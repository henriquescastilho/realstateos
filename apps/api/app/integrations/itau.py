"""Itaú Open Finance integration.

Handles:
- Webhook ingestion: parses Itaú Pix/TED/Boleto payment notifications,
  validates HMAC-SHA256 signature, and maps to internal PaymentWebhook schema.
- OAuth2 client credentials: token management with automatic refresh.
- Account statement polling: fallback when webhooks are unavailable.
- Replay protection: idempotency key stored in Redis (TTL 24h).
- Circuit breaker + retry via apps/api/app/utils/resilience.py.

Sandbox mode: set ITAU_SANDBOX=true in environment to use the sandbox base URL
and skip real HMAC validation.

Usage:
    client = ItauClient.from_env()

    # Parse an inbound webhook (FastAPI route handler)
    payment = client.parse_webhook(raw_body, signature_header)

    # Poll account statements (fallback)
    statements = await client.poll_statements(account_id, date_from, date_to)
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
from decimal import Decimal
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
    logger.warning("httpx not installed — ItauClient HTTP calls will be simulated")

try:
    import redis as redis_lib
    _HAS_REDIS = True
except ImportError:
    _HAS_REDIS = False
    logger.warning("redis not installed — idempotency checks will use in-memory store")

try:
    from app.utils.resilience import CircuitBreaker, retry_with_backoff
    _HAS_RESILIENCE = True
except ImportError:
    _HAS_RESILIENCE = False

    # Minimal no-op fallbacks
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

ITAU_PROD_BASE_URL = "https://sts.itau.com.br"
ITAU_SANDBOX_BASE_URL = "https://sandbox.sts.itau.com.br"
ITAU_API_VERSION = "v2"

# Token refresh headroom — refresh if token expires within this many seconds
TOKEN_REFRESH_HEADROOM_SECS = 60

# Idempotency key TTL in seconds (24 hours)
IDEMPOTENCY_TTL_SECS = 86_400


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class PaymentWebhook:
    """Normalised payment notification from Itaú webhook."""

    event_id: str
    event_type: str              # "pix_received", "boleto_paid", "ted_received"
    transaction_id: str
    amount: Decimal
    payer_document: str          # CPF or CNPJ (masked in logs)
    payer_name: str
    account_id: str
    occurred_at: datetime
    raw: dict = field(default_factory=dict, repr=False)

    @property
    def idempotency_key(self) -> str:
        return f"itau:webhook:{self.event_id}"


@dataclass
class AccountStatement:
    """A single entry from the Itaú account statement."""

    entry_id: str
    transaction_type: str        # "credit" | "debit"
    amount: Decimal
    description: str
    counterpart_document: str
    counterpart_name: str
    occurred_at: datetime
    balance_after: Decimal


@dataclass
class OAuth2Token:
    access_token: str
    token_type: str
    expires_at: float            # Unix timestamp

    @property
    def is_expired(self) -> bool:
        return time.time() >= (self.expires_at - TOKEN_REFRESH_HEADROOM_SECS)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class ItauWebhookSignatureError(ValueError):
    """Raised when HMAC signature validation fails."""


class ItauWebhookReplayError(ValueError):
    """Raised when an event_id has already been processed."""


class ItauOAuth2Error(RuntimeError):
    """Raised when OAuth2 token exchange fails."""


class ItauAPIError(RuntimeError):
    """Raised when the Itaú API returns an unexpected error."""


# ---------------------------------------------------------------------------
# In-memory idempotency fallback (used when Redis is unavailable)
# ---------------------------------------------------------------------------

_IN_MEMORY_IDEMPOTENCY: dict[str, float] = {}
_IN_MEMORY_LOCK = Lock()


def _idempotency_check_memory(key: str) -> bool:
    """Return True if key is new (not seen before), False if replay."""
    now = time.time()
    with _IN_MEMORY_LOCK:
        # Evict expired keys
        expired = [k for k, exp in _IN_MEMORY_IDEMPOTENCY.items() if now > exp]
        for k in expired:
            del _IN_MEMORY_IDEMPOTENCY[k]

        if key in _IN_MEMORY_IDEMPOTENCY:
            return False  # replay
        _IN_MEMORY_IDEMPOTENCY[key] = now + IDEMPOTENCY_TTL_SECS
        return True


# ---------------------------------------------------------------------------
# Circuit breaker instances (module-level singletons)
# ---------------------------------------------------------------------------

_token_breaker = CircuitBreaker(
    name="itau_oauth2",
    failure_threshold=3,
    recovery_timeout=60,
)
_statement_breaker = CircuitBreaker(
    name="itau_statements",
    failure_threshold=5,
    recovery_timeout=120,
)


# ---------------------------------------------------------------------------
# ItauClient
# ---------------------------------------------------------------------------

class ItauClient:
    """Itaú Open Finance client.

    Thread-safe OAuth2 token management with automatic refresh.
    """

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        webhook_secret: str,
        sandbox: bool = False,
        redis_url: str | None = None,
    ) -> None:
        self.client_id = client_id
        self.client_secret = client_secret
        self.webhook_secret = webhook_secret
        self.sandbox = sandbox
        self.base_url = ITAU_SANDBOX_BASE_URL if sandbox else ITAU_PROD_BASE_URL
        self._token: OAuth2Token | None = None
        self._token_lock = Lock()

        # Redis for idempotency
        self._redis: Any = None
        if _HAS_REDIS and redis_url:
            try:
                self._redis = redis_lib.from_url(redis_url, decode_responses=True)
                self._redis.ping()
                logger.info("ItauClient: Redis idempotency store connected")
            except Exception as exc:
                logger.warning("ItauClient: Redis unavailable (%s) — using in-memory idempotency", exc)
                self._redis = None

        logger.info(
            "ItauClient initialised (sandbox=%s, base_url=%s)",
            self.sandbox, self.base_url,
        )

    @classmethod
    def from_env(cls) -> "ItauClient":
        """Construct from environment variables.

        Required env vars:
            ITAU_CLIENT_ID
            ITAU_CLIENT_SECRET
            ITAU_WEBHOOK_SECRET

        Optional:
            ITAU_SANDBOX=true           use sandbox URLs (default: false)
            REDIS_URL                   for distributed idempotency
        """
        client_id = os.environ.get("ITAU_CLIENT_ID", "")
        client_secret = os.environ.get("ITAU_CLIENT_SECRET", "")
        webhook_secret = os.environ.get("ITAU_WEBHOOK_SECRET", "")
        sandbox = os.environ.get("ITAU_SANDBOX", "false").lower() == "true"
        redis_url = os.environ.get("REDIS_URL")

        if not client_id or not client_secret:
            logger.warning(
                "ITAU_CLIENT_ID / ITAU_CLIENT_SECRET not set — "
                "ItauClient running in stub mode"
            )

        return cls(
            client_id=client_id,
            client_secret=client_secret,
            webhook_secret=webhook_secret,
            sandbox=sandbox,
            redis_url=redis_url,
        )

    # ------------------------------------------------------------------
    # Webhook parsing + signature validation
    # ------------------------------------------------------------------

    def parse_webhook(self, raw_body: bytes, signature_header: str) -> PaymentWebhook:
        """Parse and validate an Itaú webhook notification.

        Args:
            raw_body: The raw request body bytes (do NOT decode before calling).
            signature_header: Value of the ``x-itau-signature`` HTTP header.

        Returns:
            PaymentWebhook with normalised fields.

        Raises:
            ItauWebhookSignatureError: If HMAC validation fails.
            ItauWebhookReplayError: If event_id was already processed.
            ValueError: If the payload is malformed.
        """
        if not self.sandbox:
            self._validate_signature(raw_body, signature_header)

        payload = json.loads(raw_body)
        webhook = self._map_payload(payload)

        # Replay protection
        if not self._is_idempotent(webhook.idempotency_key):
            raise ItauWebhookReplayError(
                f"Duplicate event_id {webhook.event_id!r} — already processed"
            )

        logger.info(
            "itau.webhook.received event_id=%s type=%s amount=%s",
            webhook.event_id,
            webhook.event_type,
            webhook.amount,
        )
        return webhook

    def _validate_signature(self, raw_body: bytes, signature_header: str) -> None:
        """Validate HMAC-SHA256 signature.

        Itaú sends: ``x-itau-signature: sha256=<hex_digest>``
        """
        expected_prefix = "sha256="
        if not signature_header.startswith(expected_prefix):
            raise ItauWebhookSignatureError(
                f"Unexpected signature format: {signature_header[:30]!r}"
            )

        received_digest = signature_header[len(expected_prefix):]
        expected_digest = hmac.new(
            self.webhook_secret.encode(),
            raw_body,
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(received_digest, expected_digest):
            raise ItauWebhookSignatureError("HMAC signature mismatch — possible tampering")

    @staticmethod
    def _map_payload(payload: dict) -> PaymentWebhook:
        """Map Itaú Open Finance webhook payload to internal schema."""
        # Itaú Open Finance v2 webhook structure
        # https://devportal.itau.com.br/api-details/open-finance
        event = payload.get("evento", {})
        pix = payload.get("pix", {})
        pagamento = payload.get("pagamento", {})

        # Determine event type from payload discriminator
        if pix:
            event_type = "pix_received"
            transaction_id = pix.get("endToEndId", pix.get("txid", ""))
            amount = Decimal(str(pix.get("valor", "0")))
            payer_doc = pix.get("pagador", {}).get("cpf") or pix.get("pagador", {}).get("cnpj", "")
            payer_name = pix.get("pagador", {}).get("nome", "")
            occurred_at_str = pix.get("horario", event.get("dataHora", ""))
        elif pagamento:
            tipo = pagamento.get("tipo", "").lower()
            event_type = "boleto_paid" if "boleto" in tipo else "ted_received"
            transaction_id = pagamento.get("idTransacao", pagamento.get("nossoNumero", ""))
            amount = Decimal(str(pagamento.get("valor", "0")))
            payer_doc = pagamento.get("pagador", {}).get("cpf") or pagamento.get("pagador", {}).get("cnpj", "")
            payer_name = pagamento.get("pagador", {}).get("nome", "")
            occurred_at_str = pagamento.get("dataLiquidacao", event.get("dataHora", ""))
        else:
            # Fallback: generic payment notification
            event_type = payload.get("tipo", "payment_received")
            transaction_id = payload.get("idTransacao", "")
            amount = Decimal(str(payload.get("valor", "0")))
            payer_doc = payload.get("cpfPagador", payload.get("cnpjPagador", ""))
            payer_name = payload.get("nomePagador", "")
            occurred_at_str = payload.get("dataHora", "")

        # Parse timestamp
        try:
            occurred_at = datetime.fromisoformat(occurred_at_str.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            occurred_at = datetime.utcnow()

        return PaymentWebhook(
            event_id=event.get("id", transaction_id),
            event_type=event_type,
            transaction_id=transaction_id,
            amount=amount,
            payer_document=payer_doc,
            payer_name=payer_name,
            account_id=payload.get("conta", {}).get("numero", ""),
            occurred_at=occurred_at,
            raw=payload,
        )

    def _is_idempotent(self, key: str) -> bool:
        """Return True if key is new (first time seen)."""
        if self._redis is not None:
            try:
                # SET key 1 EX ttl NX — returns True if key was set (new)
                result = self._redis.set(key, "1", ex=IDEMPOTENCY_TTL_SECS, nx=True)
                return result is True
            except Exception as exc:
                logger.warning("Redis idempotency check failed (%s) — falling back to memory", exc)

        return _idempotency_check_memory(key)

    # ------------------------------------------------------------------
    # OAuth2 token management
    # ------------------------------------------------------------------

    def _get_token(self) -> str:
        """Return a valid access token, refreshing if necessary.

        Thread-safe via _token_lock.
        """
        with self._token_lock:
            if self._token and not self._token.is_expired:
                return self._token.access_token
            self._token = self._fetch_token()
            return self._token.access_token

    @_token_breaker
    @retry_with_backoff(max_attempts=3, base_delay=2.0, exceptions=(ItauOAuth2Error,))
    def _fetch_token(self) -> OAuth2Token:
        """Fetch a new OAuth2 client credentials token from Itaú STS."""
        if not _HAS_HTTPX:
            logger.warning("httpx not available — returning stub token")
            return OAuth2Token(
                access_token="stub-token",
                token_type="Bearer",
                expires_at=time.time() + 3600,
            )

        # Stub mode when credentials are not configured
        if not self.client_id or not self.client_secret:
            return OAuth2Token(
                access_token="stub-token-no-credentials",
                token_type="Bearer",
                expires_at=time.time() + 3600,
            )

        url = f"{self.base_url}/as/token.oauth2"
        try:
            with httpx.Client(timeout=15.0) as http:
                response = http.post(
                    url,
                    data={
                        "grant_type": "client_credentials",
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                        "scope": "openfinance.payments.read openfinance.statements.read",
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPStatusError as exc:
            raise ItauOAuth2Error(
                f"Itaú OAuth2 failed ({exc.response.status_code}): {exc.response.text[:200]}"
            ) from exc
        except httpx.RequestError as exc:
            raise ItauOAuth2Error(f"Itaú OAuth2 network error: {exc}") from exc

        expires_in = int(data.get("expires_in", 3600))
        token = OAuth2Token(
            access_token=data["access_token"],
            token_type=data.get("token_type", "Bearer"),
            expires_at=time.time() + expires_in,
        )
        logger.info("itau.oauth2.token_refreshed expires_in=%ds", expires_in)
        return token

    # ------------------------------------------------------------------
    # Account statement polling (fallback when webhooks not available)
    # ------------------------------------------------------------------

    @_statement_breaker
    @retry_with_backoff(max_attempts=3, base_delay=2.0)
    def poll_statements(
        self,
        account_id: str,
        date_from: date,
        date_to: date,
    ) -> list[AccountStatement]:
        """Fetch account statement entries for the given date range.

        This is the fallback mechanism when Itaú webhooks are not configured
        or temporarily unavailable. The API supports up to 90-day windows.

        Args:
            account_id: Itaú account identifier (agência + conta).
            date_from: Start date (inclusive).
            date_to: End date (inclusive).

        Returns:
            List of AccountStatement entries, sorted by occurred_at ascending.
        """
        if not _HAS_HTTPX:
            logger.warning("httpx not available — returning empty statement list")
            return []

        token = self._get_token()

        # Stub mode
        if token.startswith("stub-token"):
            logger.info(
                "itau.statements.stub account=%s from=%s to=%s",
                account_id, date_from, date_to,
            )
            return _build_stub_statements(date_from, date_to)

        url = (
            f"{self.base_url}/open-banking/{ITAU_API_VERSION}"
            f"/accounts/{account_id}/transactions"
        )
        params = {
            "fromBookingDateTime": date_from.isoformat(),
            "toBookingDateTime": date_to.isoformat(),
            "page": 1,
            "page-size": 200,
        }

        entries: list[AccountStatement] = []
        try:
            with httpx.Client(timeout=30.0) as http:
                while True:
                    response = http.get(
                        url,
                        params=params,
                        headers={"Authorization": f"Bearer {token}"},
                    )
                    response.raise_for_status()
                    data = response.json()

                    for item in data.get("data", []):
                        entries.append(_map_statement_entry(item))

                    # Pagination
                    meta = data.get("meta", {})
                    total_pages = meta.get("totalPages", 1)
                    if params["page"] >= total_pages:
                        break
                    params["page"] += 1  # type: ignore[index]

        except httpx.HTTPStatusError as exc:
            raise ItauAPIError(
                f"Itaú statement API error ({exc.response.status_code}): "
                f"{exc.response.text[:200]}"
            ) from exc
        except httpx.RequestError as exc:
            raise ItauAPIError(f"Itaú statement network error: {exc}") from exc

        entries.sort(key=lambda e: e.occurred_at)
        logger.info(
            "itau.statements.fetched account=%s from=%s to=%s count=%d",
            account_id, date_from, date_to, len(entries),
        )
        return entries


# ---------------------------------------------------------------------------
# Mapping helpers
# ---------------------------------------------------------------------------

def _map_statement_entry(item: dict) -> AccountStatement:
    """Map Itaú Open Banking transaction object to AccountStatement."""
    amount_raw = item.get("amount", {})
    if isinstance(amount_raw, dict):
        amount = Decimal(str(amount_raw.get("amount", "0")))
    else:
        amount = Decimal(str(amount_raw or "0"))

    balance_raw = item.get("balanceAfterTransaction", {})
    if isinstance(balance_raw, dict):
        balance = Decimal(str(balance_raw.get("amount", "0")))
    else:
        balance = Decimal(str(balance_raw or "0"))

    credit_debit = item.get("creditDebitIndicator", "CREDIT").upper()
    transaction_type = "credit" if credit_debit == "CREDIT" else "debit"

    counterpart = item.get("counterpartAccount", item.get("remittanceInformation", {}))
    if isinstance(counterpart, dict):
        counterpart_doc = counterpart.get("identification", {}).get("cpfCnpj", "")
        counterpart_name = counterpart.get("identification", {}).get("name", "")
    else:
        counterpart_doc = ""
        counterpart_name = str(counterpart)

    booking_dt = item.get("bookingDateTime", item.get("transactionDate", ""))
    try:
        occurred_at = datetime.fromisoformat(booking_dt.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        occurred_at = datetime.utcnow()

    return AccountStatement(
        entry_id=item.get("transactionId", item.get("entryReference", "")),
        transaction_type=transaction_type,
        amount=amount,
        description=item.get("transactionInformation", item.get("remittanceInformation", "")),
        counterpart_document=counterpart_doc,
        counterpart_name=counterpart_name,
        occurred_at=occurred_at,
        balance_after=balance,
    )


def _build_stub_statements(date_from: date, date_to: date) -> list[AccountStatement]:
    """Return synthetic statement entries for sandbox/dev mode."""
    from decimal import Decimal as D
    from datetime import timedelta

    entries = []
    current = date_from
    seq = 1
    while current <= date_to:
        entries.append(AccountStatement(
            entry_id=f"stub-{current.isoformat()}-{seq:04d}",
            transaction_type="credit",
            amount=D("1500.00"),
            description=f"PIX RECEBIDO - INQUILINO STUB {seq}",
            counterpart_document="123.456.789-00",
            counterpart_name=f"LOCATARIO TESTE {seq}",
            occurred_at=datetime(current.year, current.month, current.day, 10, 0, 0),
            balance_after=D(f"{10000 + seq * 1500}.00"),
        ))
        current += timedelta(days=7)
        seq += 1
    return entries


# ---------------------------------------------------------------------------
# Module-level singleton (lazy init from environment)
# ---------------------------------------------------------------------------

_default_client: ItauClient | None = None
_client_lock = Lock()


def get_itau_client() -> ItauClient:
    """Return the module-level ItauClient singleton, initialised from env vars."""
    global _default_client
    if _default_client is None:
        with _client_lock:
            if _default_client is None:
                _default_client = ItauClient.from_env()
    return _default_client
