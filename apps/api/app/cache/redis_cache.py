"""Redis-backed cache layer with decorator support.

Provides:
- `@cache(ttl, key_fn)` decorator for caching expensive function results
- `CacheClient` class for direct get/set/invalidate operations
- Pre-built key builders for common entities (portfolio KPIs, contracts, analytics)

Falls back to no-op (passthrough) when Redis is unavailable so the app
remains functional without caching.
"""
from __future__ import annotations

import functools
import json
import logging
from typing import Any, Callable, TypeVar

logger = logging.getLogger(__name__)

# Redis client singleton — initialized lazily on first use
_redis_client = None

F = TypeVar("F", bound=Callable[..., Any])


# ---------------------------------------------------------------------------
# Redis client management
# ---------------------------------------------------------------------------


def _get_redis():
    """Return a connected Redis client or None if unavailable."""
    global _redis_client  # noqa: PLW0603
    if _redis_client is not None:
        return _redis_client
    try:
        import redis  # noqa: PLC0415

        from app.config import settings  # noqa: PLC0415

        client = redis.from_url(settings.redis_url, decode_responses=True)
        client.ping()
        _redis_client = client
        logger.info("Redis cache connected: %s", settings.redis_url)
        return _redis_client
    except Exception as exc:  # noqa: BLE001
        logger.warning("Redis cache unavailable: %s — caching disabled", exc)
        return None


def reset_redis_client() -> None:
    """Reset the cached Redis client (for testing or reconnection)."""
    global _redis_client  # noqa: PLW0603
    _redis_client = None


# ---------------------------------------------------------------------------
# CacheClient — direct get/set/invalidate API
# ---------------------------------------------------------------------------


class CacheClient:
    """Thin wrapper around Redis for structured cache operations."""

    def get(self, key: str) -> Any | None:
        """Retrieve a cached value. Returns None on miss or Redis failure."""
        r = _get_redis()
        if r is None:
            return None
        try:
            raw = r.get(key)
            if raw is None:
                return None
            return json.loads(raw)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Cache GET failed for key=%s: %s", key, exc)
            return None

    def set(self, key: str, value: Any, ttl: int) -> bool:
        """Store a value with a TTL (seconds). Returns True on success."""
        r = _get_redis()
        if r is None:
            return False
        try:
            r.setex(key, ttl, json.dumps(value, default=str))
            return True
        except Exception as exc:  # noqa: BLE001
            logger.warning("Cache SET failed for key=%s: %s", key, exc)
            return False

    def delete(self, key: str) -> bool:
        """Invalidate a single cache key."""
        r = _get_redis()
        if r is None:
            return False
        try:
            r.delete(key)
            return True
        except Exception as exc:  # noqa: BLE001
            logger.warning("Cache DELETE failed for key=%s: %s", key, exc)
            return False

    def delete_pattern(self, pattern: str) -> int:
        """Invalidate all keys matching a glob pattern. Returns count deleted."""
        r = _get_redis()
        if r is None:
            return 0
        try:
            keys = list(r.scan_iter(pattern))
            if keys:
                return r.delete(*keys)
            return 0
        except Exception as exc:  # noqa: BLE001
            logger.warning("Cache DELETE pattern=%s failed: %s", pattern, exc)
            return 0

    def exists(self, key: str) -> bool:
        """Check if a key exists in cache."""
        r = _get_redis()
        if r is None:
            return False
        try:
            return bool(r.exists(key))
        except Exception:  # noqa: BLE001
            return False


# Module-level singleton
cache_client = CacheClient()


# ---------------------------------------------------------------------------
# @cache decorator
# ---------------------------------------------------------------------------


def cache(
    ttl: int = 300,
    key_fn: Callable[..., str] | None = None,
    prefix: str = "reos",
) -> Callable[[F], F]:
    """Decorator that caches a function's return value in Redis.

    Args:
        ttl: Time-to-live in seconds.
        key_fn: Optional callable(args, kwargs) -> str for custom key generation.
                Defaults to f"{prefix}:{func_module}:{func_name}:{args_repr}".
        prefix: Cache key prefix.

    Example::

        @cache(ttl=300, key_fn=lambda args, kw: f"portfolio:{kw['tenant_id']}")
        def get_portfolio_kpis(db, tenant_id: str) -> dict:
            ...
    """
    def decorator(func: F) -> F:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # Build cache key
            if key_fn is not None:
                cache_key = key_fn(args, kwargs)
            else:
                args_repr = ":".join(str(a) for a in args[1:])  # skip 'db' arg
                kwargs_repr = ":".join(f"{k}={v}" for k, v in sorted(kwargs.items()))
                cache_key = f"{prefix}:{func.__module__}:{func.__name__}:{args_repr}:{kwargs_repr}"

            # Try cache hit
            cached = cache_client.get(cache_key)
            if cached is not None:
                logger.debug("Cache HIT: %s", cache_key)
                return cached

            # Cache miss — call function
            logger.debug("Cache MISS: %s", cache_key)
            result = func(*args, **kwargs)

            # Store result (skip None to avoid caching transient errors)
            if result is not None:
                cache_client.set(cache_key, result, ttl)

            return result

        # Attach invalidation helper to the function
        def invalidate(*args, **kwargs):
            if key_fn is not None:
                cache_key = key_fn(args, kwargs)
            else:
                args_repr = ":".join(str(a) for a in args[1:])
                kwargs_repr = ":".join(f"{k}={v}" for k, v in sorted(kwargs.items()))
                cache_key = f"{prefix}:{func.__module__}:{func.__name__}:{args_repr}:{kwargs_repr}"
            cache_client.delete(cache_key)

        wrapper.invalidate = invalidate  # type: ignore[attr-defined]
        return wrapper  # type: ignore[return-value]

    return decorator


# ---------------------------------------------------------------------------
# Pre-built key builders for common entities
# ---------------------------------------------------------------------------


def portfolio_kpis_key(tenant_id: str) -> str:
    return f"reos:portfolio:kpis:{tenant_id}"


def contract_list_key(tenant_id: str, page: int = 0) -> str:
    return f"reos:contracts:list:{tenant_id}:p{page}"


def analytics_billing_key(tenant_id: str, month: str) -> str:
    return f"reos:analytics:billing:{tenant_id}:{month}"


def analytics_portfolio_key(tenant_id: str) -> str:
    return f"reos:analytics:portfolio:{tenant_id}"


def analytics_maintenance_key(tenant_id: str) -> str:
    return f"reos:analytics:maintenance:{tenant_id}"


def invalidate_tenant_cache(tenant_id: str) -> int:
    """Invalidate all cache entries for a tenant on mutations."""
    return cache_client.delete_pattern(f"reos:*:{tenant_id}*")
