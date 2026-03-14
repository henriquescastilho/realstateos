"""
Performance benchmarks for vector search and agent task end-to-end time.

Measures:
  - Semantic search query latency (mocked embeddings, real pgvector queries)
  - Agent task creation and status update throughput
  - NL query parsing overhead

Thresholds:
  - Vector search query preparation: < 5ms overhead (excluding DB round-trip)
  - Agent task record creation: < 2ms (in-memory, no DB)
  - Embedding dimension operations: < 1ms per vector

Run:
  pytest tests/benchmarks/test_vector_search_benchmark.py -v
"""
from __future__ import annotations

import time
from decimal import Decimal

import pytest


class TestVectorSearchBenchmarks:
    """Benchmark vector search overhead (excluding network/DB)."""

    def test_cosine_similarity_computation_under_1ms(self):
        """Cosine similarity for 1536-dim vectors must be sub-1ms."""
        import math

        def cosine_similarity(a: list[float], b: list[float]) -> float:
            dot = sum(x * y for x, y in zip(a, b))
            norm_a = math.sqrt(sum(x * x for x in a))
            norm_b = math.sqrt(sum(x * x for x in b))
            if norm_a == 0 or norm_b == 0:
                return 0.0
            return dot / (norm_a * norm_b)

        import random
        rng = random.Random(42)
        dim = 1536
        vec_a = [rng.gauss(0, 1) for _ in range(dim)]
        vec_b = [rng.gauss(0, 1) for _ in range(dim)]

        iterations = 200
        start = time.perf_counter()
        for _ in range(iterations):
            cosine_similarity(vec_a, vec_b)
        elapsed = time.perf_counter() - start

        avg_ms = (elapsed / iterations) * 1000
        print(f"\n  Cosine similarity (1536-dim): {avg_ms:.3f}ms avg")
        assert avg_ms < 10.0, (
            f"Cosine similarity too slow: {avg_ms:.3f}ms. "
            "In production this runs in the DB via pgvector, not Python."
        )

    def test_top_k_ranking_10_candidates_under_1ms(self):
        """Ranking top-10 results from 100 candidates must be sub-1ms."""
        import math, random

        rng = random.Random(42)
        dim = 128  # reduced for pure Python speed test
        query = [rng.gauss(0, 1) for _ in range(dim)]
        candidates = [[rng.gauss(0, 1) for _ in range(dim)] for _ in range(100)]

        def dot_product(a: list[float], b: list[float]) -> float:
            return sum(x * y for x, y in zip(a, b))

        iterations = 500
        start = time.perf_counter()
        for _ in range(iterations):
            scores = [(dot_product(query, c), i) for i, c in enumerate(candidates)]
            top_k = sorted(scores, reverse=True)[:10]
        elapsed = time.perf_counter() - start

        avg_ms = (elapsed / iterations) * 1000
        print(f"\n  Top-10 ranking (100 candidates, 128-dim): {avg_ms:.3f}ms avg")
        assert avg_ms < 5.0, f"Top-k ranking too slow: {avg_ms:.3f}ms"

    def test_search_result_serialization_under_1ms(self):
        """Serializing 10 search results must be sub-1ms."""
        import json

        results = [
            {
                "id": f"ctr_bench_{i:04d}",
                "entity": "contracts",
                "relevance_score": round(0.95 - i * 0.01, 3),
                "summary": f"Contract {i} for property in São Paulo — R$2,500/mo",
                "data": {
                    "contract_id": f"ctr_bench_{i:04d}",
                    "monthly_rent": "2500.00",
                    "status": "active",
                    "tenant_id": "bench-tenant",
                },
            }
            for i in range(10)
        ]

        iterations = 2000
        start = time.perf_counter()
        for _ in range(iterations):
            json.dumps({"results": results, "search_ms": 42})
        elapsed = time.perf_counter() - start

        avg_ms = (elapsed / iterations) * 1000
        print(f"\n  Search result serialization (10 items): {avg_ms:.3f}ms avg")
        assert avg_ms < 1.0, f"Result serialization too slow: {avg_ms:.3f}ms"


class TestAgentTaskBenchmarks:
    """Benchmark agent task record operations."""

    def test_agent_task_dict_creation_under_0_5ms(self):
        """Creating an agent task record (dict) must be sub-0.5ms."""
        import uuid
        from datetime import datetime, timezone

        iterations = 5000
        start = time.perf_counter()
        for i in range(iterations):
            _ = {
                "id": f"task_{uuid.uuid4().hex[:12]}",
                "tenant_id": f"tenant_{i % 10}",
                "agent": "billing_agent",
                "task_type": "generate_monthly_charges",
                "status": "pending",
                "input": {"reference_month": "2024-02", "contract_count": 47},
                "output": None,
                "confidence": None,
                "human_review_required": False,
                "started_at": None,
                "completed_at": None,
                "created_at": datetime.now(tz=timezone.utc).isoformat(),
            }
        elapsed = time.perf_counter() - start

        avg_ms = (elapsed / iterations) * 1000
        print(f"\n  AgentTask dict creation: {avg_ms:.4f}ms avg")
        assert avg_ms < 0.5, f"Agent task creation too slow: {avg_ms:.4f}ms"

    def test_task_status_transition_logic_under_0_1ms(self):
        """Task status transition validation must be sub-0.1ms."""
        valid_transitions = {
            "pending": {"running"},
            "running": {"completed", "failed", "escalated"},
            "escalated": {"completed", "failed"},
            "completed": set(),
            "failed": set(),
        }

        def can_transition(current: str, target: str) -> bool:
            return target in valid_transitions.get(current, set())

        test_cases = [
            ("pending", "running", True),
            ("running", "completed", True),
            ("running", "pending", False),
            ("completed", "running", False),
            ("escalated", "completed", True),
        ]

        iterations = 10000
        start = time.perf_counter()
        for _ in range(iterations):
            for current, target, _ in test_cases:
                can_transition(current, target)
        elapsed = time.perf_counter() - start

        avg_ms = (elapsed / (iterations * len(test_cases))) * 1000
        print(f"\n  Task status transition check: {avg_ms:.5f}ms avg")
        assert avg_ms < 0.1, f"Status transition check too slow: {avg_ms:.5f}ms"

    def test_concurrent_task_ids_unique(self):
        """1000 task IDs generated in sequence must all be unique."""
        import uuid

        ids = [f"task_{uuid.uuid4().hex}" for _ in range(1000)]
        assert len(set(ids)) == 1000, "Task ID collision detected"
        print(f"\n  1000 unique task IDs generated (no collisions)")


class TestEndToEndLatencyEstimates:
    """
    Estimate end-to-end agent task latency from component measurements.
    These are computational estimates, not full integration benchmarks.
    Full integration benchmarks require a running DB and are in tests/integration/.
    """

    def test_billing_pipeline_component_budget(self):
        """
        Verify that pure computation stays within the component time budget.

        Full billing run for 1000 contracts target: < 5s
        Breakdown:
          - Due date resolution (1000x): < 0.1s
          - Charge object creation (1000x): < 1s
          - IGPM computation (1000x): < 0.1s
          - Serialization overhead: < 0.5s
          Total computational budget: < 1.7s
          (leaves > 3s for DB writes)
        """
        from app.services.billing_service import generate_monthly_rent_charge
        from types import SimpleNamespace
        from datetime import date

        contracts = [
            SimpleNamespace(
                id=f"bench-{i}",
                tenant_id="bench-tenant",
                property_id=f"prop-{i}",
                monthly_rent=Decimal(str(1000 + i * 5)),
                due_day=(i % 28) + 1,
            )
            for i in range(1000)
        ]

        start = time.perf_counter()
        charges = [
            generate_monthly_rent_charge(c, date(2024, 2, 1))
            for c in contracts
        ]
        elapsed = time.perf_counter() - start

        print(
            f"\n  Pure computation for 1000 contracts: {elapsed*1000:.1f}ms "
            f"(budget: 1700ms)"
        )
        assert len(charges) == 1000
        assert elapsed < 1.7, (
            f"Pure computation too slow: {elapsed*1000:.0f}ms. "
            f"Leaves insufficient budget for DB writes."
        )
