from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.middleware.tenant import OrgContext, get_demo_or_authed_org
from app.models.document import Document
from app.openapi import AUTH_RESPONSES, RESPONSES_422
from app.schemas.document import DocumentRead
from app.services.document_ingestion import upload_monthly_bill

router = APIRouter()


@router.get(
    "",
    response_model=list[DocumentRead],
    summary="List documents",
    description=(
        "Return all documents stored for the authenticated tenant. "
        "Documents include contract PDFs, monthly bill scans, and maintenance photos."
    ),
    responses={**AUTH_RESPONSES},
)
def list_documents(
    org: OrgContext = Depends(get_demo_or_authed_org),
    db: Session = Depends(get_db),
):
    return list(db.scalars(select(Document).where(Document.tenant_id == org.tenant_id)).all())


@router.post(
    "/upload",
    response_model=DocumentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Upload document",
    description=(
        "Upload a document file (PDF, image) and attach it to a property. "
        "The file is stored in MinIO and a metadata record is created. "
        "Provide `extracted_amount` and `extracted_due_date` when uploading a monthly bill "
        "to pre-populate billing data without OCR."
    ),
    responses={**AUTH_RESPONSES, **RESPONSES_422},
)
def upload_document(
    property_id: Annotated[str, Form(description="UUID of the property this document belongs to")],
    type: Annotated[str, Form(description="Document type: monthly_bill, contract, inspection_report, other")],
    extracted_amount: Annotated[str | None, Form(description="Pre-extracted amount in BRL (optional)")] = None,
    extracted_due_date: Annotated[str | None, Form(description="Pre-extracted due date YYYY-MM-DD (optional)")] = None,
    file: UploadFile = File(..., description="File to upload (PDF or image, max 50 MB)"),
    org: OrgContext = Depends(get_demo_or_authed_org),
    db: Session = Depends(get_db),
):
    content = file.file.read()
    return upload_monthly_bill(
        db=db,
        tenant_id=org.tenant_id,
        property_id=property_id,
        document_type=type,
        filename=file.filename,
        file_bytes=content,
        extracted_amount=extracted_amount,
        extracted_due_date=extracted_due_date,
    )
