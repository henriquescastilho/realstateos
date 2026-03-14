"""Multi-tenant middleware — extracts and validates organization context.

Usage as a FastAPI dependency:

    @router.get("/contracts")
    def list_contracts(org: OrgContext = Depends(get_current_org), db: Session = Depends(get_db)):
        return db.scalars(select(Contract).where(Contract.tenant_id == org.tenant_id)).all()
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, get_current_user, get_optional_user
from app.api.deps import get_db
from app.models.tenant import Tenant
from app.services.demo_tenant import get_or_create_demo_tenant

logger = logging.getLogger(__name__)


@dataclass
class OrgContext:
    """Resolved tenant context attached to every authenticated request."""

    tenant_id: str
    tenant_name: str
    user_id: str | None = None
    role: str | None = None


def get_current_org(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrgContext:
    """Dependency that enforces tenant isolation — requires authentication.

    Validates that the tenant referenced in the JWT actually exists in the DB.
    Raises 403 if the tenant is not found (prevents token forgery attacks).
    """
    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        logger.warning(
            "JWT references non-existent tenant_id=%s user_id=%s",
            current_user.tenant_id,
            current_user.user_id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant not found or access denied",
        )
    return OrgContext(
        tenant_id=tenant.id,
        tenant_name=tenant.name,
        user_id=current_user.user_id,
        role=current_user.role,
    )


def get_demo_or_authed_org(
    current_user: CurrentUser | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> OrgContext:
    """Dependency for routes that accept both authenticated and demo (unauthenticated) requests.

    If a valid JWT is supplied, uses that tenant.
    Otherwise falls back to the demo tenant (hackathon compatibility).
    """
    if current_user is not None:
        tenant = db.get(Tenant, current_user.tenant_id)
        if tenant is not None:
            return OrgContext(
                tenant_id=tenant.id,
                tenant_name=tenant.name,
                user_id=current_user.user_id,
                role=current_user.role,
            )

    # Fallback: demo tenant (keeps /demo/* and existing routes working)
    demo = get_or_create_demo_tenant(db)
    return OrgContext(tenant_id=demo.id, tenant_name=demo.name)


class TenantScopedSession:
    """Context manager that wraps a DB session with automatic tenant scoping.

    Usage:
        with TenantScopedSession(db, org.tenant_id) as ts:
            results = ts.query(Contract).all()  # automatically filtered by tenant_id
    """

    def __init__(self, db: Session, tenant_id: str) -> None:
        self._db = db
        self.tenant_id = tenant_id

    def __enter__(self) -> "TenantScopedSession":
        return self

    def __exit__(self, *args: object) -> None:
        pass  # Session lifecycle managed externally

    def query(self, model: type) -> "TenantScopedQuery":
        return TenantScopedQuery(self._db, model, self.tenant_id)


class TenantScopedQuery:
    """Thin query wrapper that auto-applies tenant_id filter."""

    def __init__(self, db: Session, model: type, tenant_id: str) -> None:
        from sqlalchemy import select  # noqa: PLC0415

        self._query = select(model).where(model.tenant_id == tenant_id)  # type: ignore[attr-defined]
        self._db = db

    def filter(self, *criteria: object) -> "TenantScopedQuery":
        self._query = self._query.filter(*criteria)  # type: ignore[arg-type]
        return self

    def all(self) -> list:
        return list(self._db.scalars(self._query).all())

    def first(self) -> object | None:
        return self._db.scalar(self._query)
