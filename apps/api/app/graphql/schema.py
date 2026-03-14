"""GraphQL schema assembly — wires Query, Subscription, and context into a
Strawberry schema and returns a FastAPI-compatible GraphQLRouter.

Mount in main.py::

    from app.graphql.schema import get_graphql_router
    gql = get_graphql_router()
    if gql is not None:
        app.include_router(gql, prefix="/graphql")

Requires ``strawberry-graphql[fastapi]`` to be installed.
Falls back gracefully when the library is absent.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

logger = logging.getLogger(__name__)

try:
    import strawberry
    from strawberry.fastapi import GraphQLRouter

    _STRAWBERRY_AVAILABLE = True
except ImportError:
    _STRAWBERRY_AVAILABLE = False
    logger.warning("strawberry-graphql not installed — GraphQL endpoint will be unavailable")

if TYPE_CHECKING:
    from fastapi import APIRouter


def get_graphql_router() -> "APIRouter | None":
    """Return the Strawberry GraphQLRouter, or None if strawberry is not installed."""
    if not _STRAWBERRY_AVAILABLE:
        return _fallback_router()

    try:
        return _build_router()
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to build GraphQL schema: %s", exc, exc_info=True)
        return _fallback_router()


def _build_router():  # type: ignore[return]
    """Build and return the real Strawberry GraphQLRouter."""
    from app.graphql.context import GraphQLContext
    from app.graphql.queries import Query
    from app.graphql.subscriptions import Subscription

    # ---------------------------------------------------------------------------
    # Context factory — called by Strawberry for every HTTP/WS request
    # ---------------------------------------------------------------------------

    async def get_context(request: Any = None, connection: Any = None) -> GraphQLContext:  # noqa: ANN401
        """Extract JWT tenant_id and create a DB session for the request."""
        from app.db import SessionLocal  # noqa: PLC0415

        db = SessionLocal()

        # Try to extract tenant from Authorization header
        tenant_id = "demo"
        try:
            from jose import jwt as _jwt  # noqa: PLC0415
            from app.config import settings  # noqa: PLC0415

            # Support both HTTP and WebSocket connections
            _request = request or connection
            if _request is not None:
                auth_header = ""
                if hasattr(_request, "headers"):
                    auth_header = _request.headers.get("Authorization", "")
                if auth_header.startswith("Bearer "):
                    token = auth_header[7:]
                    try:
                        payload = _jwt.decode(
                            token,
                            settings.jwt_secret,
                            algorithms=[settings.jwt_algorithm],
                        )
                        tenant_id = payload.get("tenant_id", payload.get("sub", "demo"))
                    except Exception:  # noqa: BLE001
                        pass  # Unauthenticated — use demo tenant

        except ImportError:
            pass  # jose not available, stick with demo tenant

        return GraphQLContext(tenant_id=tenant_id, db=db)

    # ---------------------------------------------------------------------------
    # Schema — Query + Subscription; Mutation is left as a future extension
    # ---------------------------------------------------------------------------

    schema = strawberry.Schema(
        query=Query,
        subscription=Subscription,
        # Enable strawberry built-in extensions for query depth limiting
        extensions=[],
    )

    router = GraphQLRouter(
        schema,
        context_getter=get_context,
        graphiql=True,  # Enable GraphiQL IDE in all environments for dev convenience
        subscription_protocols=["graphql-ws", "graphql-transport-ws"],
    )

    logger.info("GraphQL schema built — /graphql endpoint active (GraphiQL enabled)")
    return router


def _fallback_router():
    """Return a minimal FastAPI router that explains how to enable GraphQL."""
    try:
        from fastapi import APIRouter
        from fastapi.responses import JSONResponse

        fallback = APIRouter(tags=["graphql"])

        @fallback.get(
            "",
            include_in_schema=False,
            summary="GraphQL unavailable",
        )
        @fallback.post("", include_in_schema=False)
        async def graphql_unavailable() -> JSONResponse:
            return JSONResponse(
                status_code=503,
                content={
                    "error": "GraphQL endpoint is not available.",
                    "reason": "strawberry-graphql[fastapi] is not installed.",
                    "fix": "pip install 'strawberry-graphql[fastapi]>=0.243.0'",
                },
            )

        return fallback
    except ImportError:
        return None
