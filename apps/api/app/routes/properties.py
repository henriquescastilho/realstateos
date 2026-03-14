from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, get_current_user
from app.api.deps import get_db
from app.middleware.tenant import OrgContext, get_demo_or_authed_org
from app.repositories.property_repo import list_properties_for_tenant
from app.schemas.property import PropertyCreate, PropertyRead
from app.services.property_service import create_property

router = APIRouter()


@router.post("", response_model=PropertyRead, status_code=status.HTTP_201_CREATED)
def create_property_route(
    payload: PropertyCreate,
    org: OrgContext = Depends(get_demo_or_authed_org),
    db: Session = Depends(get_db),
):
    return create_property(db, org.tenant_id, payload)


@router.get("", response_model=list[PropertyRead])
def list_properties(
    org: OrgContext = Depends(get_demo_or_authed_org),
    db: Session = Depends(get_db),
):
    return list_properties_for_tenant(db, org.tenant_id)
