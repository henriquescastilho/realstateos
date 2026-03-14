from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.middleware.tenant import OrgContext, get_demo_or_authed_org
from app.models.renter import Renter
from app.openapi import AUTH_RESPONSES, RESPONSES_422
from app.schemas.renter import RenterCreate, RenterRead

router = APIRouter()


@router.post(
    "",
    response_model=RenterRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create renter",
    description=(
        "Register a new renter (tenant) under the authenticated organization. "
        "The `document` field accepts CPF (11 digits) or CNPJ (14 digits). "
        "Phone must be in Brazilian format."
    ),
    responses={**AUTH_RESPONSES, **RESPONSES_422},
)
def create_renter(
    payload: RenterCreate,
    org: OrgContext = Depends(get_demo_or_authed_org),
    db: Session = Depends(get_db),
) -> Renter:
    renter = Renter(tenant_id=org.tenant_id, **payload.model_dump())
    db.add(renter)
    db.commit()
    db.refresh(renter)
    return renter


@router.get(
    "",
    response_model=list[RenterRead],
    summary="List renters",
    description="Return all renters belonging to the authenticated tenant.",
    responses={**AUTH_RESPONSES},
)
def list_renters(
    org: OrgContext = Depends(get_demo_or_authed_org),
    db: Session = Depends(get_db),
) -> list[Renter]:
    return list(db.scalars(select(Renter).where(Renter.tenant_id == org.tenant_id)).all())
