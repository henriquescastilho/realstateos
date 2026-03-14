# Runbook: MinIO Bucket Restore

**RTO contribution:** ~30 min (depends on bucket size)
**RPO:** ≤ 1 hour (same backup schedule as database)

---

## When to Use This Runbook

- MinIO pod crashed and data volume is corrupted or lost
- Accidental object deletion (contract PDFs, owner statements, etc.)
- MinIO bucket deleted or overwritten
- Storage volume migration to new infrastructure
- Cross-region disaster recovery (restore from off-site copy)

---

## MinIO Storage Layout

```
s3://realestateos/
├── backups/
│   ├── daily/       YYYY-MM-DD_HHMMSS.sql.gz  (PostgreSQL — 7 days)
│   ├── weekly/      YYYY-MM-DD_HHMMSS.sql.gz  (PostgreSQL — 4 weeks)
│   └── monthly/     YYYY-MM-DD_HHMMSS.sql.gz  (PostgreSQL — 12 months)
├── {tenant_id}/
│   ├── contracts/   {uuid}-{filename}.pdf
│   ├── statements/  {uuid}-owner-statement-{month}.pdf
│   ├── uploads/     {uuid}-{original-filename}
│   └── exports/     {uuid}-export-{timestamp}.xlsx
```

Object keys follow the pattern: `{tenant_id}/{folder}/{uuid}-{filename}` (from `StorageService.buildKey()`).

---

## Prerequisites

```bash
# mc (MinIO client) must be installed
mc --version

# Or use AWS CLI (compatible with MinIO S3 API)
aws --version

# Configure mc alias
mc alias set minio "$S3_ENDPOINT_URL" "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY"
```

Environment variables:
```
S3_ENDPOINT_URL       http://minio:9000
S3_ACCESS_KEY_ID      <from secret>
S3_SECRET_ACCESS_KEY  <from secret>
S3_BUCKET_NAME        realestateos
```

---

## Step 1 — Assess the Damage

```bash
# Check MinIO pod status
kubectl -n realstateos get pod -l app=minio
kubectl -n realstateos describe pod -l app=minio

# Check bucket contents
mc ls minio/realestateos --recursive | head -50
mc du minio/realestateos
```

---

## Step 2 — Restore a Single Object

For targeted restores (e.g. a single contract PDF deleted accidentally):

```bash
# If you have a backup copy in the backups prefix, restore from there
# Otherwise, identify the object key from application logs (Loki):
# Search Grafana Loki for: {service="api"} |= "upload" |= "<tenant_id>"

# Download from backup (if backup was stored separately)
mc cp minio-backup/realestateos-backup/{tenant_id}/contracts/{uuid}-contract.pdf \
      minio/realestateos/{tenant_id}/contracts/{uuid}-contract.pdf

# Verify
mc stat minio/realestateos/{tenant_id}/contracts/{uuid}-contract.pdf
```

---

## Step 3 — Restore Full Bucket from Off-Site Backup

### Option A: Mirror from backup MinIO (recommended for production)

If a second MinIO instance is configured as a backup target (e.g. different region):

```bash
# Configure backup alias
mc alias set minio-backup "$BACKUP_S3_ENDPOINT" "$BACKUP_ACCESS_KEY" "$BACKUP_SECRET_KEY"

# Mirror all objects back to primary
mc mirror --overwrite minio-backup/realestateos-backup minio/realestateos

# Verify object counts match
mc ls minio-backup/realestateos-backup --recursive | wc -l
mc ls minio/realestateos --recursive | wc -l
```

### Option B: Restore from local backup archive

If bucket contents were exported to a tarball before the incident:

```bash
# Extract and re-upload
tar -xzf realestateos-bucket-backup-YYYYMMDD.tar.gz -C /tmp/bucket-restore/
mc mirror /tmp/bucket-restore/ minio/realestateos
```

### Option C: Recreate bucket and restore DB backups only

If tenant files are unrecoverable but DB backups are intact:

```bash
# Recreate the bucket
mc mb minio/realestateos

# Restore PostgreSQL backups (these are the most critical)
# DB backups are typically stored external to MinIO as well
# Upload from local copy:
mc cp /mnt/backup/backups/ minio/realestateos/backups/ --recursive

# Tenant files (PDFs, statements) are regenerable from DB data
# Trigger re-generation via the API after DB restore is complete
```

---

## Step 4 — Restore MinIO Data Volume (Kubernetes)

If the PersistentVolume backing MinIO was lost:

```bash
# 1. Provision a new PV/PVC (adjust storage class as needed)
kubectl -n realstateos apply -f - <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: minio-data-new
  namespace: realstateos
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 50Gi
  storageClassName: standard
EOF

# 2. Update MinIO deployment to use new PVC
kubectl -n realstateos patch deployment minio \
  --type=json \
  -p='[{"op":"replace","path":"/spec/template/spec/volumes/0/persistentVolumeClaim/claimName","value":"minio-data-new"}]'

# 3. Wait for MinIO to come up
kubectl -n realstateos rollout status deployment/minio

# 4. Mirror data from backup (see Step 3 options above)
mc mirror minio-backup/realestateos-backup minio/realestateos
```

---

## Step 5 — Configure MinIO Replication (Preventive)

After recovery, configure bucket replication to prevent future data loss:

```bash
# Enable bucket versioning (required for replication)
mc version enable minio/realestateos

# Set up replication to backup MinIO
mc replicate add minio/realestateos \
  --remote-bucket "minio-backup/realestateos-backup" \
  --replicate "delete,delete-marker,existing-objects"

# Verify replication status
mc replicate status minio/realestateos
```

---

## Step 6 — Verify

```bash
# Check bucket accessible from API
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API_URL/v1/contracts/{id}/document" \
  -o /tmp/test-contract.pdf

# Check file size > 0
ls -lh /tmp/test-contract.pdf

# Check MinIO metrics in Grafana (if minio-exporter is running)
# Or check directly:
mc admin info minio
```

---

## Application Impact During Restore

| Service | Impact | Mitigation |
|---------|--------|------------|
| File uploads | 503 errors | Scale down api to 0 during restore, post maintenance page |
| PDF generation | Fails silently | Jobs will retry via BullMQ DLQ |
| Contract document view | 404 errors | Acceptable during restore window |
| DB backups | Cannot upload new backups | Run backup script after restore completes |

The application is designed with `StorageService` fallback — if MinIO is unreachable, uploads return an error but do not crash the API.
