from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, get_current_user
from app.api.deps import get_db
from app.middleware.tenant import OrgContext, get_demo_or_authed_org
from app.models.charge import Charge
from app.openapi import AUTH_RESPONSES, RESPONSES_404, RESPONSES_422
from app.schemas.charge import ChargeRead, ConsolidatedChargeRead, GenerateMonthlyChargeRequest
from app.schemas.pagination import PaginatedResponse, PaginationParams
from app.services.consolidation import consolidate_pending_charges
from app.services.monthly_billing import create_monthly_rent_charge
from app.services.santander import generate_payment_payload
from app.services.task_service import create_task_record

router = APIRouter()
billing_limiter = Limiter(key_func=get_remote_address)


@router.get(
    "",
    response_model=PaginatedResponse[ChargeRead],
    summary="List charges",
    description=(
        "Return billing charges for the authenticated tenant, paginated. "
        "Each charge represents a billing line item (monthly rent, fee, adjustment). "
        "Optionally filter by `status` (pending, paid, overdue, partial). "
        "Use `page` and `per_page` query parameters to paginate results."
    ),
    responses={**AUTH_RESPONSES},
)
def list_charges(
    charge_status: str | None = Query(None, alias="status", description="Filter by charge status"),
    p: PaginationParams = Depends(),
    org: OrgContext = Depends(get_demo_or_authed_org),
    db: Session = Depends(get_db),
) -> PaginatedResponse[ChargeRead]:
    base = select(Charge).where(Charge.tenant_id == org.tenant_id)
    if charge_status:
        base = base.where(Charge.status == charge_status.lower())
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    items = list(db.scalars(base.offset(p.offset).limit(p.limit)).all())
    return PaginatedResponse.build(items=items, total=total or 0, params=p)


@router.post(
    "/generate-monthly",
    response_model=list[ChargeRead],
    status_code=status.HTTP_201_CREATED,
    summary="Generate monthly charges",
    description=(
        "Generate all billing line items for a contract for the given reference month. "
        "Typically called automatically by the scheduler on the 1st of each month. "
        "`reference_month` should be the first day of the target month (e.g. `2026-03-01`)."
    ),
    responses={**AUTH_RESPONSES, **RESPONSES_404, **RESPONSES_422},
)
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


@router.post(
    "/consolidate",
    response_model=ConsolidatedChargeRead,
    status_code=status.HTTP_201_CREATED,
    summary="Consolidate charges into boleto",
    description=(
        "Merge all pending charges for a contract + month into a single consolidated boleto. "
        "Returns the total amount and a breakdown of all included line items. "
        "Use this before generating the Santander payment payload."
    ),
    responses={**AUTH_RESPONSES, **RESPONSES_404, **RESPONSES_422},
)
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


@router.post(
    "/{charge_id}/generate-payment",
    status_code=status.HTTP_200_OK,
    summary="Generate Santander payment payload",
    description=(
        "Generate a Santander boleto or PIX payment payload for the specified charge. "
        "Returns the boleto URL and barcode (or PIX QR code) ready to send to the renter. "
        "Falls back to a mock payload when Santander credentials are not configured."
    ),
    responses={**AUTH_RESPONSES, **RESPONSES_404},
)
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
