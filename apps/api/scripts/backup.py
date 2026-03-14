"""Database backup script for Real Estate OS.

Runs pg_dump and uploads to MinIO with timestamp-based naming.

Retention policy:
    daily:   keep 7 days
    weekly:  keep 4 weeks (every Sunday)
    monthly: keep 12 months (1st of month)

Backup verification: restores dump to a temporary PostgreSQL database and
runs a smoke test (COUNT rows on key tables). Fails loudly if smoke test fails.

Usage:
    python -m scripts.backup [--verify] [--prune]

    --verify: After upload, restore to temp DB and run smoke test
    --prune:  Apply retention policy and delete old backups

Environment variables:
    DATABASE_URL         PostgreSQL connection string
    MINIO_ENDPOINT       MinIO endpoint URL
    MINIO_ACCESS_KEY     MinIO access key
    MINIO_SECRET_KEY     MinIO secret key
    MINIO_BUCKET         MinIO bucket (default: realestateos-backups)
"""
from __future__ import annotations

import argparse
import io
import logging
import os
import subprocess
import sys
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("backup")

_BUCKET = os.environ.get("MINIO_BUCKET", "realestateos-backups")
_DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/realestateos"
)
_MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "http://localhost:9000")
_MINIO_ACCESS_KEY = os.environ.get("MINIO_ACCESS_KEY", "minioadmin")
_MINIO_SECRET_KEY = os.environ.get("MINIO_SECRET_KEY", "minioadmin")


# ---------------------------------------------------------------------------
# MinIO client helper
# ---------------------------------------------------------------------------


def _get_minio():
    try:
        from minio import Minio  # noqa: PLC0415
        from urllib.parse import urlparse  # noqa: PLC0415

        parsed = urlparse(_MINIO_ENDPOINT)
        endpoint = parsed.netloc or parsed.path
        secure = parsed.scheme == "https"
        client = Minio(endpoint, access_key=_MINIO_ACCESS_KEY, secret_key=_MINIO_SECRET_KEY, secure=secure)
        # Ensure bucket exists
        if not client.bucket_exists(_BUCKET):
            client.make_bucket(_BUCKET)
            logger.info("Created MinIO bucket: %s", _BUCKET)
        return client
    except ImportError:
        logger.error("minio package not installed — install with: pip install minio")
        raise


# ---------------------------------------------------------------------------
# Backup key naming
# ---------------------------------------------------------------------------


def _backup_key(now: datetime) -> str:
    """Generate the S3 object key for a backup taken at `now`."""
    ts = now.strftime("%Y%m%d_%H%M%S")
    today = now.date()
    if today.day == 1:
        tier = "monthly"
    elif today.weekday() == 6:  # Sunday
        tier = "weekly"
    else:
        tier = "daily"
    return f"backups/{tier}/{ts}.dump"


# ---------------------------------------------------------------------------
# pg_dump
# ---------------------------------------------------------------------------


def _pg_dump(output_path: Path) -> None:
    """Run pg_dump and write to output_path (custom format)."""
    logger.info("Running pg_dump → %s", output_path)
    result = subprocess.run(
        [
            "pg_dump",
            "--format=custom",
            "--compress=9",
            "--no-password",
            "--file", str(output_path),
            _DATABASE_URL,
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"pg_dump failed:\n{result.stderr}")
    size_mb = output_path.stat().st_size / 1024 / 1024
    logger.info("pg_dump complete: %.2f MB", size_mb)


# ---------------------------------------------------------------------------
# Upload to MinIO
# ---------------------------------------------------------------------------


def _upload(dump_path: Path, object_key: str) -> str:
    """Upload dump file to MinIO. Returns the full object URL."""
    client = _get_minio()
    size = dump_path.stat().st_size
    logger.info("Uploading %s (%d bytes) → %s/%s", dump_path.name, size, _BUCKET, object_key)
    client.fput_object(_BUCKET, object_key, str(dump_path))
    logger.info("Upload complete: %s/%s", _BUCKET, object_key)
    return f"{_MINIO_ENDPOINT}/{_BUCKET}/{object_key}"


# ---------------------------------------------------------------------------
# Backup verification
# ---------------------------------------------------------------------------


def _verify(dump_path: Path) -> bool:
    """Restore dump to a temp DB and run smoke test.

    Returns True if verification passes, False otherwise.
    """
    temp_db = f"realestateos_verify_{datetime.now().strftime('%H%M%S')}"
    logger.info("Creating temp database: %s", temp_db)

    # Use psql to create temp DB (connect to 'postgres' default DB)
    admin_url = _DATABASE_URL.rsplit("/", 1)[0] + "/postgres"

    create_result = subprocess.run(
        ["psql", admin_url, "-c", f"CREATE DATABASE {temp_db}"],
        capture_output=True, text=True,
    )
    if create_result.returncode != 0:
        logger.error("Could not create temp DB: %s", create_result.stderr)
        return False

    restore_url = _DATABASE_URL.rsplit("/", 1)[0] + f"/{temp_db}"
    try:
        # Restore dump
        restore_result = subprocess.run(
            ["pg_restore", "--no-owner", "--no-privileges", f"--dbname={restore_url}", str(dump_path)],
            capture_output=True, text=True,
        )
        if restore_result.returncode not in (0, 1):  # 1 = warnings only, acceptable
            logger.error("pg_restore failed: %s", restore_result.stderr[:500])
            return False

        # Smoke test: count rows on key tables
        smoke_result = subprocess.run(
            [
                "psql", restore_url, "-c",
                "SELECT COUNT(*) FROM tenants; SELECT COUNT(*) FROM contracts; SELECT COUNT(*) FROM charges;",
            ],
            capture_output=True, text=True,
        )
        if smoke_result.returncode != 0:
            logger.error("Smoke test failed: %s", smoke_result.stderr)
            return False

        logger.info("Verification PASSED. Smoke test output:\n%s", smoke_result.stdout[:300])
        return True

    finally:
        # Drop temp DB
        subprocess.run(
            ["psql", admin_url, "-c", f"DROP DATABASE IF EXISTS {temp_db}"],
            capture_output=True, text=True,
        )
        logger.info("Temp database %s dropped", temp_db)


# ---------------------------------------------------------------------------
# Retention pruning
# ---------------------------------------------------------------------------


def _prune() -> None:
    """Apply retention policy and delete backups older than thresholds."""
    client = _get_minio()
    today = date.today()

    thresholds = {
        "daily": today - timedelta(days=7),
        "weekly": today - timedelta(weeks=4),
        "monthly": today - timedelta(days=365),
    }

    deleted = 0
    for obj in client.list_objects(_BUCKET, prefix="backups/", recursive=True):
        name = obj.object_name
        # Parse tier from path: backups/{tier}/{ts}.dump
        parts = name.split("/")
        if len(parts) < 3:
            continue
        tier = parts[1]
        if tier not in thresholds:
            continue
        # Parse date from filename: YYYYMMDD_HHMMSS.dump
        try:
            ts_str = parts[2].split(".")[0]
            backup_date = datetime.strptime(ts_str, "%Y%m%d_%H%M%S").date()
        except ValueError:
            continue

        if backup_date < thresholds[tier]:
            logger.info("Pruning %s (backup_date=%s, threshold=%s)", name, backup_date, thresholds[tier])
            client.remove_object(_BUCKET, name)
            deleted += 1

    logger.info("Pruning complete: %d backups deleted", deleted)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def backup(verify: bool = False, prune: bool = False) -> None:
    now = datetime.now(tz=timezone.utc)
    object_key = _backup_key(now)

    with tempfile.TemporaryDirectory() as tmpdir:
        dump_path = Path(tmpdir) / "backup.dump"

        # Dump
        _pg_dump(dump_path)

        # Upload
        url = _upload(dump_path, object_key)
        logger.info("Backup uploaded: %s", url)

        # Verify
        if verify:
            ok = _verify(dump_path)
            if not ok:
                logger.error("Backup verification FAILED")
                sys.exit(1)

    # Prune
    if prune:
        _prune()

    logger.info("Backup complete: %s", object_key)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Real Estate OS database backup")
    parser.add_argument("--verify", action="store_true", help="Restore and smoke-test the backup")
    parser.add_argument("--prune", action="store_true", help="Apply retention policy")
    args = parser.parse_args()
    backup(verify=args.verify, prune=args.prune)
