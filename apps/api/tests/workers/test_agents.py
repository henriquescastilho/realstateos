from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.models.contract import Contract
from app.models.owner import Owner
from app.models.property import Property
from app.models.renter import Renter
from app.models.task import Task
from app.models.tenant import Tenant
from app.workers.jobs import run_task


def _seed_contract_data(db_session):
    tenant = Tenant(name="Worker Realty")
    owner = Owner(
        tenant=tenant,
        name="Worker Owner",
        document="123",
        email="owner@worker.com",
        phone="1111",
    )
    renter = Renter(
        tenant=tenant,
        name="Worker Renter",
        document="456",
        email="renter@worker.com",
        phone="2222",
    )
    property_record = Property(
        tenant=tenant,
        owner=owner,
        address="Rua Worker, 10",
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
    db_session.refresh(contract)
    return tenant, property_record, contract


def test_financial_agent_generates_charge_from_task_payload(db_session):
    tenant, _property_record, contract = _seed_contract_data(db_session)
    task = Task(
        tenant_id=tenant.id,
        type="generate_charge",
        status="queued",
        payload={"tenant_id": tenant.id, "contract_id": contract.id, "reference_month": "2026-02-01"},
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    result = run_task(task.id)

    charge_count = db_session.execute(select(Task).where(Task.tenant_id == tenant.id)).all()
    assert result["status"] == "completed"
    assert charge_count


def test_retrieval_agent_creates_manual_notify_task_on_failure(db_session):
    tenant, property_record, _contract = _seed_contract_data(db_session)
    task = Task(
        tenant_id=tenant.id,
        type="retrieve_condo",
        status="queued",
        payload={"tenant_id": tenant.id, "property_id": property_record.id, "due_hint": "5"},
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    result = run_task(task.id)
    manual_tasks = db_session.scalars(select(Task).where(Task.type == "notify_admin")).all()

    assert result["status"] == "escalated"
    assert len(manual_tasks) == 1
    assert "Please upload the condo bill before day 5" in manual_tasks[0].payload["message"]
