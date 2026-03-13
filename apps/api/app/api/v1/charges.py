from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_context, get_db
from app.core.tenant import RequestContext
from app.models.charge import Charge
from app.schemas.charge import (
    BoletoResponse,
    ChargeRead,
    ChargeStatusUpdate,
    ConsolidatedChargeRead,
    GenerateMonthlyChargeRequest,
    PixResponse,
)
from app.services.charge_service import (
    consolidate_charges_by_property_month,
    create_monthly_charges,
    generate_boleto_for_charge,
    generate_pix_for_charge,
    update_charge_status,
)

router = APIRouter()


@router.get("", response_model=list[ChargeRead])
def list_charges(
    db: Session = Depends(get_db),
    context: Annotated[RequestContext, Depends(get_current_context)] = None,
):
    return list(db.scalars(select(Charge).where(Charge.tenant_id == context.tenant_id)).all())


@router.get("/consolidated", response_model=list[ConsolidatedChargeRead])
def consolidated_charges(
    reference_month: str,
    db: Session = Depends(get_db),
    context: Annotated[RequestContext, Depends(get_current_context)] = None,
):
    return consolidate_charges_by_property_month(
        db,
        context.tenant_id,
        date.fromisoformat(reference_month),
    )


@router.post("/generate_monthly", response_model=list[ChargeRead], status_code=201)
def generate_monthly_charges(
    payload: GenerateMonthlyChargeRequest,
    db: Session = Depends(get_db),
    context: Annotated[RequestContext, Depends(get_current_context)] = None,
):
    return create_monthly_charges(db, context.tenant_id, payload.contract_id, payload.reference_month)


@router.patch("/{charge_id}/status", response_model=ChargeRead)
def patch_charge_status(
    charge_id: str,
    payload: ChargeStatusUpdate,
    db: Session = Depends(get_db),
    context: Annotated[RequestContext, Depends(get_current_context)] = None,
):
    return update_charge_status(db, context.tenant_id, charge_id, payload.status)


@router.post("/{charge_id}/generate_boleto", response_model=BoletoResponse)
def generate_boleto(
    charge_id: str,
    db: Session = Depends(get_db),
    context: Annotated[RequestContext, Depends(get_current_context)] = None,
):
    return generate_boleto_for_charge(db, context.tenant_id, charge_id)


@router.post("/{charge_id}/generate_pix", response_model=PixResponse)
def generate_pix(
    charge_id: str,
    db: Session = Depends(get_db),
    context: Annotated[RequestContext, Depends(get_current_context)] = None,
):
    return generate_pix_for_charge(db, context.tenant_id, charge_id)
