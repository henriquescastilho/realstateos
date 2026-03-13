from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.agents.billing_agent.tools import BillingAgentTools
from app.models.charge import Charge
from app.models.contract import Contract
from app.models.owner import Owner
from app.models.property import Property
from app.models.renter import Renter
from app.models.task import Task
from app.models.tenant import Tenant


def seed_contract_graph(db_session):
    tenant = Tenant(name="Billing Agent Realty")
    owner = Owner(
        tenant=tenant,
        name="Owner Agent",
        document="123",
        email="owner@agent.com",
        phone="1111",
    )
    renter = Renter(
        tenant=tenant,
        name="Renter Agent",
        document="456",
        email="renter@agent.com",
        phone="2222",
    )
    property_record = Property(
        tenant=tenant,
        owner=owner,
        address="Rua Billing Agent, 10",
        city="Sao Paulo",
        state="SP",
        zip="01010-010",
        iptu_registration_number="IPTU-AGENT",
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


def test_generate_monthly_charge_returns_structured_output_and_writes_expected_message(db_session):
    tenant, _property_record, contract = seed_contract_graph(db_session)
    tools = BillingAgentTools(db=db_session, tenant_id=tenant.id)

    result = tools.generate_monthly_charge(contract_id=contract.id, month_ref="2026-02")

    task = db_session.scalar(select(Task).where(Task.type == "GENERATE_MONTHLY_CHARGE"))

    assert result["ok"] is True
    assert result["operation"] == "generate_monthly_charge"
    assert result["contract_id"] == contract.id
    assert result["month_ref"] == "2026-02"
    assert result["message"] == "Cobrança mensal gerada automaticamente"
    assert result["generated_charge_ids"]
    assert task is not None
    assert task.payload["message"] == "Cobrança mensal gerada automaticamente"


def test_consolidate_monthly_charges_returns_structured_output_and_writes_expected_message(db_session):
    tenant, property_record, contract = seed_contract_graph(db_session)
    db_session.add_all(
        [
            Charge(
                tenant_id=tenant.id,
                property_id=property_record.id,
                contract_id=contract.id,
                type="RENT",
                description="Rent",
                amount=Decimal("2000.00"),
                due_date=date(2026, 2, 2),
                source="SYSTEM",
                status="pending",
            ),
            Charge(
                tenant_id=tenant.id,
                property_id=property_record.id,
                contract_id=contract.id,
                type="CONDO",
                description="Condo",
                amount=Decimal("500.00"),
                due_date=date(2026, 2, 5),
                source="UPLOAD",
                status="pending",
            ),
        ]
    )
    db_session.commit()

    tools = BillingAgentTools(db=db_session, tenant_id=tenant.id)
    result = tools.consolidate_monthly_charges(contract_id=contract.id, property_id=property_record.id, month_ref="2026-02")

    task = db_session.scalar(select(Task).where(Task.type == "CONSOLIDATE_CHARGES"))

    assert result["ok"] is True
    assert result["operation"] == "consolidate_monthly_charges"
    assert result["property_id"] == property_record.id
    assert result["contract_id"] == contract.id
    assert result["month_ref"] == "2026-02"
    assert result["message"] == "Consolidação realizada"
    assert result["consolidated_charge_id"]
    assert result["total_amount"] == "2500.00"
    assert task is not None
    assert task.payload["message"] == "Consolidação realizada"


def test_generate_payment_returns_structured_output_and_writes_success_message(db_session):
    tenant, property_record, contract = seed_contract_graph(db_session)
    consolidated_charge = Charge(
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
    db_session.add(consolidated_charge)
    db_session.commit()
    db_session.refresh(consolidated_charge)

    tools = BillingAgentTools(db=db_session, tenant_id=tenant.id)
    result = tools.generate_payment(charge_id=consolidated_charge.id)

    task = db_session.scalar(select(Task).where(Task.type == "GENERATE_PAYMENT"))

    assert result["ok"] is True
    assert result["operation"] == "generate_payment"
    assert result["charge_id"] == consolidated_charge.id
    assert result["message"] == "Boleto Santander emitido"
    assert result["payment"]["boleto_url"]
    assert result["payment"]["pix_qrcode"]
    assert task is not None
    assert task.payload["message"] == "Boleto Santander emitido"


def test_register_task_message_returns_task_metadata(db_session):
    tenant, _property_record, contract = seed_contract_graph(db_session)
    tools = BillingAgentTools(db=db_session, tenant_id=tenant.id)

    result = tools.register_task_message(
        task_type="GENERATE_PAYMENT",
        message="Falha ao emitir boleto; usar mock",
        payload={"contract_id": contract.id},
        contract_id=contract.id,
    )

    task = db_session.scalar(select(Task).where(Task.id == result["task_id"]))

    assert result["ok"] is True
    assert result["operation"] == "register_task_message"
    assert result["message"] == "Falha ao emitir boleto; usar mock"
    assert task is not None
    assert task.payload["contract_id"] == contract.id
    assert task.payload["message"] == "Falha ao emitir boleto; usar mock"
