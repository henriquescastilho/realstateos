from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_context, get_db
from app.core.tenant import RequestContext
from app.repositories.property_repo import list_properties_for_tenant
from app.schemas.property import PropertyCreate, PropertyRead
from app.services.property_service import create_property

router = APIRouter()


@router.post("", response_model=PropertyRead, status_code=status.HTTP_201_CREATED)
def create_property_route(
    payload: PropertyCreate,
    db: Session = Depends(get_db),
    context: Annotated[RequestContext, Depends(get_current_context)] = None,
):
    return create_property(db, context.tenant_id, payload)


@router.get("", response_model=list[PropertyRead])
def list_properties(
    db: Session = Depends(get_db),
    context: Annotated[RequestContext, Depends(get_current_context)] = None,
):
    return list_properties_for_tenant(db, context.tenant_id)

