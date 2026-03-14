import logging
from io import BytesIO
from uuid import uuid4

import boto3
from botocore.exceptions import ClientError
from sqlalchemy.orm import Session

from app.config import settings
from app.integrations.ocr import parse_pdf_document
from app.models.document import Document

logger = logging.getLogger("realestateos.document_service")


def _get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key_id,
        aws_secret_access_key=settings.s3_secret_access_key,
    )


def _ensure_bucket_exists(client, bucket_name: str) -> None:
    try:
        client.head_bucket(Bucket=bucket_name)
    except ClientError:
        logger.info("Creating S3 bucket: %s", bucket_name)
        client.create_bucket(Bucket=bucket_name)


def _upload_to_s3(file_key: str, file_bytes: bytes) -> str:
    client = _get_s3_client()
    bucket = settings.s3_bucket_name
    _ensure_bucket_exists(client, bucket)
    client.upload_fileobj(
        BytesIO(file_bytes),
        bucket,
        file_key,
        ExtraArgs={"ContentType": "application/pdf"},
    )
    return f"s3://{bucket}/{file_key}"


def create_document_record(
    db: Session,
    tenant_id: str,
    property_id: str,
    document_type: str,
    filename: str,
    file_bytes: bytes,
) -> Document:
    file_key = f"{tenant_id}/{property_id}/{uuid4()}-{filename}"

    # Upload to S3/MinIO
    file_url = _upload_to_s3(file_key, file_bytes)

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
