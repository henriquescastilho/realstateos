"""SendGrid transactional email integration.

Handles:
- Transactional emails: charge notice, payment confirmation, owner statement,
  maintenance update, welcome email.
- HTML templates rendered via Jinja2 (inline — no file system required).
- Bounce / complaint / unsubscribe webhook parsing for list hygiene.
- Retry + circuit breaker via apps/api/app/utils/resilience.py.
- Sandbox mode: renders email and logs it instead of calling SendGrid API.

Usage:
    client = EmailClient.from_env()

    # Send a charge notice
    result = client.send_charge_notice(
        to_email="joao@example.com",
        to_name="João Silva",
        amount="R$ 2.500,00",
        due_date="05/04/2026",
        boleto_url="https://boleto.example.com/abc123",
    )

    # Parse a bounce webhook (POST /webhooks/email)
    events = client.parse_event_webhook(raw_body)
"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime
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
    logger.warning("httpx not installed — EmailClient HTTP calls will be simulated")

try:
    from jinja2 import Environment, select_autoescape
    _HAS_JINJA2 = True
    _jinja_env = Environment(autoescape=select_autoescape(["html"]))
except ImportError:
    _HAS_JINJA2 = False
    _jinja_env = None
    logger.warning("jinja2 not installed — email templates will use plain-text fallback")

try:
    from app.utils.resilience import CircuitBreaker, retry_with_backoff
except ImportError:
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

SENDGRID_API_BASE = "https://api.sendgrid.com/v3"
SENDGRID_SEND_URL = f"{SENDGRID_API_BASE}/mail/send"
SENDGRID_SUPPRESSION_URL = f"{SENDGRID_API_BASE}/suppression/bounces"

# Brand colours (used in HTML templates)
BRAND_PRIMARY = "#1a56db"
BRAND_SECONDARY = "#f3f4f6"
BRAND_TEXT = "#111827"
BRAND_MUTED = "#6b7280"


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class EmailResult:
    success: bool
    message_id: str
    to_email: str
    subject: str
    sandbox: bool = False
    error: str | None = None


@dataclass
class EmailEvent:
    """A single event from a SendGrid event webhook."""

    event_type: str          # "bounce", "delivered", "open", "click", "unsubscribe", etc.
    email: str
    timestamp: datetime
    message_id: str
    reason: str | None = None
    bounce_type: str | None = None  # "hard" | "soft" (for bounce events)
    raw: dict = field(default_factory=dict, repr=False)

    @property
    def is_hard_bounce(self) -> bool:
        return self.event_type == "bounce" and self.bounce_type == "hard"

    @property
    def should_suppress(self) -> bool:
        """True if this event means we should stop sending to this address."""
        return self.event_type in ("bounce", "unsubscribe", "spamreport")


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class EmailAPIError(RuntimeError):
    """Raised when the SendGrid API returns an error."""


# ---------------------------------------------------------------------------
# Circuit breaker singleton
# ---------------------------------------------------------------------------

_send_breaker = CircuitBreaker(
    name="sendgrid_send",
    failure_threshold=5,
    recovery_timeout=120,
)


# ---------------------------------------------------------------------------
# HTML Templates (inline Jinja2)
# ---------------------------------------------------------------------------

_BASE_HTML = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{{ subject }}</title>
  <style>
    body { margin:0; padding:0; background:#f9fafb; font-family:'Segoe UI',Arial,sans-serif; }
    .wrapper { max-width:600px; margin:32px auto; background:#ffffff; border-radius:8px;
               border:1px solid #e5e7eb; overflow:hidden; }
    .header { background:{{ brand_primary }}; padding:24px 32px; }
    .header h1 { margin:0; color:#ffffff; font-size:20px; font-weight:600; }
    .header p { margin:4px 0 0; color:#93c5fd; font-size:13px; }
    .body { padding:32px; color:{{ brand_text }}; font-size:15px; line-height:1.6; }
    .card { background:{{ brand_secondary }}; border-radius:6px; padding:16px 20px;
            margin:20px 0; }
    .card-row { display:flex; justify-content:space-between; padding:6px 0;
                border-bottom:1px solid #e5e7eb; }
    .card-row:last-child { border-bottom:none; }
    .card-label { color:{{ brand_muted }}; font-size:13px; }
    .card-value { font-weight:600; font-size:14px; }
    .btn { display:inline-block; background:{{ brand_primary }}; color:#ffffff;
           text-decoration:none; padding:12px 28px; border-radius:6px;
           font-weight:600; font-size:14px; margin:20px 0; }
    .footer { padding:16px 32px; background:#f3f4f6; color:{{ brand_muted }};
              font-size:12px; text-align:center; border-top:1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>{{ header_title }}</h1>
      <p>Real Estate OS</p>
    </div>
    <div class="body">
      {{ body_content }}
    </div>
    <div class="footer">
      Este é um e-mail automático. Não responda a esta mensagem.
      &copy; {{ year }} Real Estate OS. Todos os direitos reservados.
    </div>
  </div>
</body>
</html>"""

# Per-email body templates
_CHARGE_NOTICE_BODY = """
<p>Olá, <strong>{{ renter_name }}</strong>,</p>
<p>Seu boleto de aluguel está disponível para pagamento.</p>
<div class="card">
  <div class="card-row">
    <span class="card-label">Valor</span>
    <span class="card-value">{{ amount }}</span>
  </div>
  <div class="card-row">
    <span class="card-label">Vencimento</span>
    <span class="card-value">{{ due_date }}</span>
  </div>
  {% if contract_code %}
  <div class="card-row">
    <span class="card-label">Contrato</span>
    <span class="card-value">{{ contract_code }}</span>
  </div>
  {% endif %}
</div>
{% if boleto_url %}
<a href="{{ boleto_url }}" class="btn">Ver / Pagar Boleto</a>
{% endif %}
<p style="color:{{ brand_muted }};font-size:13px;">
  Em caso de dúvidas, entre em contato com sua imobiliária.
</p>
"""

_PAYMENT_CONFIRMATION_BODY = """
<p>Olá, <strong>{{ renter_name }}</strong>,</p>
<p>Recebemos o seu pagamento com sucesso. Obrigado!</p>
<div class="card">
  <div class="card-row">
    <span class="card-label">Valor pago</span>
    <span class="card-value">{{ amount }}</span>
  </div>
  <div class="card-row">
    <span class="card-label">Data do pagamento</span>
    <span class="card-value">{{ payment_date }}</span>
  </div>
  {% if transaction_id %}
  <div class="card-row">
    <span class="card-label">ID da transação</span>
    <span class="card-value" style="font-family:monospace;font-size:12px;">{{ transaction_id }}</span>
  </div>
  {% endif %}
</div>
<p>Guarde este comprovante para seus registros.</p>
"""

_OWNER_STATEMENT_BODY = """
<p>Olá, <strong>{{ owner_name }}</strong>,</p>
<p>Seu extrato de <strong>{{ month }}</strong> está disponível.</p>
<div class="card">
  <div class="card-row">
    <span class="card-label">Total recebido</span>
    <span class="card-value">{{ total_received }}</span>
  </div>
  <div class="card-row">
    <span class="card-label">Total de imóveis</span>
    <span class="card-value">{{ property_count }}</span>
  </div>
  <div class="card-row">
    <span class="card-label">Competência</span>
    <span class="card-value">{{ month }}</span>
  </div>
</div>
{% if statement_url %}
<a href="{{ statement_url }}" class="btn">Baixar Extrato PDF</a>
{% endif %}
"""

_MAINTENANCE_UPDATE_BODY = """
<p>Olá, <strong>{{ renter_name }}</strong>,</p>
<p>Há uma atualização no seu chamado de manutenção.</p>
<div class="card">
  <div class="card-row">
    <span class="card-label">Chamado</span>
    <span class="card-value" style="font-family:monospace;">#{{ ticket_id }}</span>
  </div>
  <div class="card-row">
    <span class="card-label">Status</span>
    <span class="card-value">{{ status }}</span>
  </div>
  <div class="card-row">
    <span class="card-label">Descrição</span>
    <span class="card-value">{{ description }}</span>
  </div>
</div>
<p style="color:{{ brand_muted }};font-size:13px;">
  Entre em contato com sua imobiliária para mais informações.
</p>
"""

_WELCOME_BODY = """
<p>Olá, <strong>{{ user_name }}</strong>,</p>
<p>Bem-vindo ao <strong>Real Estate OS</strong>! Sua conta foi criada com sucesso.</p>
<div class="card">
  <div class="card-row">
    <span class="card-label">E-mail</span>
    <span class="card-value">{{ email }}</span>
  </div>
  <div class="card-row">
    <span class="card-label">Organização</span>
    <span class="card-value">{{ org_name }}</span>
  </div>
</div>
{% if login_url %}
<a href="{{ login_url }}" class="btn">Acessar Plataforma</a>
{% endif %}
"""

# Template registry
_TEMPLATES: dict[str, tuple[str, str]] = {
    # (header_title, body_template)
    "charge_notice": ("Cobrança de Aluguel", _CHARGE_NOTICE_BODY),
    "payment_confirmation": ("Pagamento Confirmado ✓", _PAYMENT_CONFIRMATION_BODY),
    "owner_statement": ("Extrato do Proprietário", _OWNER_STATEMENT_BODY),
    "maintenance_update": ("Atualização de Manutenção", _MAINTENANCE_UPDATE_BODY),
    "welcome": ("Bem-vindo ao Real Estate OS", _WELCOME_BODY),
}


def _render_html(template_name: str, context: dict) -> str:
    """Render a full HTML email from a named template + context dict."""
    if template_name not in _TEMPLATES:
        raise ValueError(f"Unknown email template: {template_name!r}")

    header_title, body_template = _TEMPLATES[template_name]
    brand_ctx = {
        "brand_primary": BRAND_PRIMARY,
        "brand_secondary": BRAND_SECONDARY,
        "brand_text": BRAND_TEXT,
        "brand_muted": BRAND_MUTED,
        "year": datetime.utcnow().year,
    }

    full_ctx = {**brand_ctx, **context, "header_title": header_title}

    if _HAS_JINJA2:
        body_html = _jinja_env.from_string(body_template).render(**full_ctx)  # type: ignore[union-attr]
        full_ctx["body_content"] = body_html
        return _jinja_env.from_string(_BASE_HTML).render(**full_ctx)  # type: ignore[union-attr]

    # Plain-text fallback when Jinja2 is unavailable
    lines = [f"=== {header_title} ===", ""]
    for k, v in context.items():
        if v and not k.startswith("brand_"):
            lines.append(f"{k}: {v}")
    return "\n".join(lines)


def _strip_html_to_text(html: str) -> str:
    """Very basic HTML-to-text for the plain-text alternative part."""
    import re
    text = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.DOTALL)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ---------------------------------------------------------------------------
# EmailClient
# ---------------------------------------------------------------------------

class EmailClient:
    """SendGrid transactional email client.

    Thread-safe singleton. Supports HTML templates via Jinja2 with a plain-text
    fallback. Sandbox mode logs instead of calling the SendGrid API.
    """

    def __init__(
        self,
        api_key: str,
        from_email: str,
        from_name: str,
        sandbox: bool = False,
        reply_to: str | None = None,
    ) -> None:
        self.api_key = api_key
        self.from_email = from_email
        self.from_name = from_name
        self.sandbox = sandbox
        self.reply_to = reply_to

        logger.info(
            "EmailClient initialised (from=%s, sandbox=%s)",
            self.from_email, self.sandbox,
        )

    @classmethod
    def from_env(cls) -> "EmailClient":
        """Construct from environment variables.

        Required:
            SENDGRID_API_KEY         SendGrid API key
            EMAIL_FROM_ADDRESS       Sender address (e.g. noreply@realstateos.com)
            EMAIL_FROM_NAME          Sender display name (e.g. Real Estate OS)

        Optional:
            EMAIL_SANDBOX=true       Log instead of sending (default: false)
            EMAIL_REPLY_TO           Reply-to address
        """
        api_key = os.environ.get("SENDGRID_API_KEY", "")
        from_email = os.environ.get("EMAIL_FROM_ADDRESS", "noreply@realstateos.com")
        from_name = os.environ.get("EMAIL_FROM_NAME", "Real Estate OS")
        sandbox = os.environ.get("EMAIL_SANDBOX", "false").lower() == "true"
        reply_to = os.environ.get("EMAIL_REPLY_TO")

        if not api_key:
            logger.warning(
                "SENDGRID_API_KEY not set — EmailClient running in sandbox mode"
            )
            sandbox = True

        return cls(
            api_key=api_key,
            from_email=from_email,
            from_name=from_name,
            sandbox=sandbox,
            reply_to=reply_to,
        )

    # ------------------------------------------------------------------
    # Core send method
    # ------------------------------------------------------------------

    @_send_breaker
    @retry_with_backoff(max_attempts=3, base_delay=2.0, exceptions=(EmailAPIError,))
    def send(
        self,
        to_email: str,
        to_name: str,
        subject: str,
        html_content: str,
        text_content: str | None = None,
        attachments: list[dict] | None = None,
    ) -> EmailResult:
        """Send a transactional email via SendGrid.

        Args:
            to_email: Recipient email address.
            to_name: Recipient display name.
            subject: Email subject line.
            html_content: Full HTML body.
            text_content: Plain-text alternative (auto-generated if None).
            attachments: Optional list of SendGrid attachment objects.

        Returns:
            EmailResult with success status and message_id.
        """
        if text_content is None:
            text_content = _strip_html_to_text(html_content)

        payload: dict[str, Any] = {
            "personalizations": [{
                "to": [{"email": to_email, "name": to_name}],
                "subject": subject,
            }],
            "from": {"email": self.from_email, "name": self.from_name},
            "content": [
                {"type": "text/plain", "value": text_content},
                {"type": "text/html", "value": html_content},
            ],
        }

        if self.reply_to:
            payload["reply_to"] = {"email": self.reply_to}

        if attachments:
            payload["attachments"] = attachments

        if self.sandbox:
            logger.info(
                "email.sandbox.send to=%s subject=%r html_chars=%d",
                to_email, subject, len(html_content),
            )
            return EmailResult(
                success=True,
                message_id=f"sandbox_{int(datetime.utcnow().timestamp() * 1000)}",
                to_email=to_email,
                subject=subject,
                sandbox=True,
            )

        if not _HAS_HTTPX:
            raise EmailAPIError(
                "httpx is required to send real emails. pip install httpx"
            )

        try:
            with httpx.Client(timeout=20.0) as http:
                response = http.post(
                    SENDGRID_SEND_URL,
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise EmailAPIError(
                f"SendGrid API error ({exc.response.status_code}): {exc.response.text[:300]}"
            ) from exc
        except httpx.RequestError as exc:
            raise EmailAPIError(f"SendGrid network error: {exc}") from exc

        message_id = response.headers.get("x-message-id", "")
        logger.info(
            "email.sent to=%s subject=%r message_id=%s",
            to_email, subject, message_id,
        )
        return EmailResult(
            success=True,
            message_id=message_id,
            to_email=to_email,
            subject=subject,
            sandbox=False,
        )

    # ------------------------------------------------------------------
    # High-level domain helpers
    # ------------------------------------------------------------------

    def send_charge_notice(
        self,
        to_email: str,
        to_name: str,
        renter_name: str,
        amount: str,
        due_date: str,
        boleto_url: str = "",
        contract_code: str = "",
    ) -> EmailResult:
        """Send monthly rent charge notification."""
        html = _render_html("charge_notice", {
            "renter_name": renter_name,
            "amount": amount,
            "due_date": due_date,
            "boleto_url": boleto_url,
            "contract_code": contract_code,
        })
        return self.send(
            to_email=to_email,
            to_name=to_name,
            subject=f"Cobrança de Aluguel — Vencimento {due_date}",
            html_content=html,
        )

    def send_payment_confirmation(
        self,
        to_email: str,
        to_name: str,
        renter_name: str,
        amount: str,
        payment_date: str,
        transaction_id: str = "",
    ) -> EmailResult:
        """Send payment received confirmation."""
        html = _render_html("payment_confirmation", {
            "renter_name": renter_name,
            "amount": amount,
            "payment_date": payment_date,
            "transaction_id": transaction_id,
        })
        return self.send(
            to_email=to_email,
            to_name=to_name,
            subject=f"Pagamento Confirmado — {amount}",
            html_content=html,
        )

    def send_owner_statement(
        self,
        to_email: str,
        to_name: str,
        owner_name: str,
        month: str,
        total_received: str,
        property_count: int,
        statement_url: str = "",
        pdf_content_base64: str | None = None,
    ) -> EmailResult:
        """Send monthly owner statement email, optionally with PDF attachment."""
        html = _render_html("owner_statement", {
            "owner_name": owner_name,
            "month": month,
            "total_received": total_received,
            "property_count": str(property_count),
            "statement_url": statement_url,
        })

        attachments = None
        if pdf_content_base64:
            attachments = [{
                "content": pdf_content_base64,
                "type": "application/pdf",
                "filename": f"extrato_{month.replace(' ', '_').lower()}.pdf",
                "disposition": "attachment",
            }]

        return self.send(
            to_email=to_email,
            to_name=to_name,
            subject=f"Extrato do Proprietário — {month}",
            html_content=html,
            attachments=attachments,
        )

    def send_maintenance_update(
        self,
        to_email: str,
        to_name: str,
        renter_name: str,
        ticket_id: str,
        status: str,
        description: str,
    ) -> EmailResult:
        """Send maintenance ticket status update."""
        html = _render_html("maintenance_update", {
            "renter_name": renter_name,
            "ticket_id": ticket_id,
            "status": status,
            "description": description,
        })
        return self.send(
            to_email=to_email,
            to_name=to_name,
            subject=f"Atualização do Chamado #{ticket_id} — {status}",
            html_content=html,
        )

    def send_welcome(
        self,
        to_email: str,
        to_name: str,
        user_name: str,
        org_name: str,
        login_url: str = "",
    ) -> EmailResult:
        """Send welcome email to a newly registered user."""
        html = _render_html("welcome", {
            "user_name": user_name,
            "email": to_email,
            "org_name": org_name,
            "login_url": login_url,
        })
        return self.send(
            to_email=to_email,
            to_name=to_name,
            subject="Bem-vindo ao Real Estate OS!",
            html_content=html,
        )

    # ------------------------------------------------------------------
    # Bounce / event webhook parsing
    # ------------------------------------------------------------------

    def parse_event_webhook(self, raw_body: bytes) -> list[EmailEvent]:
        """Parse a SendGrid Event Webhook payload.

        SendGrid sends an array of event objects. Each event has at minimum:
            email, event, timestamp, sg_event_id, sg_message_id

        Bounce events additionally have: reason, type ("hard"/"soft")
        Unsubscribe events: event = "unsubscribe" or "group_unsubscribe"
        Spam reports: event = "spamreport"

        Args:
            raw_body: Raw JSON bytes from the POST body.

        Returns:
            List of EmailEvent objects, one per event in the payload.
        """
        events_raw: list[dict] = json.loads(raw_body)
        if not isinstance(events_raw, list):
            events_raw = [events_raw]

        events: list[EmailEvent] = []
        for obj in events_raw:
            try:
                event = _map_sendgrid_event(obj)
                events.append(event)
                if event.is_hard_bounce:
                    logger.warning(
                        "email.hard_bounce address=%s reason=%s",
                        event.email, event.reason,
                    )
                elif event.should_suppress:
                    logger.info(
                        "email.suppress_event type=%s address=%s",
                        event.event_type, event.email,
                    )
                else:
                    logger.debug(
                        "email.event type=%s address=%s",
                        event.event_type, event.email,
                    )
            except Exception as exc:
                logger.warning("Failed to parse SendGrid event: %s — %r", exc, obj)

        return events

    def list_bounces(self, start_time: int | None = None) -> list[dict]:
        """Fetch current bounced addresses from SendGrid suppression list.

        Args:
            start_time: Optional Unix timestamp to filter bounces after this time.

        Returns:
            List of bounce objects from the SendGrid API.
        """
        if self.sandbox or not _HAS_HTTPX:
            logger.info("email.list_bounces.sandbox — returning empty list")
            return []

        params: dict[str, Any] = {}
        if start_time:
            params["start_time"] = start_time

        try:
            with httpx.Client(timeout=15.0) as http:
                response = http.get(
                    SENDGRID_SUPPRESSION_URL,
                    params=params,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as exc:
            logger.error(
                "SendGrid bounces API error (%d): %s",
                exc.response.status_code, exc.response.text[:200],
            )
            return []
        except httpx.RequestError as exc:
            logger.error("SendGrid bounces network error: %s", exc)
            return []

    def delete_bounce(self, email_address: str) -> bool:
        """Remove an email address from the SendGrid bounce suppression list.

        Returns True if deletion succeeded.
        """
        if self.sandbox or not _HAS_HTTPX:
            logger.info("email.delete_bounce.sandbox email=%s", email_address)
            return True

        url = f"{SENDGRID_SUPPRESSION_URL}/{email_address}"
        try:
            with httpx.Client(timeout=15.0) as http:
                response = http.delete(
                    url,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                response.raise_for_status()
                logger.info("email.bounce_deleted email=%s", email_address)
                return True
        except httpx.HTTPStatusError as exc:
            logger.error(
                "SendGrid delete bounce error (%d) for %s: %s",
                exc.response.status_code, email_address, exc.response.text[:200],
            )
            return False
        except httpx.RequestError as exc:
            logger.error("SendGrid delete bounce network error: %s", exc)
            return False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _map_sendgrid_event(obj: dict) -> EmailEvent:
    """Map a raw SendGrid event dict to an EmailEvent."""
    ts_raw = obj.get("timestamp", 0)
    try:
        occurred_at = datetime.utcfromtimestamp(int(ts_raw))
    except (ValueError, TypeError):
        occurred_at = datetime.utcnow()

    event_type = obj.get("event", "unknown")
    bounce_type: str | None = None

    if event_type == "bounce":
        raw_type = obj.get("type", "").lower()
        bounce_type = "hard" if raw_type in ("hard", "blocked") else "soft"

    return EmailEvent(
        event_type=event_type,
        email=obj.get("email", ""),
        timestamp=occurred_at,
        message_id=obj.get("sg_message_id", obj.get("sg_event_id", "")),
        reason=obj.get("reason"),
        bounce_type=bounce_type,
        raw=obj,
    )


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_default_client: EmailClient | None = None
_client_lock = Lock()


def get_email_client() -> EmailClient:
    """Return the module-level EmailClient singleton, initialised from env vars."""
    global _default_client
    if _default_client is None:
        with _client_lock:
            if _default_client is None:
                _default_client = EmailClient.from_env()
    return _default_client
