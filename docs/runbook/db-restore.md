# Runbook: PostgreSQL Database Restore

**RTO contribution:** ~45 min (list backups + download + restore + verify)
**RPO:** ≤ 1 hour (daily backup at 06:00 UTC + WAL/transaction logs)

---

## When to Use This Runbook

- Accidental `DROP TABLE` or `TRUNCATE` in production
- Database corruption detected (Grafana alert `PostgreSQLDown`)
- Data divergence discovered (e.g. missing charges, contracts)
- Full disk / data volume failure requiring restore to a new PV

---

## Prerequisites

```bash
# On the ops host or inside the api pod:
psql --version      # must be present
pg_dump --version   # must be present
python -m scripts.backup --list   # must reach MinIO
```

Environment variables required (already set in prod pods):
```
DATABASE_URL   postgresql+psycopg://user:pass@postgres:5432/realestateos
S3_ENDPOINT_URL  http://minio:9000
S3_ACCESS_KEY_ID  <from secret>
S3_SECRET_ACCESS_KEY  <from secret>
S3_BUCKET_NAME  realestateos
```

---

## Step 1 — Assess Data Loss Window

```bash
# Check the last successful backup
python -m scripts.backup --list
```

Output will show:
```
--- DAILY backups ---
  backups/daily/2026-03-14_060000.sql.gz  (24320 KB)
  backups/daily/2026-03-13_060000.sql.gz  (24100 KB)
...
```

Identify the backup taken **before** the incident. Note the key (e.g. `backups/daily/2026-03-14_060000.sql.gz`).

---

## Step 2 — Scale Down the Application

> **Critical:** prevent the broken app from writing more data before restore.

```bash
# Kubernetes
kubectl -n realstateos scale deployment api api-node worker --replicas=0

# Docker Compose (dev/staging)
docker compose stop api worker api-node
```

---

## Step 3 — Create a Snapshot of the Current (Broken) State

Always preserve the broken state before overwriting — it may be useful for forensics.

```bash
# Inside the postgres pod or on a host with psql access:
export PGPASSWORD="$DB_PASSWORD"

pg_dump \
  --no-password \
  --format=plain \
  --encoding=UTF8 \
  --no-owner \
  --no-acl \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" \
  | gzip > /tmp/pre-restore-snapshot_$(date +%Y%m%d_%H%M%S).sql.gz

echo "Snapshot saved: /tmp/pre-restore-snapshot_*.sql.gz"
```

---

## Step 4 — Restore from Backup

Using the built-in restore tool (`apps/api/scripts/backup.py`):

```bash
# Restore into a NEW database for verification first
python -m scripts.backup \
  --restore backups/daily/2026-03-14_060000.sql.gz \
  --target-db realestateos_restored

# Verify the restore looks correct
psql -h "$DB_HOST" -U "$DB_USER" -d realestateos_restored \
  -c "SELECT COUNT(*) FROM contracts;"
psql -h "$DB_HOST" -U "$DB_USER" -d realestateos_restored \
  -c "SELECT MAX(created_at) FROM charges;"
```

If the restored DB looks correct, proceed to swap:

```bash
# Terminate all connections to the production database
psql -h "$DB_HOST" -U "$DB_USER" -d postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='realestateos' AND pid <> pg_backend_pid();"

# Drop and recreate the production database
psql -h "$DB_HOST" -U "$DB_USER" -d postgres \
  -c "DROP DATABASE realestateos;"
psql -h "$DB_HOST" -U "$DB_USER" -d postgres \
  -c "CREATE DATABASE realestateos;"

# Rename the verified restore into place
psql -h "$DB_HOST" -U "$DB_USER" -d postgres \
  -c "ALTER DATABASE realestateos_restored RENAME TO realestateos;"
```

---

## Step 5 — Run Alembic Migrations

Ensure the schema is at the latest revision (in case the backup predates a recent migration):

```bash
# Inside the api container or migration pod
cd apps/api
alembic upgrade head
```

---

## Step 6 — Run Smoke Tests

```bash
# Verify critical tables and row counts
psql -h "$DB_HOST" -U "$DB_USER" -d realestateos \
  -c "SELECT table_name, pg_total_relation_size(table_name::regclass) AS size_bytes
      FROM information_schema.tables
      WHERE table_schema='public'
      ORDER BY size_bytes DESC
      LIMIT 10;"

# Quick record sanity
psql -h "$DB_HOST" -U "$DB_USER" -d realestateos -c "SELECT COUNT(*) FROM tenants;"
psql -h "$DB_HOST" -U "$DB_USER" -d realestateos -c "SELECT COUNT(*) FROM contracts;"
psql -h "$DB_HOST" -U "$DB_USER" -d realestateos -c "SELECT COUNT(*) FROM charges;"
```

---

## Step 7 — Scale Up the Application

```bash
# Kubernetes
kubectl -n realstateos scale deployment api api-node worker --replicas=2

# Watch rollout
kubectl -n realstateos rollout status deployment/api

# Docker Compose
docker compose start api worker api-node
```

---

## Step 8 — Verify in Grafana

1. Open Grafana → **Real Estate OS — Infrastructure** dashboard
2. Confirm `PostgreSQL Up` stat = 1 (green)
3. Confirm `DB Connections by State` showing active connections
4. Open **Real Estate OS — API Overview** dashboard
5. Confirm p95 latency < 200ms and error rate < 1%

---

## Rollback

If restore made things worse, restore the pre-restore snapshot saved in Step 3:

```bash
gunzip -c /tmp/pre-restore-snapshot_*.sql.gz | \
  psql -h "$DB_HOST" -U "$DB_USER" -d realestateos
```

---

## Automated Backup Verification

The backup script runs verification automatically unless `--no-verify` is passed.
It creates a temp database, restores the dump, checks for table existence, then drops the temp DB.

```bash
# Manual trigger of verification for any backup key
python -m scripts.backup --restore backups/daily/2026-03-14_060000.sql.gz \
                          --target-db realestateos_verify_manual
```
