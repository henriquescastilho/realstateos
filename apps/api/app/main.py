from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.middleware.rate_limiter import RateLimitMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.routes.router import hackathon_router
from app.utils.logging import CorrelationIdMiddleware, configure_logging

# Initialize structured JSON logging at import time
configure_logging(level="INFO")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize DLQ worker
    from app.db import SessionLocal  # noqa: PLC0415
    from app.workers.dlq_worker import init_dlq_worker  # noqa: PLC0415

    dlq = init_dlq_worker(redis_url=settings.redis_url, db_factory=SessionLocal)
    yield
    # Shutdown: stop DLQ worker
    dlq.stop()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# NOTE: Middleware is applied in reverse registration order (last registered = outermost).
# Order here: CorrelationId → SecurityHeaders → RateLimiter → CORS → Routes

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-Request-ID"],
)

app.add_middleware(RateLimitMiddleware, redis_url=settings.redis_url)
app.add_middleware(SecurityHeadersMiddleware, debug=False)
app.add_middleware(CorrelationIdMiddleware)

app.include_router(hackathon_router)
app.include_router(hackathon_router, prefix="/api")


@app.get("/health", tags=["health"])
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
