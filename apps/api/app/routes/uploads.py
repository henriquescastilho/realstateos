"""File upload API.

Endpoints:
    POST /uploads   — Upload a file (PDF, image) to MinIO; returns presigned download URL.

Supported file types:
    contract PDFs, maintenance photos, owner statements

Constraints:
    - Max file size: 50 MB
    - Accepted MIME types: application/pdf, image/jpeg, image/png, image/webp
    - Virus scan: stub (pluggable — set VIRUS_SCAN_ENABLED=true to activate)
"""

from __future__ import annotations

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.middleware.tenant import OrgContext, get_current_org
from app.openapi import AUTH_RESPONSES, RESPONSES_422
from app.services.storage import StorageError, StorageService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/uploads", tags=["uploads"])

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB

_ALLOWED_MIME_TYPES: frozenset[str] = frozenset(
    {
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
    }
)

# Document type → subfolder in MinIO
_DOCUMENT_TYPE_FOLDERS: dict[str, str] = {
    "contract": "contracts",
    "maintenance_photo": "maintenance",
    "owner_statement": "statements",
    "other": "misc",
}


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class UploadResponse(BaseModel):
    """Returned after a successful upload."""

    object_key: str
    download_url: str
    filename: str
    content_type: str
    size_bytes: int
    expires_in_seconds: int = 3600

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "object_key": "tenant-abc/contracts/2026-01/e3b0c4.pdf",
                    "download_url": "http://minio:9000/realestateos/tenant-abc/contracts/...",
                    "filename": "contract.pdf",
                    "content_type": "application/pdf",
                    "size_bytes": 204800,
                    "expires_in_seconds": 3600,
                }
            ]
        }
    }


# ---------------------------------------------------------------------------
# Virus scan stub — pluggable
# ---------------------------------------------------------------------------


def _virus_scan_stub(data: bytes, filename: str) -> None:
    """Placeholder virus scanner.

    In production, replace with a call to ClamAV or a cloud AV service.
    Raises HTTPException 422 if a threat is detected.
    """
    # Stub: always clean.  Replace body with real scanner call.
    pass


# ---------------------------------------------------------------------------
# Upload endpoint
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=UploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a file",
    description=(
        "Stream a file (PDF, image) to MinIO object storage. "
        "Returns a presigned download URL valid for 1 hour. "
        "Supported types: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`. "
        "Maximum file size: **50 MB**. "
        "The `document_type` field determines the storage path: "
        "`contract`, `maintenance_photo`, `owner_statement`, or `other`."
    ),
    responses={**AUTH_RESPONSES, **RESPONSES_422},
)
async def upload_file(
    file: Annotated[UploadFile, File(description="Binary file to upload. Max 50 MB.")],
    document_type: Annotated[
        str,
        Form(description="Document category: contract | maintenance_photo | owner_statement | other"),
    ] = "other",
    org: OrgContext = Depends(get_current_org),
) -> UploadResponse:
    # Validate document_type
    if document_type not in _DOCUMENT_TYPE_FOLDERS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid document_type '{document_type}'. Allowed: {sorted(_DOCUMENT_TYPE_FOLDERS)}",
        )

    # Validate content type
    content_type = file.content_type or "application/octet-stream"
    if content_type not in _ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Unsupported content type '{content_type}'. "
                f"Allowed: {sorted(_ALLOWED_MIME_TYPES)}"
            ),
        )

    # Read body and enforce size limit
    data = await file.read()
    if len(data) > _MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large: {len(data) / (1024 * 1024):.1f} MB. Maximum allowed: 50 MB.",
        )

    if len(data) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded file is empty.",
        )

    # Virus scan (stub — pluggable)
    _virus_scan_stub(data, file.filename or "upload")

    # Build object key: <tenant_id>/<folder>/<uuid>-<filename>
    safe_filename = (file.filename or "upload").replace("..", "").lstrip("/")
    folder = _DOCUMENT_TYPE_FOLDERS[document_type]
    object_key = f"{org.tenant_id}/{folder}/{uuid.uuid4()}-{safe_filename}"

    # Upload to MinIO
    try:
        storage = StorageService()
        storage.upload(data, content_type, object_key)
        download_url = storage.presigned_url(object_key, expires_in=3600)
    except StorageError as exc:
        logger.error("Storage upload failed: org=%s error=%s", org.tenant_id, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="File storage is temporarily unavailable. Please try again later.",
        ) from exc

    logger.info(
        "File uploaded: org=%s key=%s size=%d content_type=%s",
        org.tenant_id,
        object_key,
        len(data),
        content_type,
    )

    return UploadResponse(
        object_key=object_key,
        download_url=download_url,
        filename=safe_filename,
        content_type=content_type,
        size_bytes=len(data),
        expires_in_seconds=3600,
    )
