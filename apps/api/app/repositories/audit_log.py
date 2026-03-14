"""Repository for AuditLog — append-only audit trail."""
from __future__ import annotations

import csv
import io
import json
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------


def append_audit_entry(
    db: Session,
    tenant_id: str,
    entity_type: str,
    entity_id: str,
    action: str,
    actor_type: str,
    actor_id: str,
    *,
    agent_task_id: str | None = None,
    before_state: dict | None = None,
    after_state: dict | None = None,
    extra_metadata: dict | None = None,
    ip_address: str | None = None,
    correlation_id: str | None = None,
) -> AuditLog:
    """Append a single immutable audit entry.

    This is the only write path — audit_log is never updated or deleted.
    """
    entry = AuditLog(
        tenant_id=tenant_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action.upper(),
        actor_type=actor_type,
        actor_id=actor_id,
        agent_task_id=agent_task_id,
        before_state=before_state,
        after_state=after_state,
        extra_metadata=extra_metadata,
        ip_address=ip_address,
        correlation_id=correlation_id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------


def get_audit_log_entry(db: Session, entry_id: str, tenant_id: str) -> AuditLog | None:
    return db.scalar(
        select(AuditLog).where(AuditLog.id == entry_id, AuditLog.tenant_id == tenant_id)
    )


def list_audit_entries(
    db: Session,
    tenant_id: str,
    *,
    entity_type: str | None = None,
    entity_id: str | None = None,
    action: str | None = None,
    actor_type: str | None = None,
    actor_id: str | None = None,
    agent_task_id: str | None = None,
    correlation_id: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[AuditLog]:
    """Query audit log with flexible filters, newest first."""
    q = select(AuditLog).where(AuditLog.tenant_id == tenant_id)
    if entity_type:
        q = q.where(AuditLog.entity_type == entity_type)
    if entity_id:
        q = q.where(AuditLog.entity_id == entity_id)
    if action:
        q = q.where(AuditLog.action == action.upper())
    if actor_type:
        q = q.where(AuditLog.actor_type == actor_type)
    if actor_id:
        q = q.where(AuditLog.actor_id == actor_id)
    if agent_task_id:
        q = q.where(AuditLog.agent_task_id == agent_task_id)
    if correlation_id:
        q = q.where(AuditLog.correlation_id == correlation_id)
    if date_from:
        q = q.where(
            AuditLog.created_at >= datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc)
        )
    if date_to:
        q = q.where(
            AuditLog.created_at
            <= datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, tzinfo=timezone.utc)
        )
    q = q.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)
    return list(db.scalars(q).all())


# ---------------------------------------------------------------------------
# Export helpers
# ---------------------------------------------------------------------------


def export_audit_log_csv(
    db: Session,
    tenant_id: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> str:
    """Export audit entries as a CSV string for compliance reporting."""
    entries = list_audit_entries(
        db,
        tenant_id,
        entity_type=entity_type,
        entity_id=entity_id,
        date_from=date_from,
        date_to=date_to,
        limit=10_000,
    )
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "created_at", "entity_type", "entity_id", "action",
        "actor_type", "actor_id", "agent_task_id", "correlation_id",
        "before_state", "after_state",
    ])
    for e in entries:
        writer.writerow([
            e.id,
            e.created_at.isoformat() if e.created_at else "",
            e.entity_type,
            e.entity_id,
            e.action,
            e.actor_type,
            e.actor_id,
            e.agent_task_id or "",
            e.correlation_id or "",
            json.dumps(e.before_state) if e.before_state else "",
            json.dumps(e.after_state) if e.after_state else "",
        ])
    return output.getvalue()


def export_audit_log_json(
    db: Session,
    tenant_id: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[dict[str, Any]]:
    """Export audit entries as a list of dicts for JSON serialization."""
    entries = list_audit_entries(
        db,
        tenant_id,
        entity_type=entity_type,
        entity_id=entity_id,
        date_from=date_from,
        date_to=date_to,
        limit=10_000,
    )
    return [
        {
            "id": e.id,
            "created_at": e.created_at.isoformat() if e.created_at else None,
            "entity_type": e.entity_type,
            "entity_id": e.entity_id,
            "action": e.action,
            "actor_type": e.actor_type,
            "actor_id": e.actor_id,
            "agent_task_id": e.agent_task_id,
            "correlation_id": e.correlation_id,
            "before_state": e.before_state,
            "after_state": e.after_state,
            "extra_metadata": e.extra_metadata,
        }
        for e in entries
    ]
