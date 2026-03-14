from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.middleware.audit import AuditLogMiddleware
from app.middleware.rate_limiter import RateLimitMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.routes.router import hackathon_router
from app.utils.logging import CorrelationIdMiddleware, configure_logging

# Initialize structured JSON logging at import time
configure_logging(level="INFO")


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    import logging  # noqa: PLC0415

    from app.db import SessionLocal  # noqa: PLC0415
    from app.workers.dlq_worker import init_dlq_worker  # noqa: PLC0415
    from app.workers.scheduler import start_scheduler  # noqa: PLC0415

    _run_migrations()
    dlq = init_dlq_worker(redis_url=settings.redis_url, db_factory=SessionLocal)
    start_scheduler()
    yield
    # Shutdown
    from app.workers.scheduler import stop_scheduler  # noqa: PLC0415

    dlq.stop()
    stop_scheduler()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
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

app.include_router(hackathon_router)
app.include_router(hackathon_router, prefix="/api")


@app.get("/health", tags=["health"])
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
