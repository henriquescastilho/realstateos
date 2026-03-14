"""Bulk Operations API.

All bulk endpoints accept a list of items, process them, and return a ``job_id``
for async tracking via ``GET /agent-tasks/{job_id}``.

Processing is synchronous within the request — items are handled one-by-one and
the job Task record is updated with per-item results and a final status.

Endpoints
---------
POST   /bulk/contracts        Create multiple contracts in one call
PATCH  /bulk/charges/status   Update status on multiple charges
POST   /bulk/agents/trigger   Trigger the orchestrator agent for multiple contracts
"""
from __future__ import annotations

import logging
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.middleware.tenant import OrgContext, get_current_org
from app.models.charge import Charge
from app.models.task import Task
from app.openapi import AUTH_RESPONSES, RESPONSES_422
from app.schemas.contract import ContractCreate
from app.schemas.task import TaskRead
from app.services.contract_service import create_contract
from app.services.task_service import create_task_record

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bulk", tags=["bulk"])

_MAX_BULK_SIZE = 100  # Maximum items per bulk request


# ---------------------------------------------------------------------------
# Shared schemas
# ---------------------------------------------------------------------------


class BulkJobResponse(BaseModel):
    """Returned by all bulk endpoints."""

    job_id: str = Field(description="Task ID to track progress via GET /agent-tasks/{job_id}")
    status: Literal["DONE", "PARTIAL", "FAILED"] = Field(description="Overall job status")
    total: int = Field(description="Total items submitted")
    processed: int = Field(description="Items processed successfully")
    failed: int = Field(description="Items that failed processing")
    errors: list[dict[str, Any]] = Field(default_factory=list, description="Per-item errors (index + message)")
    results: list[dict[str, Any]] = Field(default_factory=list, description="Per-item results for successful items")


# ---------------------------------------------------------------------------
# POST /bulk/contracts
# ---------------------------------------------------------------------------


class BulkContractCreateRequest(BaseModel):
    """Request body for bulk contract creation."""

    contracts: list[ContractCreate] = Field(
        min_length=1, max_length=_MAX_BULK_SIZE, description="List of contract definitions to create"
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "contracts": [
                        {
                            "property_id": "770e8400-e29b-41d4-a716-446655440002",
                            "renter_id": "660e8400-e29b-41d4-a716-446655440001",
                            "start_date": "2026-01-01",
                            "end_date": "2027-12-31",
                            "monthly_rent": "2500.00",
                            "due_day": 10,
                        }
                    ]
                }
            ]
        }
    }


@router.post(
    "/contracts",
    response_model=BulkJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Bulk create contracts",
    description=(
        "Create multiple rental contracts in a single request (max 100). "
        "Returns a `job_id` for tracking via `GET /agent-tasks/{job_id}`. "
        "Each contract is validated independently — partial success is possible "
        "(status `PARTIAL`). Failed items include index and error message."
    ),
    responses={**AUTH_RESPONSES, **RESPONSES_422},
)
def bulk_create_contracts(
    payload: BulkContractCreateRequest,
    org: OrgContext = Depends(get_current_org),
    db: Session = Depends(get_db),
) -> BulkJobResponse:
    """Create multiple contracts, returning a job_id for tracking."""
    # Create a parent job task
    job_task = create_task_record(
        db,
        tenant_id=org.tenant_id,
        task_type="BULK_CREATE_CONTRACTS",
        status_value="RUNNING",
        message=f"Bulk creating {len(payload.contracts)} contracts",
        payload={"total": len(payload.contracts)},
    )
    job_id = job_task.id

    results: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    for idx, contract_data in enumerate(payload.contracts):
        try:
            contract = create_contract(db, org.tenant_id, contract_data)
            results.append({"index": idx, "id": contract.id, "status": "created"})
        except HTTPException as exc:
            errors.append({"index": idx, "message": exc.detail})
        except Exception as exc:  # noqa: BLE001
            logger.warning("bulk_create_contracts: item %d failed: %s", idx, exc)
            errors.append({"index": idx, "message": str(exc)})

    # Determine final status
    processed = len(results)
    failed = len(errors)
    if failed == 0:
        final_status: Literal["DONE", "PARTIAL", "FAILED"] = "DONE"
    elif processed == 0:
        final_status = "FAILED"
    else:
        final_status = "PARTIAL"

    # Update the job task
    job_task.status = final_status
    job_task.payload = {
        **job_task.payload,
        "processed": processed,
        "failed": failed,
        "results": results,
        "errors": errors,
    }
    db.add(job_task)
    db.commit()

    logger.info(
        "bulk_create_contracts: tenant=%s job=%s total=%d processed=%d failed=%d",
        org.tenant_id, job_id, len(payload.contracts), processed, failed,
    )

    return BulkJobResponse(
        job_id=job_id,
        status=final_status,
        total=len(payload.contracts),
        processed=processed,
        failed=failed,
        errors=errors,
        results=results,
    )


# ---------------------------------------------------------------------------
# PATCH /bulk/charges/status
# ---------------------------------------------------------------------------

_VALID_CHARGE_STATUSES = {"pending", "paid", "overdue", "partial", "cancelled"}


class BulkChargeStatusRequest(BaseModel):
    """Request body for bulk charge status update."""

    charge_ids: list[str] = Field(
        min_length=1, max_length=_MAX_BULK_SIZE, description="List of charge UUIDs to update"
    )
    status: str = Field(description="New status to apply to all listed charges")

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        normalized = v.lower().strip()
        if normalized not in _VALID_CHARGE_STATUSES:
            raise ValueError(f"status must be one of: {', '.join(sorted(_VALID_CHARGE_STATUSES))}")
        return normalized

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "charge_ids": [
                        "550e8400-e29b-41d4-a716-446655440000",
                        "550e8400-e29b-41d4-a716-446655440001",
                    ],
                    "status": "paid",
                }
            ]
        }
    }


@router.patch(
    "/charges/status",
    response_model=BulkJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Bulk update charge status",
    description=(
        "Update the status of multiple charges in one request (max 100). "
        "Valid statuses: `pending`, `paid`, `overdue`, `partial`, `cancelled`. "
        "Returns a `job_id` for tracking. Charges not belonging to the tenant are skipped (not an error). "
        "Partial success is reported when some charge IDs are not found."
    ),
    responses={**AUTH_RESPONSES, **RESPONSES_422},
)
def bulk_update_charge_status(
    payload: BulkChargeStatusRequest,
    org: OrgContext = Depends(get_current_org),
    db: Session = Depends(get_db),
) -> BulkJobResponse:
    """Bulk update charge status, returning a job_id for tracking."""
    job_task = create_task_record(
        db,
        tenant_id=org.tenant_id,
        task_type="BULK_UPDATE_CHARGE_STATUS",
        status_value="RUNNING",
        message=f"Bulk updating {len(payload.charge_ids)} charges to status '{payload.status}'",
        payload={"total": len(payload.charge_ids), "new_status": payload.status},
    )
    job_id = job_task.id

    results: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    for idx, charge_id in enumerate(payload.charge_ids):
        charge = db.scalar(
            select(Charge).where(Charge.id == charge_id, Charge.tenant_id == org.tenant_id)
        )
        if charge is None:
            errors.append({"index": idx, "charge_id": charge_id, "message": "Charge not found"})
            continue
        try:
            old_status = charge.status
            charge.status = payload.status
            db.add(charge)
            results.append({
                "index": idx,
                "charge_id": charge_id,
                "old_status": old_status,
                "new_status": payload.status,
            })
        except Exception as exc:  # noqa: BLE001
            logger.warning("bulk_update_charge_status: charge %s failed: %s", charge_id, exc)
            errors.append({"index": idx, "charge_id": charge_id, "message": str(exc)})

    db.commit()

    processed = len(results)
    failed = len(errors)
    if failed == 0:
        final_status: Literal["DONE", "PARTIAL", "FAILED"] = "DONE"
    elif processed == 0:
        final_status = "FAILED"
    else:
        final_status = "PARTIAL"

    job_task.status = final_status
    job_task.payload = {
        **job_task.payload,
        "processed": processed,
        "failed": failed,
        "results": results,
        "errors": errors,
    }
    db.add(job_task)
    db.commit()

    logger.info(
        "bulk_update_charge_status: tenant=%s job=%s total=%d processed=%d failed=%d",
        org.tenant_id, job_id, len(payload.charge_ids), processed, failed,
    )

    return BulkJobResponse(
        job_id=job_id,
        status=final_status,
        total=len(payload.charge_ids),
        processed=processed,
        failed=failed,
        errors=errors,
        results=results,
    )


# ---------------------------------------------------------------------------
# POST /bulk/agents/trigger
# ---------------------------------------------------------------------------


class BulkAgentTriggerRequest(BaseModel):
    """Request body for triggering the orchestrator agent on multiple contracts."""

    contract_ids: list[str] = Field(
        min_length=1, max_length=_MAX_BULK_SIZE, description="List of contract UUIDs to process"
    )
    task_type: str = Field(
        description=(
            "Agent task type to trigger. One of: "
            "GENERATE_MONTHLY_CHARGE, PAYMENT_RECONCILIATION, SEND_PAYMENT_REMINDER, "
            "PORTFOLIO_ANALYSIS, MAINTENANCE_TRIAGE"
        )
    )
    context: dict[str, Any] = Field(
        default_factory=dict, description="Additional context passed to the agent"
    )

    @field_validator("task_type")
    @classmethod
    def validate_task_type(cls, v: str) -> str:
        allowed = {
            "GENERATE_MONTHLY_CHARGE",
            "PAYMENT_RECONCILIATION",
            "SEND_PAYMENT_REMINDER",
            "PORTFOLIO_ANALYSIS",
            "MAINTENANCE_TRIAGE",
        }
        normalized = v.strip().upper()
        if normalized not in allowed:
            raise ValueError(f"task_type must be one of: {', '.join(sorted(allowed))}")
        return normalized

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "contract_ids": [
                        "880e8400-e29b-41d4-a716-446655440003",
                        "880e8400-e29b-41d4-a716-446655440004",
                    ],
                    "task_type": "GENERATE_MONTHLY_CHARGE",
                    "context": {"reference_month": "2026-03-01"},
                }
            ]
        }
    }


@router.post(
    "/agents/trigger",
    response_model=BulkJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Bulk trigger agent tasks",
    description=(
        "Queue agent tasks for a list of contracts (max 100). "
        "Each contract gets its own PENDING agent task that the orchestrator picks up. "
        "Returns a parent `job_id` for tracking the overall batch. "
        "Individual task IDs are included in `results` for granular tracking. "
        "Allowed task types: `GENERATE_MONTHLY_CHARGE`, `PAYMENT_RECONCILIATION`, "
        "`SEND_PAYMENT_REMINDER`, `PORTFOLIO_ANALYSIS`, `MAINTENANCE_TRIAGE`."
    ),
    responses={**AUTH_RESPONSES, **RESPONSES_422},
)
def bulk_trigger_agents(
    payload: BulkAgentTriggerRequest,
    org: OrgContext = Depends(get_current_org),
    db: Session = Depends(get_db),
) -> BulkJobResponse:
    """Queue individual agent tasks for each contract, returning a parent job_id."""
    # Parent job task for tracking the batch
    job_task = create_task_record(
        db,
        tenant_id=org.tenant_id,
        task_type="BULK_AGENT_TRIGGER",
        status_value="RUNNING",
        message=(
            f"Bulk triggering {payload.task_type} for "
            f"{len(payload.contract_ids)} contracts"
        ),
        payload={
            "total": len(payload.contract_ids),
            "agent_task_type": payload.task_type,
            "context": payload.context,
        },
    )
    job_id = job_task.id

    results: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    for idx, contract_id in enumerate(payload.contract_ids):
        try:
            child_task = create_task_record(
                db,
                tenant_id=org.tenant_id,
                task_type=payload.task_type,
                status_value="PENDING",
                message=f"Queued by bulk trigger job {job_id}",
                payload={
                    "contract_id": contract_id,
                    "parent_job_id": job_id,
                    **payload.context,
                },
                contract_id=contract_id,
            )
            results.append({
                "index": idx,
                "contract_id": contract_id,
                "task_id": child_task.id,
                "status": "queued",
            })
        except Exception as exc:  # noqa: BLE001
            logger.warning("bulk_trigger_agents: contract %s failed: %s", contract_id, exc)
            errors.append({"index": idx, "contract_id": contract_id, "message": str(exc)})

    processed = len(results)
    failed = len(errors)
    if failed == 0:
        final_status: Literal["DONE", "PARTIAL", "FAILED"] = "DONE"
    elif processed == 0:
        final_status = "FAILED"
    else:
        final_status = "PARTIAL"

    job_task.status = final_status
    job_task.payload = {
        **job_task.payload,
        "processed": processed,
        "failed": failed,
        "child_task_ids": [r["task_id"] for r in results],
        "errors": errors,
    }
    db.add(job_task)
    db.commit()

    logger.info(
        "bulk_trigger_agents: tenant=%s job=%s type=%s total=%d queued=%d failed=%d",
        org.tenant_id, job_id, payload.task_type,
        len(payload.contract_ids), processed, failed,
    )

    return BulkJobResponse(
        job_id=job_id,
        status=final_status,
        total=len(payload.contract_ids),
        processed=processed,
        failed=failed,
        errors=errors,
        results=results,
    )
