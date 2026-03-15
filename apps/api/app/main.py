from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.errors import AppError
from app.middleware.rate_limiter import RateLimitMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.openapi import OPENAPI_TAGS
from app.routes.router import hackathon_router
from app.middleware.audit import AuditLogMiddleware
from app.utils.logging import CorrelationIdMiddleware, configure_logging
from app.versioning import VersionNegotiationMiddleware, include_versioned_routes

# Initialize structured JSON logging at import time
configure_logging(level="INFO")

_APP_DESCRIPTION = """\
## Real Estate OS — Enterprise Multi-Tenant SaaS

AI-powered property management platform for Brazilian real estate, built on
**Google ADK** (Agent Development Kit) with a FastAPI backend.

### Key features

* **Multi-agent orchestration** — CEO orchestrator delegates to specialised agents:
  Billing, Payments, Communications, Maintenance, and Onboarding.
* **Multi-tenant isolation** — every resource is scoped to an `organization_id`
  extracted from the Bearer JWT.
* **Full audit trail** — every automated action writes an immutable record to
  `agent_tasks` with before/after state.
* **Human escalation** — structured escalation when agent confidence is below threshold.
* **Brazilian compliance** — CPF/CNPJ validation, CEP lookup, IGPM/IPCA adjustments,
  Santander bank webhook parsing.

### Authentication

All protected routes require a `Bearer` token in the `Authorization` header:

```
Authorization: Bearer <jwt>
```

Demo routes under `/demo/*` are open (no token required) for hackathon testing.

### Rate limits

| Scope | Limit |
|---|---|
| Global (per IP) | 100 req / min |
| `/auth/*` | 10 req / min |
| `/agents/*` | 20 req / min |

### API Versioning

All routes are available under three equivalent path hierarchies:

| Path prefix | Status |
|---|---|
| `/v1/…` | **Canonical** — use this for all new integrations |
| `/api/…` | Legacy shim (backwards compat, do not use in new code) |
| `/…` | Root shim (hackathon compatibility) |

Version negotiation via `Accept` header is also supported:

```
Accept: application/vnd.realstateos.v1+json
```

### Pagination

List endpoints accept `limit` (default 50, max 200) and `offset` query parameters.
Responses are plain arrays today — paginated envelopes coming in v2.

### Error format

```json
{ "detail": "Human-readable message" }
```
Validation errors return a list of `{ "field": "...", "message": "..." }` objects.
"""


def _run_migrations() -> None:
    """Run Alembic migrations to head on startup."""
    import logging  # noqa: PLC0415
    import os  # noqa: PLC0415

    log = logging.getLogger(__name__)
    try:
        from alembic import command  # noqa: PLC0415
        from alembic.config import Config  # noqa: PLC0415

        # Resolve alembic.ini relative to this file's location
        here = os.path.dirname(os.path.abspath(__file__))
        alembic_cfg_path = os.path.join(here, "..", "alembic.ini")
        alembic_cfg = Config(alembic_cfg_path)
        # Override script_location to the actual alembic/ directory
        alembic_cfg.set_main_option(
            "script_location", os.path.join(here, "..", "alembic")
        )
        command.upgrade(alembic_cfg, "head")
        log.info("Alembic migrations applied successfully")
    except Exception as exc:  # noqa: BLE001
        log.warning("Alembic migration failed (non-fatal): %s", exc)


def _ensure_password_column() -> None:
    """Add password_hash column to users table if missing."""
    import logging  # noqa: PLC0415

    from sqlalchemy import inspect, text  # noqa: PLC0415

    from app.db import engine  # noqa: PLC0415

    log = logging.getLogger(__name__)
    try:
        insp = inspect(engine)
        columns = [c["name"] for c in insp.get_columns("users")]
        if "password_hash" not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)"))
            log.info("Added password_hash column to users table")
    except Exception as exc:
        log.warning("Could not check/add password_hash column: %s", exc)


def _seed_admin_user() -> None:
    """Ensure default admin user exists."""
    import logging  # noqa: PLC0415

    from sqlalchemy import select  # noqa: PLC0415

    from app.db import SessionLocal  # noqa: PLC0415
    from app.models.tenant import Tenant  # noqa: PLC0415
    from app.models.user import User  # noqa: PLC0415

    log = logging.getLogger(__name__)
    db = SessionLocal()
    try:
        existing = db.scalar(select(User).where(User.email == "lcastilho@lcastilho.com.br"))
        if existing:
            if not existing.password_hash:
                existing.set_password("123@123")
                db.commit()
                log.info("Updated password for admin user lcastilho@lcastilho.com.br")
            return

        # Find or create tenant
        tenant = db.scalar(select(Tenant).where(Tenant.name == "L CASTILHO IMOVEIS"))
        if not tenant:
            tenant = Tenant(name="L CASTILHO IMOVEIS")
            db.add(tenant)
            db.flush()

        user = User(
            tenant_id=tenant.id,
            name="L Castilho",
            email="lcastilho@lcastilho.com.br",
            role="admin",
        )
        user.set_password("123@123")
        db.add(user)
        db.commit()
        log.info("Seeded admin user lcastilho@lcastilho.com.br")
    except Exception as exc:
        log.warning("Could not seed admin user: %s", exc)
        db.rollback()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    import logging  # noqa: PLC0415

    from app.db import SessionLocal  # noqa: PLC0415
    from app.workers.dlq_worker import init_dlq_worker  # noqa: PLC0415
    from app.workers.scheduler import start_scheduler  # noqa: PLC0415

    _run_migrations()
    _ensure_password_column()
    _seed_admin_user()
    dlq = init_dlq_worker(redis_url=settings.redis_url, db_factory=SessionLocal)
    start_scheduler()
    yield
    # Shutdown
    from app.workers.scheduler import stop_scheduler  # noqa: PLC0415

    dlq.stop()
    stop_scheduler()


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description=_APP_DESCRIPTION,
    contact={
        "name": "Real Estate OS Engineering",
        "url": "https://github.com/realstateos/enterprise",
        "email": "eng@realstateos.com.br",
    },
    license_info={
        "name": "Proprietary",
        "url": "https://realstateos.com.br/terms",
    },
    terms_of_service="https://realstateos.com.br/terms",
    openapi_tags=OPENAPI_TAGS,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# NOTE: Middleware is applied in reverse registration order (last registered = outermost).
# Order here: CorrelationId → SecurityHeaders → AuditLog → RateLimiter → CORS → Routes

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-Request-ID"],
)

app.add_middleware(RateLimitMiddleware, redis_url=settings.redis_url)
app.add_middleware(AuditLogMiddleware)
app.add_middleware(SecurityHeadersMiddleware, debug=False)
app.add_middleware(CorrelationIdMiddleware)
# Version negotiation: Accept: application/vnd.realstateos.v1+json → /v1/…
app.add_middleware(VersionNegotiationMiddleware, default_version="/v1")

# Mount all routes:  /v1/ (canonical)  /api/ (legacy)  / (root shim)
include_versioned_routes(app, hackathon_router)

# Mount GraphQL at /graphql (HTTP + WebSocket for subscriptions)
# Falls back gracefully when strawberry-graphql is not installed.
from app.graphql.schema import get_graphql_router  # noqa: E402, PLC0415

_graphql_router = get_graphql_router()
if _graphql_router is not None:
    app.include_router(_graphql_router, prefix="/graphql")


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Serialize AppError subclasses into a structured JSON error envelope."""
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


@app.get(
    "/health",
    tags=["health"],
    summary="Basic liveness check",
    description="Backward-compatible liveness endpoint. Returns `{\"status\": \"ok\"}` when the process is up.",
)
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
