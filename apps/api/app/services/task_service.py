from sqlalchemy.orm import Session

from app.models.task import Task

SUPPORTED_BILLING_TASK_TYPES = {
    "GENERATE_MONTHLY_CHARGE",
    "CONSOLIDATE_CHARGES",
    "GENERATE_PAYMENT",
}

TASK_TYPE_ALIASES = {
    "generate_charge": "GENERATE_MONTHLY_CHARGE",
    "generate_monthly_charge": "GENERATE_MONTHLY_CHARGE",
    "consolidate_charges": "CONSOLIDATE_CHARGES",
    "generate_payment": "GENERATE_PAYMENT",
}


def normalize_task_type(task_type: str) -> str:
    normalized = task_type.strip()
    if normalized in SUPPORTED_BILLING_TASK_TYPES:
        return normalized
    return TASK_TYPE_ALIASES.get(normalized.lower(), normalized.upper())


def create_task_record(
    db: Session,
    tenant_id: str,
    task_type: str,
    status_value: str,
    message: str,
    payload: dict,
    property_id: str | None = None,
    contract_id: str | None = None,
) -> Task:
    task = Task(
        tenant_id=tenant_id,
        type=normalize_task_type(task_type),
        status=status_value,
        payload={
            "property_id": property_id,
            "contract_id": contract_id,
            "message": message,
            **payload,
        },
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def create_agent_message(
    db: Session,
    tenant_id: str,
    task_type: str,
    message: str,
    payload: dict | None = None,
    property_id: str | None = None,
    contract_id: str | None = None,
    status_value: str = "DONE",
) -> Task:
    return create_task_record(
        db=db,
        tenant_id=tenant_id,
        task_type=task_type,
        status_value=status_value,
        message=message,
        payload=payload or {},
        property_id=property_id,
        contract_id=contract_id,
    )


def create_pending_task(
    db: Session,
    tenant_id: str,
    task_type: str,
    payload: dict,
    property_id: str | None = None,
    contract_id: str | None = None,
) -> Task:
    return create_task_record(
        db=db,
        tenant_id=tenant_id,
        task_type=task_type,
        status_value="PENDING",
        message="Task queued for BillingAgent execution",
        payload=payload,
        property_id=property_id,
        contract_id=contract_id,
    )


def get_next_pending_task(db: Session) -> Task | None:
    from sqlalchemy import select

    statement = (
        select(Task)
        .where(Task.status == "PENDING", Task.type.in_(SUPPORTED_BILLING_TASK_TYPES))
        .order_by(Task.created_at.asc())
    )
    return db.scalar(statement)


def mark_task_running(db: Session, task: Task) -> Task:
    task.status = "RUNNING"
    task.payload = {**task.payload, "message": "BillingAgent is processing this task"}
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def mark_task_done(db: Session, task: Task, result: dict, message: str) -> Task:
    task.status = "DONE"
    task.payload = {**task.payload, "message": message, "result": result}
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def mark_task_failed(db: Session, task: Task, error: str, message: str) -> Task:
    task.status = "FAILED"
    task.payload = {**task.payload, "message": message, "error": error}
    db.add(task)
    db.commit()
    db.refresh(task)
    return task
