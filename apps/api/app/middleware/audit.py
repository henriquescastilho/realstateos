import logging
import time

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("realestateos.audit")


class AuditLogMiddleware(BaseHTTPMiddleware):
    """Logs every request with method, path, status, duration, and user context."""

    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.monotonic()
        response: Response = await call_next(request)
        duration_ms = round((time.monotonic() - start) * 1000, 2)

        # Extract user info from JWT if present (set by auth dependency)
        user_id = "-"
        tenant_id = "-"
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            try:
                from jose import jwt

                from app.config import settings

                token = auth_header.split(" ", 1)[1]
                payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
                user_id = payload.get("sub", "-")
                tenant_id = payload.get("tenant_id", "-")
            except Exception:
                pass

        logger.info(
            "audit_request",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": duration_ms,
                "user_id": user_id,
                "tenant_id": tenant_id,
                "client_ip": request.client.host if request.client else "-",
            },
        )
        return response
