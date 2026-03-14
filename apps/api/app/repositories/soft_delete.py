"""Soft-delete helper functions for all models using SoftDeleteMixin.

Provides:
- soft_delete(db, model, record_id, tenant_id) — sets deleted_at
- restore(db, model, record_id, tenant_id) — clears deleted_at
- is_deleted_filter() — SQLAlchemy filter clause for active records

Usage:
    from app.repositories.soft_delete import soft_delete, restore

    # Soft delete a contract
    contract = soft_delete(db, Contract, contract_id, tenant_id=org.tenant_id)

    # Restore it
    contract = restore(db, Contract, contract_id, tenant_id=org.tenant_id)
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Type, TypeVar

from sqlalchemy import select
from sqlalchemy.orm import Session

T = TypeVar("T")


def soft_delete(
    db: Session,
    model: Type[T],
    record_id: str,
    tenant_id: str,
) -> T | None:
    """Mark a record as deleted by setting deleted_at to now.

    Returns the updated record, or None if not found.
    Only operates on records belonging to the given tenant.
    """
    record = db.scalar(
        select(model).where(
            model.id == record_id,
            model.tenant_id == tenant_id,
            model.deleted_at.is_(None),
        )
    )
    if record is None:
        return None
    record.deleted_at = datetime.now(tz=timezone.utc)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def restore(
    db: Session,
    model: Type[T],
    record_id: str,
    tenant_id: str,
) -> T | None:
    """Restore a soft-deleted record by clearing deleted_at.

    Returns the restored record, or None if not found.
    Only operates on deleted records belonging to the given tenant.
    """
    record = db.scalar(
        select(model).where(
            model.id == record_id,
            model.tenant_id == tenant_id,
            model.deleted_at.is_not(None),
        )
    )
    if record is None:
        return None
    record.deleted_at = None
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def active_filter(model: Type[Any]):
    """SQLAlchemy WHERE clause that excludes soft-deleted records.

    Usage:
        q = select(Contract).where(Contract.tenant_id == tid, *active_filter(Contract))
    """
    return [model.deleted_at.is_(None)]
