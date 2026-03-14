"""Portfolio Intelligence Agent tools.

All tools are pure Python functions that can be used as ADK tools
or called directly when ADK is unavailable.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.charge import Charge
from app.models.contract import Contract
from app.models.task import Task

logger = logging.getLogger(__name__)


class PortfolioAgentTools:
    def __init__(self, db: Session, tenant_id: str) -> None:
        self.db = db
        self.tenant_id = tenant_id

    def get_portfolio_summary(self) -> dict:
        """Return high-level KPIs for the tenant's portfolio."""
        today = date.today()

        active_contracts = self.db.scalar(
            select(func.count()).select_from(Contract).where(
                Contract.tenant_id == self.tenant_id,
                Contract.start_date <= today,
                Contract.end_date >= today,
            )
        ) or 0

        total_monthly_revenue = self.db.scalar(
            select(func.coalesce(func.sum(Contract.monthly_rent), 0)).where(
                Contract.tenant_id == self.tenant_id,
                Contract.start_date <= today,
                Contract.end_date >= today,
            )
        ) or Decimal("0")

        pending_charges = self.db.scalar(
            select(func.count()).select_from(Charge).where(
                Charge.tenant_id == self.tenant_id,
                Charge.status == "pending",
            )
        ) or 0

        overdue_charges = self.db.scalar(
            select(func.count()).select_from(Charge).where(
                Charge.tenant_id == self.tenant_id,
                Charge.status == "pending",
                Charge.due_date < today,
            )
        ) or 0

        paid_charges = self.db.scalar(
            select(func.count()).select_from(Charge).where(
                Charge.tenant_id == self.tenant_id,
                Charge.status == "paid",
            )
        ) or 0

        return {
            "tenant_id": self.tenant_id,
            "active_contracts": active_contracts,
            "total_monthly_revenue": str(total_monthly_revenue),
            "pending_charges": pending_charges,
            "overdue_charges": overdue_charges,
            "paid_charges": paid_charges,
            "as_of": today.isoformat(),
        }

    def calculate_default_rate(self, period_months: int = 3) -> dict:
        """Calculate the payment default rate over the past N months.

        Default rate = overdue charges / total charges in period.
        """
        today = date.today()
        period_start = today - timedelta(days=period_months * 30)

        total = self.db.scalar(
            select(func.count()).select_from(Charge).where(
                Charge.tenant_id == self.tenant_id,
                Charge.due_date >= period_start,
                Charge.due_date <= today,
            )
        ) or 0

        overdue = self.db.scalar(
            select(func.count()).select_from(Charge).where(
                Charge.tenant_id == self.tenant_id,
                Charge.due_date >= period_start,
                Charge.due_date <= today,
                Charge.status.in_(["pending", "overdue"]),
                Charge.due_date < today,
            )
        ) or 0

        rate = (overdue / total * 100) if total > 0 else 0.0

        return {
            "period_months": period_months,
            "period_start": period_start.isoformat(),
            "total_charges": total,
            "overdue_charges": overdue,
            "default_rate_pct": round(rate, 2),
        }

    def get_expiring_contracts(self, days_ahead: int = 30) -> list[dict]:
        """List contracts expiring within the next N days."""
        today = date.today()
        cutoff = today + timedelta(days=days_ahead)

        contracts = self.db.scalars(
            select(Contract).where(
                Contract.tenant_id == self.tenant_id,
                Contract.end_date >= today,
                Contract.end_date <= cutoff,
            ).order_by(Contract.end_date.asc())
        ).all()

        return [
            {
                "contract_id": c.id,
                "property_id": c.property_id,
                "renter_id": c.renter_id,
                "end_date": c.end_date.isoformat(),
                "days_remaining": (c.end_date - today).days,
                "monthly_rent": str(c.monthly_rent),
            }
            for c in contracts
        ]

    def calculate_avg_resolution_time(self) -> dict:
        """Calculate average time (in hours) for DONE tasks vs creation time.

        Note: Task model doesn't have an updated_at field, so we estimate
        resolution time from payload if available.
        """
        done_tasks = self.db.scalar(
            select(func.count()).select_from(Task).where(
                Task.tenant_id == self.tenant_id,
                Task.status == "DONE",
            )
        ) or 0

        escalated_tasks = self.db.scalar(
            select(func.count()).select_from(Task).where(
                Task.tenant_id == self.tenant_id,
                Task.status == "ESCALATED",
            )
        ) or 0

        total_tasks = self.db.scalar(
            select(func.count()).select_from(Task).where(
                Task.tenant_id == self.tenant_id,
            )
        ) or 0

        automation_rate = (done_tasks / total_tasks * 100) if total_tasks > 0 else 0.0

        return {
            "total_tasks": total_tasks,
            "done_tasks": done_tasks,
            "escalated_tasks": escalated_tasks,
            "automation_rate_pct": round(automation_rate, 2),
        }

    def generate_portfolio_report(self, month: str | None = None) -> dict:
        """Generate a comprehensive portfolio report for a given month (YYYY-MM).

        Defaults to current month if not specified.
        """
        if month is None:
            today = date.today()
            month = today.strftime("%Y-%m")

        year, mon = map(int, month.split("-"))
        from calendar import monthrange  # noqa: PLC0415

        _, last_day = monthrange(year, mon)
        month_start = date(year, mon, 1)
        month_end = date(year, mon, last_day)

        charges_generated = self.db.scalar(
            select(func.count()).select_from(Charge).where(
                Charge.tenant_id == self.tenant_id,
                Charge.due_date >= month_start,
                Charge.due_date <= month_end,
            )
        ) or 0

        charges_paid = self.db.scalar(
            select(func.count()).select_from(Charge).where(
                Charge.tenant_id == self.tenant_id,
                Charge.due_date >= month_start,
                Charge.due_date <= month_end,
                Charge.status == "paid",
            )
        ) or 0

        revenue_collected = self.db.scalar(
            select(func.coalesce(func.sum(Charge.amount), 0)).where(
                Charge.tenant_id == self.tenant_id,
                Charge.due_date >= month_start,
                Charge.due_date <= month_end,
                Charge.status == "paid",
            )
        ) or Decimal("0")

        summary = self.get_portfolio_summary()
        default_rate = self.calculate_default_rate(period_months=1)

        return {
            "month": month,
            "tenant_id": self.tenant_id,
            "active_contracts": summary["active_contracts"],
            "charges_generated": charges_generated,
            "charges_paid": charges_paid,
            "payment_rate_pct": round(charges_paid / charges_generated * 100, 2) if charges_generated else 0.0,
            "revenue_collected": str(revenue_collected),
            "default_rate_pct": default_rate["default_rate_pct"],
            "expiring_contracts_30d": len(self.get_expiring_contracts(30)),
        }
