"""
End-to-end integration tests for the full monthly real estate cycle:
    1. Contract Onboarding  (OnboardingTools)
    2. Billing Generation   (BillingAgentTools)
    3. Payment Reconciliation (PaymentsTools)
    4. Owner Statement      (PaymentsTools)
    5. Communications       (CommsTools)

Also includes a lightweight ADK-style evaluation framework that scores agent
tool outputs against golden criteria. The evaluation framework is independent
of google-adk being installed — it runs a local scoring pipeline.

CI usage:
    pytest apps/api/tests/agents/test_agent_e2e.py -v
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

import app.models  # noqa: F401 — registers all ORM mappers
from app.models.charge import Charge
from app.models.contract import Contract
from app.models.owner import Owner
from app.models.property import Property
from app.models.renter import Renter
from app.models.task import Task
from app.models.tenant import Tenant


# ── Fixtures (db_session provided by tests/agents/conftest.py) ────────────────

@pytest.fixture()
def full_graph(db_session: Session):
    """Seed a complete contract graph: tenant → owner + renter + property + contract."""
    tenant = Tenant(name="E2E Realty Test")
    owner = Owner(
        tenant=tenant,
        name="Carlos Proprietário",
        document="11144477735",  # valid CPF
        email="carlos@proprietario.com",
        phone="11999990001",
    )
    renter = Renter(
        tenant=tenant,
        name="Ana Inquilina",
        document="52998224725",  # valid CPF
        email="ana@inquilina.com",
        phone="11999990002",
    )
    prop = Property(
        tenant=tenant,
        owner=owner,
        address="Av. Paulista, 1000, Apto 302",
        city="São Paulo",
        state="SP",
        zip="01310-100",
        iptu_registration_number="IPTU-E2E-001",
    )
    contract = Contract(
        tenant=tenant,
        property=prop,
        renter=renter,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
        monthly_rent=Decimal("3500.00"),
        due_day=10,
    )
    db_session.add_all([tenant, owner, renter, prop, contract])
    db_session.commit()
    for obj in [tenant, owner, renter, prop, contract]:
        db_session.refresh(obj)
    return {
        "tenant": tenant,
        "owner": owner,
        "renter": renter,
        "property": prop,
        "contract": contract,
    }


# ── ADK Evaluation Framework ──────────────────────────────────────────────────

class AgentEvaluator:
    """
    Lightweight evaluation framework that mirrors the ADK evaluate() interface.

    Scores agent tool outputs against a set of criteria. Each criterion is a
    callable that receives the tool result dict and returns True/False.

    Usage:
        ev = AgentEvaluator("billing_cycle")
        ev.add_criterion("ok_is_true", lambda r: r.get("ok") is True)
        score = ev.evaluate(result)
        assert score.passed
    """

    def __init__(self, scenario_name: str):
        self.scenario_name = scenario_name
        self._criteria: list[tuple[str, Any]] = []

    def add_criterion(self, name: str, fn) -> "AgentEvaluator":
        self._criteria.append((name, fn))
        return self

    def evaluate(self, result: dict[str, Any]) -> "EvaluationResult":
        passed_names: list[str] = []
        failed_names: list[str] = []
        for name, fn in self._criteria:
            try:
                ok = bool(fn(result))
            except Exception:
                ok = False
            (passed_names if ok else failed_names).append(name)

        total = len(self._criteria)
        score = len(passed_names) / total if total else 1.0
        return EvaluationResult(
            scenario=self.scenario_name,
            score=score,
            passed_criteria=passed_names,
            failed_criteria=failed_names,
        )


class EvaluationResult:
    PASS_THRESHOLD = 0.80  # 80% criteria must pass

    def __init__(self, scenario: str, score: float, passed_criteria: list, failed_criteria: list):
        self.scenario = scenario
        self.score = score
        self.passed_criteria = passed_criteria
        self.failed_criteria = failed_criteria

    @property
    def passed(self) -> bool:
        return self.score >= self.PASS_THRESHOLD

    def __repr__(self) -> str:
        return (
            f"EvaluationResult(scenario={self.scenario!r}, score={self.score:.0%}, "
            f"passed={self.passed}, failed_criteria={self.failed_criteria})"
        )


# ── Phase 1: Onboarding ───────────────────────────────────────────────────────

class TestOnboardingPhase:
    """Tests for the OnboardingTools contract ingestion phase."""

    def test_validate_cpf_valid(self):
        from app.agents.onboarding_agent.tools import OnboardingTools
        tools = OnboardingTools()
        result = tools.validate_cpf("529.982.247-25")

        ev = (
            AgentEvaluator("onboarding.validate_cpf")
            .add_criterion("ok_true", lambda r: r["ok"] is True)
            .add_criterion("valid_true", lambda r: r["valid"] is True)
            .add_criterion("cpf_normalized_set", lambda r: r["cpf_normalized"] is not None)
            .add_criterion("message_confirms_valid", lambda r: "válido" in r["message"].lower())
        )
        score = ev.evaluate(result)
        assert score.passed, f"Onboarding CPF eval failed: {score}"

    def test_validate_cpf_invalid(self):
        from app.agents.onboarding_agent.tools import OnboardingTools
        tools = OnboardingTools()
        result = tools.validate_cpf("000.000.000-00")
        assert result["ok"] is False
        assert result["valid"] is False

    def test_validate_cnpj_valid(self):
        from app.agents.onboarding_agent.tools import OnboardingTools
        tools = OnboardingTools()
        # Valid CNPJ: 11.222.333/0001-81
        result = tools.validate_cnpj("11222333000181")
        assert result["valid"] is True
        assert result["cnpj_normalized"] == "11.222.333/0001-81"

    def test_normalize_address_expands_abbreviations(self):
        from app.agents.onboarding_agent.tools import OnboardingTools
        tools = OnboardingTools()
        result = tools.normalize_address("Av. Paulista, 1000", cep="01310100")
        assert result["ok"] is True
        assert "Avenida" in result["normalized_address"]
        assert result["cep_normalized"] == "01310-100"
        assert result["cep_valid"] is True

    def test_extract_contract_data_mock(self):
        from app.agents.onboarding_agent.tools import OnboardingTools
        tools = OnboardingTools()
        result = tools.extract_contract_data(
            document_id="doc-e2e-001",
            tenant_id="tenant-1",
            use_mock=True,
        )
        ev = (
            AgentEvaluator("onboarding.extract_contract_data")
            .add_criterion("ok_true", lambda r: r["ok"] is True)
            .add_criterion("has_extracted_data", lambda r: "extracted_data" in r)
            .add_criterion("has_confidence_scores", lambda r: "confidence_scores" in r)
            .add_criterion("rent_amount_positive", lambda r: r["extracted_data"]["rent_amount"] > 0)
            .add_criterion("due_day_valid", lambda r: 1 <= r["extracted_data"]["due_day"] <= 31)
        )
        score = ev.evaluate(result)
        assert score.passed, f"Extract contract data eval failed: {score}"

    def test_create_contract_record_missing_fields_returns_error(self):
        from app.agents.onboarding_agent.tools import OnboardingTools
        tools = OnboardingTools()
        result = tools.create_contract_record(
            tenant_id="tenant-1",
            contract_data={"rent_amount": 1000},  # missing required fields
        )
        assert result["ok"] is False
        assert "Missing required fields" in result["error"]


# ── Phase 2: Billing Generation ───────────────────────────────────────────────

class TestBillingPhase:
    """Tests for the BillingAgentTools charge generation phase."""

    def test_generate_monthly_charge(self, full_graph, db_session):
        from app.agents.billing_agent.tools import BillingAgentTools
        g = full_graph
        tools = BillingAgentTools(db=db_session, tenant_id=g["tenant"].id)
        result = tools.generate_monthly_charge(
            contract_id=g["contract"].id,
            month_ref="2026-03",
        )
        ev = (
            AgentEvaluator("billing.generate_monthly_charge")
            .add_criterion("ok_true", lambda r: r["ok"] is True)
            .add_criterion("operation_correct", lambda r: r["operation"] == "generate_monthly_charge")
            .add_criterion("contract_id_matches", lambda r: r["contract_id"] == g["contract"].id)
            .add_criterion("month_ref_matches", lambda r: r["month_ref"] == "2026-03")
            .add_criterion("charge_ids_returned", lambda r: bool(r.get("generated_charge_ids")))
        )
        score = ev.evaluate(result)
        assert score.passed, f"Billing generate eval failed: {score}"

        # Verify audit task was created
        task = db_session.scalar(select(Task).where(Task.type == "GENERATE_MONTHLY_CHARGE"))
        assert task is not None

    def test_consolidate_monthly_charges(self, full_graph, db_session):
        from app.agents.billing_agent.tools import BillingAgentTools
        g = full_graph
        # Seed multiple charges
        charges = [
            Charge(
                tenant_id=g["tenant"].id,
                property_id=g["property"].id,
                contract_id=g["contract"].id,
                type="RENT",
                description="Aluguel março",
                amount=Decimal("3500.00"),
                due_date=date(2026, 3, 10),
                source="SYSTEM",
                status="pending",
            ),
            Charge(
                tenant_id=g["tenant"].id,
                property_id=g["property"].id,
                contract_id=g["contract"].id,
                type="CONDO",
                description="Condomínio março",
                amount=Decimal("450.00"),
                due_date=date(2026, 3, 10),
                source="UPLOAD",
                status="pending",
            ),
        ]
        db_session.add_all(charges)
        db_session.commit()

        tools = BillingAgentTools(db=db_session, tenant_id=g["tenant"].id)
        result = tools.consolidate_monthly_charges(
            contract_id=g["contract"].id,
            property_id=g["property"].id,
            month_ref="2026-03",
        )

        ev = (
            AgentEvaluator("billing.consolidate_monthly_charges")
            .add_criterion("ok_true", lambda r: r["ok"] is True)
            .add_criterion("total_correct", lambda r: r["total_amount"] == "3950.00")
            .add_criterion("consolidated_id_set", lambda r: bool(r.get("consolidated_charge_id")))
        )
        score = ev.evaluate(result)
        assert score.passed, f"Billing consolidate eval failed: {score}"


# ── Phase 3: Payment Reconciliation ──────────────────────────────────────────

class TestPaymentReconciliationPhase:
    """Tests for the PaymentsTools reconciliation phase."""

    def test_ingest_bank_webhook_santander(self):
        from app.agents.payments_agent.tools import PaymentsTools
        tools = PaymentsTools()
        payload = {
            "codigoBoleto": "34191.09008 61207.727308 71140.100004 1 91330000350000",
            "valorPago": 3500.00,
            "dataPagamento": "2026-03-10",
            "nomePagador": "Ana Inquilina",
            "cpfCnpjPagador": "52998224725",
            "tipoPagamento": "boleto",
        }
        result = tools.ingest_bank_webhook(
            tenant_id="tenant-e2e",
            webhook_payload=payload,
            source="santander",
        )
        ev = (
            AgentEvaluator("payments.ingest_bank_webhook")
            .add_criterion("ok_true", lambda r: r["ok"] is True)
            .add_criterion("source_correct", lambda r: r["source"] == "santander")
            .add_criterion("transaction_id_present", lambda r: bool(r["normalized_payment"]["transaction_id"]))
            .add_criterion("amount_correct", lambda r: r["normalized_payment"]["amount"] == 3500.00)
            .add_criterion("payer_document_extracted", lambda r: bool(r["normalized_payment"]["payer_document"]))
        )
        score = ev.evaluate(result)
        assert score.passed, f"Webhook ingest eval failed: {score}"

    def test_classify_reconciliation_exact(self):
        from app.agents.payments_agent.tools import PaymentsTools
        tools = PaymentsTools()
        result = tools.classify_reconciliation(
            received_amount=3500.00,
            expected_amount=3500.00,
            charge_id="charge-001",
        )
        ev = (
            AgentEvaluator("payments.classify_reconciliation.exact")
            .add_criterion("ok_true", lambda r: r["ok"] is True)
            .add_criterion("classification_exact", lambda r: r["classification"] == "EXACT")
            .add_criterion("no_review_needed", lambda r: r["requires_human_review"] is False)
            .add_criterion("delta_zero", lambda r: abs(r["delta"]) < 0.01)
        )
        score = ev.evaluate(result)
        assert score.passed, f"Exact reconciliation eval failed: {score}"

    def test_classify_reconciliation_underpayment_triggers_review(self):
        from app.agents.payments_agent.tools import PaymentsTools
        tools = PaymentsTools()
        result = tools.classify_reconciliation(
            received_amount=3400.00,  # R$100 short → triggers divergence threshold
            expected_amount=3500.00,
            charge_id="charge-001",
        )
        assert result["classification"] == "UNDERPAYMENT"
        assert result["requires_human_review"] is True
        assert result["delta"] == pytest.approx(-100.0)

    def test_classify_reconciliation_overpayment_small_no_review(self):
        from app.agents.payments_agent.tools import PaymentsTools
        tools = PaymentsTools()
        result = tools.classify_reconciliation(
            received_amount=3500.50,  # R$0.50 over — under threshold
            expected_amount=3500.00,
            charge_id="charge-001",
        )
        assert result["classification"] == "OVERPAYMENT"
        assert result["requires_human_review"] is False

    def test_classify_reconciliation_unmatched(self):
        from app.agents.payments_agent.tools import PaymentsTools
        tools = PaymentsTools()
        result = tools.classify_reconciliation(
            received_amount=1000.00,
            expected_amount=0.0,
            charge_id="",  # empty = unmatched
        )
        assert result["classification"] == "UNMATCHED"
        assert result["requires_human_review"] is True

    def test_handle_divergence_creates_audit_task(self, full_graph, db_session):
        from app.agents.payments_agent.tools import PaymentsTools
        # PaymentsTools uses its own SessionLocal internally — patch is needed
        # for test isolation. Here we test the response contract instead.
        tools = PaymentsTools()
        result = tools.handle_divergence(
            tenant_id=str(full_graph["tenant"].id),
            payment_id="TXN-E2E-001",
            charge_id="charge-001",
            classification="UNDERPAYMENT",
            delta=-200.0,
            context={"source": "santander"},
        )
        # Response contract check (DB interaction uses its own session)
        assert result["ok"] is True
        assert result.get("divergence_task_id") is not None
        assert result["severity"] == "HIGH"


# ── Phase 4: Owner Statement ──────────────────────────────────────────────────

class TestOwnerStatementPhase:
    """Tests for the owner statement generation phase."""

    def test_generate_owner_statement_empty_month(self, full_graph, db_session):
        from app.agents.payments_agent.tools import PaymentsTools
        tools = PaymentsTools()
        # Month with no charges → totals should be zero
        result = tools.generate_owner_statement(
            tenant_id=str(full_graph["tenant"].id),
            contract_id=str(full_graph["contract"].id),
            month_ref="2026-05",
        )
        ev = (
            AgentEvaluator("payments.generate_owner_statement.empty")
            .add_criterion("ok_true", lambda r: r["ok"] is True)
            .add_criterion("statement_present", lambda r: "statement" in r)
            .add_criterion("month_ref_correct", lambda r: r["statement"]["month_ref"] == "2026-05")
            .add_criterion("task_id_set", lambda r: bool(r.get("statement_task_id")))
        )
        score = ev.evaluate(result)
        assert score.passed, f"Owner statement eval failed: {score}"
        assert result["statement"]["total_charged"] == 0.0
        assert result["statement"]["outstanding_balance"] == 0.0


# ── Phase 5: Communications ───────────────────────────────────────────────────

class TestCommunicationsPhase:
    """Tests for the CommsTools notification phase."""

    def test_send_charge_notice_returns_delivery_results(self, full_graph):
        from app.agents.comms_agent.tools import CommsTools
        tools = CommsTools()
        result = tools.send_charge_notice(
            tenant_id=str(full_graph["tenant"].id),
            renter_id=str(full_graph["renter"].id),
            charge_id="charge-e2e-001",
            due_date="2026-03-10",
            amount=3950.00,
            channels=["email", "whatsapp"],
        )
        ev = (
            AgentEvaluator("comms.send_charge_notice")
            .add_criterion("ok_true", lambda r: r["ok"] is True)
            .add_criterion("delivery_results_present", lambda r: "delivery_results" in r)
            .add_criterion("task_id_present", lambda r: r.get("task_id") is not None)
        )
        score = ev.evaluate(result)
        assert score.passed, f"Send charge notice eval failed: {score}"

    def test_send_payment_confirmation(self, full_graph):
        from app.agents.comms_agent.tools import CommsTools
        tools = CommsTools()
        result = tools.send_payment_confirmation(
            tenant_id=str(full_graph["tenant"].id),
            renter_id=str(full_graph["renter"].id),
            payment_id="PAY-E2E-001",
            amount=3950.00,
            payment_date="2026-03-10",
        )
        assert result["ok"] is True
        assert result.get("task_id") is not None


# ── Full Monthly Cycle E2E ────────────────────────────────────────────────────

class TestFullMonthlyCycle:
    """
    End-to-end integration test covering the complete monthly cycle:
        Onboarding → Billing → Payment → Statement → Communications

    Each phase uses the previous phase's output as input, verifying
    the full data flow through all agent tool layers.
    """

    def test_full_monthly_cycle(self, full_graph, db_session):
        g = full_graph
        tenant_id = str(g["tenant"].id)
        contract_id = str(g["contract"].id)
        property_id = str(g["property"].id)
        renter_id = str(g["renter"].id)
        month_ref = "2026-04"

        # ── Step 1: Validate renter CPF ─────────────────────────────────
        from app.agents.onboarding_agent.tools import OnboardingTools
        onboarding = OnboardingTools()
        cpf_result = onboarding.validate_cpf(g["renter"].document)
        assert cpf_result["valid"] is True, f"Renter CPF invalid: {g['renter'].document}"

        # ── Step 2: Normalize property address ──────────────────────────
        addr_result = onboarding.normalize_address(g["property"].address)
        assert addr_result["ok"] is True

        # ── Step 3: Generate monthly charge ─────────────────────────────
        from app.agents.billing_agent.tools import BillingAgentTools
        billing = BillingAgentTools(db=db_session, tenant_id=g["tenant"].id)
        charge_result = billing.generate_monthly_charge(
            contract_id=g["contract"].id,
            month_ref=month_ref,
        )
        assert charge_result["ok"] is True, f"Billing failed: {charge_result}"
        assert charge_result["generated_charge_ids"], "No charges generated"

        # ── Step 4: Simulate bank payment webhook ────────────────────────
        from app.agents.payments_agent.tools import PaymentsTools
        payments = PaymentsTools()
        webhook_result = payments.ingest_bank_webhook(
            tenant_id=tenant_id,
            webhook_payload={
                "transaction_id": f"TXN-{uuid.uuid4().hex[:8].upper()}",
                "amount": 3500.00,
                "payment_date": f"{month_ref}-10",
                "payer_name": g["renter"].name,
                "payer_document": g["renter"].document,
                "payment_method": "pix",
            },
            source="mock",
        )
        assert webhook_result["ok"] is True
        normalized_payment = webhook_result["normalized_payment"]

        # ── Step 5: Classify reconciliation ─────────────────────────────
        recon_result = payments.classify_reconciliation(
            received_amount=normalized_payment["amount"],
            expected_amount=3500.00,
            charge_id=charge_result["generated_charge_ids"][0],
        )
        assert recon_result["ok"] is True
        # Exact payment → no human review needed
        assert recon_result["classification"] == "EXACT"
        assert recon_result["requires_human_review"] is False

        # ── Step 6: Generate owner statement ────────────────────────────
        statement_result = payments.generate_owner_statement(
            tenant_id=tenant_id,
            contract_id=contract_id,
            month_ref=month_ref,
        )
        assert statement_result["ok"] is True
        assert statement_result["statement"]["month_ref"] == month_ref

        # ── Step 7: Send charge notice to renter ────────────────────────
        from app.agents.comms_agent.tools import CommsTools
        comms = CommsTools()
        notice_result = comms.send_charge_notice(
            tenant_id=tenant_id,
            renter_id=renter_id,
            charge_id=charge_result["generated_charge_ids"][0],
            due_date=f"{month_ref}-10",
            amount=3500.00,
            channels=["email"],
        )
        assert notice_result["ok"] is True

        # ── Step 8: Send payment confirmation ────────────────────────────
        confirm_result = comms.send_payment_confirmation(
            tenant_id=tenant_id,
            renter_id=renter_id,
            payment_id=normalized_payment["transaction_id"],
            amount=normalized_payment["amount"],
            payment_date=normalized_payment["payment_date"],
        )
        assert confirm_result["ok"] is True

        # ── ADK Evaluation: Score the full cycle output ──────────────────
        cycle_summary = {
            "onboarding_ok": cpf_result["valid"],
            "billing_ok": charge_result["ok"],
            "charges_count": len(charge_result["generated_charge_ids"]),
            "reconciliation_class": recon_result["classification"],
            "requires_human_review": recon_result["requires_human_review"],
            "statement_ok": statement_result["ok"],
            "comms_notice_ok": notice_result["ok"],
            "comms_confirm_ok": confirm_result["ok"],
        }

        cycle_eval = (
            AgentEvaluator("full_monthly_cycle")
            .add_criterion("onboarding_succeeded", lambda r: r["onboarding_ok"] is True)
            .add_criterion("billing_succeeded", lambda r: r["billing_ok"] is True)
            .add_criterion("at_least_one_charge", lambda r: r["charges_count"] >= 1)
            .add_criterion("exact_reconciliation", lambda r: r["reconciliation_class"] == "EXACT")
            .add_criterion("no_human_review_needed", lambda r: r["requires_human_review"] is False)
            .add_criterion("statement_generated", lambda r: r["statement_ok"] is True)
            .add_criterion("charge_notice_sent", lambda r: r["comms_notice_ok"] is True)
            .add_criterion("payment_confirmed", lambda r: r["comms_confirm_ok"] is True)
        )
        score = cycle_eval.evaluate(cycle_summary)
        assert score.passed, (
            f"Full monthly cycle evaluation FAILED — score={score.score:.0%}\n"
            f"  failed_criteria={score.failed_criteria}\n"
            f"  summary={cycle_summary}"
        )


# ── ADK Evaluation Framework Unit Tests ──────────────────────────────────────

class TestAgentEvaluator:
    """Unit tests for the AgentEvaluator framework itself."""

    def test_all_criteria_pass_gives_score_1(self):
        ev = (
            AgentEvaluator("test_scenario")
            .add_criterion("always_true", lambda r: True)
            .add_criterion("key_present", lambda r: "key" in r)
        )
        result = ev.evaluate({"key": "value"})
        assert result.score == 1.0
        assert result.passed is True

    def test_partial_pass_computed_correctly(self):
        ev = (
            AgentEvaluator("partial")
            .add_criterion("pass1", lambda r: True)
            .add_criterion("pass2", lambda r: True)
            .add_criterion("fail1", lambda r: False)
            .add_criterion("fail2", lambda r: False)
        )
        result = ev.evaluate({})
        assert result.score == pytest.approx(0.5)
        assert result.passed is False  # below 80% threshold

    def test_exception_in_criterion_treated_as_failure(self):
        ev = AgentEvaluator("crash_test").add_criterion("raises", lambda r: 1 / 0)
        result = ev.evaluate({})
        assert result.score == 0.0
        assert "raises" in result.failed_criteria

    def test_empty_criteria_gives_score_1(self):
        ev = AgentEvaluator("empty")
        result = ev.evaluate({"anything": True})
        assert result.score == 1.0
        assert result.passed is True
