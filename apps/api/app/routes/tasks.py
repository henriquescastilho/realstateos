from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.middleware.tenant import OrgContext, get_demo_or_authed_org
from app.models.task import Task
from app.openapi import AUTH_RESPONSES
from app.schemas.task import TaskRead

router = APIRouter()


@router.get(
    "",
    response_model=list[TaskRead],
    summary="List task records",
    description=(
        "Return all task audit records for the authenticated tenant, newest first. "
        "These are lightweight records created by billing and payment operations. "
        "For full agent task lifecycle management (retry, resolve, escalation), "
        "use the `/agent-tasks` endpoints instead."
    ),
    responses={**AUTH_RESPONSES},
)
def list_tasks(
    org: OrgContext = Depends(get_demo_or_authed_org),
    db: Session = Depends(get_db),
):
    return list(db.scalars(select(Task).where(Task.tenant_id == org.tenant_id)).all())
