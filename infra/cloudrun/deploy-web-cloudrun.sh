#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
: "${GCP_REGION:?Set GCP_REGION}"
: "${WEB_IMAGE:?Set WEB_IMAGE}"
: "${NEXT_PUBLIC_API_URL:?Set NEXT_PUBLIC_API_URL}"

SERVICE_NAME="${SERVICE_NAME:-realestateos-web}"

gcloud run deploy "${SERVICE_NAME}" \
  --project "${GCP_PROJECT_ID}" \
  --region "${GCP_REGION}" \
  --image "${WEB_IMAGE}" \
  --platform managed \
  --allow-unauthenticated \
  --port 3000 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 2 \
  --set-env-vars "PORT=3000,NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}"
