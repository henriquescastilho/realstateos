from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.repositories.property_repo import list_properties_for_tenant
from app.schemas.property import PropertyCreate, PropertyRead
from app.services.demo_tenant import get_or_create_demo_tenant
from app.services.property_service import create_property

router = APIRouter()


@router.post("", response_model=PropertyRead, status_code=status.HTTP_201_CREATED)
def create_property_route(payload: PropertyCreate, db: Session = Depends(get_db)):
    demo_tenant = get_or_create_demo_tenant(db)
    return create_property(db, demo_tenant.id, payload)


@router.get("", response_model=list[PropertyRead])
def list_properties(db: Session = Depends(get_db)):
    demo_tenant = get_or_create_demo_tenant(db)
    return list_properties_for_tenant(db, demo_tenant.id)
