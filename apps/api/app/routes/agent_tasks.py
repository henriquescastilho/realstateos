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

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.errors import AgentTaskNotFoundError, TaskStateConflictError
from app.middleware.tenant import OrgContext, get_current_org
from app.models.task import Task
from app.openapi import AUTH_RESPONSES, RESPONSES_404, RESPONSES_409, RESPONSES_422
from app.schemas.pagination import PaginatedResponse, PaginationParams
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
        raise AgentTaskNotFoundError(task_id=task_id)
    return task


@router.get(
    "",
    response_model=PaginatedResponse[TaskRead],
    summary="List agent tasks",
    description=(
        "List agent tasks for the authenticated tenant, newest first. "
        "Filter by `status` (PENDING, RUNNING, DONE, FAILED, ESCALATED) and/or `type` "
        "to narrow results. Use `page` and `per_page` query parameters to paginate results."
    ),
    responses={**AUTH_RESPONSES},
)
def list_agent_tasks(
    task_status: str | None = Query(None, alias="status", description="Filter by status (PENDING, RUNNING, DONE, FAILED, ESCALATED)"),
    task_type: str | None = Query(None, alias="type", description="Filter by task type"),
    p: PaginationParams = Depends(),
    org: OrgContext = Depends(get_current_org),
    db: Session = Depends(get_db),
) -> PaginatedResponse[TaskRead]:
    """List agent tasks for the authenticated tenant, newest first."""
    base = select(Task).where(Task.tenant_id == org.tenant_id)
    if task_status:
        base = base.where(Task.status == task_status.upper())
    if task_type:
        base = base.where(Task.type == task_type.upper())
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    items = list(db.scalars(base.order_by(Task.created_at.desc()).offset(p.offset).limit(p.limit)).all())
    return PaginatedResponse.build(items=items, total=total or 0, params=p)


@router.get(
    "/{task_id}",
    response_model=TaskRead,
    summary="Get agent task detail",
    description=(
        "Retrieve a single agent task including its full `payload` (audit log). "
        "The payload contains the agent's input, output, escalation reason (if any), "
        "and any human resolution metadata."
    ),
    responses={**AUTH_RESPONSES, **RESPONSES_404},
)
def get_agent_task(
    task_id: str,
    org: OrgContext = Depends(get_current_org),
    db: Session = Depends(get_db),
) -> Task:
    """Get a single agent task with full payload (audit log)."""
    return _get_task_or_404(db, task_id, org.tenant_id)


@router.post(
    "/{task_id}/retry",
    response_model=TaskRead,
    status_code=status.HTTP_200_OK,
    summary="Retry failed agent task",
    description=(
        "Human-triggered retry — resets status to PENDING so the worker picks it up again. "
        "Only `FAILED` or `ESCALATED` tasks can be retried. "
        "The retry is logged in the task payload with the operator's user ID."
    ),
    responses={**AUTH_RESPONSES, **RESPONSES_404, **RESPONSES_409},
)
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
        raise TaskStateConflictError(
            action="retry",
            task_id=task_id,
            current_status=task.status,
            allowed_statuses="FAILED, ESCALATED",
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


@router.post(
    "/{task_id}/resolve",
    response_model=TaskRead,
    status_code=status.HTTP_200_OK,
    summary="Resolve escalated agent task",
    description=(
        "Human resolution of an escalated task. "
        "Set `resolution` to `approved` (marks task DONE) or `rejected` (marks task FAILED). "
        "Include optional `notes` for audit trail. "
        "Only `ESCALATED` tasks can be resolved via this endpoint."
    ),
    responses={**AUTH_RESPONSES, **RESPONSES_404, **RESPONSES_409, **RESPONSES_422},
)
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
        raise TaskStateConflictError(
            action="resolve",
            task_id=task_id,
            current_status=task.status,
            allowed_statuses="ESCALATED",
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
