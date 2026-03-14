from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.middleware.tenant import OrgContext, get_demo_or_authed_org
from app.models.task import Task
from app.openapi import AUTH_RESPONSES
from app.schemas.pagination import PaginatedResponse, PaginationParams
from app.schemas.task import TaskRead

router = APIRouter()


@router.get(
    "",
    response_model=PaginatedResponse[TaskRead],
    summary="List task records",
    description=(
        "Return task audit records for the authenticated tenant, newest first, paginated. "
        "These are lightweight records created by billing and payment operations. "
        "For full agent task lifecycle management (retry, resolve, escalation), "
        "use the `/agent-tasks` endpoints instead. "
        "Use `page` and `per_page` query parameters to paginate results."
    ),
    responses={**AUTH_RESPONSES},
)
def list_tasks(
    p: PaginationParams = Depends(),
    org: OrgContext = Depends(get_demo_or_authed_org),
    db: Session = Depends(get_db),
) -> PaginatedResponse[TaskRead]:
    base = select(Task).where(Task.tenant_id == org.tenant_id).order_by(Task.created_at.desc())
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    items = list(db.scalars(base.offset(p.offset).limit(p.limit)).all())
    return PaginatedResponse.build(items=items, total=total or 0, params=p)
