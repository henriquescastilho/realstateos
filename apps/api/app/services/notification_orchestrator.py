"""Unified notification orchestrator — channel selection, deduplication, and delivery."""
from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import UUID

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional dependency imports
# ---------------------------------------------------------------------------
try:
    import redis.asyncio as aioredis  # type: ignore
    _REDIS_AVAILABLE = True
except ImportError:
    _REDIS_AVAILABLE = False

try:
    from sqlalchemy.ext.asyncio import AsyncSession  # type: ignore
    _SQLA_AVAILABLE = True
except ImportError:
    _SQLA_AVAILABLE = False

# ---------------------------------------------------------------------------
# Channel + event type definitions
# ---------------------------------------------------------------------------

class Channel(str, Enum):
    EMAIL = "email"
    WHATSAPP = "whatsapp"
    # Push is defined but not delivered yet — extensibility hook
    PUSH = "push"


class NotificationEvent(str, Enum):
    # Billing
    CHARGE_DUE = "charge.due"
    CHARGE_OVERDUE = "charge.overdue"
    PAYMENT_CONFIRMED = "payment.confirmed"
    # Maintenance
    MAINTENANCE_UPDATE = "maintenance.update"
    MAINTENANCE_SCHEDULED = "maintenance.scheduled"
    # Contract
    CONTRACT_EXPIRING = "contract.expiring"
    # General
    WELCOME = "welcome"
    OWNER_STATEMENT = "owner.statement"


# Per-event defaults: which channels to attempt in priority order
_EVENT_CHANNEL_PRIORITY: dict[NotificationEvent, list[Channel]] = {
    NotificationEvent.CHARGE_DUE: [Channel.WHATSAPP, Channel.EMAIL],
    NotificationEvent.CHARGE_OVERDUE: [Channel.WHATSAPP, Channel.EMAIL],
    NotificationEvent.PAYMENT_CONFIRMED: [Channel.WHATSAPP, Channel.EMAIL],
    NotificationEvent.MAINTENANCE_UPDATE: [Channel.EMAIL, Channel.WHATSAPP],
    NotificationEvent.MAINTENANCE_SCHEDULED: [Channel.EMAIL, Channel.WHATSAPP],
    NotificationEvent.CONTRACT_EXPIRING: [Channel.EMAIL, Channel.WHATSAPP],
    NotificationEvent.WELCOME: [Channel.EMAIL],
    NotificationEvent.OWNER_STATEMENT: [Channel.EMAIL],
}

# Hours of day (local BRT) when WhatsApp messages are acceptable
_WHATSAPP_ALLOWED_HOURS_START = 8   # 08:00
_WHATSAPP_ALLOWED_HOURS_END = 21    # 21:00

# Deduplication window in seconds (24 h)
_DEDUP_TTL_SECONDS = 86_400


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class RenterContact:
    """Minimal contact info needed to send a notification."""
    renter_id: str
    name: str
    email: str | None = None
    phone: str | None = None
    # Explicit channel preference stored on renter profile (optional)
    preferred_channel: Channel | None = None
    # Whether the renter has opted out of any channel
    email_opt_out: bool = False
    whatsapp_opt_out: bool = False


@dataclass
class NotificationPayload:
    """Everything needed to dispatch a single notification."""
    event: NotificationEvent
    recipient: RenterContact
    data: dict[str, Any] = field(default_factory=dict)
    # Optional org/tenant context
    org_id: str | None = None
    # Force a specific channel (overrides auto-selection)
    force_channel: Channel | None = None
    # Idempotency key suffix — extra discriminator to allow same event type
    # to be sent more than once for *different* business reasons within 24h.
    idempotency_suffix: str = ""


@dataclass
class NotificationResult:
    """Result of a single notification dispatch attempt."""
    event: NotificationEvent
    channel: Channel
    recipient_id: str
    success: bool
    message_id: str | None = None
    error: str | None = None
    deduplicated: bool = False


# ---------------------------------------------------------------------------
# In-memory dedup store (fallback when Redis unavailable)
# ---------------------------------------------------------------------------

_MEM_DEDUP: dict[str, float] = {}


def _mem_dedup_check(key: str) -> bool:
    """Return True if key is a duplicate (seen within TTL)."""
    import time
    now = time.time()
    _mem_dedup_prune(now)
    return key in _MEM_DEDUP


def _mem_dedup_record(key: str) -> None:
    import time
    _MEM_DEDUP[key] = time.time() + _DEDUP_TTL_SECONDS


def _mem_dedup_prune(now: float) -> None:
    expired = [k for k, exp in _MEM_DEDUP.items() if exp < now]
    for k in expired:
        del _MEM_DEDUP[k]


# ---------------------------------------------------------------------------
# Core orchestrator
# ---------------------------------------------------------------------------

class NotificationOrchestrator:
    """
    Unified notification dispatcher with:
    - Automatic channel selection based on renter preference, time-of-day,
      and event type defaults.
    - Redis-backed deduplication (in-memory fallback): no duplicate
      notifications for the same (renter, event, suffix) within 24 hours.
    - Graceful degradation when integrations are unavailable.
    """

    def __init__(self, redis_url: str | None = None) -> None:
        self._redis_url = redis_url
        self._redis: Any | None = None

    # ------------------------------------------------------------------
    # Redis connection (lazy)
    # ------------------------------------------------------------------

    async def _get_redis(self) -> Any | None:
        if not _REDIS_AVAILABLE:
            return None
        if self._redis is None and self._redis_url:
            try:
                self._redis = aioredis.from_url(self._redis_url, decode_responses=True)
            except Exception as exc:
                logger.warning("notification_orchestrator: redis connect failed: %s", exc)
        return self._redis

    # ------------------------------------------------------------------
    # Deduplication
    # ------------------------------------------------------------------

    def _dedup_key(self, payload: NotificationPayload) -> str:
        raw = f"notif:{payload.recipient.renter_id}:{payload.event.value}:{payload.idempotency_suffix}"
        return "notif_dedup:" + hashlib.sha256(raw.encode()).hexdigest()[:32]

    async def _is_duplicate(self, payload: NotificationPayload) -> bool:
        key = self._dedup_key(payload)
        r = await self._get_redis()
        if r is not None:
            try:
                return bool(await r.exists(key))
            except Exception:
                pass
        return _mem_dedup_check(key)

    async def _record_sent(self, payload: NotificationPayload) -> None:
        key = self._dedup_key(payload)
        r = await self._get_redis()
        if r is not None:
            try:
                await r.setex(key, _DEDUP_TTL_SECONDS, "1")
                return
            except Exception:
                pass
        _mem_dedup_record(key)

    # ------------------------------------------------------------------
    # Channel selection
    # ------------------------------------------------------------------

    def _select_channel(self, payload: NotificationPayload) -> Channel | None:
        if payload.force_channel:
            return payload.force_channel

        recipient = payload.recipient

        # Build candidate list ordered by priority
        candidates = list(_EVENT_CHANNEL_PRIORITY.get(payload.event, [Channel.EMAIL]))

        # Honour explicit renter preference: move preferred channel to front
        if recipient.preferred_channel and recipient.preferred_channel in candidates:
            candidates.remove(recipient.preferred_channel)
            candidates.insert(0, recipient.preferred_channel)

        for channel in candidates:
            if channel == Channel.EMAIL:
                if recipient.email_opt_out or not recipient.email:
                    continue
                return channel

            if channel == Channel.WHATSAPP:
                if recipient.whatsapp_opt_out or not recipient.phone:
                    continue
                # Time-of-day gate for WhatsApp
                hour = datetime.now(tz=timezone.utc).hour
                # Approximate BRT offset: UTC-3
                brt_hour = (hour - 3) % 24
                if not (_WHATSAPP_ALLOWED_HOURS_START <= brt_hour < _WHATSAPP_ALLOWED_HOURS_END):
                    logger.debug(
                        "notification_orchestrator: skipping WhatsApp for %s — outside allowed hours (BRT %02d:xx)",
                        recipient.renter_id,
                        brt_hour,
                    )
                    continue
                return channel

            if channel == Channel.PUSH:
                # Push not implemented yet — skip silently
                continue

        return None

    # ------------------------------------------------------------------
    # Delivery
    # ------------------------------------------------------------------

    async def _deliver_email(self, payload: NotificationPayload) -> NotificationResult:
        recipient = payload.recipient
        event = payload.event
        data = payload.data

        try:
            from app.integrations.email import get_email_client  # type: ignore

            client = get_email_client()

            if event == NotificationEvent.CHARGE_DUE:
                msg_id = await _run_sync(
                    client.send_charge_notice,
                    recipient.email,
                    recipient.name,
                    data.get("charge_id", ""),
                    data.get("amount", 0.0),
                    data.get("due_date", ""),
                )
            elif event == NotificationEvent.CHARGE_OVERDUE:
                msg_id = await _run_sync(
                    client.send_charge_notice,
                    recipient.email,
                    recipient.name,
                    data.get("charge_id", ""),
                    data.get("amount", 0.0),
                    data.get("due_date", ""),
                )
            elif event == NotificationEvent.PAYMENT_CONFIRMED:
                msg_id = await _run_sync(
                    client.send_payment_confirmation,
                    recipient.email,
                    recipient.name,
                    data.get("charge_id", ""),
                    data.get("amount", 0.0),
                    data.get("paid_at", ""),
                )
            elif event == NotificationEvent.MAINTENANCE_UPDATE:
                msg_id = await _run_sync(
                    client.send_maintenance_update,
                    recipient.email,
                    recipient.name,
                    data.get("ticket_id", ""),
                    data.get("status", ""),
                    data.get("description", ""),
                )
            elif event == NotificationEvent.WELCOME:
                msg_id = await _run_sync(
                    client.send_welcome,
                    recipient.email,
                    recipient.name,
                )
            else:
                # Generic fallback — send a simple text email
                from app.integrations.email import EmailMessage  # type: ignore

                msg = EmailMessage(
                    to_email=recipient.email,  # type: ignore[arg-type]
                    to_name=recipient.name,
                    subject=f"Real Estate OS — {event.value}",
                    body_text=json.dumps(data, ensure_ascii=False, default=str),
                )
                msg_id = await _run_sync(client.send, msg)

            return NotificationResult(
                event=event,
                channel=Channel.EMAIL,
                recipient_id=recipient.renter_id,
                success=True,
                message_id=str(msg_id) if msg_id else None,
            )

        except Exception as exc:
            logger.error(
                "notification_orchestrator: email delivery failed renter=%s event=%s: %s",
                recipient.renter_id,
                event.value,
                exc,
            )
            return NotificationResult(
                event=event,
                channel=Channel.EMAIL,
                recipient_id=recipient.renter_id,
                success=False,
                error=str(exc),
            )

    async def _deliver_whatsapp(self, payload: NotificationPayload) -> NotificationResult:
        recipient = payload.recipient
        event = payload.event
        data = payload.data

        try:
            from app.integrations.whatsapp import get_whatsapp_client  # type: ignore

            client = get_whatsapp_client()
            phone = recipient.phone  # already guaranteed non-None at this point

            if event in (NotificationEvent.CHARGE_DUE, NotificationEvent.CHARGE_OVERDUE):
                msg_id = await _run_sync(
                    client.send_charge_notice,
                    phone,  # type: ignore[arg-type]
                    recipient.name,
                    data.get("charge_id", ""),
                    data.get("amount", 0.0),
                    data.get("due_date", ""),
                )
            elif event == NotificationEvent.PAYMENT_CONFIRMED:
                msg_id = await _run_sync(
                    client.send_payment_confirmation,
                    phone,  # type: ignore[arg-type]
                    recipient.name,
                    data.get("charge_id", ""),
                    data.get("amount", 0.0),
                    data.get("paid_at", ""),
                )
            elif event == NotificationEvent.MAINTENANCE_UPDATE:
                msg_id = await _run_sync(
                    client.send_maintenance_update,
                    phone,  # type: ignore[arg-type]
                    recipient.name,
                    data.get("ticket_id", ""),
                    data.get("status", ""),
                    data.get("description", ""),
                )
            else:
                # Generic text fallback
                text = f"Real Estate OS: {event.value} — " + json.dumps(data, ensure_ascii=False, default=str)
                result = await _run_sync(client.send_text, phone, text)  # type: ignore[arg-type]
                msg_id = result.get("messages", [{}])[0].get("id") if result else None

            return NotificationResult(
                event=event,
                channel=Channel.WHATSAPP,
                recipient_id=recipient.renter_id,
                success=True,
                message_id=str(msg_id) if msg_id else None,
            )

        except Exception as exc:
            logger.error(
                "notification_orchestrator: whatsapp delivery failed renter=%s event=%s: %s",
                recipient.renter_id,
                event.value,
                exc,
            )
            return NotificationResult(
                event=event,
                channel=Channel.WHATSAPP,
                recipient_id=recipient.renter_id,
                success=False,
                error=str(exc),
            )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def send(self, payload: NotificationPayload) -> NotificationResult:
        """
        Main entry point. Selects channel, checks deduplication, and delivers.

        Returns a `NotificationResult` — never raises.
        """
        # Deduplication check
        if await self._is_duplicate(payload):
            logger.info(
                "notification_orchestrator: duplicate suppressed renter=%s event=%s suffix=%r",
                payload.recipient.renter_id,
                payload.event.value,
                payload.idempotency_suffix,
            )
            return NotificationResult(
                event=payload.event,
                channel=Channel.EMAIL,  # placeholder — not actually sent
                recipient_id=payload.recipient.renter_id,
                success=True,
                deduplicated=True,
            )

        channel = self._select_channel(payload)
        if channel is None:
            logger.warning(
                "notification_orchestrator: no viable channel for renter=%s event=%s",
                payload.recipient.renter_id,
                payload.event.value,
            )
            return NotificationResult(
                event=payload.event,
                channel=Channel.EMAIL,
                recipient_id=payload.recipient.renter_id,
                success=False,
                error="no_viable_channel",
            )

        # Deliver
        if channel == Channel.EMAIL:
            result = await self._deliver_email(payload)
        elif channel == Channel.WHATSAPP:
            result = await self._deliver_whatsapp(payload)
        else:
            result = NotificationResult(
                event=payload.event,
                channel=channel,
                recipient_id=payload.recipient.renter_id,
                success=False,
                error=f"channel_not_implemented:{channel.value}",
            )

        # Record dedup key only on success to allow retry on failure
        if result.success:
            await self._record_sent(payload)

        logger.info(
            "notification_orchestrator: dispatched renter=%s event=%s channel=%s success=%s",
            payload.recipient.renter_id,
            payload.event.value,
            channel.value,
            result.success,
        )
        return result

    async def send_bulk(
        self, payloads: list[NotificationPayload]
    ) -> list[NotificationResult]:
        """
        Send multiple notifications. Each is deduped independently.
        Does NOT run in parallel to avoid overwhelming downstream APIs.
        """
        results: list[NotificationResult] = []
        for payload in payloads:
            result = await self.send(payload)
            results.append(result)
        return results


# ---------------------------------------------------------------------------
# Async helper — run sync integration calls without blocking
# ---------------------------------------------------------------------------

async def _run_sync(fn: Any, *args: Any, **kwargs: Any) -> Any:
    """Run a synchronous function in the default executor."""
    import asyncio
    import functools

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, functools.partial(fn, *args, **kwargs))


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_orchestrator: NotificationOrchestrator | None = None


def get_notification_orchestrator(redis_url: str | None = None) -> NotificationOrchestrator:
    """Return module-level singleton, constructing it on first call."""
    global _orchestrator
    if _orchestrator is None:
        import os

        url = redis_url or os.getenv("REDIS_URL")
        _orchestrator = NotificationOrchestrator(redis_url=url)
    return _orchestrator


# ---------------------------------------------------------------------------
# Convenience functions
# ---------------------------------------------------------------------------

async def notify_charge_due(
    renter_id: str,
    name: str,
    email: str | None,
    phone: str | None,
    charge_id: str,
    amount: float,
    due_date: str,
    *,
    org_id: str | None = None,
    idempotency_suffix: str = "",
) -> NotificationResult:
    """Shortcut: send charge-due notification via best available channel."""
    orchestrator = get_notification_orchestrator()
    payload = NotificationPayload(
        event=NotificationEvent.CHARGE_DUE,
        recipient=RenterContact(
            renter_id=renter_id,
            name=name,
            email=email,
            phone=phone,
        ),
        data={"charge_id": charge_id, "amount": amount, "due_date": due_date},
        org_id=org_id,
        idempotency_suffix=idempotency_suffix or charge_id,
    )
    return await orchestrator.send(payload)


async def notify_payment_confirmed(
    renter_id: str,
    name: str,
    email: str | None,
    phone: str | None,
    charge_id: str,
    amount: float,
    paid_at: str,
    *,
    org_id: str | None = None,
) -> NotificationResult:
    """Shortcut: send payment-confirmed notification."""
    orchestrator = get_notification_orchestrator()
    payload = NotificationPayload(
        event=NotificationEvent.PAYMENT_CONFIRMED,
        recipient=RenterContact(
            renter_id=renter_id,
            name=name,
            email=email,
            phone=phone,
        ),
        data={"charge_id": charge_id, "amount": amount, "paid_at": paid_at},
        org_id=org_id,
        idempotency_suffix=charge_id,
    )
    return await orchestrator.send(payload)


async def notify_maintenance_update(
    renter_id: str,
    name: str,
    email: str | None,
    phone: str | None,
    ticket_id: str,
    status: str,
    description: str,
    *,
    org_id: str | None = None,
) -> NotificationResult:
    """Shortcut: send maintenance-update notification."""
    orchestrator = get_notification_orchestrator()
    payload = NotificationPayload(
        event=NotificationEvent.MAINTENANCE_UPDATE,
        recipient=RenterContact(
            renter_id=renter_id,
            name=name,
            email=email,
            phone=phone,
        ),
        data={"ticket_id": ticket_id, "status": status, "description": description},
        org_id=org_id,
        idempotency_suffix=f"{ticket_id}:{status}",
    )
    return await orchestrator.send(payload)
