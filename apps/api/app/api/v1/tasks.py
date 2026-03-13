from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_context, get_db
from app.core.tenant import RequestContext
from app.schemas.task import TaskCreate, TaskRead
from app.services.task_service import create_pending_task
from app.models.task import Task

router = APIRouter()


@router.get("", response_model=list[TaskRead])
def list_tasks(
    db: Session = Depends(get_db),
    context: Annotated[RequestContext, Depends(get_current_context)] = None,
):
    return list(db.scalars(select(Task).where(Task.tenant_id == context.tenant_id)).all())


@router.post("/run", response_model=TaskRead, status_code=status.HTTP_202_ACCEPTED)
def run_task_route(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    context: Annotated[RequestContext, Depends(get_current_context)] = None,
):
    merged_payload = {"tenant_id": context.tenant_id, **payload.payload}
    task = create_pending_task(
        db=db,
        tenant_id=context.tenant_id,
        task_type=payload.type,
        payload=merged_payload,
        property_id=merged_payload.get("property_id"),
        contract_id=merged_payload.get("contract_id"),
    )
    return task
