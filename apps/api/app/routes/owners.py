from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, get_current_user
from app.api.deps import get_db
from app.middleware.tenant import OrgContext, get_demo_or_authed_org
from app.models.owner import Owner
from app.schemas.owner import OwnerCreate, OwnerRead

router = APIRouter()


@router.post("", response_model=OwnerRead, status_code=status.HTTP_201_CREATED)
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


@router.get("", response_model=list[OwnerRead])
def list_owners(
    org: OrgContext = Depends(get_demo_or_authed_org),
    db: Session = Depends(get_db),
) -> list[Owner]:
    return list(db.scalars(select(Owner).where(Owner.tenant_id == org.tenant_id)).all())
