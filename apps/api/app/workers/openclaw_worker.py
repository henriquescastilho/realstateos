import argparse
from collections.abc import Callable
import json
import logging
import time

from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.services.task_service import (
    get_next_pending_task,
    mark_task_done,
    mark_task_failed,
    mark_task_running,
)
from app.workers.agent_worker import BillingAgentWorker

logger = logging.getLogger("realestateos.openclaw_worker")


def _configure_logging() -> None:
    if logger.handlers:
        return

    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)


def _log_event(event: str, **fields: object) -> None:
    logger.info(json.dumps({"event": event, **fields}, ensure_ascii=True, default=str))


class OpenClawExecutionWorker:
    """
    Thin execution worker for the hackathon.
    Polls database-backed PENDING tasks and routes them to BillingAgent.
    """

    def __init__(self, session_factory: Callable[[], Session], poll_interval_seconds: float = 2.0):
        self.session_factory = session_factory
        self.poll_interval_seconds = poll_interval_seconds

    def run_once(self) -> dict[str, int]:
        db = self.session_factory()
        try:
            task = get_next_pending_task(db)
            if task is None:
                _log_event("worker_idle")
                return {"processed": 0}

            _log_event("task_claimed", task_id=task.id, task_type=task.type, tenant_id=task.tenant_id)
            mark_task_running(db, task)
            try:
                result = self._execute_task(db, task)
                if result.get("ok") is True:
                    mark_task_done(db, task, result=result, message=result.get("message", "Task completed"))
                    _log_event(
                        "task_done",
                        task_id=task.id,
                        task_type=task.type,
                        tenant_id=task.tenant_id,
                        operation=result.get("operation"),
                    )
                else:
                    mark_task_failed(
                        db,
                        task,
                        error=result.get("error", "unknown_error"),
                        message=result.get("message", "Falha ao emitir boleto; usar mock"),
                    )
                    _log_event(
                        "task_failed",
                        task_id=task.id,
                        task_type=task.type,
                        tenant_id=task.tenant_id,
                        error=result.get("error", "unknown_error"),
                    )
            except Exception as exc:  # pragma: no cover
                mark_task_failed(
                    db,
                    task,
                    error=str(exc),
                    message="Falha ao emitir boleto; usar mock",
                )
                _log_event(
                    "task_failed",
                    task_id=task.id,
                    task_type=task.type,
                    tenant_id=task.tenant_id,
                    error=str(exc),
                )

            return {"processed": 1}
        finally:
            db.close()

    def run_forever(self) -> None:  # pragma: no cover
        while True:
            outcome = self.run_once()
            if outcome["processed"] == 0:
                time.sleep(self.poll_interval_seconds)

    def _execute_task(self, db: Session, task) -> dict:
        worker = BillingAgentWorker(db=db, tenant_id=task.tenant_id)
        return worker.execute(task.type, task.payload)


def build_worker(poll_interval_seconds: float | None = None) -> OpenClawExecutionWorker:
    return OpenClawExecutionWorker(
        session_factory=SessionLocal,
        poll_interval_seconds=poll_interval_seconds or settings.worker_poll_interval_seconds,
    )


def main() -> None:  # pragma: no cover
    _configure_logging()
    parser = argparse.ArgumentParser(description="OpenClaw-compatible execution worker for Real Estate OS.")
    parser.add_argument("--once", action="store_true", help="Process a single pending task and exit.")
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=settings.worker_poll_interval_seconds,
        help="Polling interval in seconds when running continuously.",
    )
    args = parser.parse_args()

    worker = build_worker(args.poll_interval)
    if args.once:
        print(json.dumps(worker.run_once()))
        return

    worker.run_forever()


if __name__ == "__main__":  # pragma: no cover
    main()
