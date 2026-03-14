"""Pydantic schemas for the Webhook system."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, field_validator

# ---------------------------------------------------------------------------
# Supported event types
# ---------------------------------------------------------------------------

SUPPORTED_EVENTS = frozenset(
    {
        "contract.created",
        "contract.updated",
        "contract.terminated",
        "payment.reconciled",
        "payment.divergence",
        "maintenance.created",
        "maintenance.escalated",
        "maintenance.closed",
        "agent.completed",
        "agent.escalated",
        "agent.failed",
        "*",  # wildcard — all events
    }
)


def _validate_events(v: str) -> str:
    parts = [p.strip() for p in v.split(",") if p.strip()]
    if not parts:
        raise ValueError("events must be a non-empty comma-separated list")
    invalid = [p for p in parts if p not in SUPPORTED_EVENTS]
    if invalid:
        raise ValueError(
            f"Unsupported event types: {invalid}. "
            f"Supported: {sorted(SUPPORTED_EVENTS)}"
        )
    return ",".join(parts)


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class WebhookCreate(BaseModel):
    """Payload for registering a new webhook endpoint."""

    url: AnyHttpUrl = Field(
        ...,
        description="The HTTPS URL to deliver events to.",
        examples=["https://api.example.com/webhooks/realstateos"],
    )
    events: str = Field(
        default="*",
        description=(
            "Comma-separated list of event types to subscribe to, or `*` for all. "
            "Supported: contract.created, contract.updated, contract.terminated, "
            "payment.reconciled, payment.divergence, maintenance.created, "
            "maintenance.escalated, maintenance.closed, "
            "agent.completed, agent.escalated, agent.failed."
        ),
        examples=["contract.created,payment.reconciled"],
    )
    description: str | None = Field(
        default=None,
        max_length=500,
        description="Optional human-readable description.",
    )

    @field_validator("events")
    @classmethod
    def validate_events(cls, v: str) -> str:
        return _validate_events(v)

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "url": "https://api.example.com/webhooks/realstateos",
                    "events": "contract.created,payment.reconciled",
                    "description": "Production webhook for ERP integration",
                }
            ]
        }
    )


class WebhookRead(BaseModel):
    """Webhook endpoint as returned by the API (secret is masked)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    url: str
    events: str
    is_active: bool
    description: str | None
    created_at: datetime
    # secret is intentionally excluded for security


class WebhookEventPayload(BaseModel):
    """The JSON body delivered to a registered webhook URL.

    The ``X-RealstateOS-Signature`` header contains
    ``sha256=<hex_digest>`` — computed as HMAC-SHA256 of the raw request body
    using the endpoint's ``secret``.
    """

    event: str = Field(..., description="Event type, e.g. `contract.created`.")
    tenant_id: str = Field(..., description="Organization that generated the event.")
    timestamp: str = Field(..., description="ISO-8601 UTC timestamp.")
    data: dict = Field(..., description="Event-specific payload.")

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "event": "payment.reconciled",
                    "tenant_id": "org-123",
                    "timestamp": "2026-03-14T10:00:00Z",
                    "data": {
                        "charge_id": "chg-456",
                        "payment_id": "pay-789",
                        "amount": "2500.00",
                    },
                }
            ]
        }
    )
