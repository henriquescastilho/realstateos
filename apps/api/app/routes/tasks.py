from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.task import Task
from app.schemas.task import TaskRead
from app.services.demo_tenant import get_or_create_demo_tenant

router = APIRouter()


@router.get("", response_model=list[TaskRead])
def list_tasks(db: Session = Depends(get_db)):
    demo_tenant = get_or_create_demo_tenant(db)
    return list(db.scalars(select(Task).where(Task.tenant_id == demo_tenant.id)).all())
