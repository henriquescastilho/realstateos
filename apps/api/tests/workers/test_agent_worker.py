from datetime import date
from decimal import Decimal

import pytest

from app.models.charge import Charge
from app.models.contract import Contract
from app.models.owner import Owner
from app.models.property import Property
from app.models.renter import Renter
from app.models.tenant import Tenant
from app.workers.agent_worker import BillingAgentWorker


def seed_worker_graph(db_session):
    tenant = Tenant(name="Worker Billing Realty")
    owner = Owner(
        tenant=tenant,
        name="Owner Worker",
        document="123",
        email="owner@worker.com",
        phone="1111",
    )
    renter = Renter(
        tenant=tenant,
        name="Renter Worker",
        document="456",
        email="renter@worker.com",
        phone="2222",
    )
    property_record = Property(
        tenant=tenant,
        owner=owner,
        address="Rua Worker Billing, 10",
        city="Sao Paulo",
        state="SP",
        zip="01010-010",
        iptu_registration_number="IPTU-WORKER",
    )
    contract = Contract(
        tenant=tenant,
        property=property_record,
        renter=renter,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
        monthly_rent=Decimal("2000.00"),
        due_day=1,
    )
    db_session.add_all([tenant, owner, renter, property_record, contract])
    db_session.commit()
    db_session.refresh(tenant)
    db_session.refresh(property_record)
    db_session.refresh(contract)
    return tenant, property_record, contract


def test_worker_executes_generate_monthly_charge_deterministically(db_session):
    tenant, _property_record, contract = seed_worker_graph(db_session)
    worker = BillingAgentWorker(db=db_session, tenant_id=tenant.id)

    result = worker.execute(
        "GENERATE_MONTHLY_CHARGE",
        {"contract_id": contract.id, "month_ref": "2026-02"},
    )

    assert result["ok"] is True
    assert result["operation"] == "generate_monthly_charge"
    assert result["message"] == "Cobrança mensal gerada automaticamente"


def test_worker_writes_safe_failure_message_when_payment_generation_raises(db_session, monkeypatch):
    tenant, property_record, contract = seed_worker_graph(db_session)
    charge = Charge(
        tenant_id=tenant.id,
        property_id=property_record.id,
        contract_id=contract.id,
        type="CONSOLIDATED",
        description="Aluguel + IPTU + Condomínio",
        amount=Decimal("2800.00"),
        due_date=date(2026, 2, 2),
        source="CONSOLIDATION",
        status="pending",
    )
    db_session.add(charge)
    db_session.commit()
    db_session.refresh(charge)

    worker = BillingAgentWorker(db=db_session, tenant_id=tenant.id)

    def explode(*args, **kwargs):
        raise RuntimeError("sandbox down")

    monkeypatch.setattr(worker.tools, "generate_payment", explode)

    result = worker.execute("GENERATE_PAYMENT", {"charge_id": charge.id})

    assert result["ok"] is False
    assert result["operation"] == "generate_payment"
    assert result["message"] == "Falha ao processar tarefa de billing"
    assert result["error"] == "internal_error"


def test_worker_rejects_unknown_operation_explicitly(db_session):
    tenant, _property_record, _contract = seed_worker_graph(db_session)
    worker = BillingAgentWorker(db=db_session, tenant_id=tenant.id)

    result = worker.execute("UNSUPPORTED_TASK", {"message": "noop"})

    assert result["ok"] is False
    assert result["operation"] == "unsupported_task"
    assert result["message"] == "Unsupported billing task."


def test_worker_rejects_invalid_payload_explicitly(db_session):
    tenant, _property_record, _contract = seed_worker_graph(db_session)
    worker = BillingAgentWorker(db=db_session, tenant_id=tenant.id)

    result = worker.execute("GENERATE_MONTHLY_CHARGE", {"month_ref": "2026-02"})

    assert result["ok"] is False
    assert result["operation"] == "generate_monthly_charge"
    assert result["message"] == "Invalid billing task payload."
    assert result["error"] == "missing_keys:contract_id"
