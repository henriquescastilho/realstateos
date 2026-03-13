from sqlalchemy import select

from app.agents.document_agent import DocumentAgent
from app.agents.financial_agent import FinancialAgent
from app.agents.notification_agent import NotificationAgent
from app.agents.retrieval_agent import RetrievalAgent
from app.db import SessionLocal
from app.models.task import Task
from app.workers.celery_app import celery_app


def _resolve_agent(task_type: str):
    if task_type == "generate_charge":
        return FinancialAgent()
    if task_type in {"retrieve_iptu", "retrieve_condo"}:
        return RetrievalAgent()
    if task_type == "process_document":
        return DocumentAgent()
    if task_type == "notify_admin":
        return NotificationAgent()
    return None


@celery_app.task(name="app.workers.jobs.run_task")
def run_task(task_id: str) -> dict[str, str]:
    db = SessionLocal()
    try:
        task = db.scalar(select(Task).where(Task.id == task_id))
        if task is None:
            return {"task_id": task_id, "status": "not_found"}

        agent = _resolve_agent(task.type)
        if agent is None:
            task.status = "failed"
            db.add(task)
            db.commit()
            return {"task_id": task_id, "status": "failed"}

        task.status = "running"
        db.add(task)
        db.commit()

        result = agent.run(db, task)
        task.status = result["status"]
        db.add(task)
        db.commit()
        return {"task_id": task_id, "status": task.status}
    finally:
        db.close()
