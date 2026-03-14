from __future__ import annotations

from sqlalchemy import ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class AuditLog(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Append-only audit trail for every automated and human action.

    Records the before/after state of entities and which actor caused the change.
    """

    __tablename__ = "audit_log"

    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)

    # What was affected
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False)  # CREATE, UPDATE, DELETE, STATUS_CHANGE, TOOL_CALL

    # Who caused the change
    actor_type: Mapped[str] = mapped_column(String(20), nullable=False)  # agent, user, system
    actor_id: Mapped[str] = mapped_column(String(100), nullable=False)

    # Link to agent task that triggered this action (nullable for human actions)
    agent_task_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # State snapshot
    before_state: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after_state: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    extra_metadata: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Context
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    correlation_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

