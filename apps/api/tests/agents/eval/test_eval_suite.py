"""
ADK Evaluation Suite — CI Test Runner
======================================
Runs all 50 golden scenarios and asserts:
  1. Overall score >= 95%
  2. No individual agent type scores below 80%
  3. All category scores (tool_selection, output_quality, escalation_precision) >= 80%
  4. Alerts if score drops >5% from baseline

CI usage:
    pytest apps/api/tests/agents/eval/test_eval_suite.py -v

Save baseline:
    pytest apps/api/tests/agents/eval/test_eval_suite.py --save-baseline
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from apps.api.tests.agents.eval.framework import (
    SUITE_PASS_THRESHOLD,
    CI_ALERT_DROP_PCT,
    EvalReport,
    EvalSuite,
)
from apps.api.tests.agents.eval.golden_dataset import build_golden_suite

BASELINE_PATH = Path(__file__).parent / "baseline_scores.json"
RESULTS_DIR = Path(__file__).parent / "results"


def pytest_addoption(parser):
    """Add --save-baseline option to pytest."""
    try:
        parser.addoption(
            "--save-baseline",
            action="store_true",
            default=False,
            help="Save current eval results as the new baseline",
        )
    except ValueError:
        pass  # already added


@pytest.fixture(scope="module")
def eval_report() -> EvalReport:
    """Run the full 50-scenario eval suite once per test module."""
    suite = build_golden_suite()
    report = suite.run()
    report.print_summary()

    # Always save results for inspection
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    results_path = RESULTS_DIR / "latest.json"
    report.save(results_path)

    return report


class TestEvalSuiteOverall:
    """Top-level suite acceptance tests."""

    def test_total_scenario_count(self, eval_report: EvalReport):
        """Must have exactly 50 scenarios."""
        assert eval_report.total_scenarios == 50, (
            f"Expected 50 scenarios, got {eval_report.total_scenarios}"
        )

    def test_overall_score_passes_threshold(self, eval_report: EvalReport):
        """Overall score must be >= 95%."""
        assert eval_report.overall_score >= SUITE_PASS_THRESHOLD, (
            f"Overall score {eval_report.overall_score:.1%} below threshold {SUITE_PASS_THRESHOLD:.0%}\n"
            f"Failed scenarios: {[r.scenario_id for r in eval_report.results if not r.passed]}"
        )

    def test_no_agent_type_below_minimum(self, eval_report: EvalReport):
        """No individual agent type may score below 70%."""
        min_agent_threshold = 0.70
        failures = {
            agent: score
            for agent, score in eval_report.score_by_agent.items()
            if score < min_agent_threshold
        }
        assert not failures, (
            f"Agent types below {min_agent_threshold:.0%}: {failures}"
        )

    def test_category_tool_selection_passes(self, eval_report: EvalReport):
        """Tool selection accuracy must be >= 80%."""
        score = eval_report.score_by_category.get("tool_selection", 1.0)
        assert score >= 0.80, f"Tool selection score {score:.1%} below 80%"

    def test_category_output_quality_passes(self, eval_report: EvalReport):
        """Output quality score must be >= 80%."""
        score = eval_report.score_by_category.get("output_quality", 1.0)
        assert score >= 0.80, f"Output quality score {score:.1%} below 80%"

    def test_category_escalation_precision_passes(self, eval_report: EvalReport):
        """Escalation precision score must be >= 75%."""
        score = eval_report.score_by_category.get("escalation_precision", 1.0)
        assert score >= 0.75, f"Escalation precision score {score:.1%} below 75%"

    def test_no_score_drop_from_baseline(self, eval_report: EvalReport):
        """Score must not drop >5% from baseline (CI regression guard)."""
        comparison = eval_report.compare_with_baseline(BASELINE_PATH)
        if comparison["status"] == "no_baseline":
            pytest.skip("No baseline file found — run with --save-baseline to create one")
        drop = comparison["drop"]
        assert drop <= CI_ALERT_DROP_PCT, (
            f"Score dropped {drop:.1%} from baseline {comparison['baseline_score']:.1%} "
            f"to {comparison['current_score']:.1%} — exceeds {CI_ALERT_DROP_PCT:.0%} alert threshold"
        )

    def test_save_baseline_if_requested(self, eval_report: EvalReport, request):
        """Save current results as baseline when --save-baseline flag is set."""
        save = request.config.getoption("--save-baseline", default=False)
        if save:
            eval_report.save(BASELINE_PATH)
            print(f"\nBaseline saved to {BASELINE_PATH}")


class TestEvalSuiteByAgent:
    """Per-agent score breakdown tests."""

    def test_onboarding_agent_score(self, eval_report: EvalReport):
        score = eval_report.score_by_agent.get("onboarding_agent", 1.0)
        assert score >= 0.70, f"OnboardingAgent score {score:.1%} below 70%"

    def test_payments_agent_score(self, eval_report: EvalReport):
        score = eval_report.score_by_agent.get("payments_agent", 1.0)
        assert score >= 0.75, f"PaymentsAgent score {score:.1%} below 75%"

    def test_comms_agent_score(self, eval_report: EvalReport):
        score = eval_report.score_by_agent.get("comms_agent", 1.0)
        assert score >= 0.70, f"CommsAgent score {score:.1%} below 70%"

    def test_maintenance_agent_score(self, eval_report: EvalReport):
        score = eval_report.score_by_agent.get("maintenance_agent", 1.0)
        assert score >= 0.70, f"MaintenanceAgent score {score:.1%} below 70%"

    def test_portfolio_agent_score(self, eval_report: EvalReport):
        score = eval_report.score_by_agent.get("portfolio_agent", 1.0)
        assert score >= 0.70, f"PortfolioAgent score {score:.1%} below 70%"


class TestIndividualScenarios:
    """Critical individual scenario tests (fail fast on regressions)."""

    def _get_result(self, eval_report: EvalReport, scenario_id: str):
        for r in eval_report.results:
            if r.scenario_id == scenario_id:
                return r
        return None

    def test_s01_cpf_valid(self, eval_report: EvalReport):
        r = self._get_result(eval_report, "S01_onboarding_cpf_valid")
        assert r is not None, "S01 not found in results"
        assert r.passed, f"S01 failed: {r.failed_criteria}"

    def test_s02_cpf_invalid(self, eval_report: EvalReport):
        r = self._get_result(eval_report, "S02_onboarding_cpf_invalid")
        assert r is not None, "S02 not found"
        assert r.passed, f"S02 failed: {r.failed_criteria}"

    def test_s11_exact_reconciliation(self, eval_report: EvalReport):
        r = self._get_result(eval_report, "S11_billing_recon_exact")
        assert r is not None, "S11 not found"
        assert r.passed, f"S11 failed: {r.failed_criteria}"

    def test_s12_underpayment_review(self, eval_report: EvalReport):
        r = self._get_result(eval_report, "S12_billing_recon_underpayment")
        assert r is not None, "S12 not found"
        assert r.passed, f"S12 critical: underpayment must trigger human review"

    def test_s14_unmatched_triggers_review(self, eval_report: EvalReport):
        r = self._get_result(eval_report, "S14_billing_recon_unmatched")
        assert r is not None, "S14 not found"
        assert r.passed, f"S14 critical: unmatched payments must trigger human review"

    def test_s50_full_pipeline(self, eval_report: EvalReport):
        r = self._get_result(eval_report, "S50_onboarding_full_pipeline")
        assert r is not None, "S50 not found"
        assert r.passed, f"S50 critical: full onboarding pipeline must pass"
