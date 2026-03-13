#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
: "${GCP_REGION:?Set GCP_REGION}"
: "${API_IMAGE:?Set API_IMAGE}"
: "${DATABASE_URL:?Set DATABASE_URL}"
: "${REDIS_URL:?Set REDIS_URL}"
: "${JWT_SECRET:?Set JWT_SECRET}"
: "${CORS_ALLOWED_ORIGINS:?Set CORS_ALLOWED_ORIGINS}"

SERVICE_NAME="${SERVICE_NAME:-realestateos-api}"

gcloud run deploy "${SERVICE_NAME}" \
  --project "${GCP_PROJECT_ID}" \
  --region "${GCP_REGION}" \
  --image "${API_IMAGE}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 3 \
  --set-env-vars "PORT=8080,DATABASE_URL=${DATABASE_URL},REDIS_URL=${REDIS_URL},JWT_SECRET=${JWT_SECRET},CORS_ALLOWED_ORIGINS=${CORS_ALLOWED_ORIGINS},PAYMENT_MOCK_FALLBACK_ENABLED=true,SANTANDER_SANDBOX_ENABLED=true"
