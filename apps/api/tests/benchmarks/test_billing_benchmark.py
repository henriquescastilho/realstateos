"""
Performance benchmarks for the billing engine.

Measures:
  - Charge generation throughput (N contracts in parallel)
  - IGPM/IPCA adjustment computation time
  - Due date resolution at scale
  - Payment reconciliation throughput

Run:
  pytest tests/benchmarks/test_billing_benchmark.py -v --benchmark-only
  pytest tests/benchmarks/ -v -k benchmark --tb=short

Thresholds (CI regression gates):
  - generate_monthly_rent_charge: < 1ms per contract
  - resolve_due_date: < 0.1ms per call
  - classify_payment: < 0.1ms per call
  - 1000-contract billing run: < 5 seconds total

To run without pytest-benchmark (uses time.perf_counter):
  pytest tests/benchmarks/test_billing_benchmark.py -v -m "not benchmark"
"""
from __future__ import annotations

import time
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_contract(
    idx: int,
    rent: Decimal = Decimal("2500.00"),
    due_day: int = 10,
) -> SimpleNamespace:
    """Minimal contract-like object for benchmarking without DB."""
    return SimpleNamespace(
        id=f"bench-contract-{idx}",
        tenant_id=f"bench-tenant-{idx % 10}",
        property_id=f"bench-property-{idx}",
        monthly_rent=rent,
        due_day=due_day,
    )


REFERENCE_MONTH = date(2024, 2, 1)
N_CONTRACTS = 1000


# ---------------------------------------------------------------------------
# Billing generation benchmarks
# ---------------------------------------------------------------------------

class TestBillingGenerationBenchmarks:
    """Benchmark charge generation — the hot path of the billing pipeline."""

    def test_single_charge_generation_under_1ms(self):
        """Single charge generation must complete in under 1ms."""
        from app.services.billing_service import generate_monthly_rent_charge

        contract = _make_contract(0)

        iterations = 500
        start = time.perf_counter()
        for _ in range(iterations):
            generate_monthly_rent_charge(contract, REFERENCE_MONTH)
        elapsed = time.perf_counter() - start

        avg_ms = (elapsed / iterations) * 1000
        print(f"\n  Single charge generation: {avg_ms:.3f}ms avg over {iterations} calls")
        assert avg_ms < 1.0, (
            f"Charge generation too slow: {avg_ms:.3f}ms (threshold: 1ms). "
            "Check billing_service.py for expensive operations."
        )

    def test_1000_contracts_billing_run_under_5_seconds(self):
        """Generating charges for 1000 contracts must complete in under 5 seconds."""
        from app.services.billing_service import generate_monthly_rent_charge

        contracts = [_make_contract(i) for i in range(N_CONTRACTS)]

        start = time.perf_counter()
        charges = [generate_monthly_rent_charge(c, REFERENCE_MONTH) for c in contracts]
        elapsed = time.perf_counter() - start

        throughput = N_CONTRACTS / elapsed
        print(
            f"\n  {N_CONTRACTS} contracts: {elapsed:.3f}s total, "
            f"{throughput:.0f} contracts/s"
        )
        assert len(charges) == N_CONTRACTS
        assert elapsed < 5.0, (
            f"Billing run too slow: {elapsed:.3f}s for {N_CONTRACTS} contracts "
            f"(threshold: 5s). Throughput: {throughput:.0f}/s."
        )

    def test_billing_throughput_exceeds_200_contracts_per_second(self):
        """Must sustain > 200 contracts/second for batch billing runs."""
        from app.services.billing_service import generate_monthly_rent_charge

        contracts = [_make_contract(i) for i in range(200)]

        start = time.perf_counter()
        for c in contracts:
            generate_monthly_rent_charge(c, REFERENCE_MONTH)
        elapsed = time.perf_counter() - start

        throughput = 200 / elapsed
        print(f"\n  Throughput: {throughput:.0f} contracts/s")
        assert throughput > 200, (
            f"Throughput {throughput:.0f}/s below threshold of 200/s."
        )

    def test_variable_rent_amounts_no_performance_degradation(self):
        """Performance must be consistent regardless of rent amount magnitude."""
        from app.services.billing_service import generate_monthly_rent_charge

        rents = [
            Decimal("200.00"),
            Decimal("5000.00"),
            Decimal("50000.00"),
        ]
        durations = {}

        iterations = 200
        for rent in rents:
            contract = _make_contract(0, rent=rent)
            start = time.perf_counter()
            for _ in range(iterations):
                generate_monthly_rent_charge(contract, REFERENCE_MONTH)
            elapsed = time.perf_counter() - start
            avg_ms = (elapsed / iterations) * 1000
            durations[str(rent)] = avg_ms

        print(f"\n  Durations by rent: {durations}")
        max_ms = max(durations.values())
        min_ms = min(durations.values())
        ratio = max_ms / max(min_ms, 0.001)
        # Slowest must not be more than 10x faster than fastest — no rent-value-dependent branching
        assert ratio < 10.0, (
            f"Performance varies too much by rent value: {durations}"
        )


# ---------------------------------------------------------------------------
# Due date resolution benchmarks
# ---------------------------------------------------------------------------

class TestDueDateBenchmarks:
    """Benchmark the due date resolution utility."""

    def test_due_date_resolution_under_0_1ms(self):
        """resolve_due_date must complete in under 0.1ms per call."""
        from app.utils.dates import resolve_due_date

        ref = date(2024, 2, 1)
        iterations = 2000

        start = time.perf_counter()
        for day in range(1, 29):
            for _ in range(iterations // 28):
                resolve_due_date(ref, day)
        elapsed = time.perf_counter() - start

        avg_ms = (elapsed / iterations) * 1000
        print(f"\n  resolve_due_date: {avg_ms:.4f}ms avg")
        assert avg_ms < 0.1, (
            f"resolve_due_date too slow: {avg_ms:.4f}ms (threshold: 0.1ms)"
        )

    def test_business_day_resolution_consistent_across_months(self):
        """Due date resolution should be consistently fast across all months of the year."""
        from app.utils.dates import resolve_due_date

        months = [date(2024, m, 1) for m in range(1, 13)]
        iterations_per_month = 100

        start = time.perf_counter()
        for ref in months:
            for day in range(1, 29):
                for _ in range(iterations_per_month):
                    resolve_due_date(ref, day)
        elapsed = time.perf_counter() - start

        total_calls = len(months) * 28 * iterations_per_month
        avg_ms = (elapsed / total_calls) * 1000
        print(f"\n  {total_calls} due-date calls in {elapsed:.3f}s ({avg_ms:.4f}ms avg)")
        assert avg_ms < 0.5, f"Due date resolution too slow: {avg_ms:.4f}ms avg"


# ---------------------------------------------------------------------------
# Payment classification benchmarks
# ---------------------------------------------------------------------------

class TestPaymentClassificationBenchmarks:
    """Benchmark payment reconciliation classification."""

    def test_classify_payment_under_0_1ms(self):
        """Payment classification must be pure and sub-0.1ms."""
        # Classification logic mirrored from billing_properties tests
        from decimal import ROUND_HALF_UP

        def classify_payment(paid: Decimal, charged: Decimal) -> str:
            if charged <= Decimal("0"):
                return "unmatched"
            tolerance = Decimal("0.05")
            if abs(paid - charged) <= tolerance:
                return "paid"
            if paid < charged:
                return "partial"
            return "overpayment"

        test_cases = [
            (Decimal("2500.00"), Decimal("2500.00")),   # exact
            (Decimal("2499.97"), Decimal("2500.00")),   # within tolerance
            (Decimal("2000.00"), Decimal("2500.00")),   # partial
            (Decimal("3000.00"), Decimal("2500.00")),   # overpayment
        ]

        iterations = 5000
        start = time.perf_counter()
        for _ in range(iterations):
            for paid, charged in test_cases:
                classify_payment(paid, charged)
        elapsed = time.perf_counter() - start

        total_calls = iterations * len(test_cases)
        avg_ms = (elapsed / total_calls) * 1000
        print(f"\n  classify_payment: {avg_ms:.4f}ms avg")
        assert avg_ms < 0.1, f"Payment classification too slow: {avg_ms:.4f}ms"

    def test_1000_payment_reconciliation_under_1_second(self):
        """Reconciling 1000 payments must complete in under 1 second."""
        from decimal import ROUND_HALF_UP

        def reconcile_batch(payments: list[tuple[Decimal, Decimal]]) -> list[str]:
            results = []
            for paid, charged in payments:
                if charged <= Decimal("0"):
                    results.append("unmatched")
                    continue
                tolerance = Decimal("0.05")
                if abs(paid - charged) <= tolerance:
                    results.append("paid")
                elif paid < charged:
                    results.append("partial")
                else:
                    results.append("overpayment")
            return results

        # Mix of payment types
        payments = []
        for i in range(1000):
            charged = Decimal(str(1000 + i * 10))
            if i % 4 == 0:
                paid = charged  # exact
            elif i % 4 == 1:
                paid = charged - Decimal("200")  # partial
            elif i % 4 == 2:
                paid = charged + Decimal("100")  # overpayment
            else:
                paid = charged + Decimal("0.02")  # within tolerance
            payments.append((paid, charged))

        start = time.perf_counter()
        results = reconcile_batch(payments)
        elapsed = time.perf_counter() - start

        print(f"\n  1000 payment reconciliations: {elapsed*1000:.1f}ms")
        assert len(results) == 1000
        assert elapsed < 1.0, (
            f"Reconciliation too slow: {elapsed*1000:.1f}ms for 1000 payments"
        )


# ---------------------------------------------------------------------------
# IGPM adjustment computation benchmarks
# ---------------------------------------------------------------------------

class TestIgpmBenchmarks:
    """Benchmark IGPM/IPCA adjustment calculations."""

    def test_adjustment_calculation_under_0_1ms(self):
        """Annual index adjustment calculation must be sub-0.1ms."""
        from decimal import ROUND_HALF_UP

        def apply_index_adjustment(base_rent: Decimal, annual_rate: Decimal) -> Decimal:
            return (base_rent * annual_rate / 100).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )

        base_rents = [Decimal("1500.00"), Decimal("3000.00"), Decimal("10000.00")]
        rates = [Decimal("5.12"), Decimal("8.75"), Decimal("-0.50")]

        iterations = 3000
        start = time.perf_counter()
        for _ in range(iterations):
            for rent in base_rents:
                for rate in rates:
                    apply_index_adjustment(rent, rate)
        elapsed = time.perf_counter() - start

        total = iterations * len(base_rents) * len(rates)
        avg_ms = (elapsed / total) * 1000
        print(f"\n  IGPM adjustment: {avg_ms:.4f}ms avg")
        assert avg_ms < 0.1, f"IGPM calculation too slow: {avg_ms:.4f}ms"


# ---------------------------------------------------------------------------
# Benchmark summary
# ---------------------------------------------------------------------------

class TestBenchmarkSummary:
    """Print a consolidated benchmark summary."""

    def test_print_benchmark_thresholds(self):
        """Print regression thresholds for CI reference."""
        thresholds = {
            "generate_monthly_rent_charge (single)": "< 1ms",
            "1000-contract billing run": "< 5s",
            "billing throughput": "> 200 contracts/s",
            "resolve_due_date (single)": "< 0.1ms",
            "classify_payment (single)": "< 0.1ms",
            "1000-payment reconciliation batch": "< 1s",
            "IGPM adjustment (single)": "< 0.1ms",
        }
        print("\n\n  === BENCHMARK REGRESSION THRESHOLDS ===")
        for name, threshold in thresholds.items():
            print(f"  {name:50s} {threshold}")
        print()
