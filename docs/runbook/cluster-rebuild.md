# Runbook: Full Cluster Rebuild from IaC

**RTO contribution:** ~2–3 hours (from scratch: infra provision + deploy + data restore)
**RPO:** ≤ 1 hour (last successful DB backup)

---

## When to Use This Runbook

- Complete cluster failure (all nodes lost)
- Kubernetes control plane unrecoverable
- Cloud provider incident requiring region failover
- Intentional environment recreation (e.g. blue/green cutover)
- Namespace corruption requiring full teardown and redeploy

---

## Architecture Overview

```
IaC Sources:
  k8s/          → Kubernetes manifests (kustomize base)
  helm/         → Helm chart (realstateos)
  .github/workflows/cd-staging.yml  → Staging deploy automation
  .github/workflows/cd-prod.yml     → Production deploy automation

Services deployed:
  api           → FastAPI (Python), port 8000
  api-node      → Express.js (Node.js), port 8082
  worker        → BullMQ workers (Node.js)
  web           → Next.js frontend, port 3000
  postgres      → PostgreSQL 15
  redis         → Redis 7
  minio         → MinIO object storage
  nginx         → API gateway (profile: gateway)
  prometheus    → Metrics (profile: monitoring)
  grafana       → Dashboards (profile: monitoring)
  alertmanager  → Alerts (profile: monitoring)
  loki          → Log storage (profile: logging)
  promtail      → Log shipper (profile: logging)
```

---

## Phase 1 — Provision Kubernetes Cluster (~30 min)

### GKE (Google Kubernetes Engine — recommended)

```bash
# Create cluster (adjust region and node count as needed)
gcloud container clusters create realstateos-prod \
  --region us-central1 \
  --num-nodes 3 \
  --machine-type e2-standard-4 \
  --enable-autoscaling --min-nodes 2 --max-nodes 10 \
  --enable-autorepair --enable-autoupgrade \
  --workload-pool "$(gcloud config get-value project).svc.id.goog" \
  --addons HorizontalPodAutoscaling,HttpLoadBalancing

# Get credentials
gcloud container clusters get-credentials realstateos-prod --region us-central1
```

### Verify cluster

```bash
kubectl cluster-info
kubectl get nodes
```

---

## Phase 2 — Bootstrap Secrets (~10 min)

Secrets must be created before Helm deployment. The Helm chart references `secrets.existingSecret`.

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Create the main application secret
kubectl -n realstateos create secret generic realstateos-secrets \
  --from-literal=DATABASE_URL="postgresql+psycopg://user:pass@postgres:5432/realestateos" \
  --from-literal=JWT_SECRET="$(openssl rand -hex 32)" \
  --from-literal=REDIS_URL="redis://redis:6379/0" \
  --from-literal=S3_ENDPOINT_URL="http://minio:9000" \
  --from-literal=S3_ACCESS_KEY_ID="minioadmin" \
  --from-literal=S3_SECRET_ACCESS_KEY="minioadmin" \
  --from-literal=S3_BUCKET_NAME="realestateos" \
  --from-literal=ENVIRONMENT="production"

# Verify
kubectl -n realstateos get secret realstateos-secrets
```

---

## Phase 3 — Deploy Infrastructure Services (~20 min)

Deploy PostgreSQL, Redis, and MinIO first (application depends on them).

### Option A: Helm chart (full stack)

```bash
cd helm/

# Add dependencies if needed
helm dependency update realstateos/

# Deploy (using existing secret)
helm upgrade --install realstateos realstateos/ \
  --namespace realstateos \
  --create-namespace \
  --set secrets.existingSecret=realstateos-secrets \
  --set global.imageRegistry="" \
  --set api.replicaCount=0 \
  --set worker.replicaCount=0 \
  --set web.replicaCount=0 \
  --wait --timeout 5m
```

> Set replica counts to 0 initially to prevent application from starting before data is restored.

### Option B: Kustomize (k8s/ manifests only)

```bash
kubectl apply -k k8s/
```

Wait for infra pods:

```bash
kubectl -n realstateos rollout status deployment/postgres
kubectl -n realstateos rollout status deployment/redis
kubectl -n realstateos rollout status deployment/minio
```

---

## Phase 4 — Restore Database (~45 min)

Follow [db-restore.md](./db-restore.md) fully.

Key steps summary:
1. `python -m scripts.backup --list` — identify latest backup
2. `python -m scripts.backup --restore backups/daily/YYYY-MM-DD_HHMMSS.sql.gz --target-db realestateos_restored`
3. Verify restored DB, then rename into `realestateos`
4. Run `alembic upgrade head`

---

## Phase 5 — Restore MinIO Objects (~30 min)

Follow [minio-restore.md](./minio-restore.md) fully.

Key steps summary:
1. Configure `mc alias set minio ...`
2. Mirror from backup: `mc mirror minio-backup/realestateos-backup minio/realestateos`
3. Verify object counts

---

## Phase 6 — Deploy Application Services (~15 min)

Scale up the application pods:

```bash
# Via Helm
helm upgrade realstateos helm/realstateos/ \
  --namespace realstateos \
  --reuse-values \
  --set api.replicaCount=2 \
  --set worker.replicaCount=2 \
  --set web.replicaCount=2 \
  --wait --timeout 5m

# Or via kubectl
kubectl -n realstateos scale deployment api api-node worker web --replicas=2

# Watch rollout
kubectl -n realstateos rollout status deployment/api
kubectl -n realstateos rollout status deployment/web
```

---

## Phase 7 — Deploy Monitoring Stack (~10 min)

```bash
# If using Docker Compose (dev/staging):
docker compose --profile monitoring --profile logging up -d

# If using Kubernetes, apply monitoring manifests:
kubectl apply -k k8s/monitoring/   # if monitoring manifests exist

# Verify Grafana
kubectl -n realstateos port-forward svc/grafana 3001:3001 &
open http://localhost:3001   # admin / admin (change on first login)
```

---

## Phase 8 — Smoke Tests

### Health checks

```bash
export API_URL="https://api.realstateos.com"  # or kubectl port-forward

# API health
curl -s "$API_URL/health" | python -m json.tool
curl -s "$API_URL/health/ready"

# Expect all components: {"status": "healthy", "db": "up", "redis": "up", "minio": "up"}
```

### Functional smoke tests

```bash
# Get a test JWT (use existing test user or create one)
TOKEN=$(curl -s -X POST "$API_URL/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"ops-test@realstateos.com","password":"<test-password>"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# List contracts
curl -s -H "Authorization: Bearer $TOKEN" "$API_URL/v1/contracts?per_page=5" | python -m json.tool

# Check metrics endpoint
curl -s "$API_URL/metrics" | grep realestateos
```

### CD pipeline smoke tests (production)

The CD pipeline in `.github/workflows/cd-prod.yml` runs these automatically post-deploy:

```bash
# /health, /health/ready, /health/live
# If any fail, the deployment auto-rolls back via:
# helm rollback realstateos -n realstateos
```

---

## Phase 9 — DNS / Load Balancer Cutover

```bash
# Get the new ingress IP
kubectl -n realstateos get ingress realstateos-ingress \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}'

# Update DNS A record to point to new IP
# TTL: set to 60s before the event, restore to 300s after
```

---

## Rollback to Previous Cluster

If the new cluster is not working as expected and the old cluster is still available:

```bash
# Revert DNS to old cluster IP (immediate traffic shift)
# Update A record back to old IP

# Roll back Helm release on new cluster if partially deployed
helm rollback realstateos -n realstateos
```

---

## Estimated Timeline

| Phase | Duration | Cumulative |
|-------|----------|-----------|
| Phase 1: Provision cluster | 30 min | 0:30 |
| Phase 2: Bootstrap secrets | 10 min | 0:40 |
| Phase 3: Deploy infra | 20 min | 1:00 |
| Phase 4: Restore DB | 45 min | 1:45 |
| Phase 5: Restore MinIO | 30 min | 2:15 |
| Phase 6: Deploy app | 15 min | 2:30 |
| Phase 7: Deploy monitoring | 10 min | 2:40 |
| Phase 8: Smoke tests | 15 min | 2:55 |
| Phase 9: DNS cutover | 15 min | **3:10** |

**Total RTO: ~3 hours** (well within the 4-hour target)

---

## GitHub Actions Automated Deploy

For standard deploys (not from-scratch rebuilds), use the CD pipelines:

```bash
# Staging (auto-triggers on main push)
gh workflow run cd-staging.yml

# Production (requires approval in GitHub environment 'production-approval')
gh workflow run cd-prod.yml

# Monitor
gh run list --workflow=cd-prod.yml
gh run view <run-id> --log
```

The CD pipeline handles:
- Pre-deploy DB backup
- Migration pod run (`alembic upgrade head`)
- Helm upgrade
- Smoke tests
- Auto-rollback on failure
