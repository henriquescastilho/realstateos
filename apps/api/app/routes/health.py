"""Enhanced health check endpoints.

    GET /health        Basic liveness (backward compat)
    GET /health/live   Kubernetes liveness probe — is the process up?
    GET /health/ready  Kubernetes readiness probe — can it serve traffic?
                       Checks: DB, Redis, MinIO, agent worker
"""
from __future__ import annotations

import logging
import time

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.openapi import RESPONSES_503

logger = logging.getLogger(__name__)
router = APIRouter(tags=["health"])


def _check_db() -> dict:
    """Test DB connectivity with a simple SELECT 1."""
    start = time.monotonic()
    try:
        from sqlalchemy import text  # noqa: PLC0415

        from app.db import SessionLocal  # noqa: PLC0415

        with SessionLocal() as session:
            session.execute(text("SELECT 1"))
        return {"status": "ok", "latency_ms": round((time.monotonic() - start) * 1000, 1)}
    except Exception as exc:  # noqa: BLE001
        logger.error("Health: DB check failed: %s", exc)
        return {"status": "error", "error": str(exc)}


def _check_redis() -> dict:
    start = time.monotonic()
    try:
        import redis as redis_lib  # noqa: PLC0415

        from app.config import settings  # noqa: PLC0415

        r = redis_lib.from_url(settings.redis_url, socket_timeout=2)
        r.ping()
        return {"status": "ok", "latency_ms": round((time.monotonic() - start) * 1000, 1)}
    except Exception as exc:  # noqa: BLE001
        logger.warning("Health: Redis check failed: %s", exc)
        return {"status": "error", "error": str(exc)}


def _check_minio() -> dict:
    start = time.monotonic()
    try:
        import boto3  # noqa: PLC0415
        from botocore.exceptions import ClientError  # noqa: PLC0415

        from app.config import settings  # noqa: PLC0415

        s3 = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
        )
        s3.head_bucket(Bucket=settings.s3_bucket_name)
        return {"status": "ok", "latency_ms": round((time.monotonic() - start) * 1000, 1)}
    except Exception as exc:  # noqa: BLE001
        logger.warning("Health: MinIO check failed: %s", exc)
        return {"status": "degraded", "error": str(exc)}


def _build_readiness_response() -> tuple[dict, int]:
    components = {
        "database": _check_db(),
        "redis": _check_redis(),
        "storage": _check_minio(),
    }
    # Ready only if DB is healthy (Redis and MinIO are degraded-tolerant)
    overall_ok = components["database"]["status"] == "ok"
    overall_status = "ok" if overall_ok else "degraded"
    http_code = 200 if overall_ok else 503
    return {
        "status": overall_status,
        "components": components,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }, http_code


@router.get(
    "/health/live",
    summary="Liveness probe",
    description=(
        "Kubernetes liveness probe. Returns 200 as long as the Python process is running. "
        "If this returns non-200, Kubernetes will restart the pod."
    ),
)
def liveness() -> dict:
    return {"status": "ok"}


@router.get(
    "/health/ready",
    summary="Readiness probe",
    description=(
        "Kubernetes readiness probe. Returns 200 only when the database is reachable. "
        "Redis and MinIO degradation returns 200 (they are not blocking). "
        "Returns 503 if the database is unavailable."
    ),
    responses={**RESPONSES_503},
)
def readiness():
    body, code = _build_readiness_response()
    return JSONResponse(content=body, status_code=code)


@router.get(
    "/health/full",
    summary="Full health report",
    description=(
        "Detailed health report with latency measurements for all components: "
        "database, Redis, and MinIO object storage. "
        "Use this for operations dashboards and alerting."
    ),
    responses={**RESPONSES_503},
)
def full_health():
    body, code = _build_readiness_response()
    return JSONResponse(content=body, status_code=code)
