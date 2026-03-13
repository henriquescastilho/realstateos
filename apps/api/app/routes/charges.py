from datetime import date

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.charge import Charge
from app.schemas.charge import ChargeRead, ConsolidatedChargeRead, GenerateMonthlyChargeRequest
from app.services.consolidation import consolidate_pending_charges
from app.services.demo_tenant import get_or_create_demo_tenant
from app.services.monthly_billing import create_monthly_rent_charge
from app.services.santander import generate_payment_payload
from app.services.task_service import create_task_record

router = APIRouter()


@router.get("", response_model=list[ChargeRead])
def list_charges(db: Session = Depends(get_db)):
    demo_tenant = get_or_create_demo_tenant(db)
    return list(db.scalars(select(Charge).where(Charge.tenant_id == demo_tenant.id)).all())


@router.post("/generate-monthly", response_model=list[ChargeRead], status_code=status.HTTP_201_CREATED)
def generate_monthly_charge(
    payload: GenerateMonthlyChargeRequest,
    db: Session = Depends(get_db),
):
    demo_tenant = get_or_create_demo_tenant(db)
    charges = create_monthly_rent_charge(db, demo_tenant.id, payload.contract_id, payload.reference_month)
    create_task_record(
        db,
        tenant_id=demo_tenant.id,
        task_type="GENERATE_MONTHLY_CHARGE",
        status_value="DONE",
        message="Cobrança mensal gerada automaticamente",
        payload={"contract_id": payload.contract_id, "reference_month": payload.reference_month.isoformat()},
    )
    return charges


@router.post("/consolidate", response_model=ConsolidatedChargeRead, status_code=status.HTTP_201_CREATED)
def consolidate_charge_month(
    payload: GenerateMonthlyChargeRequest,
    db: Session = Depends(get_db),
):
    demo_tenant = get_or_create_demo_tenant(db)
    charge = consolidate_pending_charges(db, demo_tenant.id, payload.contract_id, payload.reference_month)
    create_task_record(
        db,
        tenant_id=demo_tenant.id,
        task_type="CONSOLIDATE_CHARGES",
        status_value="DONE",
        message="Consolidação realizada",
        payload={"contract_id": payload.contract_id, "reference_month": payload.reference_month.isoformat()},
    )
    return charge


@router.post("/{charge_id}/generate-payment", status_code=status.HTTP_200_OK)
def generate_payment(
    charge_id: str,
    db: Session = Depends(get_db),
):
    demo_tenant = get_or_create_demo_tenant(db)
    payment = generate_payment_payload(db, demo_tenant.id, charge_id)
    create_task_record(
        db,
        tenant_id=demo_tenant.id,
        task_type="GENERATE_PAYMENT",
        status_value="DONE",
        message="Boleto Santander emitido" if payment["provider"] == "santander" else "Falha ao emitir boleto; usar mock",
        payload={"charge_id": charge_id, "provider": payment["provider"]},
    )
    return payment
