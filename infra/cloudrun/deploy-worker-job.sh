#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
: "${GCP_REGION:?Set GCP_REGION}"
: "${API_IMAGE:?Set API_IMAGE}"
: "${DATABASE_URL:?Set DATABASE_URL}"
: "${REDIS_URL:?Set REDIS_URL}"
: "${JWT_SECRET:?Set JWT_SECRET}"

JOB_NAME="${JOB_NAME:-realestateos-worker}"

gcloud run jobs deploy "${JOB_NAME}" \
  --project "${GCP_PROJECT_ID}" \
  --region "${GCP_REGION}" \
  --image "${API_IMAGE}" \
  --tasks 1 \
  --max-retries 1 \
  --memory 512Mi \
  --cpu 1 \
  --command python \
  --args=-m,app.workers.openclaw_worker,--once \
  --set-env-vars "DATABASE_URL=${DATABASE_URL},REDIS_URL=${REDIS_URL},JWT_SECRET=${JWT_SECRET},WORKER_POLL_INTERVAL_SECONDS=2,PAYMENT_MOCK_FALLBACK_ENABLED=true,SANTANDER_SANDBOX_ENABLED=true"
