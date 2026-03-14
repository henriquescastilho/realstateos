from fastapi import APIRouter, Depends, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, get_current_user
from app.api.deps import get_db
from app.middleware.tenant import OrgContext, get_demo_or_authed_org
from app.models.charge import Charge
from app.schemas.charge import ChargeRead, ConsolidatedChargeRead, GenerateMonthlyChargeRequest
from app.services.consolidation import consolidate_pending_charges
from app.services.monthly_billing import create_monthly_rent_charge
from app.services.santander import generate_payment_payload
from app.services.task_service import create_task_record

router = APIRouter()
billing_limiter = Limiter(key_func=get_remote_address)


@router.get("", response_model=list[ChargeRead])
def list_charges(
    org: OrgContext = Depends(get_demo_or_authed_org),
    db: Session = Depends(get_db),
):
    return list(db.scalars(select(Charge).where(Charge.tenant_id == org.tenant_id)).all())


@router.post("/generate-monthly", response_model=list[ChargeRead], status_code=status.HTTP_201_CREATED)
@billing_limiter.limit("10/minute")
def generate_monthly_charge(
    request: Request,
    payload: GenerateMonthlyChargeRequest,
    org: OrgContext = Depends(get_demo_or_authed_org),
    db: Session = Depends(get_db),
):
    charges = create_monthly_rent_charge(db, org.tenant_id, payload.contract_id, payload.reference_month)
    create_task_record(
        db,
        tenant_id=org.tenant_id,
        task_type="GENERATE_MONTHLY_CHARGE",
        status_value="DONE",
        message="Cobranca mensal gerada automaticamente",
        payload={"contract_id": payload.contract_id, "reference_month": payload.reference_month.isoformat()},
    )
    return charges


@router.post("/consolidate", response_model=ConsolidatedChargeRead, status_code=status.HTTP_201_CREATED)
@billing_limiter.limit("10/minute")
def consolidate_charge_month(
    request: Request,
    payload: GenerateMonthlyChargeRequest,
    org: OrgContext = Depends(get_demo_or_authed_org),
    db: Session = Depends(get_db),
):
    charge = consolidate_pending_charges(db, org.tenant_id, payload.contract_id, payload.reference_month)
    create_task_record(
        db,
        tenant_id=org.tenant_id,
        task_type="CONSOLIDATE_CHARGES",
        status_value="DONE",
        message="Consolidacao realizada",
        payload={"contract_id": payload.contract_id, "reference_month": payload.reference_month.isoformat()},
    )
    return charge


@router.post("/{charge_id}/generate-payment", status_code=status.HTTP_200_OK)
@billing_limiter.limit("10/minute")
def generate_payment(
    request: Request,
    charge_id: str,
    org: OrgContext = Depends(get_demo_or_authed_org),
    db: Session = Depends(get_db),
):
    payment = generate_payment_payload(db, org.tenant_id, charge_id)
    create_task_record(
        db,
        tenant_id=org.tenant_id,
        task_type="GENERATE_PAYMENT",
        status_value="DONE",
        message="Boleto Santander emitido" if payment["provider"] == "santander" else "Pagamento mock gerado",
        payload={"charge_id": charge_id, "provider": payment["provider"]},
    )
    return payment
