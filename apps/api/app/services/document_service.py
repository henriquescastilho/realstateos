from pathlib import Path
from uuid import uuid4

from sqlalchemy.orm import Session

from app.integrations.ocr import parse_pdf_document
from app.models.document import Document


def create_document_record(
    db: Session,
    tenant_id: str,
    property_id: str,
    document_type: str,
    filename: str,
    file_bytes: bytes,
) -> Document:
    file_key = f"{tenant_id}/{property_id}/{uuid4()}-{filename}"
    file_url = f"s3://realestateos/{file_key}"
    parsed_data = parse_pdf_document(filename=filename, file_bytes=file_bytes)

    document = Document(
        tenant_id=tenant_id,
        property_id=property_id,
        type=document_type,
        file_url=file_url,
        parsed_data=parsed_data,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


def build_manual_document_task_payload(property_id: str, task_type: str, due_hint: str) -> dict:
    return {
        "property_id": property_id,
        "task_type": task_type,
        "message": f"Please upload the {task_type} before day {due_hint} to avoid interrupting billing flow.",
    }
