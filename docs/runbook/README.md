# Disaster Recovery Runbook — Real Estate OS

## Overview

This runbook covers disaster recovery procedures for the Real Estate OS platform.

| Target | Value |
|--------|-------|
| **RTO** (Recovery Time Objective) | **< 4 hours** |
| **RPO** (Recovery Point Objective) | **< 1 hour** |
| **Backup schedule** | Daily 06:00 UTC, Weekly Mon 06:00 UTC, Monthly 1st 06:00 UTC |
| **Backup retention** | Daily 7 days · Weekly 4 weeks · Monthly 12 months |
| **Backup location** | MinIO bucket `realestateos` → `backups/{daily,weekly,monthly}/` |

---

## Severity Classification

| Severity | Description | Expected response |
|----------|-------------|-------------------|
| **P0** | Full cluster down, data loss, security breach | On-call immediately, start DR |
| **P1** | Single service down, partial degradation | On-call within 15 min |
| **P2** | Performance degraded, minor feature unavailable | Next business day |

---

## Quick-Reference Playbooks

| Scenario | Runbook |
|----------|---------|
| PostgreSQL data loss or corruption | [db-restore.md](./db-restore.md) |
| Redis data loss, OOM, or cache corruption | [redis-recovery.md](./redis-recovery.md) |
| MinIO bucket lost or object corruption | [minio-restore.md](./minio-restore.md) |
| Full cluster rebuild from scratch | [cluster-rebuild.md](./cluster-rebuild.md) |

---

## On-Call Contacts

| Role | Contact |
|------|---------|
| Primary on-call | See PagerDuty escalation policy `realstateos-oncall` |
| Database DBA | Escalate via PagerDuty `realstateos-dba` service |
| Infrastructure | `#infra-alerts` Slack channel |
| Management escalation | PagerDuty `realstateos-management` (P0 only) |

---

## Environment Reference

```
Production Kubernetes namespace:  realstateos
Helm release name:                realstateos
MinIO endpoint:                   S3_ENDPOINT_URL (env var, e.g. http://minio:9000)
MinIO bucket:                     S3_BUCKET_NAME  (env var, default: realestateos)
Database URL:                     DATABASE_URL    (env var, PostgreSQL)
Redis URL:                        REDIS_URL       (env var)
Monitoring:                       Grafana http://grafana:3001  (profile: monitoring)
Logs:                             Grafana → Loki  (profile: logging)
```

---

## Post-Incident Checklist

After any P0/P1 incident:

- [ ] Services fully restored and smoke-tested
- [ ] Grafana dashboards showing healthy metrics
- [ ] Loki logs reviewed for residual errors
- [ ] Root cause identified and documented
- [ ] Incident timeline written (Slack thread or wiki)
- [ ] Preventive action items filed as GitHub issues
- [ ] Runbook updated if procedures were unclear
