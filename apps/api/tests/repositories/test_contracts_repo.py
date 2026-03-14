"""Unit tests for app.repositories.contracts."""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.models.contract import Contract
from app.models.owner import Owner
from app.models.property import Property
from app.models.renter import Renter
from app.models.tenant import Tenant


@pytest.fixture()
def graph(db_session):
    tenant = Tenant(name="RepoTest")
    owner = Owner(tenant=tenant, name="Owner Repo", document="11144477735", email="o@r.com", phone="11000000001")
    renter = Renter(tenant=tenant, name="Renter Repo", document="52998224725", email="r@r.com", phone="11000000002")
    prop = Property(tenant=tenant, owner=owner, address="Rua Repo, 1", city="SP", state="SP", zip="01000-000")
    contract = Contract(
        tenant=tenant, property=prop, renter=renter,
        start_date=date(2026, 1, 1), end_date=date(2026, 12, 31),
        monthly_rent=Decimal("3000.00"), due_day=10,
    )
    db_session.add_all([tenant, owner, renter, prop, contract])
    db_session.commit()
    for obj in [tenant, owner, renter, prop, contract]:
        db_session.refresh(obj)
    return {"tenant": tenant, "owner": owner, "renter": renter, "property": prop, "contract": contract}


class TestListContractsForTenant:
    def test_returns_contract_for_tenant(self, db_session, graph):
        from app.repositories.contracts import list_contracts_for_tenant
        results = list_contracts_for_tenant(db_session, str(graph["tenant"].id))
        assert any(c.id == graph["contract"].id for c in results)

    def test_tenant_isolation(self, db_session, graph):
        from app.repositories.contracts import list_contracts_for_tenant
        results = list_contracts_for_tenant(db_session, "other-tenant")
        assert not any(c.id == graph["contract"].id for c in results)

    def test_limit_applies(self, db_session, graph):
        from app.repositories.contracts import list_contracts_for_tenant
        results = list_contracts_for_tenant(db_session, str(graph["tenant"].id), limit=1)
        assert len(results) <= 1

    def test_active_only_filter(self, db_session, graph):
        from app.repositories.contracts import list_contracts_for_tenant
        # 2026-01-01 to 2026-12-31 — active on 2026-03-14
        results = list_contracts_for_tenant(db_session, str(graph["tenant"].id), active_only=True)
        assert any(c.id == graph["contract"].id for c in results)

    def test_soft_deleted_not_returned(self, db_session, graph):
        from datetime import datetime, timezone
        from app.repositories.contracts import list_contracts_for_tenant
        # Soft-delete the contract
        graph["contract"].deleted_at = datetime.now(timezone.utc)
        db_session.add(graph["contract"])
        db_session.commit()
        results = list_contracts_for_tenant(db_session, str(graph["tenant"].id))
        assert not any(c.id == graph["contract"].id for c in results)


class TestGetContract:
    def test_returns_contract_by_id(self, db_session, graph):
        from app.repositories.contracts import get_contract
        result = get_contract(db_session, str(graph["contract"].id), str(graph["tenant"].id))
        assert result is not None
        assert result.id == graph["contract"].id

    def test_returns_none_wrong_tenant(self, db_session, graph):
        from app.repositories.contracts import get_contract
        result = get_contract(db_session, str(graph["contract"].id), "wrong-tenant")
        assert result is None

    def test_returns_none_unknown_id(self, db_session, graph):
        from app.repositories.contracts import get_contract
        result = get_contract(db_session, "nonexistent", str(graph["tenant"].id))
        assert result is None

    def test_returns_none_for_soft_deleted(self, db_session, graph):
        from datetime import datetime, timezone
        from app.repositories.contracts import get_contract
        graph["contract"].deleted_at = datetime.now(timezone.utc)
        db_session.add(graph["contract"])
        db_session.commit()
        result = get_contract(db_session, str(graph["contract"].id), str(graph["tenant"].id))
        assert result is None


class TestListExpiringContracts:
    def test_returns_expiring_contract(self, db_session, graph):
        """Contract expires 2026-12-31; with days_ahead=365 it should appear."""
        from app.repositories.contracts import list_expiring_contracts
        results = list_expiring_contracts(db_session, str(graph["tenant"].id), days_ahead=365)
        assert any(c.id == graph["contract"].id for c in results)

    def test_excludes_contracts_beyond_cutoff(self, db_session, graph):
        """With days_ahead=1, the 2026-12-31 contract should NOT appear today."""
        from app.repositories.contracts import list_expiring_contracts
        results = list_expiring_contracts(db_session, str(graph["tenant"].id), days_ahead=1)
        assert not any(c.id == graph["contract"].id for c in results)

    def test_tenant_isolation(self, db_session, graph):
        from app.repositories.contracts import list_expiring_contracts
        results = list_expiring_contracts(db_session, "other-tenant", days_ahead=365)
        assert not any(c.id == graph["contract"].id for c in results)
