"""
ADK Evaluation Framework — Real Estate OS
==========================================
Lightweight evaluation framework mirroring the ADK evaluate() interface.
Works without google-adk installed — uses local scoring pipeline.

Usage:
    from apps.api.tests.agents.eval.framework import AgentEvaluator, EvalSuite, EvalReport

    suite = EvalSuite.load_golden_dataset()
    report = suite.run()
    assert report.overall_score >= 0.95, f"Score dropped: {report.overall_score:.1%}"
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

# ── Threshold constants ───────────────────────────────────────────────────────

PASS_THRESHOLD = 0.80          # per-scenario: 80% criteria must pass
SUITE_PASS_THRESHOLD = 0.95    # overall suite: 95% of scenarios must pass
CI_ALERT_DROP_PCT = 0.05       # alert if score drops more than 5%

# ── Core criterion type ───────────────────────────────────────────────────────

CriterionFn = Callable[[dict[str, Any]], bool]


@dataclass
class Criterion:
    name: str
    fn: CriterionFn
    weight: float = 1.0
    category: str = "output_quality"  # tool_selection | output_quality | escalation_precision


@dataclass
class ScenarioResult:
    scenario_id: str
    agent_type: str
    score: float
    passed: bool
    duration_ms: float
    passed_criteria: list[str]
    failed_criteria: list[str]
    error: str | None = None

    def to_dict(self) -> dict:
        return {
            "scenario_id": self.scenario_id,
            "agent_type": self.agent_type,
            "score": round(self.score, 4),
            "passed": self.passed,
            "duration_ms": round(self.duration_ms, 2),
            "passed_criteria": self.passed_criteria,
            "failed_criteria": self.failed_criteria,
            "error": self.error,
        }


@dataclass
class EvalReport:
    suite_name: str
    timestamp: str
    total_scenarios: int
    passed_scenarios: int
    failed_scenarios: int
    overall_score: float
    score_by_agent: dict[str, float]
    score_by_category: dict[str, float]
    results: list[ScenarioResult]
    duration_ms: float

    @property
    def passed(self) -> bool:
        return self.overall_score >= SUITE_PASS_THRESHOLD

    def to_dict(self) -> dict:
        return {
            "suite_name": self.suite_name,
            "timestamp": self.timestamp,
            "total_scenarios": self.total_scenarios,
            "passed_scenarios": self.passed_scenarios,
            "failed_scenarios": self.failed_scenarios,
            "overall_score": round(self.overall_score, 4),
            "score_by_agent": {k: round(v, 4) for k, v in self.score_by_agent.items()},
            "score_by_category": {k: round(v, 4) for k, v in self.score_by_category.items()},
            "results": [r.to_dict() for r in self.results],
            "duration_ms": round(self.duration_ms, 2),
            "passed": self.passed,
        }

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(self.to_dict(), fh, indent=2, ensure_ascii=False)

    def compare_with_baseline(self, baseline_path: Path) -> dict:
        """Compare current report with a baseline. Returns drop info."""
        if not baseline_path.exists():
            return {"status": "no_baseline", "drop": 0.0}
        with open(baseline_path, encoding="utf-8") as fh:
            baseline = json.load(fh)
        drop = baseline.get("overall_score", 1.0) - self.overall_score
        return {
            "status": "alert" if drop > CI_ALERT_DROP_PCT else "ok",
            "drop": round(drop, 4),
            "baseline_score": baseline.get("overall_score"),
            "current_score": self.overall_score,
        }

    def print_summary(self) -> None:
        status = "PASS" if self.passed else "FAIL"
        print(f"\n{'='*60}")
        print(f"ADK Eval Suite: {self.suite_name}")
        print(f"Status: {status} | Score: {self.overall_score:.1%} | Duration: {self.duration_ms:.0f}ms")
        print(f"Scenarios: {self.passed_scenarios}/{self.total_scenarios} passed")
        print("\nScore by Agent:")
        for agent, score in sorted(self.score_by_agent.items()):
            flag = "✓" if score >= SUITE_PASS_THRESHOLD else "✗"
            print(f"  {flag} {agent:<30} {score:.1%}")
        print("\nScore by Category:")
        for cat, score in sorted(self.score_by_category.items()):
            flag = "✓" if score >= SUITE_PASS_THRESHOLD else "✗"
            print(f"  {flag} {cat:<30} {score:.1%}")
        if any(not r.passed for r in self.results):
            print("\nFailed Scenarios:")
            for r in self.results:
                if not r.passed:
                    print(f"  ✗ {r.scenario_id} [{r.agent_type}] score={r.score:.1%} failed={r.failed_criteria}")
        print(f"{'='*60}\n")


class AgentEvaluator:
    """
    Evaluates a single agent scenario against a set of weighted criteria.

    Usage:
        ev = AgentEvaluator("payments.reconcile.exact")
        ev.add_criterion("ok_true", lambda r: r["ok"] is True, category="output_quality")
        ev.add_criterion("tool_selected", lambda r: r["tool"] == "classify_reconciliation", category="tool_selection")
        result = ev.run(callable_fn, *args, **kwargs)
    """

    def __init__(self, scenario_id: str, agent_type: str = "unknown"):
        self.scenario_id = scenario_id
        self.agent_type = agent_type
        self._criteria: list[Criterion] = []

    def add_criterion(
        self,
        name: str,
        fn: CriterionFn,
        weight: float = 1.0,
        category: str = "output_quality",
    ) -> "AgentEvaluator":
        self._criteria.append(Criterion(name=name, fn=fn, weight=weight, category=category))
        return self

    def evaluate(self, result: dict[str, Any]) -> ScenarioResult:
        """Evaluate a pre-computed result dict."""
        start = time.monotonic()
        passed_names: list[str] = []
        failed_names: list[str] = []
        total_weight = sum(c.weight for c in self._criteria) or 1.0
        weighted_pass = 0.0

        for criterion in self._criteria:
            try:
                ok = bool(criterion.fn(result))
            except Exception:
                ok = False
            if ok:
                passed_names.append(criterion.name)
                weighted_pass += criterion.weight
            else:
                failed_names.append(criterion.name)

        score = weighted_pass / total_weight
        duration_ms = (time.monotonic() - start) * 1000

        return ScenarioResult(
            scenario_id=self.scenario_id,
            agent_type=self.agent_type,
            score=score,
            passed=score >= PASS_THRESHOLD,
            duration_ms=duration_ms,
            passed_criteria=passed_names,
            failed_criteria=failed_names,
        )

    def run(self, fn: Callable, *args, **kwargs) -> ScenarioResult:
        """Call fn(*args, **kwargs) and evaluate the result."""
        start = time.monotonic()
        error = None
        result: dict = {}
        try:
            result = fn(*args, **kwargs)
        except Exception as exc:
            error = str(exc)
            result = {"ok": False, "error": error}
        scenario_result = self.evaluate(result)
        scenario_result.duration_ms = (time.monotonic() - start) * 1000
        scenario_result.error = error
        return scenario_result


@dataclass
class EvalScenario:
    """A single evaluation scenario with its evaluator and execution function."""
    scenario_id: str
    agent_type: str
    evaluator: AgentEvaluator
    run_fn: Callable[[], dict]


class EvalSuite:
    """
    A collection of evaluation scenarios that can be run as a suite.
    Produces an EvalReport with per-agent and per-category scores.
    """

    def __init__(self, name: str = "realstateos_agent_eval"):
        self.name = name
        self._scenarios: list[EvalScenario] = []

    def add(self, scenario: EvalScenario) -> "EvalSuite":
        self._scenarios.append(scenario)
        return self

    def run(self) -> EvalReport:
        start = time.monotonic()
        results: list[ScenarioResult] = []

        for scenario in self._scenarios:
            try:
                raw = scenario.run_fn()
            except Exception as exc:
                raw = {"ok": False, "error": str(exc)}
                scenario.evaluator._criteria  # ensure criteria registered
            result = scenario.evaluator.evaluate(raw)
            results.append(result)

        total = len(results)
        passed = sum(1 for r in results if r.passed)
        overall_score = passed / total if total else 1.0

        # Score by agent type
        agent_scores: dict[str, list[float]] = {}
        for r in results:
            agent_scores.setdefault(r.agent_type, []).append(float(r.passed))
        score_by_agent = {k: sum(v) / len(v) for k, v in agent_scores.items()}

        # Score by category (across all criteria in all scenarios)
        category_pass: dict[str, list[float]] = {}
        for scenario in self._scenarios:
            for criterion in scenario.evaluator._criteria:
                result_for_scenario = next((r for r in results if r.scenario_id == scenario.scenario_id), None)
                if result_for_scenario:
                    passed_criterion = criterion.name in result_for_scenario.passed_criteria
                    category_pass.setdefault(criterion.category, []).append(float(passed_criterion))
        score_by_category = {k: sum(v) / len(v) for k, v in category_pass.items()}

        duration_ms = (time.monotonic() - start) * 1000
        return EvalReport(
            suite_name=self.name,
            timestamp=datetime.now(timezone.utc).isoformat(),
            total_scenarios=total,
            passed_scenarios=passed,
            failed_scenarios=total - passed,
            overall_score=overall_score,
            score_by_agent=score_by_agent,
            score_by_category=score_by_category,
            results=results,
            duration_ms=duration_ms,
        )

    @classmethod
    def load_golden_dataset(cls) -> "EvalSuite":
        """Load the standard 50-scenario golden dataset."""
        from apps.api.tests.agents.eval.golden_dataset import build_golden_suite
        return build_golden_suite()
