"""Agent Tasks API — operations dashboard for monitoring and controlling agent work.

Endpoints:
    GET  /agent-tasks          List agent tasks (filterable by status, type, tenant)
    GET  /agent-tasks/{id}     Full detail with audit log
    POST /agent-tasks/{id}/retry     Human-triggered retry
    POST /agent-tasks/{id}/resolve   Human resolution of escalated task
"""
from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, get_current_user
from app.api.deps import get_db
from app.middleware.tenant import OrgContext, get_current_org
from app.models.task import Task
from app.schemas.task import TaskRead
from app.services.task_service import create_task_record


class ResolveTaskRequest(BaseModel):
    resolution: Literal["approved", "rejected"]
    notes: str = ""

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agent-tasks", tags=["agent-tasks"])


def _get_task_or_404(db: Session, task_id: str, tenant_id: str) -> Task:
    task = db.scalar(select(Task).where(Task.id == task_id, Task.tenant_id == tenant_id))
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


@router.get("", response_model=list[TaskRead])
def list_agent_tasks(
    task_status: str | None = Query(None, alias="status", description="Filter by status (PENDING, RUNNING, DONE, FAILED, ESCALATED)"),
    task_type: str | None = Query(None, alias="type", description="Filter by task type"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    org: OrgContext = Depends(get_current_org),
    db: Session = Depends(get_db),
) -> list[TaskRead]:
    """List agent tasks for the authenticated tenant, newest first."""
    q = select(Task).where(Task.tenant_id == org.tenant_id)
    if task_status:
        q = q.where(Task.status == task_status.upper())
    if task_type:
        q = q.where(Task.type == task_type.upper())
    q = q.order_by(Task.created_at.desc()).offset(offset).limit(limit)
    return list(db.scalars(q).all())


@router.get("/{task_id}", response_model=TaskRead)
def get_agent_task(
    task_id: str,
    org: OrgContext = Depends(get_current_org),
    db: Session = Depends(get_db),
) -> Task:
    """Get a single agent task with full payload (audit log)."""
    return _get_task_or_404(db, task_id, org.tenant_id)


@router.post("/{task_id}/retry", response_model=TaskRead, status_code=status.HTTP_200_OK)
def retry_agent_task(
    task_id: str,
    org: OrgContext = Depends(get_current_org),
    db: Session = Depends(get_db),
) -> Task:
    """Human-triggered retry — resets status to PENDING so the worker picks it up again.

    Only FAILED or ESCALATED tasks can be retried.
    """
    task = _get_task_or_404(db, task_id, org.tenant_id)
    if task.status not in ("FAILED", "ESCALATED"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot retry task with status '{task.status}'. Only FAILED or ESCALATED tasks can be retried.",
        )
    task.status = "PENDING"
    task.payload = {
        **task.payload,
        "retry_by": org.user_id,
        "retry_reason": "human_triggered_retry",
    }
    db.add(task)
    db.commit()
    db.refresh(task)
    logger.info(
        "Task retried by human: task_id=%s tenant_id=%s user_id=%s",
        task_id,
        org.tenant_id,
        org.user_id,
    )
    return task


@router.post("/{task_id}/resolve", response_model=TaskRead, status_code=status.HTTP_200_OK)
def resolve_agent_task(
    task_id: str,
    body: ResolveTaskRequest,
    org: OrgContext = Depends(get_current_org),
    db: Session = Depends(get_db),
) -> Task:
    """Human resolution of an escalated task.

    Body: {"resolution": "approved" | "rejected", "notes": "..."}
    Marks task as DONE (approved) or FAILED (rejected) with human resolution metadata.
    """
    task = _get_task_or_404(db, task_id, org.tenant_id)
    if task.status != "ESCALATED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot resolve task with status '{task.status}'. Only ESCALATED tasks can be resolved.",
        )
    task.status = "DONE" if body.resolution == "approved" else "FAILED"
    task.payload = {
        **task.payload,
        "human_resolution": body.resolution,
        "resolved_by": org.user_id,
        "resolution_notes": body.notes,
    }
    db.add(task)
    db.commit()
    db.refresh(task)
    logger.info(
        "Task resolved by human: task_id=%s decision=%s tenant_id=%s user_id=%s",
        task_id,
        body.resolution,
        org.tenant_id,
        org.user_id,
    )
    return task
