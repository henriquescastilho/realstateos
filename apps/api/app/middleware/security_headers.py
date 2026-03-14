"""Security headers middleware.

Adds OWASP-recommended security headers to every response.
Stack traces are suppressed from error responses in production.
"""
from __future__ import annotations

import json
import logging

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Cache-Control": "no-store",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Injects security headers and sanitizes 500 error bodies in production."""

    def __init__(self, app, debug: bool = False) -> None:
        super().__init__(app)
        self._debug = debug

    async def dispatch(self, request: Request, call_next) -> Response:  # noqa: ANN001
        try:
            response = await call_next(request)
        except Exception:  # noqa: BLE001
            logger.exception("Unhandled exception for %s %s", request.method, request.url.path)
            body = json.dumps({"detail": "Internal server error"}).encode()
            response = Response(content=body, status_code=500, media_type="application/json")

        for header, value in _SECURITY_HEADERS.items():
            response.headers[header] = value

        # Scrub stack traces from 5xx responses in production
        if not self._debug and response.status_code >= 500:
            content_type = response.headers.get("content-type", "")
            if "application/json" in content_type:
                try:
                    body = b""
                    async for chunk in response.body_iterator:  # type: ignore[attr-defined]
                        body += chunk
                    data = json.loads(body)
                    # Strip any 'traceback' or 'detail' that contains file paths
                    if isinstance(data.get("detail"), str) and "Traceback" in data["detail"]:
                        data["detail"] = "Internal server error"
                    clean_body = json.dumps(data).encode()
                    response = Response(
                        content=clean_body,
                        status_code=response.status_code,
                        media_type="application/json",
                        headers=dict(response.headers),
                    )
                except Exception:  # noqa: BLE001
                    pass  # Best-effort — don't break the response

        return response
