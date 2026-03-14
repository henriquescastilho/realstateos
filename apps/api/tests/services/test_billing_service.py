"""Unit tests for app.services.billing_service."""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from types import SimpleNamespace


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture()
def stub_contract():
    """Minimal Contract-like namespace for billing_service tests (no DB needed)."""
    return SimpleNamespace(
        id=str(uuid.uuid4()),
        tenant_id=str(uuid.uuid4()),
        property_id=str(uuid.uuid4()),
        monthly_rent=Decimal("2500.00"),
        due_day=10,
    )


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestGenerateMonthlyRentCharge:
    def test_returns_charge_with_correct_type(self, stub_contract):
        from app.services.billing_service import generate_monthly_rent_charge
        charge = generate_monthly_rent_charge(stub_contract, date(2026, 3, 1))
        assert charge.type == "RENT"

    def test_amount_matches_contract(self, stub_contract):
        from app.services.billing_service import generate_monthly_rent_charge
        charge = generate_monthly_rent_charge(stub_contract, date(2026, 3, 1))
        assert charge.amount == Decimal("2500.00")

    def test_source_is_system(self, stub_contract):
        from app.services.billing_service import generate_monthly_rent_charge
        charge = generate_monthly_rent_charge(stub_contract, date(2026, 3, 1))
        assert charge.source == "SYSTEM"

    def test_status_is_pending(self, stub_contract):
        from app.services.billing_service import generate_monthly_rent_charge
        charge = generate_monthly_rent_charge(stub_contract, date(2026, 3, 1))
        assert charge.status == "pending"

    def test_tenant_id_propagated(self, stub_contract):
        from app.services.billing_service import generate_monthly_rent_charge
        charge = generate_monthly_rent_charge(stub_contract, date(2026, 3, 1))
        assert charge.tenant_id == stub_contract.tenant_id

    def test_property_id_propagated(self, stub_contract):
        from app.services.billing_service import generate_monthly_rent_charge
        charge = generate_monthly_rent_charge(stub_contract, date(2026, 3, 1))
        assert charge.property_id == stub_contract.property_id

    def test_contract_id_propagated(self, stub_contract):
        from app.services.billing_service import generate_monthly_rent_charge
        charge = generate_monthly_rent_charge(stub_contract, date(2026, 3, 1))
        assert charge.contract_id == stub_contract.id

    def test_description_contains_month_ref(self, stub_contract):
        from app.services.billing_service import generate_monthly_rent_charge
        charge = generate_monthly_rent_charge(stub_contract, date(2026, 4, 1))
        assert "2026-04" in charge.description

    def test_due_date_is_in_reference_month(self, stub_contract):
        from app.services.billing_service import generate_monthly_rent_charge
        stub_contract.due_day = 10
        charge = generate_monthly_rent_charge(stub_contract, date(2026, 3, 1))
        assert charge.due_date.month == 3
        assert charge.due_date.year == 2026

    def test_due_day_clamped_to_end_of_short_month(self, stub_contract):
        """February only has 28/29 days — day 31 should be clamped."""
        from app.services.billing_service import generate_monthly_rent_charge
        stub_contract.due_day = 31
        charge = generate_monthly_rent_charge(stub_contract, date(2026, 2, 1))
        assert charge.due_date.month == 2 or charge.due_date.month == 3  # may push to next biz day
        assert charge.due_date.year == 2026

    def test_due_date_is_business_day(self, stub_contract):
        """due_date must land on weekday."""
        from app.services.billing_service import generate_monthly_rent_charge
        stub_contract.due_day = 1  # 2026-03-01 is a Sunday
        charge = generate_monthly_rent_charge(stub_contract, date(2026, 3, 1))
        assert charge.due_date.weekday() < 5  # 0=Mon ... 4=Fri
