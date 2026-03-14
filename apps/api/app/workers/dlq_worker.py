"""Dead Letter Queue (DLQ) worker.

Tasks that fail 3+ times are moved to a Redis-backed DLQ.
The DLQ worker:
1. Polls the DLQ list in Redis
2. Creates an ESCALATED task record in DB for human review
3. Sends an alert (placeholder — wire to email/Slack in production)

DLQ key format: realestateos:dlq (Redis list, RPUSH/BLPOP)
Each entry is a JSON-serialized dict:
  {task_id, tenant_id, task_type, payload, failure_count, last_error, failed_at}
"""
from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from threading import Event, Thread

logger = logging.getLogger(__name__)

_DLQ_KEY = "realestateos:dlq"
_FAILURE_THRESHOLD = 3


class DLQWorker:
    """Background thread that drains the DLQ and creates escalation records."""

    def __init__(self, redis_url: str, db_factory) -> None:
        """
        Args:
            redis_url:   Redis URL for DLQ connectivity.
            db_factory:  Callable that returns a SQLAlchemy Session (e.g., SessionLocal).
        """
        self._redis_url = redis_url
        self._db_factory = db_factory
        self._stop_event = Event()
        self._thread: Thread | None = None
        self._redis = None
        self._connect_redis()

    def _connect_redis(self) -> None:
        try:
            import redis as redis_lib  # noqa: PLC0415

            self._redis = redis_lib.from_url(self._redis_url, decode_responses=True)
            self._redis.ping()
            logger.info("DLQWorker connected to Redis")
        except Exception as exc:  # noqa: BLE001
            logger.warning("DLQWorker cannot connect to Redis: %s — DLQ disabled", exc)
            self._redis = None

    def start(self) -> None:
        if self._redis is None:
            logger.warning("DLQWorker not started: Redis unavailable")
            return
        self._thread = Thread(target=self._run, daemon=True, name="dlq-worker")
        self._thread.start()
        logger.info("DLQWorker started")

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
        logger.info("DLQWorker stopped")

    def push(self, task_id: str, tenant_id: str, task_type: str, payload: dict, error: str) -> None:
        """Push a failed task to the DLQ. Called by the agent worker on nth failure."""
        if self._redis is None:
            logger.warning("Cannot push to DLQ: Redis unavailable")
            return
        entry = {
            "task_id": task_id,
            "tenant_id": tenant_id,
            "task_type": task_type,
            "payload": payload,
            "last_error": error,
            "failed_at": datetime.now(tz=timezone.utc).isoformat(),
        }
        try:
            self._redis.rpush(_DLQ_KEY, json.dumps(entry))
            logger.warning(
                "Task pushed to DLQ: task_id=%s task_type=%s error=%s",
                task_id,
                task_type,
                error,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to push task to DLQ: %s", exc)

    def _process_entry(self, raw: str) -> None:
        try:
            entry = json.loads(raw)
        except json.JSONDecodeError:
            logger.error("DLQ: invalid JSON entry, discarding: %s", raw[:200])
            return

        task_id = entry.get("task_id", "unknown")
        tenant_id = entry.get("tenant_id", "unknown")
        task_type = entry.get("task_type", "UNKNOWN")
        payload = entry.get("payload", {})
        last_error = entry.get("last_error", "unknown error")

        logger.warning(
            "DLQ: processing failed task task_id=%s task_type=%s tenant_id=%s error=%s",
            task_id,
            task_type,
            tenant_id,
            last_error,
        )

        # Create ESCALATED task for human review
        try:
            db = self._db_factory()
            try:
                from app.services.task_service import create_task_record  # noqa: PLC0415

                create_task_record(
                    db=db,
                    tenant_id=tenant_id,
                    task_type=f"DLQ_{task_type}",
                    status_value="ESCALATED",
                    message=f"Task failed {_FAILURE_THRESHOLD}+ times and requires human review. Last error: {last_error}",
                    payload={
                        **payload,
                        "original_task_id": task_id,
                        "dlq_reason": last_error,
                        "requires_human_review": True,
                    },
                )
                logger.info("DLQ: ESCALATED task created for task_id=%s", task_id)
            finally:
                db.close()
        except Exception as exc:  # noqa: BLE001
            logger.error("DLQ: failed to create escalation record for task_id=%s: %s", task_id, exc)

        # Alert placeholder — wire to email/Slack/PagerDuty in production
        self._send_alert(task_id, task_type, tenant_id, last_error)

    def _send_alert(self, task_id: str, task_type: str, tenant_id: str, error: str) -> None:
        """Stub: send alert about DLQ item requiring human attention."""
        logger.warning(
            "ALERT: DLQ item requires human attention — task_id=%s task_type=%s tenant_id=%s error=%s",
            task_id,
            task_type,
            tenant_id,
            error,
        )
        # TODO: integrate with Slack/email/PagerDuty webhook

    def _run(self) -> None:
        logger.info("DLQWorker polling %s", _DLQ_KEY)
        while not self._stop_event.is_set():
            try:
                # BLPOP blocks up to 2s then returns None (allows clean shutdown check)
                result = self._redis.blpop(_DLQ_KEY, timeout=2)  # type: ignore[union-attr]
                if result:
                    _, raw = result
                    self._process_entry(raw)
            except Exception as exc:  # noqa: BLE001
                logger.error("DLQWorker error: %s — sleeping 5s", exc)
                time.sleep(5)


# Module-level singleton — started in main.py lifespan
_dlq_worker: DLQWorker | None = None


def get_dlq_worker() -> DLQWorker | None:
    return _dlq_worker


def init_dlq_worker(redis_url: str, db_factory) -> DLQWorker:
    global _dlq_worker  # noqa: PLW0603
    _dlq_worker = DLQWorker(redis_url=redis_url, db_factory=db_factory)
    _dlq_worker.start()
    return _dlq_worker
