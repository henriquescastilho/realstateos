from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.contract import Contract
from app.models.property import Property
from app.models.renter import Renter
from app.schemas.contract import ContractCreate


def create_contract(db: Session, tenant_id: str, payload: ContractCreate) -> Contract:
    property_record = db.scalar(
        select(Property).where(Property.id == payload.property_id, Property.tenant_id == tenant_id)
    )
    renter = db.scalar(select(Renter).where(Renter.id == payload.renter_id, Renter.tenant_id == tenant_id))

    if property_record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found.")
    if renter is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Renter not found.")

    contract = Contract(tenant_id=tenant_id, **payload.model_dump())
    db.add(contract)
    db.commit()
    db.refresh(contract)
    return contract
