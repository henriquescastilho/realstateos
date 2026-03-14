"""Unit tests for app.services.charge_service."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.models.charge import Charge
from app.models.contract import Contract
from app.models.owner import Owner
from app.models.property import Property
from app.models.renter import Renter
from app.models.tenant import Tenant


@pytest.fixture()
def contract_graph(db_session):
    """Minimal DB graph: tenant + owner + renter + property + contract."""
    tenant = Tenant(name="CS Test")
    owner = Owner(tenant=tenant, name="Owner CS", document="11144477735", email="o@cs.com", phone="11000000001")
    renter = Renter(tenant=tenant, name="Renter CS", document="52998224725", email="r@cs.com", phone="11000000002")
    prop = Property(
        tenant=tenant, owner=owner,
        address="Rua Teste, 1", city="SP", state="SP", zip="01000-000",
    )
    contract = Contract(
        tenant=tenant, property=prop, renter=renter,
        start_date=date(2026, 1, 1), end_date=date(2026, 12, 31),
        monthly_rent=Decimal("2000.00"), due_day=10,
    )
    db_session.add_all([tenant, owner, renter, prop, contract])
    db_session.commit()
    for obj in [tenant, owner, renter, prop, contract]:
        db_session.refresh(obj)
    return {"tenant": tenant, "owner": owner, "renter": renter, "property": prop, "contract": contract}


class TestCreateMonthlyCharges:
    def test_creates_charge_for_valid_contract(self, db_session, contract_graph):
        from app.services.charge_service import create_monthly_charges
        g = contract_graph
        charges = create_monthly_charges(db_session, str(g["tenant"].id), str(g["contract"].id), date(2026, 3, 1))
        assert len(charges) == 1
        assert charges[0].type == "RENT"
        assert charges[0].amount == Decimal("2000.00")

    def test_raises_404_for_unknown_contract(self, db_session, contract_graph):
        from app.services.charge_service import create_monthly_charges
        g = contract_graph
        with pytest.raises(HTTPException) as exc:
            create_monthly_charges(db_session, str(g["tenant"].id), "nonexistent-id", date(2026, 3, 1))
        assert exc.value.status_code == 404

    def test_tenant_isolation_raises_404(self, db_session, contract_graph):
        from app.services.charge_service import create_monthly_charges
        g = contract_graph
        with pytest.raises(HTTPException) as exc:
            create_monthly_charges(db_session, "wrong-tenant", str(g["contract"].id), date(2026, 3, 1))
        assert exc.value.status_code == 404


class TestGetChargeForTenant:
    def test_returns_existing_charge(self, db_session, contract_graph):
        from app.services.charge_service import create_monthly_charges, get_charge_for_tenant
        g = contract_graph
        [charge] = create_monthly_charges(db_session, str(g["tenant"].id), str(g["contract"].id), date(2026, 4, 1))
        result = get_charge_for_tenant(db_session, str(g["tenant"].id), str(charge.id))
        assert result.id == charge.id

    def test_raises_404_for_wrong_tenant(self, db_session, contract_graph):
        from app.services.charge_service import create_monthly_charges, get_charge_for_tenant
        g = contract_graph
        [charge] = create_monthly_charges(db_session, str(g["tenant"].id), str(g["contract"].id), date(2026, 5, 1))
        with pytest.raises(HTTPException) as exc:
            get_charge_for_tenant(db_session, "wrong-tenant", str(charge.id))
        assert exc.value.status_code == 404


class TestUpdateChargeStatus:
    def test_updates_status(self, db_session, contract_graph):
        from app.services.charge_service import create_monthly_charges, update_charge_status
        g = contract_graph
        [charge] = create_monthly_charges(db_session, str(g["tenant"].id), str(g["contract"].id), date(2026, 6, 1))
        updated = update_charge_status(db_session, str(g["tenant"].id), str(charge.id), "paid")
        assert updated.status == "paid"


class TestGenerateBoletoForCharge:
    def test_returns_dict_with_keys(self, db_session, contract_graph):
        from app.services.charge_service import create_monthly_charges, generate_boleto_for_charge
        g = contract_graph
        [charge] = create_monthly_charges(db_session, str(g["tenant"].id), str(g["contract"].id), date(2026, 7, 1))
        result = generate_boleto_for_charge(db_session, str(g["tenant"].id), str(charge.id))
        assert isinstance(result, dict)
        assert len(result) > 0

    def test_raises_404_for_wrong_tenant(self, db_session, contract_graph):
        from app.services.charge_service import create_monthly_charges, generate_boleto_for_charge
        g = contract_graph
        [charge] = create_monthly_charges(db_session, str(g["tenant"].id), str(g["contract"].id), date(2026, 8, 1))
        with pytest.raises(HTTPException):
            generate_boleto_for_charge(db_session, "wrong-tenant", str(charge.id))


class TestConsolidateChargesByPropertyMonth:
    def test_groups_charges_correctly(self, db_session, contract_graph):
        from app.services.charge_service import create_monthly_charges, consolidate_charges_by_property_month
        g = contract_graph
        create_monthly_charges(db_session, str(g["tenant"].id), str(g["contract"].id), date(2026, 9, 1))
        result = consolidate_charges_by_property_month(db_session, str(g["tenant"].id), date(2026, 9, 1))
        assert len(result) >= 1
        assert result[0]["total_amount"] == Decimal("2000.00")

    def test_empty_month_returns_empty_list(self, db_session, contract_graph):
        from app.services.charge_service import consolidate_charges_by_property_month
        g = contract_graph
        result = consolidate_charges_by_property_month(db_session, str(g["tenant"].id), date(2025, 1, 1))
        assert result == []

    def test_december_edge_case(self, db_session, contract_graph):
        """December month_end should be January of next year without crashing."""
        from app.services.charge_service import create_monthly_charges, consolidate_charges_by_property_month
        g = contract_graph
        create_monthly_charges(db_session, str(g["tenant"].id), str(g["contract"].id), date(2026, 12, 1))
        result = consolidate_charges_by_property_month(db_session, str(g["tenant"].id), date(2026, 12, 1))
        assert isinstance(result, list)
