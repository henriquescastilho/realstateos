from contextlib import asynccontextmanager
import threading

from fastapi import FastAPI

from app.config import settings
from app.workers.openclaw_worker import _configure_logging, build_worker

stop_event = threading.Event()
worker = build_worker()


def _background_loop() -> None:
    while not stop_event.is_set():
        outcome = worker.run_once()
        if outcome["processed"] == 0:
            stop_event.wait(settings.worker_poll_interval_seconds)


@asynccontextmanager
async def lifespan(_: FastAPI):
    _configure_logging()
    stop_event.clear()
    thread = threading.Thread(target=_background_loop, daemon=True, name="openclaw-worker")
    thread.start()
    try:
        yield
    finally:
        stop_event.set()
        thread.join(timeout=5)


app = FastAPI(title="Real Estate OS Worker", version="0.1.0", lifespan=lifespan)


@app.get("/health", tags=["health"])
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
