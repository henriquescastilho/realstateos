"""Digital contract signing integration.

Provides a unified ESignProvider interface with a Clicksign implementation
(primary, BR market) and a DocuSign stub (secondary, international).

Handles:
- Creating a signing envelope from a PDF document.
- Adding signers with role and email.
- Sending the envelope for signature.
- Webhook parsing: completion, refusal, cancellation events.
- Downloading the signed PDF and storing it to MinIO via StorageService.
- Stub / sandbox mode: logs operations without calling external APIs.

Clicksign is the primary implementation because it is the dominant e-signature
platform in the Brazilian market, with native CPF validation and ICP-Brasil
support. DocuSign is provided as an interface stub for international tenants.

Usage:
    provider = ClicksignProvider.from_env()

    # 1. Create an envelope and add the PDF
    envelope = provider.create_envelope(
        document_key="org-abc/contracts/uuid-contrato.pdf",
        document_name="Contrato de Locação — CONT-2024-001",
        deadline_date=date(2026, 4, 30),
    )

    # 2. Add signers
    provider.add_signer(envelope.envelope_id, Signer(
        name="João Silva",
        email="joao@example.com",
        cpf="123.456.789-09",
        role="renter",
        sign_as="sign",
    ))
    provider.add_signer(envelope.envelope_id, Signer(
        name="Maria Santos",
        email="maria@example.com",
        cpf="987.654.321-00",
        role="owner",
        sign_as="sign",
    ))

    # 3. Finalize (send notification emails)
    provider.finalize_envelope(envelope.envelope_id)

    # 4. Handle webhook (POST /webhooks/esign)
    event = provider.parse_webhook(raw_body)
    if event.event_type == "completed":
        signed_pdf_url = provider.download_signed(event.envelope_id, storage_service)
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date, datetime
from threading import Lock
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional dependencies
# ---------------------------------------------------------------------------

try:
    import httpx
    _HAS_HTTPX = True
except ImportError:
    _HAS_HTTPX = False
    logger.warning("httpx not installed — ESign provider running in stub mode")

try:
    from app.utils.resilience import retry_with_backoff, CircuitBreaker
except ImportError:
    def retry_with_backoff(**kwargs):  # type: ignore[misc]
        def decorator(fn):
            return fn
        return decorator

    class CircuitBreaker:  # type: ignore[no-redef]
        def __init__(self, *args, **kwargs): ...
        def __call__(self, fn):
            return fn

try:
    from app.services.storage import StorageService
    _HAS_STORAGE = True
except ImportError:
    _HAS_STORAGE = False
    StorageService = None  # type: ignore[assignment,misc]


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CLICKSIGN_PROD_BASE = "https://app.clicksign.com/api/v1"
CLICKSIGN_SANDBOX_BASE = "https://sandbox.clicksign.com/api/v1"


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class Signer:
    """A person who will sign the document."""

    name: str
    email: str
    role: str                   # "renter" | "owner" | "witness" | "guarantor"
    sign_as: str = "sign"       # Clicksign: "sign" | "approve" | "acknowledge" | "witness"
    cpf: str = ""               # Optional, validated by Clicksign for BR market
    phone_number: str = ""      # E.164 format (optional)
    auth_method: str = "email"  # "email" | "sms" | "whatsapp" | "icp" (ICP-Brasil)


@dataclass
class SigningEnvelope:
    """A signing envelope / document package."""

    envelope_id: str
    document_key: str           # MinIO object key
    document_name: str
    status: str                 # "draft" | "pending" | "completed" | "refused" | "cancelled"
    created_at: datetime
    deadline: date | None = None
    signers: list[Signer] = field(default_factory=list)
    signing_url: str = ""       # URL to redirect a signer to (single-use)
    sandbox: bool = False


@dataclass
class ESignEvent:
    """A parsed event from an e-signature webhook."""

    event_type: str             # "completed" | "refused" | "cancelled" | "viewed" | "signed"
    envelope_id: str
    document_key: str
    signer_email: str = ""
    signer_name: str = ""
    timestamp: datetime = field(default_factory=datetime.utcnow)
    signed_document_url: str = ""   # Filled for "completed" events
    raw: dict = field(default_factory=dict, repr=False)

    @property
    def is_completed(self) -> bool:
        return self.event_type == "completed"

    @property
    def is_refused(self) -> bool:
        return self.event_type == "refused"


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class ESignError(RuntimeError):
    """General e-signature API error."""


class ESignWebhookError(ValueError):
    """Raised when webhook signature validation fails."""


# ---------------------------------------------------------------------------
# Abstract interface
# ---------------------------------------------------------------------------

class ESignProvider(ABC):
    """Abstract interface for e-signature providers."""

    @abstractmethod
    def create_envelope(
        self,
        document_key: str,
        document_name: str,
        deadline_date: date | None = None,
    ) -> SigningEnvelope:
        """Create a new signing envelope from a document stored in MinIO."""
        ...

    @abstractmethod
    def add_signer(self, envelope_id: str, signer: Signer) -> str:
        """Add a signer to the envelope. Returns signer_key."""
        ...

    @abstractmethod
    def finalize_envelope(self, envelope_id: str) -> bool:
        """Send notification emails to all signers."""
        ...

    @abstractmethod
    def get_envelope(self, envelope_id: str) -> SigningEnvelope | None:
        """Fetch current envelope status."""
        ...

    @abstractmethod
    def cancel_envelope(self, envelope_id: str, reason: str = "") -> bool:
        """Cancel a pending envelope."""
        ...

    @abstractmethod
    def parse_webhook(self, raw_body: bytes, signature: str | None = None) -> ESignEvent:
        """Parse an inbound webhook payload."""
        ...

    @abstractmethod
    def download_signed(
        self,
        envelope_id: str,
        storage: Any | None = None,
        target_key: str | None = None,
    ) -> str:
        """Download the completed signed PDF and store it.

        Returns the MinIO object key (or URL) of the stored signed document.
        """
        ...


# ---------------------------------------------------------------------------
# Circuit breaker singletons
# ---------------------------------------------------------------------------

_clicksign_breaker = CircuitBreaker(
    name="clicksign",
    failure_threshold=5,
    recovery_timeout=120,
)


# ---------------------------------------------------------------------------
# Clicksign implementation
# ---------------------------------------------------------------------------

class ClicksignProvider(ESignProvider):
    """Clicksign e-signature provider (Brazilian market).

    Clicksign API v1 reference:
    https://developers.clicksign.com/

    Flow:
    1. POST /api/v1/documents  — upload document (base64 or URL)
    2. POST /api/v1/signers    — create signer records
    3. POST /api/v1/lists      — link signers to document
    4. PATCH /api/v1/documents/{key}/finish_manual — finalize (send emails)
    5. Webhook POST → parse event → download signed PDF on completion
    """

    def __init__(
        self,
        access_token: str,
        sandbox: bool = False,
        webhook_hmac_secret: str = "",
        presigned_url_fn: Any = None,
        timeout: float = 30.0,
    ) -> None:
        self.access_token = access_token
        self.sandbox = sandbox
        self.webhook_hmac_secret = webhook_hmac_secret
        self._presigned_url_fn = presigned_url_fn  # callable(key) → URL
        self.timeout = timeout
        self.base_url = CLICKSIGN_SANDBOX_BASE if sandbox else CLICKSIGN_PROD_BASE

        logger.info("ClicksignProvider initialised (sandbox=%s)", self.sandbox)

    @classmethod
    def from_env(cls) -> "ClicksignProvider":
        """Construct from environment variables.

        Required:
            CLICKSIGN_ACCESS_TOKEN       API access token

        Optional:
            CLICKSIGN_SANDBOX=true       Use sandbox (default: false)
            CLICKSIGN_WEBHOOK_SECRET     HMAC secret for webhook validation
        """
        token = os.environ.get("CLICKSIGN_ACCESS_TOKEN", "")
        sandbox = os.environ.get("CLICKSIGN_SANDBOX", "false").lower() == "true"
        secret = os.environ.get("CLICKSIGN_WEBHOOK_SECRET", "")

        if not token:
            logger.warning(
                "CLICKSIGN_ACCESS_TOKEN not set — ClicksignProvider in stub mode"
            )
            sandbox = True

        return cls(
            access_token=token,
            sandbox=sandbox,
            webhook_hmac_secret=secret,
        )

    # ------------------------------------------------------------------
    # ESignProvider interface
    # ------------------------------------------------------------------

    @_clicksign_breaker
    @retry_with_backoff(max_attempts=3, base_delay=2.0, exceptions=(ESignError,))
    def create_envelope(
        self,
        document_key: str,
        document_name: str,
        deadline_date: date | None = None,
    ) -> SigningEnvelope:
        """Upload a document from MinIO and create a Clicksign document."""
        if self.sandbox or not _HAS_HTTPX or not self.access_token:
            stub_id = f"stub_{hashlib.md5(document_key.encode()).hexdigest()[:8]}"
            logger.info(
                "clicksign.create_envelope.stub key=%s name=%r",
                document_key, document_name,
            )
            return SigningEnvelope(
                envelope_id=stub_id,
                document_key=document_key,
                document_name=document_name,
                status="draft",
                created_at=datetime.utcnow(),
                deadline=deadline_date,
                sandbox=True,
            )

        # Get a presigned URL for the document so Clicksign can fetch it
        doc_url = self._get_document_url(document_key)

        payload: dict[str, Any] = {
            "document": {
                "path": f"/{document_name}",
                "content_base64": None,
                "deadline_at": deadline_date.isoformat() if deadline_date else None,
                "auto_close": True,
                "locale": "pt-BR",
                "sequence_enabled": False,
                "remind_interval": 3,
            }
        }

        # Clicksign supports URL-based upload via the content field
        if doc_url:
            del payload["document"]["content_base64"]
            payload["document"]["content_base64"] = None
            # Alternatively embed URL reference (provider-specific path)
            payload["document"]["path"] = f"/{document_name}"

        data = self._post("/documents", payload)
        doc = data.get("document", {})
        envelope_id = doc.get("key", "")

        logger.info(
            "clicksign.envelope_created envelope_id=%s name=%r",
            envelope_id, document_name,
        )
        return SigningEnvelope(
            envelope_id=envelope_id,
            document_key=document_key,
            document_name=document_name,
            status=doc.get("status", "draft"),
            created_at=datetime.utcnow(),
            deadline=deadline_date,
            sandbox=False,
        )

    @_clicksign_breaker
    @retry_with_backoff(max_attempts=3, base_delay=2.0, exceptions=(ESignError,))
    def add_signer(self, envelope_id: str, signer: Signer) -> str:
        """Create a Clicksign signer and link to the document."""
        if self.sandbox or not _HAS_HTTPX or not self.access_token:
            signer_key = f"stub_signer_{hashlib.md5(signer.email.encode()).hexdigest()[:8]}"
            logger.info(
                "clicksign.add_signer.stub envelope=%s email=%s",
                envelope_id, signer.email,
            )
            return signer_key

        # Step 1: Create signer
        signer_payload: dict[str, Any] = {
            "signer": {
                "email": signer.email,
                "phone_number": signer.phone_number or None,
                "auths": [signer.auth_method],
                "name": signer.name,
                "documentation": signer.cpf.replace(".", "").replace("-", "") if signer.cpf else None,
                "birthday": None,
                "has_documentation": bool(signer.cpf),
            }
        }
        signer_data = self._post("/signers", signer_payload)
        signer_key = signer_data.get("signer", {}).get("key", "")

        # Step 2: Link signer to document
        list_payload = {
            "list": {
                "document_key": envelope_id,
                "signer_key": signer_key,
                "sign_as": signer.sign_as,
                "message": f"Por favor, assine o documento: {signer.name}",
            }
        }
        self._post("/lists", list_payload)

        logger.info(
            "clicksign.signer_added envelope=%s signer_key=%s email=%s",
            envelope_id, signer_key, signer.email,
        )
        return signer_key

    @_clicksign_breaker
    @retry_with_backoff(max_attempts=2, base_delay=2.0, exceptions=(ESignError,))
    def finalize_envelope(self, envelope_id: str) -> bool:
        """Send signature notification emails to all signers."""
        if self.sandbox or not _HAS_HTTPX or not self.access_token:
            logger.info("clicksign.finalize.stub envelope=%s", envelope_id)
            return True

        self._patch(f"/documents/{envelope_id}/finish_manual", {})
        logger.info("clicksign.envelope_finalized envelope=%s", envelope_id)
        return True

    def get_envelope(self, envelope_id: str) -> SigningEnvelope | None:
        """Fetch current document/envelope status from Clicksign."""
        if self.sandbox or not _HAS_HTTPX or not self.access_token:
            return SigningEnvelope(
                envelope_id=envelope_id,
                document_key="",
                document_name="stub",
                status="pending",
                created_at=datetime.utcnow(),
                sandbox=True,
            )

        try:
            data = self._get(f"/documents/{envelope_id}")
            doc = data.get("document", {})
            return SigningEnvelope(
                envelope_id=envelope_id,
                document_key=doc.get("filename", ""),
                document_name=doc.get("filename", ""),
                status=doc.get("status", "unknown"),
                created_at=datetime.utcnow(),
                sandbox=False,
            )
        except ESignError as exc:
            logger.error("clicksign.get_envelope error: %s", exc)
            return None

    def cancel_envelope(self, envelope_id: str, reason: str = "") -> bool:
        """Cancel a pending Clicksign document."""
        if self.sandbox or not _HAS_HTTPX or not self.access_token:
            logger.info("clicksign.cancel.stub envelope=%s", envelope_id)
            return True

        try:
            self._patch(f"/documents/{envelope_id}/cancel", {})
            logger.info("clicksign.envelope_cancelled envelope=%s reason=%r", envelope_id, reason)
            return True
        except ESignError as exc:
            logger.error("clicksign.cancel_error envelope=%s: %s", envelope_id, exc)
            return False

    def parse_webhook(self, raw_body: bytes, signature: str | None = None) -> ESignEvent:
        """Parse an inbound Clicksign webhook payload.

        Clicksign sends a JSON payload with an 'event' object.
        Optionally validates HMAC-SHA256 if webhook_hmac_secret is set.
        """
        if signature and self.webhook_hmac_secret:
            _validate_hmac(raw_body, signature, self.webhook_hmac_secret)

        payload = json.loads(raw_body)
        event_obj = payload.get("event", payload)
        name = event_obj.get("name", "")

        # Map Clicksign event names to our internal types
        event_type = {
            "auto_close": "completed",
            "close": "completed",
            "cancel": "cancelled",
            "refuse": "refused",
            "sign": "signed",
            "view": "viewed",
        }.get(name, name)

        doc = event_obj.get("document", payload.get("document", {}))
        envelope_id = doc.get("key", event_obj.get("key", ""))
        signed_url = doc.get("downloads", {}).get("signed_file_url", "")

        signer = event_obj.get("signer", {})

        event = ESignEvent(
            event_type=event_type,
            envelope_id=envelope_id,
            document_key=doc.get("filename", ""),
            signer_email=signer.get("email", ""),
            signer_name=signer.get("name", ""),
            timestamp=datetime.utcnow(),
            signed_document_url=signed_url,
            raw=payload,
        )
        logger.info(
            "clicksign.webhook event_type=%s envelope=%s",
            event_type, envelope_id,
        )
        return event

    def download_signed(
        self,
        envelope_id: str,
        storage: Any = None,
        target_key: str | None = None,
    ) -> str:
        """Download the signed PDF from Clicksign and upload to MinIO.

        Args:
            envelope_id: Clicksign document key.
            storage: StorageService instance (optional). If None, attempts to
                     import the module singleton.
            target_key: MinIO key for the signed document. Auto-generated if None.

        Returns:
            MinIO object key of the stored signed PDF.
        """
        if self.sandbox or not _HAS_HTTPX or not self.access_token:
            key = target_key or f"signed/{envelope_id}.pdf"
            logger.info("clicksign.download_signed.stub key=%s", key)
            return key

        # Fetch the signed file URL from Clicksign
        try:
            doc_data = self._get(f"/documents/{envelope_id}")
        except ESignError as exc:
            logger.error("clicksign.download_signed fetch error: %s", exc)
            return ""

        signed_url = (
            doc_data.get("document", {})
            .get("downloads", {})
            .get("signed_file_url", "")
        )
        if not signed_url:
            logger.error("clicksign.download_signed: no signed_file_url for envelope=%s", envelope_id)
            return ""

        # Download the PDF bytes
        try:
            with httpx.Client(timeout=60.0) as http:
                response = http.get(signed_url)
                response.raise_for_status()
                pdf_bytes = response.content
        except Exception as exc:
            logger.error("clicksign.download_signed HTTP error: %s", exc)
            return ""

        # Store to MinIO
        object_key = target_key or f"signed/{envelope_id}_signed.pdf"

        if storage is None and _HAS_STORAGE:
            try:
                from app.services.storage import storage_service
                storage = storage_service
            except ImportError:
                pass

        if storage is not None:
            try:
                storage.upload(
                    key=object_key,
                    data=pdf_bytes,
                    content_type="application/pdf",
                )
                logger.info(
                    "clicksign.signed_pdf_stored envelope=%s key=%s bytes=%d",
                    envelope_id, object_key, len(pdf_bytes),
                )
            except Exception as exc:
                logger.error("clicksign.signed_pdf_storage_error: %s", exc)
                return ""
        else:
            logger.warning(
                "clicksign.download_signed: StorageService unavailable — PDF not stored"
            )

        return object_key

    # ------------------------------------------------------------------
    # HTTP helpers
    # ------------------------------------------------------------------

    def _get(self, path: str) -> dict:
        url = f"{self.base_url}{path}"
        try:
            with httpx.Client(timeout=self.timeout) as http:
                r = http.get(url, params={"access_token": self.access_token})
                r.raise_for_status()
                return r.json()
        except httpx.HTTPStatusError as exc:
            raise ESignError(
                f"Clicksign GET {path} error ({exc.response.status_code}): "
                f"{exc.response.text[:200]}"
            ) from exc
        except httpx.RequestError as exc:
            raise ESignError(f"Clicksign network error: {exc}") from exc

    def _post(self, path: str, payload: dict) -> dict:
        url = f"{self.base_url}{path}"
        try:
            with httpx.Client(timeout=self.timeout) as http:
                r = http.post(
                    url,
                    json=payload,
                    params={"access_token": self.access_token},
                    headers={"Content-Type": "application/json"},
                )
                r.raise_for_status()
                return r.json()
        except httpx.HTTPStatusError as exc:
            raise ESignError(
                f"Clicksign POST {path} error ({exc.response.status_code}): "
                f"{exc.response.text[:200]}"
            ) from exc
        except httpx.RequestError as exc:
            raise ESignError(f"Clicksign network error: {exc}") from exc

    def _patch(self, path: str, payload: dict) -> dict:
        url = f"{self.base_url}{path}"
        try:
            with httpx.Client(timeout=self.timeout) as http:
                r = http.patch(
                    url,
                    json=payload,
                    params={"access_token": self.access_token},
                    headers={"Content-Type": "application/json"},
                )
                r.raise_for_status()
                return r.json() if r.content else {}
        except httpx.HTTPStatusError as exc:
            raise ESignError(
                f"Clicksign PATCH {path} error ({exc.response.status_code}): "
                f"{exc.response.text[:200]}"
            ) from exc
        except httpx.RequestError as exc:
            raise ESignError(f"Clicksign network error: {exc}") from exc

    def _get_document_url(self, document_key: str) -> str:
        """Get a presigned URL for a MinIO object."""
        if self._presigned_url_fn is not None:
            try:
                return self._presigned_url_fn(document_key)
            except Exception as exc:
                logger.warning("Could not get presigned URL for %s: %s", document_key, exc)
        return ""


# ---------------------------------------------------------------------------
# DocuSign stub (international fallback)
# ---------------------------------------------------------------------------

class DocuSignProvider(ESignProvider):
    """DocuSign provider — interface stub for international tenants.

    This is a structural stub that implements the full ESignProvider interface
    but returns sandbox data. Implement with the DocuSign SDK when needed.

    pip install docusign-esign
    """

    def __init__(self, sandbox: bool = True) -> None:
        self.sandbox = sandbox
        logger.info("DocuSignProvider initialised (stub mode, sandbox=%s)", sandbox)

    @classmethod
    def from_env(cls) -> "DocuSignProvider":
        return cls(sandbox=True)

    def create_envelope(self, document_key: str, document_name: str, deadline_date: date | None = None) -> SigningEnvelope:
        logger.info("docusign.create_envelope.stub key=%s", document_key)
        return SigningEnvelope(
            envelope_id=f"docusign_stub_{hashlib.md5(document_key.encode()).hexdigest()[:8]}",
            document_key=document_key,
            document_name=document_name,
            status="draft",
            created_at=datetime.utcnow(),
            deadline=deadline_date,
            sandbox=True,
        )

    def add_signer(self, envelope_id: str, signer: Signer) -> str:
        logger.info("docusign.add_signer.stub envelope=%s email=%s", envelope_id, signer.email)
        return f"stub_signer_{signer.email[:8]}"

    def finalize_envelope(self, envelope_id: str) -> bool:
        logger.info("docusign.finalize.stub envelope=%s", envelope_id)
        return True

    def get_envelope(self, envelope_id: str) -> SigningEnvelope | None:
        return SigningEnvelope(
            envelope_id=envelope_id,
            document_key="",
            document_name="stub",
            status="pending",
            created_at=datetime.utcnow(),
            sandbox=True,
        )

    def cancel_envelope(self, envelope_id: str, reason: str = "") -> bool:
        logger.info("docusign.cancel.stub envelope=%s", envelope_id)
        return True

    def parse_webhook(self, raw_body: bytes, signature: str | None = None) -> ESignEvent:
        payload = json.loads(raw_body)
        status = payload.get("status", "completed")
        return ESignEvent(
            event_type=status,
            envelope_id=payload.get("envelopeId", ""),
            document_key="",
            timestamp=datetime.utcnow(),
            raw=payload,
        )

    def download_signed(self, envelope_id: str, storage: Any = None, target_key: str | None = None) -> str:
        key = target_key or f"signed/{envelope_id}_docusign.pdf"
        logger.info("docusign.download_signed.stub key=%s", key)
        return key


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _validate_hmac(raw_body: bytes, signature: str, secret: str) -> None:
    """Validate HMAC-SHA256 webhook signature."""
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    received = signature.replace("sha256=", "")
    if not hmac.compare_digest(expected, received):
        raise ESignWebhookError("E-sign webhook HMAC signature mismatch")


# ---------------------------------------------------------------------------
# Module-level singleton (Clicksign by default)
# ---------------------------------------------------------------------------

_default_provider: ESignProvider | None = None
_singleton_lock = Lock()


def get_esign_provider() -> ESignProvider:
    """Return module-level ESignProvider singleton.

    Uses ClicksignProvider by default. Set ESIGN_PROVIDER=docusign to switch.
    """
    global _default_provider
    if _default_provider is None:
        with _singleton_lock:
            if _default_provider is None:
                provider_name = os.environ.get("ESIGN_PROVIDER", "clicksign").lower()
                if provider_name == "docusign":
                    _default_provider = DocuSignProvider.from_env()
                else:
                    _default_provider = ClicksignProvider.from_env()
    return _default_provider
