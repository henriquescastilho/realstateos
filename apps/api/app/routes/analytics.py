"""Analytics API — portfolio KPIs and operational metrics.

Endpoints:
    GET /analytics/portfolio   Portfolio KPIs: default rate, active contracts, revenue
    GET /analytics/billing     Monthly billing totals, payment rates
    GET /analytics/maintenance Maintenance task metrics (avg resolution, category breakdown)
    GET /analytics/agents      Agent automation rate, escalation rate by task type
"""
from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.middleware.tenant import OrgContext, get_current_org
from app.models.charge import Charge
from app.models.contract import Contract
from app.models.task import Task
from app.openapi import AUTH_RESPONSES

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get(
    "/portfolio",
    summary="Portfolio KPIs",
    description=(
        "Return portfolio-level KPIs for the authenticated tenant: "
        "active contract count, total monthly revenue, default rate (3-month rolling), "
        "and contracts expiring in the next 30 and 60 days."
    ),
    responses={**AUTH_RESPONSES},
)
def portfolio_kpis(
    org: OrgContext = Depends(get_current_org),
    db: Session = Depends(get_db),
) -> dict:
    """Portfolio KPIs: active contracts, total monthly revenue, default rate, expiring contracts."""
    from app.agents.portfolio_agent.tools import PortfolioAgentTools  # noqa: PLC0415

    tools = PortfolioAgentTools(db=db, tenant_id=org.tenant_id)
    summary = tools.get_portfolio_summary()
    default_rate = tools.calculate_default_rate(period_months=3)
    expiring_30d = tools.get_expiring_contracts(days_ahead=30)
    expiring_60d = tools.get_expiring_contracts(days_ahead=60)

    return {
        **summary,
        "default_rate_3m_pct": default_rate["default_rate_pct"],
        "expiring_30d": len(expiring_30d),
        "expiring_60d": len(expiring_60d),
    }


@router.get(
    "/billing",
    summary="Billing analytics",
    description=(
        "Monthly billing totals and payment rate for the authenticated tenant. "
        "Pass `month` as `YYYY-MM` to query a specific month (defaults to current month). "
        "Returns charge counts by status, total billed amount, and collection rate."
    ),
    responses={**AUTH_RESPONSES},
)
def billing_analytics(
    month: str | None = Query(None, description="Month in YYYY-MM format, defaults to current month"),
    org: OrgContext = Depends(get_current_org),
    db: Session = Depends(get_db),
) -> dict:
    """Monthly billing totals and payment rate."""
    from calendar import monthrange  # noqa: PLC0415

    if month is None:
        today = date.today()
        month = today.strftime("%Y-%m")

    year, mon = map(int, month.split("-"))
    _, last_day = monthrange(year, mon)
    month_start = date(year, mon, 1)
    month_end = date(year, mon, last_day)
    tenant_id = org.tenant_id

    total_charges = db.scalar(
        select(func.count()).select_from(Charge).where(
            Charge.tenant_id == tenant_id,
            Charge.due_date >= month_start,
            Charge.due_date <= month_end,
        )
    ) or 0

    paid_charges = db.scalar(
        select(func.count()).select_from(Charge).where(
            Charge.tenant_id == tenant_id,
            Charge.due_date >= month_start,
            Charge.due_date <= month_end,
            Charge.status == "paid",
        )
    ) or 0

    pending_charges = db.scalar(
        select(func.count()).select_from(Charge).where(
            Charge.tenant_id == tenant_id,
            Charge.due_date >= month_start,
            Charge.due_date <= month_end,
            Charge.status == "pending",
        )
    ) or 0

    total_amount = db.scalar(
        select(func.coalesce(func.sum(Charge.amount), 0)).where(
            Charge.tenant_id == tenant_id,
            Charge.due_date >= month_start,
            Charge.due_date <= month_end,
        )
    ) or Decimal("0")

    collected_amount = db.scalar(
        select(func.coalesce(func.sum(Charge.amount), 0)).where(
            Charge.tenant_id == tenant_id,
            Charge.due_date >= month_start,
            Charge.due_date <= month_end,
            Charge.status == "paid",
        )
    ) or Decimal("0")

    return {
        "month": month,
        "total_charges": total_charges,
        "paid_charges": paid_charges,
        "pending_charges": pending_charges,
        "payment_rate_pct": round(paid_charges / total_charges * 100, 2) if total_charges else 0.0,
        "total_amount_brl": str(total_amount),
        "collected_amount_brl": str(collected_amount),
        "collection_rate_pct": round(
            float(collected_amount) / float(total_amount) * 100, 2
        ) if total_amount else 0.0,
    }


@router.get(
    "/maintenance",
    summary="Maintenance analytics",
    description=(
        "Maintenance task metrics for the authenticated tenant: "
        "total count, status breakdown, resolution rate, and escalation rate. "
        "Maintenance tasks are `Task` records whose `type` contains `MAINTENANCE`."
    ),
    responses={**AUTH_RESPONSES},
)
def maintenance_analytics(
    org: OrgContext = Depends(get_current_org),
    db: Session = Depends(get_db),
) -> dict:
    """Maintenance task metrics: count by status, category breakdown, automation rate."""
    tenant_id = org.tenant_id

    # Maintenance tasks are Task records with type containing "MAINTENANCE"
    maint_by_status = db.execute(
        select(Task.status, func.count().label("cnt"))
        .where(Task.tenant_id == tenant_id, Task.type.ilike("%MAINTENANCE%"))
        .group_by(Task.status)
    ).all()

    total_maintenance = sum(r.cnt for r in maint_by_status)
    done_maintenance = sum(r.cnt for r in maint_by_status if r.status == "DONE")
    escalated_maintenance = sum(r.cnt for r in maint_by_status if r.status == "ESCALATED")

    return {
        "total_maintenance_tasks": total_maintenance,
        "by_status": {r.status: r.cnt for r in maint_by_status},
        "resolution_rate_pct": round(done_maintenance / total_maintenance * 100, 2) if total_maintenance else 0.0,
        "escalation_rate_pct": round(escalated_maintenance / total_maintenance * 100, 2) if total_maintenance else 0.0,
    }


@router.get(
    "/agents",
    summary="Agent automation analytics",
    description=(
        "Agent automation rate and escalation breakdown by task type. "
        "Shows how often each agent type completes tasks autonomously vs. escalates to human review. "
        "Use this to identify agents that need tuning or tasks requiring policy updates."
    ),
    responses={**AUTH_RESPONSES},
)
def agent_analytics(
    org: OrgContext = Depends(get_current_org),
    db: Session = Depends(get_db),
) -> dict:
    """Agent automation rate and escalation breakdown by task type."""
    tenant_id = org.tenant_id

    by_type_status = db.execute(
        select(Task.type, Task.status, func.count().label("cnt"))
        .where(Task.tenant_id == tenant_id)
        .group_by(Task.type, Task.status)
    ).all()

    totals: dict[str, int] = {}
    done: dict[str, int] = {}
    escalated: dict[str, int] = {}
    failed: dict[str, int] = {}

    for row in by_type_status:
        totals[row.type] = totals.get(row.type, 0) + row.cnt
        if row.status == "DONE":
            done[row.type] = done.get(row.type, 0) + row.cnt
        elif row.status == "ESCALATED":
            escalated[row.type] = escalated.get(row.type, 0) + row.cnt
        elif row.status == "FAILED":
            failed[row.type] = failed.get(row.type, 0) + row.cnt

    overall_total = sum(totals.values())
    overall_done = sum(done.values())
    overall_escalated = sum(escalated.values())

    by_type = {}
    for task_type, total in totals.items():
        by_type[task_type] = {
            "total": total,
            "done": done.get(task_type, 0),
            "escalated": escalated.get(task_type, 0),
            "failed": failed.get(task_type, 0),
            "automation_rate_pct": round(done.get(task_type, 0) / total * 100, 2) if total else 0.0,
            "escalation_rate_pct": round(escalated.get(task_type, 0) / total * 100, 2) if total else 0.0,
        }

    return {
        "overall": {
            "total_tasks": overall_total,
            "automation_rate_pct": round(overall_done / overall_total * 100, 2) if overall_total else 0.0,
            "escalation_rate_pct": round(overall_escalated / overall_total * 100, 2) if overall_total else 0.0,
        },
        "by_task_type": by_type,
    }
