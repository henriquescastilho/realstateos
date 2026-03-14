"""Structured JSON logging setup for Real Estate OS.

Configure once at startup via configure_logging(). All subsequent
logger.info/warning/error calls emit JSON lines with:
  - timestamp (ISO 8601)
  - level
  - logger name
  - correlation_id (from request context when set)
  - message
  - extra fields

Sensitive fields (cpf, cnpj, document, amount) are automatically masked.
"""
from __future__ import annotations

import json
import logging
import time
from contextvars import ContextVar
from typing import Any

# Context variable — set per request by CorrelationIdMiddleware
correlation_id_var: ContextVar[str] = ContextVar("correlation_id", default="")

# Fields that should be masked in logs
_SENSITIVE_FIELDS = frozenset({"cpf", "cnpj", "document", "password", "token", "secret", "key"})
_MASK = "***"


def _mask_sensitive(data: dict) -> dict:
    result = {}
    for k, v in data.items():
        if k.lower() in _SENSITIVE_FIELDS:
            result[k] = _MASK
        elif isinstance(v, dict):
            result[k] = _mask_sensitive(v)
        else:
            result[k] = v
    return result


class JsonFormatter(logging.Formatter):
    """Emits single-line JSON log records."""

    def format(self, record: logging.LogRecord) -> str:
        log_data: dict[str, Any] = {
            "timestamp": self.formatTime(record, datefmt="%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        # Attach correlation id from context if available
        cid = correlation_id_var.get("")
        if cid:
            log_data["correlation_id"] = cid

        # Merge extra fields
        standard_keys = {
            "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
            "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
            "created", "msecs", "relativeCreated", "thread", "threadName",
            "processName", "process", "taskName", "message",
        }
        extra = {k: v for k, v in record.__dict__.items() if k not in standard_keys}
        if extra:
            log_data.update(_mask_sensitive(extra))

        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_data, default=str)


def configure_logging(level: str = "INFO") -> None:
    """Configure root logger with JSON output.

    Call once at application startup (e.g., in main.py lifespan or at module import).
    """
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Silence noisy third-party loggers
    for noisy in ("uvicorn.access", "sqlalchemy.engine"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


class CorrelationIdMiddleware:
    """ASGI middleware that injects a correlation_id into every request context.

    Sets correlation_id_var so all loggers in the same request coroutine
    emit the same correlation_id automatically.

    Priority: X-Request-ID header → auto-generated UUID.
    """

    def __init__(self, app) -> None:  # noqa: ANN001
        self.app = app

    async def __call__(self, scope, receive, send) -> None:  # noqa: ANN001
        if scope["type"] == "http":
            import uuid  # noqa: PLC0415

            headers = dict(scope.get("headers", []))
            cid = headers.get(b"x-request-id", b"").decode() or str(uuid.uuid4())
            token = correlation_id_var.set(cid)

            async def send_with_header(message):  # noqa: ANN001
                if message["type"] == "http.response.start":
                    headers_list = list(message.get("headers", []))
                    headers_list.append((b"x-request-id", cid.encode()))
                    message = {**message, "headers": headers_list}
                await send(message)

            try:
                await self.app(scope, receive, send_with_header)
            finally:
                correlation_id_var.reset(token)
        else:
            await self.app(scope, receive, send)


def get_logger(name: str) -> logging.Logger:
    """Convenience wrapper — returns a named logger."""
    return logging.getLogger(name)
