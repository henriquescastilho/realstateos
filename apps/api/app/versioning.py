"""API versioning support.

Strategy
--------
* All routes are *primarily* served under ``/v1/``.
* Backwards-compatibility shims keep the legacy un-prefixed paths (``/owners``,
  ``/contracts``, …) and the ``/api/`` prefix working via internal redirects.
* Version negotiation is also supported via the ``Accept`` header:
    ``Accept: application/vnd.realstateos.v1+json``
  When this header is present, the middleware rewrites the path to ``/v1/<path>``.

Adding a future v2
------------------
1. Create ``apps/api/app/routes/v2/`` with changed route handlers.
2. Build a ``v2_router`` and include it at prefix ``/v2``.
3. Extend ``_VENDOR_MIME_TO_PREFIX`` below.
"""

from __future__ import annotations

import re
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

# ---------------------------------------------------------------------------
# Vendor MIME type → version prefix mapping
# ---------------------------------------------------------------------------
_VENDOR_MIME_TO_PREFIX: dict[str, str] = {
    "application/vnd.realstateos.v1+json": "/v1",
    "application/vnd.realstateos.v2+json": "/v2",
}

# Paths that must NEVER be rewritten (health, metrics, docs, demo, etc.)
_SKIP_PATH_PREFIXES = (
    "/v1",
    "/v2",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/health",
    "/metrics",
    "/demo",
)

_SKIP_PATH_RE = re.compile(
    r"^(" + "|".join(re.escape(p) for p in _SKIP_PATH_PREFIXES) + r")"
)


class VersionNegotiationMiddleware(BaseHTTPMiddleware):
    """Rewrite request path to versioned prefix based on ``Accept`` header.

    Example::

        Accept: application/vnd.realstateos.v1+json

    Rewrites ``/owners`` → ``/v1/owners`` before the request reaches any router.
    If the path already starts with a version prefix it is left untouched.
    """

    def __init__(self, app: ASGIApp, default_version: str = "/v1") -> None:
        super().__init__(app)
        self._default_version = default_version

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        accept = request.headers.get("accept", "")
        path = request.scope["path"]

        # Determine the desired version prefix from Accept header
        target_prefix: str | None = None
        for mime, prefix in _VENDOR_MIME_TO_PREFIX.items():
            if mime in accept:
                target_prefix = prefix
                break

        if target_prefix and not _SKIP_PATH_RE.match(path):
            # Rewrite path in-place within the ASGI scope
            new_path = target_prefix + path
            request.scope["path"] = new_path
            request.scope["raw_path"] = new_path.encode()

        return await call_next(request)


# ---------------------------------------------------------------------------
# Helper used by main.py to register versioned + shim routers
# ---------------------------------------------------------------------------

def include_versioned_routes(app, router) -> None:  # type: ignore[no-untyped-def]
    """Mount *router* at three path hierarchies:

    * ``/v1/``  — canonical versioned path
    * ``/api/`` — legacy shim (kept for backward compat)
    * ``/``     — root shim (original hackathon paths)

    Demo, health and metrics sub-routers are intentionally also reachable at
    all three prefixes so that existing integrations continue to work.
    """
    # Canonical v1 — primary
    app.include_router(router, prefix="/v1")

    # Backward-compat shims
    app.include_router(router, prefix="/api")
    app.include_router(router)  # root (no prefix)
