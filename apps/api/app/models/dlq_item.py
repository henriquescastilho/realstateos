from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class DlqItem(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Dead Letter Queue item — persists failed tasks that need human review.

    Tasks that exhaust all retries are moved here for manual investigation.
    Status flow: PENDING → PROCESSING → RESOLVED | DISCARDED
    """

    __tablename__ = "dlq_items"

    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    original_task_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    original_task_type: Mapped[str] = mapped_column(String(100), nullable=False)

    failure_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING", index=True)
    resolution: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
