#!/usr/bin/env sh
set -eu

exec python -m app.workers.openclaw_worker --poll-interval "${WORKER_POLL_INTERVAL_SECONDS:-2}"
