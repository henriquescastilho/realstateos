"""MinIO/S3 storage service.

Provides a thin wrapper around boto3 for object storage operations:
- Multipart upload of binary data
- Presigned URL generation for download
- Object deletion

Configuration is taken from ``app.config.settings``:
    s3_endpoint_url       — MinIO endpoint (http://minio:9000 in Docker)
    s3_access_key_id      — MinIO access key
    s3_secret_access_key  — MinIO secret key
    s3_bucket_name        — target bucket

Usage::

    from app.services.storage import StorageService

    svc = StorageService()
    key = svc.upload(b"...", "application/pdf", "contracts/my.pdf")
    url = svc.presigned_url(key, expires_in=3600)
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

try:
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError

    _BOTO_AVAILABLE = True
except ImportError:
    _BOTO_AVAILABLE = False
    logger.warning("boto3 not installed — StorageService will raise on use")


class StorageError(Exception):
    """Raised when an S3/MinIO operation fails."""


class StorageService:
    """Manages object storage operations via the S3-compatible MinIO API."""

    def __init__(self) -> None:
        from app.config import settings  # lazy import to allow testing without full env

        self._bucket = settings.s3_bucket_name
        if _BOTO_AVAILABLE:
            self._client = boto3.client(
                "s3",
                endpoint_url=settings.s3_endpoint_url,
                aws_access_key_id=settings.s3_access_key_id,
                aws_secret_access_key=settings.s3_secret_access_key,
                # MinIO requires path-style access
                config=boto3.session.Config(signature_version="s3v4"),  # type: ignore[attr-defined]
            )
            self._ensure_bucket()
        else:
            self._client = None

    def _ensure_bucket(self) -> None:
        """Create the bucket if it does not already exist (idempotent)."""
        try:
            self._client.head_bucket(Bucket=self._bucket)
        except Exception:  # noqa: BLE001
            try:
                self._client.create_bucket(Bucket=self._bucket)
                logger.info("Created MinIO bucket: %s", self._bucket)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Could not create bucket %s: %s", self._bucket, exc)

    def upload(
        self,
        data: bytes,
        content_type: str,
        object_key: str,
    ) -> str:
        """Upload *data* to *object_key* in the configured bucket.

        Returns the object key on success.
        Raises :class:`StorageError` on failure.
        """
        if not _BOTO_AVAILABLE or self._client is None:
            raise StorageError("boto3 is not installed — cannot upload to MinIO")

        try:
            self._client.put_object(
                Bucket=self._bucket,
                Key=object_key,
                Body=data,
                ContentType=content_type,
                ContentLength=len(data),
            )
            logger.info("Uploaded object: bucket=%s key=%s size=%d", self._bucket, object_key, len(data))
            return object_key
        except Exception as exc:  # noqa: BLE001
            raise StorageError(f"Upload failed for key '{object_key}': {exc}") from exc

    def presigned_url(self, object_key: str, expires_in: int = 3600) -> str:
        """Generate a presigned GET URL for *object_key* valid for *expires_in* seconds.

        Raises :class:`StorageError` on failure.
        """
        if not _BOTO_AVAILABLE or self._client is None:
            raise StorageError("boto3 is not installed — cannot generate presigned URL")

        try:
            url: str = self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self._bucket, "Key": object_key},
                ExpiresIn=expires_in,
            )
            return url
        except Exception as exc:  # noqa: BLE001
            raise StorageError(f"Presigned URL failed for key '{object_key}': {exc}") from exc

    def delete(self, object_key: str) -> None:
        """Delete an object from the bucket. No-op if object does not exist."""
        if not _BOTO_AVAILABLE or self._client is None:
            raise StorageError("boto3 is not installed — cannot delete from MinIO")

        try:
            self._client.delete_object(Bucket=self._bucket, Key=object_key)
            logger.info("Deleted object: bucket=%s key=%s", self._bucket, object_key)
        except Exception as exc:  # noqa: BLE001
            raise StorageError(f"Delete failed for key '{object_key}': {exc}") from exc

    def copy(self, source_key: str, dest_key: str) -> None:
        """Copy an object within the same bucket."""
        if not _BOTO_AVAILABLE or self._client is None:
            raise StorageError("boto3 is not installed — cannot copy in MinIO")

        try:
            self._client.copy_object(
                Bucket=self._bucket,
                CopySource={"Bucket": self._bucket, "Key": source_key},
                Key=dest_key,
            )
        except Exception as exc:  # noqa: BLE001
            raise StorageError(f"Copy failed {source_key} → {dest_key}: {exc}") from exc
