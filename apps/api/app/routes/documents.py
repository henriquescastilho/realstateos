import re
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, get_current_user
from app.api.deps import get_db
from app.middleware.tenant import OrgContext, get_demo_or_authed_org
from app.models.document import Document
from app.openapi import AUTH_RESPONSES, RESPONSES_422
from app.schemas.document import DocumentRead
from app.schemas.pagination import PaginatedResponse, PaginationParams
from app.services.document_ingestion import upload_monthly_bill

router = APIRouter()

MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_CONTENT_TYPES = {"application/pdf"}


def _sanitize_filename(filename: str | None) -> str:
    if not filename:
        return "unnamed.pdf"
    # Remove path separators and special characters
    clean = re.sub(r'[/\\:*?"<>|]', "_", filename)
    # Limit length
    return clean[:255]


@router.get(
    "",
    response_model=PaginatedResponse[DocumentRead],
    summary="List documents",
    description=(
        "Return all documents stored for the authenticated tenant. "
        "Documents include contract PDFs, monthly bill scans, and maintenance photos. "
        "Use `page` and `per_page` query parameters to paginate results."
    ),
    responses={**AUTH_RESPONSES},
)
def list_documents(
    p: PaginationParams = Depends(),
    org: OrgContext = Depends(get_demo_or_authed_org),
    db: Session = Depends(get_db),
) -> PaginatedResponse[DocumentRead]:
    base = select(Document).where(Document.tenant_id == org.tenant_id)
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    items = list(db.scalars(base.offset(p.offset).limit(p.limit)).all())
    return PaginatedResponse.build(items=items, total=total or 0, params=p)


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
    # Validate content type
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Only PDF files are accepted. Received: {file.content_type}",
        )

    # Read with size limit
    content = file.file.read(MAX_UPLOAD_SIZE_BYTES + 1)
    if len(content) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)} MB",
        )

    # Validate extracted_amount if provided
    if extracted_amount is not None:
        try:
            val = float(extracted_amount.replace(",", "."))
            if val <= 0:
                raise ValueError
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="extracted_amount must be a positive number",
            )

    # Validate extracted_due_date if provided
    if extracted_due_date is not None:
        from datetime import date as date_type

        try:
            date_type.fromisoformat(extracted_due_date)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="extracted_due_date must be a valid ISO date (YYYY-MM-DD)",
            )

    safe_filename = _sanitize_filename(file.filename)

    return upload_monthly_bill(
        db=db,
        tenant_id=org.tenant_id,
        property_id=property_id,
        document_type=type,
        filename=safe_filename,
        file_bytes=content,
        extracted_amount=extracted_amount,
        extracted_due_date=extracted_due_date,
    )
