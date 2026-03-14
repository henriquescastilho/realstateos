"""Shared OpenAPI definitions — error models, common response dicts, and tag metadata.

Import these in route files to avoid repeating boilerplate:

    from app.openapi import RESPONSES_404, AUTH_RESPONSES

    @router.get("/{id}", response_model=MyRead, responses={**AUTH_RESPONSES, **RESPONSES_404})
    def get_item(id: str): ...
"""
from __future__ import annotations

from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Error response models
# ---------------------------------------------------------------------------


class ErrorDetail(BaseModel):
    """Single error item returned in validation error arrays."""

    field: str | None = None
    message: str

    model_config = {
        "json_schema_extra": {
            "examples": [{"field": "email", "message": "value is not a valid email address"}]
        }
    }


class ErrorResponse(BaseModel):
    """Standard error envelope returned by all non-2xx responses."""

    detail: str | list[ErrorDetail]

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"detail": "Not found"},
                {
                    "detail": [
                        {"field": "document", "message": "Invalid CPF format"},
                    ]
                },
            ]
        }
    }


# ---------------------------------------------------------------------------
# Reusable responses dicts (pass via **spread into route `responses=`)
# ---------------------------------------------------------------------------

RESPONSES_400: dict = {
    400: {
        "description": "Bad request — malformed input or business rule violation.",
        "model": ErrorResponse,
    }
}

RESPONSES_401: dict = {
    401: {
        "description": "Unauthorized — missing or invalid Bearer token.",
        "model": ErrorResponse,
        "content": {
            "application/json": {
                "example": {"detail": "Not authenticated"}
            }
        },
    }
}

RESPONSES_403: dict = {
    403: {
        "description": "Forbidden — authenticated but not allowed to access this resource.",
        "model": ErrorResponse,
        "content": {
            "application/json": {
                "example": {"detail": "Access denied"}
            }
        },
    }
}

RESPONSES_404: dict = {
    404: {
        "description": "Not found — the requested resource does not exist.",
        "model": ErrorResponse,
        "content": {
            "application/json": {
                "example": {"detail": "Not found"}
            }
        },
    }
}

RESPONSES_409: dict = {
    409: {
        "description": "Conflict — state precondition not met (e.g. wrong task status).",
        "model": ErrorResponse,
    }
}

RESPONSES_422: dict = {
    422: {
        "description": "Validation error — one or more input fields failed validation.",
        "model": ErrorResponse,
    }
}

RESPONSES_503: dict = {
    503: {
        "description": "Service unavailable — one or more critical dependencies are unhealthy.",
        "model": ErrorResponse,
        "content": {
            "application/json": {
                "example": {
                    "status": "degraded",
                    "components": {
                        "database": {"status": "error", "error": "connection refused"},
                        "redis": {"status": "ok", "latency_ms": 1.2},
                        "storage": {"status": "ok", "latency_ms": 4.5},
                    },
                }
            }
        },
    }
}

# Convenience bundles
AUTH_RESPONSES: dict = {**RESPONSES_401, **RESPONSES_403}
CRUD_RESPONSES: dict = {**AUTH_RESPONSES, **RESPONSES_404, **RESPONSES_422}

# ---------------------------------------------------------------------------
# OpenAPI tag metadata (consumed by FastAPI(openapi_tags=...))
# ---------------------------------------------------------------------------

OPENAPI_TAGS: list[dict] = [
    {
        "name": "owners",
        "description": "Property owners — landlords who own one or more properties managed by this platform.",
    },
    {
        "name": "renters",
        "description": "Renters (tenants) — individuals or companies currently holding active rental contracts.",
    },
    {
        "name": "properties",
        "description": "Properties — real estate units under management. Each property belongs to one owner.",
    },
    {
        "name": "contracts",
        "description": (
            "Rental contracts — binding agreements between owner and renter for a specific property. "
            "Contracts drive monthly billing generation."
        ),
    },
    {
        "name": "charges",
        "description": (
            "Charges (cobranças) — individual billing line items generated from contracts. "
            "Includes monthly rent, IGPM adjustments, fees, and consolidated boletos."
        ),
    },
    {
        "name": "documents",
        "description": "Document storage — contract PDFs, monthly bills, and attachments stored in MinIO.",
    },
    {
        "name": "tasks",
        "description": (
            "Legacy task records — simple audit trail entries created by billing and payment operations. "
            "See `agent-tasks` for the full agent task lifecycle."
        ),
    },
    {
        "name": "agent-tasks",
        "description": (
            "Agent task lifecycle — create, monitor, retry, and resolve tasks executed by AI agents. "
            "Supports human-in-the-loop escalation workflows."
        ),
    },
    {
        "name": "analytics",
        "description": (
            "Analytics & KPIs — portfolio performance metrics, billing analytics, maintenance stats, "
            "and agent automation rates. All data is scoped to the authenticated tenant."
        ),
    },
    {
        "name": "search",
        "description": (
            "Full-text search — ranked search across contracts, tasks, and maintenance records "
            "using PostgreSQL `tsvector` with Portuguese language stemming."
        ),
    },
    {
        "name": "health",
        "description": "Health probes — liveness and readiness endpoints for Kubernetes and monitoring systems.",
    },
    {
        "name": "metrics",
        "description": "Prometheus metrics — `/metrics` endpoint for Prometheus scraping. Includes agent, billing, and payment counters.",
    },
    {
        "name": "demo",
        "description": "Demo endpoints — unauthenticated convenience routes for hackathon demos and local development.",
    },
    {
        "name": "auth",
        "description": "Authentication — obtain and refresh JWT tokens.",
    },
    {
        "name": "webhooks",
        "description": (
            "Webhook endpoints — register HTTP callbacks to receive real-time event notifications. "
            "Every delivery is signed with HMAC-SHA256 via the `X-RealstateOS-Signature` header. "
            "Supported events: contract.created, payment.reconciled, maintenance.escalated, agent.completed."
        ),
    },
    {
        "name": "bulk",
        "description": (
            "Bulk operations — create or update multiple resources in a single request (max 100 items). "
            "All endpoints return a `job_id` for tracking via `GET /agent-tasks/{job_id}`. "
            "Partial success is supported — failed items are reported individually."
        ),
    },
    {
        "name": "uploads",
        "description": (
            "File uploads — stream contract PDFs, maintenance photos, and owner statements to MinIO object storage. "
            "Returns a presigned download URL valid for 1 hour. Max file size: 50 MB."
        ),
    },
    {
        "name": "exports",
        "description": (
            "Data exports — trigger async background jobs to export tenant data as CSV, XLSX, or PDF. "
            "Poll `GET /exports/{job_id}` for status; when DONE the response includes a presigned MinIO download URL. "
            "Supported datasets: contracts, billing_history, payment_history, maintenance_report."
        ),
    },
    {
        "name": "graphql",
        "description": (
            "GraphQL API — Strawberry schema mounted at `/graphql`. "
            "Covers: contracts, charges, agentTasks, maintenanceTickets. "
            "N+1-safe dataloaders for nested queries. "
            "WebSocket subscription: `agentTaskUpdates` (real-time task stream). "
            "GraphiQL IDE available at `/graphql` in the browser."
        ),
    },
]
