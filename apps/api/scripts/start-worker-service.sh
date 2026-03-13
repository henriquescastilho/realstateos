#!/usr/bin/env sh
set -eu

exec uvicorn app.workers.worker_service:app --host 0.0.0.0 --port "${PORT:-8080}"
