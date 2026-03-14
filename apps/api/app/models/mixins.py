from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column


class UUIDPrimaryKeyMixin:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class SoftDeleteMixin:
    """Mixin that adds soft-delete support.

    Models using this mixin should filter `deleted_at IS NULL` by default.
    Use the repository helpers `soft_delete()` and `restore()` instead of
    `db.delete()` for models with this mixin.
    """
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

