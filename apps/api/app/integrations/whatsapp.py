"""Meta WhatsApp Business API integration.

Handles:
- Template message sending (pre-approved HSM templates).
- Media messages (PDF, image) for owner statements and contract documents.
- Delivery receipts: inbound status webhook parser (sent/delivered/read/failed).
- Rate limiting: 1000 messages/day on free tier, tracked per phone_number_id.
- Sandbox mode: all sends are logged, no real HTTP call made.
- Retry + circuit breaker via apps/api/app/utils/resilience.py.

Template names used by Real Estate OS:
    charge_notice         — rent charge notification to renter
    payment_confirmation  — payment received confirmation
    owner_statement       — monthly statement ready for owner
    maintenance_update    — maintenance ticket status update

Usage:
    client = WhatsAppClient.from_env()

    # Send a charge notice
    msg_id = client.send_template(
        to="+5511999990000",
        template="charge_notice",
        language="pt_BR",
        components=[
            TemplateComponent.header_text("Cobrança de Aluguel"),
            TemplateComponent.body(["João Silva", "R$ 2.500,00", "05/04/2026"]),
        ],
    )

    # Parse an inbound status webhook
    receipt = client.parse_status_webhook(raw_body, x_hub_signature)
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import time
from dataclasses import dataclass, field
from datetime import date, datetime
from threading import Lock
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional dependencies with graceful fallback
# ---------------------------------------------------------------------------

try:
    import httpx
    _HAS_HTTPX = True
except ImportError:
    _HAS_HTTPX = False
    logger.warning("httpx not installed — WhatsAppClient HTTP calls will be simulated")

try:
    import redis as redis_lib
    _HAS_REDIS = True
except ImportError:
    _HAS_REDIS = False

try:
    from app.utils.resilience import CircuitBreaker, retry_with_backoff
    _HAS_RESILIENCE = True
except ImportError:
    _HAS_RESILIENCE = False

    def retry_with_backoff(**kwargs):  # type: ignore[misc]
        def decorator(fn):
            return fn
        return decorator

    class CircuitBreaker:  # type: ignore[no-redef]
        def __init__(self, *args, **kwargs): ...
        def __call__(self, fn):
            return fn


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

WHATSAPP_API_BASE = "https://graph.facebook.com/v19.0"

# Meta free tier: 1000 business-initiated conversations/month on tier 0
# Conservative daily cap: 1000 messages/day per phone_number_id
DEFAULT_DAILY_RATE_LIMIT = 1_000

# Rate limit window: 24 hours in seconds
RATE_LIMIT_WINDOW_SECS = 86_400

# Supported media MIME types
ALLOWED_MEDIA_TYPES = {
    "image/jpeg", "image/png", "image/webp",
    "application/pdf",
    "video/mp4",
    "audio/mpeg", "audio/ogg",
}


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class TemplateComponent:
    """A single component in a WhatsApp template message."""

    type: str           # "header" | "body" | "button"
    sub_type: str = ""  # for buttons: "quick_reply" | "url"
    parameters: list[dict] = field(default_factory=list)
    index: int = 0      # for buttons

    @classmethod
    def header_text(cls, text: str) -> "TemplateComponent":
        return cls(type="header", parameters=[{"type": "text", "text": text}])

    @classmethod
    def header_document(cls, link: str, filename: str) -> "TemplateComponent":
        return cls(
            type="header",
            parameters=[{
                "type": "document",
                "document": {"link": link, "filename": filename},
            }],
        )

    @classmethod
    def body(cls, values: list[str]) -> "TemplateComponent":
        """Body parameters — values replace {{1}}, {{2}}, ... placeholders."""
        return cls(
            type="body",
            parameters=[{"type": "text", "text": v} for v in values],
        )

    @classmethod
    def button_quick_reply(cls, payload: str, index: int = 0) -> "TemplateComponent":
        return cls(
            type="button",
            sub_type="quick_reply",
            index=index,
            parameters=[{"type": "payload", "payload": payload}],
        )

    def to_dict(self) -> dict:
        d: dict[str, Any] = {"type": self.type, "parameters": self.parameters}
        if self.sub_type:
            d["sub_type"] = self.sub_type
        if self.type == "button":
            d["index"] = str(self.index)
        return d


@dataclass
class MessageReceipt:
    """Normalised delivery status from a WhatsApp status webhook."""

    message_id: str
    status: str          # "sent" | "delivered" | "read" | "failed"
    recipient: str       # phone number
    timestamp: datetime
    error_code: int | None = None
    error_message: str | None = None
    raw: dict = field(default_factory=dict, repr=False)

    @property
    def is_failed(self) -> bool:
        return self.status == "failed"


@dataclass
class SentMessage:
    """Response from a successful send operation."""

    message_id: str
    to: str
    timestamp: datetime
    sandbox: bool = False


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class WhatsAppRateLimitError(RuntimeError):
    """Raised when the daily rate limit is exceeded."""


class WhatsAppSignatureError(ValueError):
    """Raised when the webhook hub signature is invalid."""


class WhatsAppAPIError(RuntimeError):
    """Raised when the Meta Graph API returns an error."""


# ---------------------------------------------------------------------------
# In-memory rate limiter fallback
# ---------------------------------------------------------------------------

_RATE_LIMIT_COUNTERS: dict[str, dict] = {}
_RATE_LIMIT_LOCK = Lock()


def _rate_check_memory(phone_number_id: str, daily_limit: int) -> bool:
    """Return True if under limit, False if limit exceeded. Increments counter."""
    now = time.time()
    with _RATE_LIMIT_LOCK:
        entry = _RATE_LIMIT_COUNTERS.get(phone_number_id)
        if not entry or now - entry["window_start"] >= RATE_LIMIT_WINDOW_SECS:
            _RATE_LIMIT_COUNTERS[phone_number_id] = {"window_start": now, "count": 1}
            return True
        if entry["count"] >= daily_limit:
            return False
        entry["count"] += 1
        return True


# ---------------------------------------------------------------------------
# Circuit breaker singleton
# ---------------------------------------------------------------------------

_send_breaker = CircuitBreaker(
    name="whatsapp_send",
    failure_threshold=5,
    recovery_timeout=120,
)


# ---------------------------------------------------------------------------
# WhatsAppClient
# ---------------------------------------------------------------------------

class WhatsAppClient:
    """Meta WhatsApp Business API client.

    Supports:
    - Template messages (HSM) for transactional notifications
    - Media messages (PDF documents, images)
    - Inbound delivery status webhook parsing
    - Daily rate limiting (per phone_number_id)
    - Sandbox mode (logs instead of calling Meta API)
    """

    def __init__(
        self,
        phone_number_id: str,
        access_token: str,
        webhook_verify_token: str,
        app_secret: str,
        sandbox: bool = False,
        daily_limit: int = DEFAULT_DAILY_RATE_LIMIT,
        redis_url: str | None = None,
    ) -> None:
        self.phone_number_id = phone_number_id
        self.access_token = access_token
        self.webhook_verify_token = webhook_verify_token
        self.app_secret = app_secret
        self.sandbox = sandbox
        self.daily_limit = daily_limit

        self._redis: Any = None
        if _HAS_REDIS and redis_url:
            try:
                self._redis = redis_lib.from_url(redis_url, decode_responses=True)
                self._redis.ping()
            except Exception as exc:
                logger.warning("WhatsAppClient: Redis unavailable (%s) — using in-memory rate limiter", exc)
                self._redis = None

        logger.info(
            "WhatsAppClient initialised (phone_number_id=%s, sandbox=%s, daily_limit=%d)",
            self.phone_number_id, self.sandbox, self.daily_limit,
        )

    @classmethod
    def from_env(cls) -> "WhatsAppClient":
        """Construct from environment variables.

        Required:
            WHATSAPP_PHONE_NUMBER_ID    Meta phone number ID
            WHATSAPP_ACCESS_TOKEN       Meta permanent access token (or system user token)
            WHATSAPP_WEBHOOK_VERIFY_TOKEN  Your chosen verify token for webhook setup
            WHATSAPP_APP_SECRET         Meta app secret for hub.signature validation

        Optional:
            WHATSAPP_SANDBOX=true       Log instead of sending (default: false)
            WHATSAPP_DAILY_LIMIT        Override daily message limit (default: 1000)
            REDIS_URL                   For distributed rate limiting
        """
        phone_number_id = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "")
        access_token = os.environ.get("WHATSAPP_ACCESS_TOKEN", "")
        verify_token = os.environ.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN", "")
        app_secret = os.environ.get("WHATSAPP_APP_SECRET", "")
        sandbox = os.environ.get("WHATSAPP_SANDBOX", "false").lower() == "true"
        daily_limit = int(os.environ.get("WHATSAPP_DAILY_LIMIT", str(DEFAULT_DAILY_RATE_LIMIT)))
        redis_url = os.environ.get("REDIS_URL")

        if not phone_number_id or not access_token:
            logger.warning(
                "WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN not set — "
                "WhatsAppClient running in sandbox mode"
            )
            sandbox = True

        return cls(
            phone_number_id=phone_number_id,
            access_token=access_token,
            webhook_verify_token=verify_token,
            app_secret=app_secret,
            sandbox=sandbox,
            daily_limit=daily_limit,
            redis_url=redis_url,
        )

    # ------------------------------------------------------------------
    # Rate limiting
    # ------------------------------------------------------------------

    def _check_rate_limit(self) -> None:
        """Raise WhatsAppRateLimitError if daily limit is reached."""
        key = f"whatsapp:ratelimit:{self.phone_number_id}:{date.today().isoformat()}"

        if self._redis is not None:
            try:
                pipe = self._redis.pipeline()
                pipe.incr(key)
                pipe.expire(key, RATE_LIMIT_WINDOW_SECS)
                results = pipe.execute()
                count = results[0]
                if count > self.daily_limit:
                    raise WhatsAppRateLimitError(
                        f"WhatsApp daily limit reached ({count}/{self.daily_limit} messages today)"
                    )
                return
            except WhatsAppRateLimitError:
                raise
            except Exception as exc:
                logger.warning("WhatsApp Redis rate check failed (%s) — using in-memory", exc)

        if not _rate_check_memory(self.phone_number_id, self.daily_limit):
            raise WhatsAppRateLimitError(
                f"WhatsApp daily limit reached ({self.daily_limit} messages/day)"
            )

    # ------------------------------------------------------------------
    # Template messages
    # ------------------------------------------------------------------

    @_send_breaker
    @retry_with_backoff(max_attempts=3, base_delay=2.0, exceptions=(WhatsAppAPIError,))
    def send_template(
        self,
        to: str,
        template: str,
        language: str = "pt_BR",
        components: list[TemplateComponent] | None = None,
    ) -> SentMessage:
        """Send a pre-approved HSM template message.

        Args:
            to: Recipient phone number in E.164 format (+5511999990000).
            template: Template name (must be pre-approved in Meta Business Manager).
            language: BCP-47 language code (default: pt_BR).
            components: Optional header/body/button parameter overrides.

        Returns:
            SentMessage with message_id.

        Raises:
            WhatsAppRateLimitError: Daily limit exceeded.
            WhatsAppAPIError: Meta API returned an error.
        """
        self._check_rate_limit()

        payload: dict[str, Any] = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": _normalise_phone(to),
            "type": "template",
            "template": {
                "name": template,
                "language": {"code": language},
            },
        }

        if components:
            payload["template"]["components"] = [c.to_dict() for c in components]

        return self._dispatch(payload, to)

    # ------------------------------------------------------------------
    # Media messages
    # ------------------------------------------------------------------

    @_send_breaker
    @retry_with_backoff(max_attempts=3, base_delay=2.0, exceptions=(WhatsAppAPIError,))
    def send_document(
        self,
        to: str,
        document_url: str,
        filename: str,
        caption: str = "",
    ) -> SentMessage:
        """Send a document (PDF, DOCX) by URL.

        The URL must be publicly accessible or a Meta-uploaded media ID.

        Args:
            to: Recipient phone number in E.164 format.
            document_url: Publicly accessible URL or media ID.
            filename: Filename shown to recipient.
            caption: Optional text caption.
        """
        self._check_rate_limit()

        document: dict[str, Any] = {
            "link": document_url,
            "filename": filename,
        }
        if caption:
            document["caption"] = caption

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": _normalise_phone(to),
            "type": "document",
            "document": document,
        }
        return self._dispatch(payload, to)

    @_send_breaker
    @retry_with_backoff(max_attempts=3, base_delay=2.0, exceptions=(WhatsAppAPIError,))
    def send_image(
        self,
        to: str,
        image_url: str,
        caption: str = "",
    ) -> SentMessage:
        """Send an image by URL."""
        self._check_rate_limit()

        image: dict[str, Any] = {"link": image_url}
        if caption:
            image["caption"] = caption

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": _normalise_phone(to),
            "type": "image",
            "image": image,
        }
        return self._dispatch(payload, to)

    @_send_breaker
    @retry_with_backoff(max_attempts=3, base_delay=2.0, exceptions=(WhatsAppAPIError,))
    def send_text(
        self,
        to: str,
        text: str,
        preview_url: bool = False,
    ) -> SentMessage:
        """Send a plain text message (only for customer-initiated threads)."""
        self._check_rate_limit()

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": _normalise_phone(to),
            "type": "text",
            "text": {"body": text, "preview_url": preview_url},
        }
        return self._dispatch(payload, to)

    # ------------------------------------------------------------------
    # Real Estate OS — high-level helpers
    # ------------------------------------------------------------------

    def send_charge_notice(
        self,
        to: str,
        renter_name: str,
        amount: str,
        due_date: str,
        boleto_url: str = "",
    ) -> SentMessage:
        """Send rent charge notification using 'charge_notice' template.

        Template variables: {{1}}=renter_name, {{2}}=amount, {{3}}=due_date
        Optional button: 'Ver boleto' → boleto_url
        """
        components = [
            TemplateComponent.body([renter_name, amount, due_date]),
        ]
        if boleto_url:
            components.append(
                TemplateComponent.button_quick_reply(payload=boleto_url, index=0)
            )
        return self.send_template(to, "charge_notice", components=components)

    def send_payment_confirmation(
        self,
        to: str,
        renter_name: str,
        amount: str,
        payment_date: str,
    ) -> SentMessage:
        """Send payment received confirmation using 'payment_confirmation' template."""
        return self.send_template(
            to,
            "payment_confirmation",
            components=[TemplateComponent.body([renter_name, amount, payment_date])],
        )

    def send_owner_statement(
        self,
        to: str,
        owner_name: str,
        month: str,
        statement_url: str,
    ) -> SentMessage:
        """Send monthly owner statement as PDF document."""
        caption = f"Extrato de {month} — {owner_name}"
        return self.send_document(
            to=to,
            document_url=statement_url,
            filename=f"extrato_{month.replace(' ', '_').lower()}.pdf",
            caption=caption,
        )

    def send_maintenance_update(
        self,
        to: str,
        renter_name: str,
        ticket_id: str,
        status: str,
        description: str,
    ) -> SentMessage:
        """Send maintenance ticket status update using 'maintenance_update' template."""
        return self.send_template(
            to,
            "maintenance_update",
            components=[
                TemplateComponent.body([renter_name, ticket_id, status, description])
            ],
        )

    # ------------------------------------------------------------------
    # Webhook handling
    # ------------------------------------------------------------------

    def verify_webhook_challenge(
        self,
        hub_mode: str,
        hub_verify_token: str,
        hub_challenge: str,
    ) -> str | None:
        """Handle Meta webhook verification challenge (GET request).

        Returns the hub_challenge string if verification succeeds, None otherwise.
        """
        if hub_mode == "subscribe" and hub_verify_token == self.webhook_verify_token:
            logger.info("WhatsApp webhook verification successful")
            return hub_challenge
        logger.warning("WhatsApp webhook verification failed (token mismatch)")
        return None

    def parse_status_webhook(
        self,
        raw_body: bytes,
        hub_signature: str | None = None,
    ) -> list[MessageReceipt]:
        """Parse an inbound status/delivery webhook from Meta.

        Args:
            raw_body: Raw request body bytes.
            hub_signature: Value of ``x-hub-signature-256`` header (optional but recommended).

        Returns:
            List of MessageReceipt objects for each status update in the payload.

        Raises:
            WhatsAppSignatureError: If app_secret is set and signature fails.
        """
        if hub_signature and self.app_secret:
            self._validate_hub_signature(raw_body, hub_signature)

        payload = json.loads(raw_body)
        receipts: list[MessageReceipt] = []

        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                for status_obj in value.get("statuses", []):
                    receipt = _map_status_object(status_obj)
                    receipts.append(receipt)
                    logger.info(
                        "whatsapp.delivery status=%s message_id=%s recipient=%s",
                        receipt.status, receipt.message_id, receipt.recipient,
                    )

        return receipts

    def _validate_hub_signature(self, raw_body: bytes, hub_signature: str) -> None:
        """Validate x-hub-signature-256 header."""
        prefix = "sha256="
        if not hub_signature.startswith(prefix):
            raise WhatsAppSignatureError(
                f"Unexpected hub_signature format: {hub_signature[:30]!r}"
            )
        received = hub_signature[len(prefix):]
        expected = hmac.new(
            self.app_secret.encode(),
            raw_body,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(received, expected):
            raise WhatsAppSignatureError("Hub signature mismatch — possible tampering")

    # ------------------------------------------------------------------
    # Internal dispatch
    # ------------------------------------------------------------------

    def _dispatch(self, payload: dict, to: str) -> SentMessage:
        """Send the payload to the Meta Graph API (or log in sandbox mode)."""
        now = datetime.utcnow()

        if self.sandbox:
            fake_id = f"sandbox_{int(now.timestamp() * 1000)}"
            logger.info(
                "whatsapp.sandbox.send to=%s type=%s fake_id=%s payload=%s",
                to, payload.get("type"), fake_id, json.dumps(payload, ensure_ascii=False)[:300],
            )
            return SentMessage(
                message_id=fake_id,
                to=to,
                timestamp=now,
                sandbox=True,
            )

        if not _HAS_HTTPX:
            raise WhatsAppAPIError(
                "httpx is required to send real WhatsApp messages. pip install httpx"
            )

        url = f"{WHATSAPP_API_BASE}/{self.phone_number_id}/messages"
        try:
            with httpx.Client(timeout=15.0) as http:
                response = http.post(
                    url,
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {self.access_token}",
                        "Content-Type": "application/json",
                    },
                )
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPStatusError as exc:
            body = exc.response.text[:400]
            raise WhatsAppAPIError(
                f"Meta WhatsApp API error ({exc.response.status_code}): {body}"
            ) from exc
        except httpx.RequestError as exc:
            raise WhatsAppAPIError(f"Meta WhatsApp network error: {exc}") from exc

        messages = data.get("messages", [{}])
        message_id = messages[0].get("id", "") if messages else ""

        logger.info(
            "whatsapp.sent to=%s type=%s message_id=%s",
            to, payload.get("type"), message_id,
        )
        return SentMessage(message_id=message_id, to=to, timestamp=now, sandbox=False)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalise_phone(phone: str) -> str:
    """Strip spaces and dashes, ensure E.164 format (starts with +)."""
    cleaned = phone.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if not cleaned.startswith("+"):
        cleaned = "+" + cleaned
    return cleaned


def _map_status_object(status_obj: dict) -> MessageReceipt:
    """Map a Meta status object to a MessageReceipt."""
    ts_raw = status_obj.get("timestamp", "")
    try:
        occurred_at = datetime.utcfromtimestamp(int(ts_raw))
    except (ValueError, TypeError):
        occurred_at = datetime.utcnow()

    errors = status_obj.get("errors", [])
    error_code = errors[0].get("code") if errors else None
    error_message = errors[0].get("message") if errors else None

    return MessageReceipt(
        message_id=status_obj.get("id", ""),
        status=status_obj.get("status", "unknown"),
        recipient=status_obj.get("recipient_id", ""),
        timestamp=occurred_at,
        error_code=error_code,
        error_message=error_message,
        raw=status_obj,
    )


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_default_client: WhatsAppClient | None = None
_client_lock = Lock()


def get_whatsapp_client() -> WhatsAppClient:
    """Return the module-level WhatsAppClient singleton, initialised from env vars."""
    global _default_client
    if _default_client is None:
        with _client_lock:
            if _default_client is None:
                _default_client = WhatsAppClient.from_env()
    return _default_client
