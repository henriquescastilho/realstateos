"""APScheduler-based scheduled task runner.

Scheduled jobs (matching fix_plan.md spec):
    - Monthly billing generation   (1st of month, 6:00 AM)
    - Payment reminder D-3         (daily at 8:00 AM — for charges due in 3 days)
    - Overdue escalation           (daily at 9:00 AM — charges past due > 5 days)
    - Portfolio report generation  (1st of month, 7:00 AM)

Each job creates an agent_tasks record so actions are auditable.

APScheduler is an optional dependency. Falls back to a no-op if not installed.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta

logger = logging.getLogger(__name__)

try:
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.cron import CronTrigger

    _APScheduler = BackgroundScheduler
    _CronTrigger = CronTrigger
    _APSCHEDULER_AVAILABLE = True
except ModuleNotFoundError:
    _APScheduler = None  # type: ignore[assignment,misc]
    _CronTrigger = None  # type: ignore[assignment,misc]
    _APSCHEDULER_AVAILABLE = False
    logger.warning("apscheduler not installed — scheduled jobs are disabled")


# ---------------------------------------------------------------------------
# Job implementations
# ---------------------------------------------------------------------------


def _run_monthly_billing() -> None:
    """Generate monthly rent charges for all active contracts."""
    from sqlalchemy import select  # noqa: PLC0415

    from app.db import SessionLocal  # noqa: PLC0415
    from app.models.contract import Contract  # noqa: PLC0415
    from app.services.billing_service import generate_monthly_rent_charge  # noqa: PLC0415
    from app.services.task_service import create_task_record  # noqa: PLC0415

    today = date.today()
    reference_month = today.replace(day=1)

    with SessionLocal() as db:
        active_contracts = db.scalars(
            select(Contract).where(
                Contract.start_date <= today,
                Contract.end_date >= today,
            )
        ).all()

        processed = 0
        errors = 0
        for contract in active_contracts:
            try:
                charge = generate_monthly_rent_charge(contract, reference_month)
                db.add(charge)
                processed += 1
            except Exception as exc:  # noqa: BLE001
                logger.error(
                    "Monthly billing failed for contract %s: %s",
                    contract.id,
                    exc,
                )
                errors += 1

        if processed > 0:
            db.commit()

        try:
            create_task_record(
                db=db,
                tenant_id="SYSTEM",
                task_type="SCHEDULED_MONTHLY_BILLING",
                status_value="DONE" if errors == 0 else "PARTIAL",
                message=f"Monthly billing: {processed} charges generated, {errors} errors",
                payload={
                    "reference_month": reference_month.isoformat(),
                    "processed": processed,
                    "errors": errors,
                },
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("Audit record failed after billing commit: %s", exc)
        logger.info("Monthly billing completed: %d processed, %d errors", processed, errors)


def _run_payment_reminder() -> None:
    """Send payment reminders for charges due in exactly 3 days."""
    from sqlalchemy import select  # noqa: PLC0415

    from app.db import SessionLocal  # noqa: PLC0415
    from app.models.charge import Charge  # noqa: PLC0415
    from app.services.task_service import create_task_record  # noqa: PLC0415

    target_date = date.today() + timedelta(days=3)

    with SessionLocal() as db:
        upcoming = db.scalars(
            select(Charge).where(
                Charge.due_date == target_date,
                Charge.status == "pending",
            )
        ).all()

        for charge in upcoming:
            create_task_record(
                db=db,
                tenant_id=charge.tenant_id,
                task_type="PAYMENT_REMINDER",
                status_value="PENDING",
                message=f"Payment reminder for charge {charge.id} due on {charge.due_date}",
                payload={
                    "charge_id": charge.id,
                    "due_date": charge.due_date.isoformat(),
                    "amount": str(charge.amount),
                    "contract_id": charge.contract_id,
                },
                contract_id=charge.contract_id,
                property_id=charge.property_id,
            )

        logger.info("Payment reminders queued for %d charges due on %s", len(upcoming), target_date)


def _run_overdue_escalation() -> None:
    """Escalate charges that are more than 5 days past due."""
    from sqlalchemy import select  # noqa: PLC0415

    from app.db import SessionLocal  # noqa: PLC0415
    from app.models.charge import Charge  # noqa: PLC0415
    from app.services.task_service import create_task_record  # noqa: PLC0415

    cutoff = date.today() - timedelta(days=5)

    with SessionLocal() as db:
        overdue = db.scalars(
            select(Charge).where(
                Charge.due_date < cutoff,
                Charge.status == "pending",
            )
        ).all()

        escalated = 0
        for charge in overdue:
            create_task_record(
                db=db,
                tenant_id=charge.tenant_id,
                task_type="OVERDUE_ESCALATION",
                status_value="ESCALATED",
                message=(
                    f"Charge {charge.id} is {(date.today() - charge.due_date).days} days overdue. "
                    "Human follow-up required."
                ),
                payload={
                    "charge_id": charge.id,
                    "due_date": charge.due_date.isoformat(),
                    "days_overdue": (date.today() - charge.due_date).days,
                    "amount": str(charge.amount),
                    "contract_id": charge.contract_id,
                },
                contract_id=charge.contract_id,
                property_id=charge.property_id,
            )
            escalated += 1

        logger.info("Overdue escalation: %d charges escalated", escalated)


def _run_portfolio_report() -> None:
    """Generate monthly portfolio report for all tenants."""
    from sqlalchemy import select  # noqa: PLC0415

    from app.db import SessionLocal  # noqa: PLC0415
    from app.models.tenant import Tenant  # noqa: PLC0415
    from app.services.task_service import create_task_record  # noqa: PLC0415

    today = date.today()
    month = today.replace(day=1).strftime("%Y-%m")

    with SessionLocal() as db:
        tenants = db.scalars(select(Tenant)).all()
        for tenant in tenants:
            try:
                from app.agents.portfolio_agent.tools import PortfolioAgentTools  # noqa: PLC0415

                tools = PortfolioAgentTools(db=db, tenant_id=tenant.id)
                report = tools.generate_portfolio_report(month=month)
                create_task_record(
                    db=db,
                    tenant_id=tenant.id,
                    task_type="PORTFOLIO_REPORT",
                    status_value="DONE",
                    message=f"Portfolio report generated for {month}",
                    payload=report,
                )
            except Exception as exc:  # noqa: BLE001
                logger.error("Portfolio report failed for tenant %s: %s", tenant.id, exc)

        logger.info("Portfolio reports generated for %d tenants for %s", len(tenants), month)


# ---------------------------------------------------------------------------
# Scheduler lifecycle
# ---------------------------------------------------------------------------

_scheduler: "BackgroundScheduler | None" = None  # type: ignore[name-defined]


def start_scheduler() -> None:
    """Initialize and start the APScheduler background scheduler."""
    global _scheduler  # noqa: PLW0603

    if not _APSCHEDULER_AVAILABLE:
        logger.warning("Scheduler not started: apscheduler package not installed")
        return

    if _scheduler is not None and _scheduler.running:
        logger.warning("Scheduler already running")
        return

    _scheduler = _APScheduler()

    # Monthly billing: 1st of every month at 6:00 AM
    _scheduler.add_job(
        _run_monthly_billing,
        trigger=_CronTrigger(day=1, hour=6, minute=0),
        id="monthly_billing",
        name="Monthly Billing Generation",
        replace_existing=True,
    )

    # Payment reminders: daily at 8:00 AM
    _scheduler.add_job(
        _run_payment_reminder,
        trigger=_CronTrigger(hour=8, minute=0),
        id="payment_reminder",
        name="Payment Reminder D-3",
        replace_existing=True,
    )

    # Overdue escalation: daily at 9:00 AM
    _scheduler.add_job(
        _run_overdue_escalation,
        trigger=_CronTrigger(hour=9, minute=0),
        id="overdue_escalation",
        name="Overdue Charge Escalation",
        replace_existing=True,
    )

    # Portfolio report: 1st of every month at 7:00 AM
    _scheduler.add_job(
        _run_portfolio_report,
        trigger=_CronTrigger(day=1, hour=7, minute=0),
        id="portfolio_report",
        name="Monthly Portfolio Report",
        replace_existing=True,
    )

    _scheduler.start()
    logger.info(
        "Scheduler started with %d jobs: %s",
        len(_scheduler.get_jobs()),
        [j.name for j in _scheduler.get_jobs()],
    )


def stop_scheduler() -> None:
    global _scheduler  # noqa: PLW0603
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
    _scheduler = None


def get_scheduler_status() -> dict:
    if not _APSCHEDULER_AVAILABLE:
        return {"available": False, "reason": "apscheduler not installed"}
    if _scheduler is None or not _scheduler.running:
        return {"available": True, "running": False, "jobs": []}
    return {
        "available": True,
        "running": True,
        "jobs": [
            {
                "id": j.id,
                "name": j.name,
                "next_run": j.next_run_time.isoformat() if j.next_run_time else None,
            }
            for j in _scheduler.get_jobs()
        ],
    }
