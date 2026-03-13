from sqlalchemy import select
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_context, get_db
from app.core.tenant import RequestContext
from app.models.owner import Owner
from app.schemas.owner import OwnerCreate, OwnerRead

router = APIRouter()


@router.post("", response_model=OwnerRead, status_code=status.HTTP_201_CREATED)
def create_owner(
    payload: OwnerCreate,
    db: Session = Depends(get_db),
    context: Annotated[RequestContext, Depends(get_current_context)] = None,
) -> Owner:
    owner = Owner(tenant_id=context.tenant_id, **payload.model_dump())
    db.add(owner)
    db.commit()
    db.refresh(owner)
    return owner


@router.get("", response_model=list[OwnerRead])
def list_owners(
    db: Session = Depends(get_db),
    context: Annotated[RequestContext, Depends(get_current_context)] = None,
) -> list[Owner]:
    return list(db.scalars(select(Owner).where(Owner.tenant_id == context.tenant_id)).all())
