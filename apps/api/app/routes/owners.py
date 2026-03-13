from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.owner import Owner
from app.schemas.owner import OwnerCreate, OwnerRead
from app.services.demo_tenant import get_or_create_demo_tenant

router = APIRouter()


@router.post("", response_model=OwnerRead, status_code=status.HTTP_201_CREATED)
def create_owner(payload: OwnerCreate, db: Session = Depends(get_db)) -> Owner:
    demo_tenant = get_or_create_demo_tenant(db)
    owner = Owner(tenant_id=demo_tenant.id, **payload.model_dump())
    db.add(owner)
    db.commit()
    db.refresh(owner)
    return owner


@router.get("", response_model=list[OwnerRead])
def list_owners(db: Session = Depends(get_db)) -> list[Owner]:
    demo_tenant = get_or_create_demo_tenant(db)
    return list(db.scalars(select(Owner).where(Owner.tenant_id == demo_tenant.id)).all())
