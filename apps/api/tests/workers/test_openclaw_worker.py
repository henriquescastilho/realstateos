from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.models.charge import Charge
from app.models.contract import Contract
from app.models.owner import Owner
from app.models.property import Property
from app.models.renter import Renter
from app.models.task import Task
from app.models.tenant import Tenant
from app.workers.openclaw_worker import OpenClawExecutionWorker


def seed_openclaw_graph(db_session):
    tenant = Tenant(name="OpenClaw Realty")
    owner = Owner(
        tenant=tenant,
        name="Owner OC",
        document="123",
        email="owner@oc.com",
        phone="1111",
    )
    renter = Renter(
        tenant=tenant,
        name="Renter OC",
        document="456",
        email="renter@oc.com",
        phone="2222",
    )
    property_record = Property(
        tenant=tenant,
        owner=owner,
        address="Rua OC, 10",
        city="Sao Paulo",
        state="SP",
        zip="01010-010",
        iptu_registration_number="IPTU-OC",
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


def test_worker_processes_pending_generate_monthly_charge_task(db_session):
    tenant, _property_record, contract = seed_openclaw_graph(db_session)
    task = Task(
        tenant_id=tenant.id,
        type="GENERATE_MONTHLY_CHARGE",
        status="PENDING",
        payload={"tenant_id": tenant.id, "contract_id": contract.id, "month_ref": "2026-02"},
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    worker = OpenClawExecutionWorker(session_factory=lambda: db_session)
    result = worker.run_once()

    updated_task = db_session.scalar(select(Task).where(Task.id == task.id))

    assert result["processed"] == 1
    assert updated_task is not None
    assert updated_task.status == "DONE"
    assert updated_task.payload["message"] == "Cobrança mensal gerada automaticamente"
    assert updated_task.payload["result"]["operation"] == "generate_monthly_charge"


def test_worker_processes_pending_generate_payment_task(db_session):
    tenant, property_record, contract = seed_openclaw_graph(db_session)
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

    task = Task(
        tenant_id=tenant.id,
        type="GENERATE_PAYMENT",
        status="PENDING",
        payload={"tenant_id": tenant.id, "charge_id": charge.id},
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    worker = OpenClawExecutionWorker(session_factory=lambda: db_session)
    worker.run_once()

    updated_task = db_session.scalar(select(Task).where(Task.id == task.id))

    assert updated_task is not None
    assert updated_task.status == "DONE"
    assert updated_task.payload["result"]["operation"] == "generate_payment"
    assert updated_task.payload["message"] in {"Boleto Santander emitido", "Falha ao emitir boleto; usar mock"}


def test_worker_marks_task_failed_when_billing_agent_raises(db_session, monkeypatch):
    tenant, _property_record, contract = seed_openclaw_graph(db_session)
    task = Task(
        tenant_id=tenant.id,
        type="GENERATE_MONTHLY_CHARGE",
        status="PENDING",
        payload={"tenant_id": tenant.id, "contract_id": contract.id, "month_ref": "2026-02"},
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    worker = OpenClawExecutionWorker(session_factory=lambda: db_session)

    def explode(*args, **kwargs):
        raise RuntimeError("agent down")

    monkeypatch.setattr(worker, "_execute_task", explode)

    result = worker.run_once()
    updated_task = db_session.scalar(select(Task).where(Task.id == task.id))

    assert result["processed"] == 1
    assert updated_task is not None
    assert updated_task.status == "FAILED"
    assert updated_task.payload["message"] == "Falha ao emitir boleto; usar mock"
    assert updated_task.payload["error"] == "agent down"


def test_worker_noops_when_no_pending_tasks_exist(db_session):
    worker = OpenClawExecutionWorker(session_factory=lambda: db_session)

    result = worker.run_once()

    assert result == {"processed": 0}
