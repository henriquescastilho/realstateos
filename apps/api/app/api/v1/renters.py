from sqlalchemy import select
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_context, get_db
from app.core.tenant import RequestContext
from app.models.renter import Renter
from app.schemas.renter import RenterCreate, RenterRead

router = APIRouter()


@router.post("", response_model=RenterRead, status_code=status.HTTP_201_CREATED)
def create_renter(
    payload: RenterCreate,
    db: Session = Depends(get_db),
    context: Annotated[RequestContext, Depends(get_current_context)] = None,
) -> Renter:
    renter = Renter(tenant_id=context.tenant_id, **payload.model_dump())
    db.add(renter)
    db.commit()
    db.refresh(renter)
    return renter


@router.get("", response_model=list[RenterRead])
def list_renters(
    db: Session = Depends(get_db),
    context: Annotated[RequestContext, Depends(get_current_context)] = None,
) -> list[Renter]:
    return list(db.scalars(select(Renter).where(Renter.tenant_id == context.tenant_id)).all())
