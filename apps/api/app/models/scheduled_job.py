from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ScheduledJob(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Execution history for APScheduler jobs.

    Each job run creates one record for auditability and debugging.
    """

    __tablename__ = "scheduled_jobs"

    job_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    job_name: Mapped[str] = mapped_column(String(255), nullable=False)

    # null = system-wide job, non-null = tenant-scoped job
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="SCHEDULED", index=True)

    trigger_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    records_processed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    records_failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
