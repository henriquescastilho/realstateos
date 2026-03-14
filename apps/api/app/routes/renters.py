from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, get_current_user
from app.api.deps import get_db
from app.models.renter import Renter
from app.schemas.renter import RenterCreate, RenterRead

router = APIRouter()


@router.post("", response_model=RenterRead, status_code=status.HTTP_201_CREATED)
def create_renter(
    payload: RenterCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Renter:
    renter = Renter(tenant_id=current_user.tenant_id, **payload.model_dump())
    db.add(renter)
    db.commit()
    db.refresh(renter)
    return renter


@router.get("", response_model=list[RenterRead])
def list_renters(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Renter]:
    return list(db.scalars(select(Renter).where(Renter.tenant_id == current_user.tenant_id)).all())
