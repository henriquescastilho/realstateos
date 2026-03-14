"""Typed error catalog for Real Estate OS.

Every domain error is represented as a subclass of ``AppError`` which carries:
* A machine-readable ``code`` (snake_case, e.g. ``contract_not_found``)
* A human-readable ``message`` (in English; Portuguese translations handled by the frontend)
* The HTTP ``status_code`` to use in the response
* An optional ``documentation_url`` pointing to the relevant API docs section

Usage::

    from app.errors import ContractNotFoundError

    raise ContractNotFoundError(contract_id="abc-123")

All ``AppError`` subclasses are also valid ``HTTPException``-compatible objects —
``FastAPI`` will serialize them using the standard ``{"detail": "..."}`` envelope
because the ``HTTPException`` handler catches ``AppError`` automatically.

Wire it up in ``main.py``::

    from fastapi import Request
    from fastapi.responses import JSONResponse
    from app.errors import AppError

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "documentation_url": exc.documentation_url,
                }
            },
        )
"""

from __future__ import annotations

from http import HTTPStatus

from fastapi import HTTPException

_DOCS_BASE = "https://realstateos.com.br/docs/api/errors"


class AppError(HTTPException):
    """Base class for all application errors.

    Subclasses **must** define:
    - ``code`` — machine-readable slug (snake_case)
    - ``http_status`` — HTTP status code (int or ``http.HTTPStatus``)
    - ``message_template`` — message string, may contain ``{placeholders}``

    Subclasses **may** define:
    - ``documentation_url`` — link to error documentation
    """

    code: str = "internal_error"
    http_status: int = 500
    message_template: str = "An unexpected error occurred."
    documentation_url: str = f"{_DOCS_BASE}#internal_error"

    def __init__(self, **kwargs: object) -> None:
        try:
            self.message = self.message_template.format(**kwargs)
        except KeyError:
            self.message = self.message_template
        super().__init__(status_code=self.http_status, detail=self.message)

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(code={self.code!r}, message={self.message!r})"


# ---------------------------------------------------------------------------
# 4xx — Client errors
# ---------------------------------------------------------------------------


class ContractNotFoundError(AppError):
    """Raised when a contract cannot be found (or belongs to another tenant)."""

    code = "contract_not_found"
    http_status = 404
    message_template = "Contract '{contract_id}' not found."
    documentation_url = f"{_DOCS_BASE}#contract_not_found"

    def __init__(self, contract_id: str = "") -> None:
        super().__init__(contract_id=contract_id)


class PropertyNotFoundError(AppError):
    """Raised when a property cannot be found."""

    code = "property_not_found"
    http_status = 404
    message_template = "Property '{property_id}' not found."
    documentation_url = f"{_DOCS_BASE}#property_not_found"

    def __init__(self, property_id: str = "") -> None:
        super().__init__(property_id=property_id)


class OwnerNotFoundError(AppError):
    """Raised when an owner cannot be found."""

    code = "owner_not_found"
    http_status = 404
    message_template = "Owner '{owner_id}' not found."
    documentation_url = f"{_DOCS_BASE}#owner_not_found"

    def __init__(self, owner_id: str = "") -> None:
        super().__init__(owner_id=owner_id)


class RenterNotFoundError(AppError):
    """Raised when a renter cannot be found."""

    code = "renter_not_found"
    http_status = 404
    message_template = "Renter '{renter_id}' not found."
    documentation_url = f"{_DOCS_BASE}#renter_not_found"

    def __init__(self, renter_id: str = "") -> None:
        super().__init__(renter_id=renter_id)


class ChargeNotFoundError(AppError):
    """Raised when a charge cannot be found."""

    code = "charge_not_found"
    http_status = 404
    message_template = "Charge '{charge_id}' not found."
    documentation_url = f"{_DOCS_BASE}#charge_not_found"

    def __init__(self, charge_id: str = "") -> None:
        super().__init__(charge_id=charge_id)


class AgentTaskNotFoundError(AppError):
    """Raised when an agent task cannot be found."""

    code = "agent_task_not_found"
    http_status = 404
    message_template = "Agent task '{task_id}' not found."
    documentation_url = f"{_DOCS_BASE}#agent_task_not_found"

    def __init__(self, task_id: str = "") -> None:
        super().__init__(task_id=task_id)


class PaymentDivergenceError(AppError):
    """Raised when a payment amount does not match the expected charge amount.

    This triggers human escalation if not overridden by policy.
    """

    code = "payment_divergence"
    http_status = 409
    message_template = (
        "Payment '{payment_id}' amount {received} does not match "
        "expected {expected} for charge '{charge_id}'."
    )
    documentation_url = f"{_DOCS_BASE}#payment_divergence"

    def __init__(
        self,
        payment_id: str = "",
        received: str = "0.00",
        expected: str = "0.00",
        charge_id: str = "",
    ) -> None:
        super().__init__(
            payment_id=payment_id,
            received=received,
            expected=expected,
            charge_id=charge_id,
        )


class AgentTimeoutError(AppError):
    """Raised when an ADK agent exceeds its execution time limit."""

    code = "agent_timeout"
    http_status = 504
    message_template = "Agent '{agent_name}' timed out after {timeout_seconds}s."
    documentation_url = f"{_DOCS_BASE}#agent_timeout"

    def __init__(self, agent_name: str = "unknown", timeout_seconds: int = 30) -> None:
        super().__init__(agent_name=agent_name, timeout_seconds=timeout_seconds)


class TenantQuotaExceededError(AppError):
    """Raised when the tenant has exceeded a usage quota (contracts, requests, etc.)."""

    code = "tenant_quota_exceeded"
    http_status = 429
    message_template = (
        "Tenant quota exceeded: {resource} limit of {limit} reached. "
        "Contact support to upgrade your plan."
    )
    documentation_url = f"{_DOCS_BASE}#tenant_quota_exceeded"

    def __init__(self, resource: str = "resource", limit: int = 0) -> None:
        super().__init__(resource=resource, limit=limit)


class InvalidDocumentError(AppError):
    """Raised when a CPF/CNPJ fails checksum validation."""

    code = "invalid_document"
    http_status = 422
    message_template = "'{document}' is not a valid CPF or CNPJ."
    documentation_url = f"{_DOCS_BASE}#invalid_document"

    def __init__(self, document: str = "") -> None:
        super().__init__(document=document)


class TaskStateConflictError(AppError):
    """Raised when a state transition is not allowed for an agent task."""

    code = "task_state_conflict"
    http_status = 409
    message_template = (
        "Cannot perform '{action}' on task '{task_id}' with status '{current_status}'. "
        "Allowed statuses: {allowed_statuses}."
    )
    documentation_url = f"{_DOCS_BASE}#task_state_conflict"

    def __init__(
        self,
        action: str = "action",
        task_id: str = "",
        current_status: str = "",
        allowed_statuses: str = "",
    ) -> None:
        super().__init__(
            action=action,
            task_id=task_id,
            current_status=current_status,
            allowed_statuses=allowed_statuses,
        )


class AuthenticationError(AppError):
    """Raised when JWT authentication fails."""

    code = "authentication_error"
    http_status = 401
    message_template = "Authentication failed: {reason}."
    documentation_url = f"{_DOCS_BASE}#authentication_error"

    def __init__(self, reason: str = "invalid or expired token") -> None:
        super().__init__(reason=reason)


class AuthorizationError(AppError):
    """Raised when the authenticated user lacks permission for an action."""

    code = "authorization_error"
    http_status = 403
    message_template = "Access denied: {reason}."
    documentation_url = f"{_DOCS_BASE}#authorization_error"

    def __init__(self, reason: str = "insufficient permissions") -> None:
        super().__init__(reason=reason)


class StorageError(AppError):
    """Raised when a MinIO / S3 storage operation fails."""

    code = "storage_error"
    http_status = 502
    message_template = "Storage operation failed: {reason}."
    documentation_url = f"{_DOCS_BASE}#storage_error"

    def __init__(self, reason: str = "unknown storage error") -> None:
        super().__init__(reason=reason)


class ExternalServiceError(AppError):
    """Raised when an external API (bank, WhatsApp, email) returns an error."""

    code = "external_service_error"
    http_status = 502
    message_template = "External service '{service}' returned an error: {reason}."
    documentation_url = f"{_DOCS_BASE}#external_service_error"

    def __init__(self, service: str = "unknown", reason: str = "unexpected error") -> None:
        super().__init__(service=service, reason=reason)


# ---------------------------------------------------------------------------
# Convenience: mapping from code → class (for deserialization/testing)
# ---------------------------------------------------------------------------

ERROR_REGISTRY: dict[str, type[AppError]] = {
    cls.code: cls  # type: ignore[attr-defined]
    for cls in [
        ContractNotFoundError,
        PropertyNotFoundError,
        OwnerNotFoundError,
        RenterNotFoundError,
        ChargeNotFoundError,
        AgentTaskNotFoundError,
        PaymentDivergenceError,
        AgentTimeoutError,
        TenantQuotaExceededError,
        InvalidDocumentError,
        TaskStateConflictError,
        AuthenticationError,
        AuthorizationError,
        StorageError,
        ExternalServiceError,
    ]
}
