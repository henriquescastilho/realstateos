from sqlalchemy.orm import Session

from app.models.task import Task


class RetrievalAgent:
    def run(self, db: Session, task: Task) -> dict:
        bill_label = "condo bill" if task.type == "retrieve_condo" else "IPTU bill"
        manual_task = Task(
            tenant_id=task.tenant_id,
            type="notify_admin",
            status="pending",
            payload={
                "tenant_id": task.tenant_id,
                "property_id": task.payload.get("property_id"),
                "message": (
                    f"Please upload the {bill_label} before day {task.payload.get('due_hint', '1')} "
                    "to avoid interrupting billing flow."
                ),
            },
        )
        db.add(manual_task)
        db.commit()
        return {"status": "escalated", "manual_task_id": manual_task.id}

