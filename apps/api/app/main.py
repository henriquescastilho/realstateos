from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.middleware.rate_limiter import RateLimitMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.routes.router import hackathon_router
from app.utils.logging import CorrelationIdMiddleware, configure_logging

# Initialize structured JSON logging at import time
configure_logging(level="INFO")

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    # Suppress automatic debug detail in error responses when not in debug mode
    docs_url="/docs",
    redoc_url="/redoc",
)

# NOTE: Middleware is applied in reverse registration order (last registered = outermost).
# Order here: SecurityHeaders → RateLimiter → CORS → Routes

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining"],
)

app.add_middleware(RateLimitMiddleware, redis_url=settings.redis_url)

app.add_middleware(SecurityHeadersMiddleware, debug=False)
app.add_middleware(CorrelationIdMiddleware)

app.include_router(hackathon_router)
app.include_router(hackathon_router, prefix="/api")


@app.get("/health", tags=["health"])
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
