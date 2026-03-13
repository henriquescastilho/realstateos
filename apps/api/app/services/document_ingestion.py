from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.charge import Charge
from app.models.contract import Contract
from app.models.document import Document
from app.models.property import Property
from app.services.document_service import create_document_record


def upload_monthly_bill(
    db: Session,
    tenant_id: str,
    property_id: str,
    document_type: str,
    filename: str,
    file_bytes: bytes,
    extracted_amount: str | None,
    extracted_due_date: str | None,
) -> Document:
    document = create_document_record(db, tenant_id, property_id, document_type, filename, file_bytes)

    property_record = db.scalar(select(Property).where(Property.id == property_id, Property.tenant_id == tenant_id))
    contract = None
    if property_record is not None:
        contract = db.scalar(select(Contract).where(Contract.property_id == property_id, Contract.tenant_id == tenant_id))

    if contract is not None and extracted_amount and extracted_due_date:
        charge = Charge(
            tenant_id=tenant_id,
            property_id=property_id,
            contract_id=contract.id,
            type=document_type,
            description=f"{document_type} uploaded bill",
            amount=Decimal(extracted_amount),
            due_date=date.fromisoformat(extracted_due_date),
            source="UPLOAD",
            status="pending",
        )
        db.add(charge)
        db.commit()

    return document
