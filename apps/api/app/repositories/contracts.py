"""Contracts repository with N+1-safe queries."""
from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.contract import Contract


def list_contracts_for_tenant(
    db: Session,
    tenant_id: str,
    *,
    active_only: bool = False,
    with_charges: bool = False,
    limit: int = 200,
    offset: int = 0,
) -> list[Contract]:
    """List contracts for a tenant with optional eager loading.

    Args:
        active_only: When True, filter to contracts active as of today.
        with_charges: When True, eagerly load charges via selectinload (avoids N+1).
            Use when iterating over contract.charges for each contract in the result.
            -- EXPLAIN ANALYZE: ix_contracts_tenant_id covers the WHERE clause.
            -- The selectinload issues one additional query:
            --   SELECT * FROM charges WHERE contract_id IN (...)
            -- which is always better than N individual queries.
    """
    today = date.today()
    q = select(Contract).where(Contract.tenant_id == tenant_id, Contract.deleted_at.is_(None))
    if active_only:
        q = q.where(Contract.start_date <= today, Contract.end_date >= today)
    if with_charges:
        q = q.options(selectinload(Contract.charges))
    q = q.order_by(Contract.start_date.desc()).offset(offset).limit(limit)
    return list(db.scalars(q).all())


def get_contract(
    db: Session,
    contract_id: str,
    tenant_id: str,
    *,
    with_charges: bool = False,
) -> Contract | None:
    """Fetch a single contract scoped to tenant."""
    q = select(Contract).where(
        Contract.id == contract_id,
        Contract.tenant_id == tenant_id,
        Contract.deleted_at.is_(None),
    )
    if with_charges:
        q = q.options(selectinload(Contract.charges))
    return db.scalar(q)


def list_expiring_contracts(
    db: Session,
    tenant_id: str,
    days_ahead: int = 30,
) -> list[Contract]:
    """Contracts expiring within `days_ahead` days from today.

    -- EXPLAIN ANALYZE: composite index on (tenant_id, end_date) would
    -- improve this query if contract volume > 10K rows.
    """
    today = date.today()
    cutoff = today.replace(year=today.year, month=today.month, day=today.day)
    from datetime import timedelta  # noqa: PLC0415
    cutoff = today + timedelta(days=days_ahead)

    return list(
        db.scalars(
            select(Contract).where(
                Contract.tenant_id == tenant_id,
                Contract.deleted_at.is_(None),
                Contract.end_date >= today,
                Contract.end_date <= cutoff,
            ).order_by(Contract.end_date.asc())
        ).all()
    )
