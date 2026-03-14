# Production Launch Checklist

**RealState OS Enterprise — Pre-Launch Gate**

This checklist must be completed and signed off before any production deployment. Each section has a **GO / NO-GO** determination. All sections must be GO before launch proceeds.

---

## How to Use This Checklist

1. Work through each section sequentially
2. Check each item: `[x]` = done, `[ ]` = pending, `[~]` = waived with justification
3. Record go/no-go decision per section
4. Final go/no-go is ALL sections passed

Responsible: **Engineering Lead + On-call Engineer**
Estimated time: 4–6 hours on launch day

---

## Section 1 — Security Audit

**Gate:** Security audit must pass or all critical/high findings must be resolved.

### 1.1 Automated Security Tests

- [ ] All security penetration tests pass: `pytest tests/security/ -v` → 37/37 passing (3 ZAP skipped without live daemon)
- [ ] OWASP ZAP active scan completed against staging environment
- [ ] ZAP scan shows zero Critical and zero High findings
- [ ] Medium findings reviewed and triaged (document any accepted risks)

### 1.2 Authentication & Authorization

- [ ] JWT algorithm confusion attack tested (alg=none rejected — verified in `TestJwtAlgorithmConfusion`)
- [ ] Expired tokens return 401 (tested)
- [ ] Tokens with wrong secret return 401 (tested)
- [ ] Cross-tenant data access verified impossible (IDOR tests passing — `TestIdorPrevention`)
- [ ] Rate limiting active on all endpoints (429 returned after burst — `TestRateLimitDefense`)
- [ ] `JWT_SECRET` is at minimum 32 random characters in production env
- [ ] `JWT_SECRET` is NOT the development default (`dev-secret-change-in-production`)

### 1.3 Data Security

- [ ] No secrets, API keys, or credentials in git history (`git log --all -p | grep -E "password|secret|api_key"` → clean)
- [ ] `.env` files are in `.gitignore`
- [ ] All database connections use TLS in production
- [ ] MinIO access is not public (bucket policy is private)
- [ ] Redis is not publicly accessible (firewall rule or VPC-only)

### 1.4 Security Headers

- [ ] Security headers present on all API responses (verify with `curl -I https://api.realstateos.io/health/live`):
  - [ ] `X-Content-Type-Options: nosniff`
  - [ ] `X-Frame-Options: DENY`
  - [ ] `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - [ ] `Content-Security-Policy` set
- [ ] No `X-Powered-By` or `Server` headers exposing technology stack

**Section 1 Decision:** `[ ] GO` / `[ ] NO-GO`
**Notes:**

---

## Section 2 — Load Testing

**Gate:** System must sustain production load with < 500ms p95 latency.

### 2.1 Load Test Results

Run: `k6 run loadtest/main.js --vus 100 --duration 5m`

- [ ] 100 concurrent users sustained for 5 minutes without error rate > 1%
- [ ] p50 latency < 100ms for contract listing
- [ ] p95 latency < 500ms for all endpoints
- [ ] p99 latency < 2000ms for billing generation (async endpoint)
- [ ] No memory leaks detected during sustained load (RSS stable after 5min)
- [ ] PostgreSQL connection pool did not exhaust (check `pg_stat_activity`)
- [ ] Redis memory usage stable (not growing unboundedly)

### 2.2 Billing Pipeline Throughput

- [ ] 1000-contract billing run completes in < 5 minutes end-to-end (including DB writes)
- [ ] Payment reconciliation: 1000 payments processed in < 10 minutes

### 2.3 Performance Regression Tests

- [ ] All benchmark tests pass: `JWT_SECRET=xxx pytest tests/benchmarks/ -v` → 17/17 passing
- [ ] No benchmark threshold violations since last baseline

**Section 2 Decision:** `[ ] GO` / `[ ] NO-GO`
**Notes:**

---

## Section 3 — Database & Backup

**Gate:** Data persistence and recovery verified.

### 3.1 Database State

- [ ] All Alembic migrations applied to production DB: `alembic current` shows head
- [ ] `alembic history` has no gaps or conflicts
- [ ] Table row counts are sensible (not empty, not bloated)
- [ ] All indexes exist: `\di` in psql shows indexes on tenant_id composite columns

### 3.2 Backup Verification

- [ ] Automated backups enabled on production PostgreSQL (daily snapshot minimum)
- [ ] Last backup completed successfully (check backup logs)
- [ ] **Restore tested**: A backup was restored to a staging DB and verified: `pg_restore` → queries return expected data
- [ ] Point-in-time recovery (PITR) enabled or WAL archiving configured
- [ ] Backup retention policy: minimum 30 days
- [ ] MinIO bucket versioning enabled (document storage)
- [ ] Redis AOF persistence enabled (job queue durability)

### 3.3 Database Performance

- [ ] EXPLAIN ANALYZE run on the 5 most common production queries — all show index scans
- [ ] No sequential scans on large tables (> 10K rows)
- [ ] Connection pooling configured: `max_connections` set appropriately for app pool size

**Section 3 Decision:** `[ ] GO` / `[ ] NO-GO`
**Notes:**

---

## Section 4 — Monitoring & Alerting

**Gate:** All critical metrics have alerts configured.

### 4.1 Infrastructure Monitoring

- [ ] Prometheus scraping `/metrics` endpoint successfully
- [ ] Grafana dashboard deployed with panels for:
  - [ ] Request rate (req/s per endpoint)
  - [ ] Error rate (4xx and 5xx)
  - [ ] p50/p95/p99 latency
  - [ ] Active DB connections
  - [ ] Redis memory usage
  - [ ] Container CPU and memory

### 4.2 Business Metric Alerts

Configure PagerDuty/OpsGenie alerts for:

- [ ] Error rate > 5% for 5 minutes → **CRITICAL**
- [ ] p95 latency > 1000ms for 5 minutes → **HIGH**
- [ ] Billing pipeline failure (agent_task.failed webhook) → **HIGH**
- [ ] Payment reconciliation divergence rate > 10% → **MEDIUM**
- [ ] Database connection pool > 80% utilization → **HIGH**
- [ ] Redis memory > 80% of max → **HIGH**
- [ ] API availability < 99% for 1 minute → **CRITICAL**
- [ ] SSL certificate expiry < 30 days → **MEDIUM**

### 4.3 Logging

- [ ] Structured JSON logs in production (no plain-text log lines)
- [ ] Logs shipped to centralized log system (Datadog / CloudWatch / Loki)
- [ ] Security events (auth failures, 403s, 429s) have specific log entries
- [ ] No PII or secrets logged (passwords, full JWT tokens, CPF numbers)
- [ ] Log retention: minimum 90 days for compliance

### 4.4 On-Call Setup

- [ ] On-call rotation defined (minimum 2 engineers)
- [ ] PagerDuty escalation policy tested (trigger test alert → engineer notified in < 5 min)
- [ ] Runbooks linked from every alert: `docs/runbook/`

**Section 4 Decision:** `[ ] GO` / `[ ] NO-GO`
**Notes:**

---

## Section 5 — Operational Readiness

**Gate:** Team can operate the system and recover from failures.

### 5.1 Runbook Review

- [ ] `docs/runbook/README.md` reviewed by on-call team
- [ ] `docs/runbook/db-restore.md` — DB restoration procedure tested
- [ ] `docs/runbook/redis-recovery.md` — Redis recovery procedure tested
- [ ] `docs/runbook/minio-restore.md` — MinIO object recovery tested
- [ ] `docs/runbook/cluster-rebuild.md` — Cluster rebuild procedure reviewed

### 5.2 Deployment Procedure

- [ ] CI/CD pipeline tested end-to-end on staging (push → deploy → health check)
- [ ] Zero-downtime deployment verified (rolling update, no 502s during deploy)
- [ ] Health check endpoints working: `/health/live` and `/health/ready`
- [ ] Container resource limits set (CPU and memory limits in Kubernetes/Cloud Run)

### 5.3 Secrets Management

- [ ] All secrets in production are stored in a secret manager (AWS Secrets Manager / GCP Secret Manager / Vault)
- [ ] No secrets in environment variables directly accessible from container metadata API
- [ ] Secret rotation procedure documented

### 5.4 DNS & TLS

- [ ] DNS records point to production load balancer
- [ ] TLS certificate valid and not expiring < 30 days
- [ ] HTTPS redirect configured (HTTP → HTTPS)
- [ ] API domain resolves correctly from external network

**Section 5 Decision:** `[ ] GO` / `[ ] NO-GO`
**Notes:**

---

## Section 6 — Test Coverage

**Gate:** Test coverage meets minimum thresholds.

### 6.1 Python API Coverage

- [ ] Services coverage ≥ 80%: `pytest --cov=app/services --cov-report=term-missing`
- [ ] Repositories coverage ≥ 80%: `pytest --cov=app/repositories --cov-report=term-missing`
- [ ] All 37 security tests passing: `pytest tests/security/`
- [ ] All property-based tests passing (21 hypothesis tests): `pytest tests/test_billing_properties.py`
- [ ] Integration tests passing against real DB: `pytest tests/integration/`
- [ ] Performance benchmarks passing (17 tests): `pytest tests/benchmarks/`

### 6.2 Node.js Coverage

- [ ] Overall coverage ≥ 80%: `npm run test:coverage`
- [ ] Validator schemas fully tested (101 tests): `npm test -- --reporter=verbose`
- [ ] Classifier tests passing

**Section 6 Decision:** `[ ] GO` / `[ ] NO-GO`
**Notes:**

---

## Final Go/No-Go Decision

| Section | Status |
|---------|--------|
| 1. Security Audit | `[ ] GO` / `[ ] NO-GO` |
| 2. Load Testing | `[ ] GO` / `[ ] NO-GO` |
| 3. Database & Backup | `[ ] GO` / `[ ] NO-GO` |
| 4. Monitoring & Alerting | `[ ] GO` / `[ ] NO-GO` |
| 5. Operational Readiness | `[ ] GO` / `[ ] NO-GO` |
| 6. Test Coverage | `[ ] GO` / `[ ] NO-GO` |

**FINAL DECISION:** `[ ] GO — PROCEED WITH LAUNCH` / `[ ] NO-GO — LAUNCH BLOCKED`

**Signed off by:**
- Engineering Lead: _________________________ Date: _______
- On-call Engineer: _________________________ Date: _______

---

## Post-Launch: First 24 Hours Monitoring Plan

### Hour 0–1 (Launch Window)

- [ ] Deployment complete, health checks green
- [ ] Smoke test: issue token → create contract → list contracts → verify 200
- [ ] Monitor error rate in Grafana for 15 minutes post-deploy — must stay < 1%
- [ ] Verify first real customer can log in (if day-1 customers scheduled)
- [ ] Confirm billing pipeline cron scheduled for next billing cycle

### Hour 1–6 (Active Watch)

- [ ] On-call engineer monitoring Grafana continuously
- [ ] Check PostgreSQL slow query log for any emerging N+1 queries
- [ ] Review agent task success rates (target: > 98% success)
- [ ] Verify webhook delivery success rates (check delivery logs)
- [ ] Confirm Redis memory stable (no unexpected growth)

### Hour 6–24 (Stabilization)

- [ ] Alert fatigue review — are any alerts firing that shouldn't be?
- [ ] Check error logs for any patterns (not just rate)
- [ ] Verify daily backup completed successfully
- [ ] Performance review: compare p95 latency to load test baseline
- [ ] Billing pipeline dry run (if launch day falls on billing cycle)

### Decision Points

**If error rate > 5% at any point:** Initiate rollback immediately (see below)
**If p95 > 2000ms sustained > 10 min:** Scale up instances + investigate
**If agent task failure rate > 10%:** Disable agent auto-trigger, run manually

---

## Rollback Procedure

### When to Roll Back

Roll back immediately if any of these occur within 1 hour of launch:
- Error rate > 10% for > 5 minutes
- Database connection exhaustion
- Security incident detected
- Data integrity issue discovered

### How to Roll Back

```bash
# 1. Trigger rollback via CI/CD (preferred)
git revert HEAD --no-edit
git push origin main
# CI/CD automatically deploys previous version

# 2. Manual Cloud Run rollback
gcloud run services update-traffic realstateos-api \
  --to-revisions PREVIOUS=100 \
  --region us-central1

# 3. Database rollback (ONLY if schema migration was part of deploy)
alembic downgrade -1
# Verify data integrity before proceeding

# 4. Notify stakeholders
# - Slack: #eng-incident
# - Status page: update to "Degraded"
# - On-call: escalate if > 15 min
```

### Post-Rollback

- [ ] Confirm rollback successful (health checks green, error rate < 1%)
- [ ] Write incident report (template in `docs/runbook/`)
- [ ] Root cause identified before scheduling next launch attempt
- [ ] All sections of this checklist re-verified with fix applied

---

## Appendix: Environment Variable Verification

Run this before launch to verify all required env vars are set in production:

```bash
# Python API
curl https://api.realstateos.io/health/ready
# Must return: {"status": "ready", "db": "connected", "redis": "connected"}

# Verify JWT_SECRET is not default
# (do this on the server, not from outside)
python3 -c "
import os
s = os.environ.get('JWT_SECRET', '')
assert len(s) >= 32, 'JWT_SECRET too short'
assert 'dev-secret' not in s, 'JWT_SECRET is the development default!'
print('JWT_SECRET: OK')
"
```

---

*Last updated: 2024-03-14 | Version: 1.0.0*
