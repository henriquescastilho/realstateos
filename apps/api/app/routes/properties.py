from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.middleware.tenant import OrgContext, get_demo_or_authed_org
from app.openapi import AUTH_RESPONSES, RESPONSES_422
from app.repositories.property_repo import list_properties_for_tenant
from app.schemas.property import PropertyCreate, PropertyRead
from app.services.property_service import create_property

router = APIRouter()


@router.post(
    "",
    response_model=PropertyRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create property",
    description=(
        "Register a new property under the authenticated tenant. "
        "The property must be associated with an existing owner via `owner_id`. "
        "`zip` must be a valid Brazilian CEP (8 digits, with or without hyphen)."
    ),
    responses={**AUTH_RESPONSES, **RESPONSES_422},
)
def create_property_route(
    payload: PropertyCreate,
    org: OrgContext = Depends(get_demo_or_authed_org),
    db: Session = Depends(get_db),
):
    return create_property(db, org.tenant_id, payload)


@router.get(
    "",
    response_model=list[PropertyRead],
    summary="List properties",
    description="Return all properties belonging to the authenticated tenant.",
    responses={**AUTH_RESPONSES},
)
def list_properties(
    org: OrgContext = Depends(get_demo_or_authed_org),
    db: Session = Depends(get_db),
):
    return list_properties_for_tenant(db, org.tenant_id)
