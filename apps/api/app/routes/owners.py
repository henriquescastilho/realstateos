from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, get_current_user
from app.api.deps import get_db
from app.middleware.tenant import OrgContext, get_demo_or_authed_org
from app.models.owner import Owner
from app.openapi import AUTH_RESPONSES, RESPONSES_422
from app.schemas.owner import OwnerCreate, OwnerRead
from app.schemas.pagination import PaginatedResponse, PaginationParams

router = APIRouter()


@router.post(
    "",
    response_model=OwnerRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create owner",
    description=(
        "Register a new property owner under the authenticated tenant. "
        "The `document` field accepts Brazilian CPF (11 digits) or CNPJ (14 digits). "
        "Phone must be in Brazilian format: `(11) 99999-9999` or `+55 11 99999-9999`."
    ),
    responses={**AUTH_RESPONSES, **RESPONSES_422},
)
def create_owner(
    payload: OwnerCreate,
    org: OrgContext = Depends(get_demo_or_authed_org),
    db: Session = Depends(get_db),
) -> Owner:
    owner = Owner(tenant_id=org.tenant_id, **payload.model_dump())
    db.add(owner)
    db.commit()
    db.refresh(owner)
    return owner


@router.get(
    "",
    response_model=PaginatedResponse[OwnerRead],
    summary="List owners",
    description=(
        "Return all property owners belonging to the authenticated tenant. "
        "Use `page` and `per_page` query parameters to paginate results."
    ),
    responses={**AUTH_RESPONSES},
)
def list_owners(
    p: PaginationParams = Depends(),
    org: OrgContext = Depends(get_demo_or_authed_org),
    db: Session = Depends(get_db),
) -> PaginatedResponse[OwnerRead]:
    base = select(Owner).where(Owner.tenant_id == org.tenant_id)
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    items = list(db.scalars(base.offset(p.offset).limit(p.limit)).all())
    return PaginatedResponse.build(items=items, total=total or 0, params=p)
