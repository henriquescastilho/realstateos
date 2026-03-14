from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.property import Property


def count_properties_for_tenant(db: Session, tenant_id: str) -> int:
    """Return total non-deleted property count for a tenant."""
    return db.scalar(
        select(func.count()).where(
            Property.tenant_id == tenant_id, Property.deleted_at.is_(None)
        )
    ) or 0


def list_properties_for_tenant(db: Session, tenant_id: str) -> list[Property]:
    """List non-deleted properties for a tenant ordered by address.

    Uses selectinload for contracts relationship to avoid N+1 if callers
    iterate over property.contracts.
    -- EXPLAIN ANALYZE: ensure ix_properties_tenant_id is used (covering index on tenant_id)
    """
    statement = (
        select(Property)
        .where(Property.tenant_id == tenant_id, Property.deleted_at.is_(None))
        .options(selectinload(Property.contracts))
        .order_by(Property.address.asc())
    )
    return list(db.scalars(statement).all())


def list_properties_paginated(
    db: Session, tenant_id: str, offset: int, limit: int
) -> list[Property]:
    """Paginated non-deleted property list for a tenant."""
    statement = (
        select(Property)
        .where(Property.tenant_id == tenant_id, Property.deleted_at.is_(None))
        .options(selectinload(Property.contracts))
        .order_by(Property.address.asc())
        .offset(offset)
        .limit(limit)
    )
    return list(db.scalars(statement).all())


def get_property(db: Session, property_id: str, tenant_id: str) -> Property | None:
    """Fetch a single non-deleted property scoped to tenant with eager-loaded contracts."""
    return db.scalar(
        select(Property)
        .where(
            Property.id == property_id,
            Property.tenant_id == tenant_id,
            Property.deleted_at.is_(None),
        )
        .options(selectinload(Property.contracts))
    )
