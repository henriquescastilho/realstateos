from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.document import Document
from app.schemas.document import DocumentRead
from app.services.demo_tenant import get_or_create_demo_tenant
from app.services.document_ingestion import upload_monthly_bill

router = APIRouter()


@router.get("", response_model=list[DocumentRead])
def list_documents(db: Session = Depends(get_db)):
    demo_tenant = get_or_create_demo_tenant(db)
    return list(db.scalars(select(Document).where(Document.tenant_id == demo_tenant.id)).all())


@router.post("/upload", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
def upload_document(
    property_id: Annotated[str, Form()],
    type: Annotated[str, Form()],
    extracted_amount: Annotated[str | None, Form()] = None,
    extracted_due_date: Annotated[str | None, Form()] = None,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    content = file.file.read()
    demo_tenant = get_or_create_demo_tenant(db)
    return upload_monthly_bill(
        db=db,
        tenant_id=demo_tenant.id,
        property_id=property_id,
        document_type=type,
        filename=file.filename,
        file_bytes=content,
        extracted_amount=extracted_amount,
        extracted_due_date=extracted_due_date,
    )
