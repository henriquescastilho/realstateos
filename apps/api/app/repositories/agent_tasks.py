"""Repository for AgentTask CRUD operations with tenant-scoped filtering."""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.agent_task import AgentTask


# ---------------------------------------------------------------------------
# Read helpers
# ---------------------------------------------------------------------------


def get_agent_task(db: Session, task_id: str, tenant_id: str) -> AgentTask | None:
    """Fetch a single agent task scoped to the tenant."""
    return db.scalar(
        select(AgentTask).where(AgentTask.id == task_id, AgentTask.tenant_id == tenant_id)
    )


def list_agent_tasks(
    db: Session,
    tenant_id: str,
    *,
    status: str | None = None,
    agent_type: str | None = None,
    task_type: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[AgentTask]:
    """List agent tasks with optional filters, newest first."""
    q = select(AgentTask).where(AgentTask.tenant_id == tenant_id)
    if status:
        q = q.where(AgentTask.status == status.upper())
    if agent_type:
        q = q.where(AgentTask.agent_type == agent_type)
    if task_type:
        q = q.where(AgentTask.task_type == task_type.upper())
    if entity_type:
        q = q.where(AgentTask.entity_type == entity_type)
    if entity_id:
        q = q.where(AgentTask.entity_id == entity_id)
    if date_from:
        q = q.where(AgentTask.created_at >= datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc))
    if date_to:
        q = q.where(AgentTask.created_at <= datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, tzinfo=timezone.utc))
    q = q.order_by(AgentTask.created_at.desc()).offset(offset).limit(limit)
    return list(db.scalars(q).all())


def count_agent_tasks(
    db: Session,
    tenant_id: str,
    *,
    status: str | None = None,
) -> int:
    """Count agent tasks (optionally filtered by status)."""
    from sqlalchemy import func  # noqa: PLC0415

    q = select(func.count()).select_from(AgentTask).where(AgentTask.tenant_id == tenant_id)
    if status:
        q = q.where(AgentTask.status == status.upper())
    return db.scalar(q) or 0


# ---------------------------------------------------------------------------
# Write helpers
# ---------------------------------------------------------------------------


def create_agent_task(
    db: Session,
    tenant_id: str,
    agent_type: str,
    task_type: str,
    input_data: dict,
    *,
    agent_id: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    priority: int = 5,
    max_retries: int = 3,
    correlation_id: str | None = None,
    status: str = "PENDING",
) -> AgentTask:
    """Create a new agent task and persist it."""
    task = AgentTask(
        tenant_id=tenant_id,
        agent_type=agent_type,
        agent_id=agent_id,
        task_type=task_type.upper(),
        status=status,
        priority=priority,
        entity_type=entity_type,
        entity_id=entity_id,
        input_data=input_data,
        max_retries=max_retries,
        correlation_id=correlation_id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def update_agent_task_status(
    db: Session,
    task_id: str,
    tenant_id: str,
    status: str,
    *,
    output_data: dict | None = None,
    error_message: str | None = None,
    duration_ms: int | None = None,
) -> AgentTask | None:
    """Update a task's status and optional result fields."""
    task = get_agent_task(db, task_id, tenant_id)
    if task is None:
        return None
    now = datetime.now(tz=timezone.utc)
    task.status = status.upper()
    task.updated_at = now
    if status.upper() == "RUNNING" and task.started_at is None:
        task.started_at = now
    if status.upper() in ("DONE", "FAILED", "ESCALATED"):
        task.completed_at = now
    if output_data is not None:
        task.output_data = output_data
    if error_message is not None:
        task.error_message = error_message
    if duration_ms is not None:
        task.duration_ms = duration_ms
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def increment_retry_count(db: Session, task_id: str, tenant_id: str) -> AgentTask | None:
    """Increment retry counter and return the updated task."""
    task = get_agent_task(db, task_id, tenant_id)
    if task is None:
        return None
    task.retry_count += 1
    task.updated_at = datetime.now(tz=timezone.utc)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def mark_task_dlq(db: Session, task_id: str, tenant_id: str) -> AgentTask | None:
    """Mark a task as moved to the DLQ."""
    task = get_agent_task(db, task_id, tenant_id)
    if task is None:
        return None
    now = datetime.now(tz=timezone.utc)
    task.status = "DLQ"
    task.dlq_at = now
    task.updated_at = now
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def bulk_update_status(
    db: Session,
    task_ids: list[str],
    tenant_id: str,
    new_status: str,
) -> int:
    """Bulk update status for a list of task IDs. Returns number of rows updated."""
    result = db.execute(
        update(AgentTask)
        .where(
            AgentTask.id.in_(task_ids),
            AgentTask.tenant_id == tenant_id,
        )
        .values(
            status=new_status.upper(),
            updated_at=datetime.now(tz=timezone.utc),
        )
    )
    db.commit()
    return result.rowcount
