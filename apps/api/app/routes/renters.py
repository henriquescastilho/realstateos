from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.renter import Renter
from app.schemas.renter import RenterCreate, RenterRead
from app.services.demo_tenant import get_or_create_demo_tenant

router = APIRouter()


@router.post("", response_model=RenterRead, status_code=status.HTTP_201_CREATED)
def create_renter(payload: RenterCreate, db: Session = Depends(get_db)) -> Renter:
    demo_tenant = get_or_create_demo_tenant(db)
    renter = Renter(tenant_id=demo_tenant.id, **payload.model_dump())
    db.add(renter)
    db.commit()
    db.refresh(renter)
    return renter


@router.get("", response_model=list[RenterRead])
def list_renters(db: Session = Depends(get_db)) -> list[Renter]:
    demo_tenant = get_or_create_demo_tenant(db)
    return list(db.scalars(select(Renter).where(Renter.tenant_id == demo_tenant.id)).all())
