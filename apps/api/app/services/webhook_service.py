"""Webhook delivery service.

Responsible for:
* Finding matching webhook endpoints for a given event type
* Signing the payload with HMAC-SHA256
* Delivering the event via HTTP POST (fire-and-forget, best-effort)

Usage::

    from app.services.webhook_service import dispatch_webhook_event

    dispatch_webhook_event(
        db=db,
        tenant_id=org.tenant_id,
        event="contract.created",
        data={"contract_id": "...", "renter_id": "..."},
    )

The function is deliberately synchronous and logs failures without raising —
webhook delivery must never interrupt the main request flow.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import urllib.request
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.webhook import WebhookEndpoint

logger = logging.getLogger(__name__)

_DELIVERY_TIMEOUT_SECONDS = 5


def _compute_signature(secret: str, body: bytes) -> str:
    """Return ``sha256=<hex>`` HMAC-SHA256 signature for *body* using *secret*."""
    digest = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def _get_matching_endpoints(
    db: Session, tenant_id: str, event: str
) -> list[WebhookEndpoint]:
    """Return active endpoints subscribed to *event* for the given tenant."""
    endpoints = db.scalars(
        select(WebhookEndpoint).where(
            WebhookEndpoint.tenant_id == tenant_id,
            WebhookEndpoint.is_active.is_(True),
            WebhookEndpoint.deleted_at.is_(None),
        )
    ).all()

    matched = []
    for ep in endpoints:
        subscribed = {e.strip() for e in ep.events.split(",") if e.strip()}
        if "*" in subscribed or event in subscribed:
            matched.append(ep)
    return matched


def _deliver(endpoint: WebhookEndpoint, body: bytes, signature: str) -> None:
    """Send a single HTTP POST to *endpoint.url*. Logs errors, never raises."""
    url = str(endpoint.url)
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-RealstateOS-Signature": signature,
            "User-Agent": "RealstateOS-Webhooks/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=_DELIVERY_TIMEOUT_SECONDS) as resp:
            status = resp.status
            if status >= 400:
                logger.warning(
                    "Webhook delivery returned HTTP %s: endpoint_id=%s url=%s",
                    status,
                    endpoint.id,
                    url,
                )
            else:
                logger.info(
                    "Webhook delivered: endpoint_id=%s event=<payload> status=%s",
                    endpoint.id,
                    status,
                )
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "Webhook delivery failed: endpoint_id=%s url=%s error=%s",
            endpoint.id,
            url,
            exc,
        )


def dispatch_webhook_event(
    db: Session,
    tenant_id: str,
    event: str,
    data: dict[str, Any],
) -> int:
    """Dispatch *event* to all matching webhook endpoints for *tenant_id*.

    Returns the number of endpoints notified.
    Delivery is synchronous and best-effort — failures are logged, not raised.
    """
    endpoints = _get_matching_endpoints(db, tenant_id, event)
    if not endpoints:
        return 0

    payload = {
        "event": event,
        "tenant_id": tenant_id,
        "timestamp": datetime.now(UTC).isoformat(),
        "data": data,
    }
    body = json.dumps(payload, default=str).encode()

    for ep in endpoints:
        sig = _compute_signature(ep.secret, body)
        _deliver(ep, body, sig)

    return len(endpoints)


def verify_webhook_signature(secret: str, body: bytes, signature_header: str) -> bool:
    """Verify that *signature_header* matches HMAC-SHA256 of *body* with *secret*.

    Consumers of webhooks should call this in their receivers to authenticate
    payloads from Real Estate OS.

    Returns ``True`` if the signature is valid, ``False`` otherwise.
    """
    expected = _compute_signature(secret, body)
    return hmac.compare_digest(expected, signature_header)
