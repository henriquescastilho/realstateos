import re
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, get_current_user
from app.api.deps import get_db
from app.models.document import Document
from app.schemas.document import DocumentRead
from app.services.document_ingestion import upload_monthly_bill

upload_limiter = Limiter(key_func=get_remote_address)

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


@router.get("", response_model=list[DocumentRead])
def list_documents(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list(db.scalars(select(Document).where(Document.tenant_id == current_user.tenant_id)).all())


@router.post("/upload", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
@upload_limiter.limit("10/minute")
def upload_document(
    request: Request,
    property_id: Annotated[str, Form()],
    type: Annotated[str, Form()],
    extracted_amount: Annotated[str | None, Form()] = None,
    extracted_due_date: Annotated[str | None, Form()] = None,
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
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
        tenant_id=current_user.tenant_id,
        property_id=property_id,
        document_type=type,
        filename=safe_filename,
        file_bytes=content,
        extracted_amount=extracted_amount,
        extracted_due_date=extracted_due_date,
    )
