"""WebhookEndpoint model — registered HTTP endpoints that receive event notifications."""

from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


class WebhookEndpoint(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """A tenant-owned HTTP endpoint that receives event notifications.

    The ``secret`` is used to generate an HMAC-SHA256 signature added to every
    delivery as the ``X-RealstateOS-Signature`` request header.  Consumers must
    validate this signature before processing the payload.

    ``events`` is a comma-separated list of event types this endpoint
    subscribes to, e.g. ``"contract.created,payment.reconciled"``.
    ``"*"`` means subscribe to all events.
    """

    __tablename__ = "webhook_endpoints"

    tenant_id: Mapped[str] = mapped_column(
        String(36), nullable=False, index=True
    )
    url: Mapped[str] = mapped_column(Text, nullable=False)
    # Comma-separated event list or "*" for all events
    events: Mapped[str] = mapped_column(Text, nullable=False, default="*")
    # HMAC secret stored in plain text — in production store encrypted
    secret: Mapped[str] = mapped_column(String(128), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
