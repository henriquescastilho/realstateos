from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.owner import Owner
from app.models.property import Property
from app.schemas.property import PropertyCreate


def create_property(db: Session, tenant_id: str, payload: PropertyCreate) -> Property:
    owner = db.scalar(select(Owner).where(Owner.id == payload.owner_id, Owner.tenant_id == tenant_id))
    if owner is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Owner not found.")

    property_record = Property(tenant_id=tenant_id, **payload.model_dump())
    db.add(property_record)
    db.commit()
    db.refresh(property_record)
    return property_record
