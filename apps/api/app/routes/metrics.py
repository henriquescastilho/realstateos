"""Prometheus-compatible /metrics endpoint.

Exposes application-level metrics in Prometheus text format.
No external dependency — metrics are computed on-demand from DB queries.

Tracked metrics (matching fix_plan.md spec):
    active_contracts_total
    charges_generated_total
    payments_reconciled_total
    agent_tasks_by_status{status}
    agent_tasks_by_type{type}
    escalations_total
"""
from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.charge import Charge
from app.models.contract import Contract
from app.models.task import Task

logger = logging.getLogger(__name__)
router = APIRouter(tags=["metrics"])

# Track application start time for uptime metric
_START_TIME = time.time()


def _prom_line(metric: str, labels: dict | None, value: float | int, help_text: str = "") -> str:
    """Format a single Prometheus metric line."""
    label_str = ""
    if labels:
        parts = [f'{k}="{v}"' for k, v in labels.items()]
        label_str = "{" + ",".join(parts) + "}"
    return f"{metric}{label_str} {value}"


@router.get(
    "/metrics",
    response_class=PlainTextResponse,
    summary="Prometheus metrics",
    description=(
        "Prometheus text-format metrics endpoint. "
        "Metrics are computed on-demand from DB queries. "
        "No authentication required — restrict access at the network/ingress level in production. "
        "Tracked metrics: `active_contracts_total`, `charges_generated_total`, "
        "`payments_reconciled_total`, `agent_tasks_by_status{status}`, "
        "`agent_tasks_by_type{type}`, `escalations_total`, `process_uptime_seconds`."
    ),
)
def prometheus_metrics(db: Session = Depends(get_db)) -> str:
    """Prometheus text format metrics endpoint.

    Can be scraped by Prometheus or consumed by Grafana.
    No authentication required (typically accessed from internal network only).
    """
    lines: list[str] = []

    def section(name: str, help_text: str, metric_type: str = "gauge") -> None:
        lines.append(f"# HELP {name} {help_text}")
        lines.append(f"# TYPE {name} {metric_type}")

    try:
        # ----------------------------------------------------------------
        # active_contracts_total
        # ----------------------------------------------------------------
        section("realestateos_active_contracts_total", "Number of active contracts")
        from datetime import date  # noqa: PLC0415

        today = date.today()
        active_contracts = db.scalar(
            select(func.count()).select_from(Contract).where(
                Contract.start_date <= today,
                Contract.end_date >= today,
            )
        ) or 0
        lines.append(_prom_line("realestateos_active_contracts_total", None, active_contracts))

        # ----------------------------------------------------------------
        # charges_generated_total (by status)
        # ----------------------------------------------------------------
        section("realestateos_charges_total", "Total charges by status", "counter")
        charge_rows = db.execute(
            select(Charge.status, func.count().label("cnt")).group_by(Charge.status)
        ).all()
        for row in charge_rows:
            lines.append(_prom_line("realestateos_charges_total", {"status": row.status}, row.cnt))
        if not charge_rows:
            lines.append(_prom_line("realestateos_charges_total", {"status": "none"}, 0))

        # ----------------------------------------------------------------
        # payments_reconciled_total
        # ----------------------------------------------------------------
        section("realestateos_payments_reconciled_total", "Charges with status=paid", "counter")
        reconciled = db.scalar(
            select(func.count()).select_from(Charge).where(Charge.status == "paid")
        ) or 0
        lines.append(_prom_line("realestateos_payments_reconciled_total", None, reconciled))

        # ----------------------------------------------------------------
        # agent_tasks_by_status
        # ----------------------------------------------------------------
        section("realestateos_agent_tasks_total", "Agent tasks by status", "gauge")
        task_status_rows = db.execute(
            select(Task.status, func.count().label("cnt")).group_by(Task.status)
        ).all()
        for row in task_status_rows:
            lines.append(
                _prom_line("realestateos_agent_tasks_total", {"status": row.status}, row.cnt)
            )
        if not task_status_rows:
            lines.append(_prom_line("realestateos_agent_tasks_total", {"status": "none"}, 0))

        # ----------------------------------------------------------------
        # agent_tasks_by_type
        # ----------------------------------------------------------------
        section("realestateos_agent_tasks_by_type_total", "Agent tasks by type", "gauge")
        task_type_rows = db.execute(
            select(Task.type, func.count().label("cnt")).group_by(Task.type)
        ).all()
        for row in task_type_rows:
            lines.append(
                _prom_line("realestateos_agent_tasks_by_type_total", {"type": row.type}, row.cnt)
            )
        if not task_type_rows:
            lines.append(
                _prom_line("realestateos_agent_tasks_by_type_total", {"type": "none"}, 0)
            )

        # ----------------------------------------------------------------
        # escalations_total
        # ----------------------------------------------------------------
        section("realestateos_escalations_total", "Tasks escalated for human review", "counter")
        escalations = db.scalar(
            select(func.count()).select_from(Task).where(Task.status == "ESCALATED")
        ) or 0
        lines.append(_prom_line("realestateos_escalations_total", None, escalations))

        # ----------------------------------------------------------------
        # process uptime
        # ----------------------------------------------------------------
        section("realestateos_uptime_seconds", "Process uptime in seconds")
        lines.append(_prom_line("realestateos_uptime_seconds", None, round(time.time() - _START_TIME, 1)))

    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to collect metrics: %s", exc)
        lines.append("# ERROR collecting metrics")

    return "\n".join(lines) + "\n"
