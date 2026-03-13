import base64

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_context, get_db
from app.core.tenant import RequestContext
from app.integrations.email_ingestion import is_bill_attachment
from app.models.document import Document
from app.schemas.document import DocumentRead, EmailIngestionRequest
from app.services.document_service import create_document_record

router = APIRouter()


@router.get("", response_model=list[DocumentRead])
def list_documents(
    db: Session = Depends(get_db),
    context: Annotated[RequestContext, Depends(get_current_context)] = None,
):
    return list(db.scalars(select(Document).where(Document.tenant_id == context.tenant_id)).all())


@router.post("/upload", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
def upload_document(
    property_id: Annotated[str, Form()],
    type: Annotated[str, Form()],
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    context: Annotated[RequestContext, Depends(get_current_context)] = None,
):
    content = file.file.read()
    return create_document_record(db, context.tenant_id, property_id, type, file.filename, content)


@router.post("/mailbox", status_code=status.HTTP_202_ACCEPTED)
def mailbox_ingestion(
    payload: EmailIngestionRequest,
    db: Session = Depends(get_db),
    context: Annotated[RequestContext, Depends(get_current_context)] = None,
):
    ingested_documents = 0
    for attachment in payload.attachments:
        if payload.property_id and is_bill_attachment(attachment.filename):
            create_document_record(
                db=db,
                tenant_id=context.tenant_id,
                property_id=payload.property_id,
                document_type=attachment.type,
                filename=attachment.filename,
                file_bytes=base64.b64decode(attachment.content_base64),
            )
            ingested_documents += 1

    return {
        "tenant_id": context.tenant_id,
        "status": "accepted",
        "attachments_received": len(payload.attachments),
        "ingested_documents": ingested_documents,
    }
