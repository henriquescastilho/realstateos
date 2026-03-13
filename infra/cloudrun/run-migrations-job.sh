#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
: "${GCP_REGION:?Set GCP_REGION}"
: "${API_IMAGE:?Set API_IMAGE}"
: "${DATABASE_URL:?Set DATABASE_URL}"

JOB_NAME="${JOB_NAME:-realestateos-migrate}"

gcloud run jobs deploy "${JOB_NAME}" \
  --project "${GCP_PROJECT_ID}" \
  --region "${GCP_REGION}" \
  --image "${API_IMAGE}" \
  --tasks 1 \
  --max-retries 0 \
  --memory 512Mi \
  --cpu 1 \
  --command sh \
  --args=./scripts/run-migrations.sh \
  --set-env-vars "DATABASE_URL=${DATABASE_URL}"

gcloud run jobs execute "${JOB_NAME}" \
  --project "${GCP_PROJECT_ID}" \
  --region "${GCP_REGION}" \
  --wait
