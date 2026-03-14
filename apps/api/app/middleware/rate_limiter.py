"""Redis-backed rate limiter for FastAPI.

Implements a sliding window counter per (IP, route_prefix).
Applied as a FastAPI middleware via Starlette BaseHTTPMiddleware.

Limits (matching fix_plan.md spec):
  - Global:    100 req/min per IP
  - /auth/*:    10 req/min per IP
  - /agents/*:  20 req/min per IP
"""
from __future__ import annotations

import logging
import time

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

# (path_prefix, limit, window_seconds)
_ROUTE_RULES: list[tuple[str, int, int]] = [
    ("/auth/", 10, 60),
    ("/agents/", 20, 60),
]
_GLOBAL_LIMIT = 100
_GLOBAL_WINDOW = 60


def _get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window rate limiter backed by Redis.

    Falls back to in-memory counters (single-process only) when Redis is unavailable.
    """

    def __init__(self, app, redis_url: str | None = None) -> None:
        super().__init__(app)
        self._redis = None
        self._mem_counters: dict[str, list[float]] = {}

        if redis_url:
            try:
                import redis as redis_lib  # noqa: PLC0415

                self._redis = redis_lib.from_url(redis_url, decode_responses=True)
                self._redis.ping()
                logger.info("RateLimitMiddleware connected to Redis at %s", redis_url)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Redis unavailable for rate limiting, falling back to in-memory: %s", exc)
                self._redis = None

    def _sliding_window_check_redis(self, key: str, limit: int, window: int) -> tuple[bool, int]:
        """Returns (allowed, remaining). Uses sorted set sliding window in Redis."""
        import redis as redis_lib  # noqa: PLC0415

        now = time.time()
        window_start = now - window

        pipe = self._redis.pipeline()  # type: ignore[union-attr]
        pipe.zremrangebyscore(key, "-inf", window_start)
        pipe.zadd(key, {str(now): now})
        pipe.zcard(key)
        pipe.expire(key, window)
        try:
            results = pipe.execute()
            count: int = results[2]
            allowed = count <= limit
            remaining = max(0, limit - count)
            return allowed, remaining
        except redis_lib.RedisError as exc:
            logger.warning("Redis rate-limit check failed, allowing request: %s", exc)
            return True, limit

    def _sliding_window_check_memory(self, key: str, limit: int, window: int) -> tuple[bool, int]:
        """Fallback in-process sliding window — not distributed."""
        now = time.time()
        window_start = now - window
        timestamps = self._mem_counters.get(key, [])
        timestamps = [t for t in timestamps if t > window_start]
        timestamps.append(now)
        self._mem_counters[key] = timestamps
        count = len(timestamps)
        return count <= limit, max(0, limit - count)

    def _check(self, key: str, limit: int, window: int) -> tuple[bool, int]:
        if self._redis is not None:
            return self._sliding_window_check_redis(key, limit, window)
        return self._sliding_window_check_memory(key, limit, window)

    async def dispatch(self, request: Request, call_next) -> Response:  # noqa: ANN001
        ip = _get_client_ip(request)
        path = request.url.path

        # Determine applicable limit
        limit, window = _GLOBAL_LIMIT, _GLOBAL_WINDOW
        for prefix, route_limit, route_window in _ROUTE_RULES:
            if path.startswith(prefix) or path.startswith(f"/api{prefix}"):
                limit, window = route_limit, route_window
                break

        key = f"rl:{ip}:{limit}:{window}"
        allowed, remaining = self._check(key, limit, window)

        if not allowed:
            logger.warning("Rate limit exceeded: ip=%s path=%s limit=%d/%ds", ip, path, limit, window)
            return Response(
                content='{"detail":"Rate limit exceeded. Please slow down."}',
                status_code=429,
                headers={
                    "Content-Type": "application/json",
                    "Retry-After": str(window),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response
