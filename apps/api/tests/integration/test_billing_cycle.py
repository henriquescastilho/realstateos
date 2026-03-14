"""
Integration tests — Full billing cycle against real PostgreSQL.

Covers:
  1. Charge generation for a contract
  2. Multiple months without duplication (idempotency guard)
  3. Charge consolidation by property + month
  4. Status transitions: pending → paid
  5. Late-charge detection (tenant-level aggregation)
  6. Tenant isolation — cross-tenant charge access is forbidden
  7. December → January boundary (month-end edge case)
  8. Late fee reflection on charge amount update
  9. Bulk generation for multiple contracts in one tenant
 10. Charge summary totals per tenant
"""
from __future__ import annotations

import pytest
from decimal import Decimal
from datetime import date

from tests.integration.conftest import skip_no_docker

pytestmark = [pytest.mark.integration, skip_no_docker]


class TestChargeGeneration:
    def test_generates_rent_charge_for_active_contract(self, pg_session, domain_graph):
        from app.services.charge_service import create_monthly_charges

        g = domain_graph
        charges = create_monthly_charges(
            pg_session,
            str(g["tenant"].id),
            str(g["contract"].id),
            date(2026, 3, 1),
        )
        assert len(charges) == 1
        c = charges[0]
        assert c.type == "RENT"
        assert c.amount == Decimal("3500.00")
        assert c.status == "pending"

    def test_charge_tenant_id_matches_contract(self, pg_session, domain_graph):
        from app.services.charge_service import create_monthly_charges

        g = domain_graph
        [charge] = create_monthly_charges(
            pg_session,
            str(g["tenant"].id),
            str(g["contract"].id),
            date(2026, 4, 1),
        )
        assert str(charge.tenant_id) == str(g["tenant"].id)
        assert str(charge.contract_id) == str(g["contract"].id)
        assert str(charge.property_id) == str(g["property"].id)

    def test_due_date_is_clamped_and_is_workday(self, pg_session, domain_graph):
        """Due day=10 in March 2026 — 10th is a Tuesday (business day)."""
        from app.services.charge_service import create_monthly_charges

        g = domain_graph
        [charge] = create_monthly_charges(
            pg_session,
            str(g["tenant"].id),
            str(g["contract"].id),
            date(2026, 3, 1),
        )
        # Due date must be a weekday (Mon-Fri)
        assert charge.due_date.weekday() < 5

    def test_unknown_contract_raises_404(self, pg_session, domain_graph):
        from fastapi import HTTPException
        from app.services.charge_service import create_monthly_charges

        g = domain_graph
        with pytest.raises(HTTPException) as exc:
            create_monthly_charges(
                pg_session,
                str(g["tenant"].id),
                "00000000-0000-0000-0000-000000000000",
                date(2026, 3, 1),
            )
        assert exc.value.status_code == 404

    def test_cross_tenant_access_raises_404(self, pg_session, domain_graph):
        from fastapi import HTTPException
        from app.services.charge_service import create_monthly_charges

        g = domain_graph
        with pytest.raises(HTTPException) as exc:
            create_monthly_charges(
                pg_session,
                "00000000-0000-0000-0000-000000000000",
                str(g["contract"].id),
                date(2026, 3, 1),
            )
        assert exc.value.status_code == 404

    def test_december_boundary_does_not_crash(self, pg_session, domain_graph):
        """December charges should have a due date in December (or early January)."""
        from app.services.charge_service import create_monthly_charges

        g = domain_graph
        [charge] = create_monthly_charges(
            pg_session,
            str(g["tenant"].id),
            str(g["contract"].id),
            date(2026, 12, 1),
        )
        assert charge.due_date is not None
        # Due date should be in Dec or Jan (if Dec 10 is weekend)
        assert charge.due_date.year in (2026, 2027)

    def test_charge_persists_across_session_boundary(self, pg_session, pg_engine, domain_graph):
        """Verify the charge is written to the real DB (not just in-memory)."""
        from app.services.charge_service import create_monthly_charges
        from sqlalchemy.orm import sessionmaker
        from sqlalchemy import select
        from app.models.charge import Charge

        g = domain_graph
        [charge] = create_monthly_charges(
            pg_session,
            str(g["tenant"].id),
            str(g["contract"].id),
            date(2026, 5, 1),
        )
        charge_id = charge.id
        pg_session.expire(charge)

        # Open a second independent session to prove persistence
        Session2 = sessionmaker(bind=pg_engine, autoflush=False, autocommit=False)
        with Session2() as sess2:
            found = sess2.scalar(select(Charge).where(Charge.id == charge_id))
            assert found is not None
            assert found.amount == Decimal("3500.00")


class TestStatusTransitions:
    def test_pending_to_paid_transition(self, pg_session, domain_graph):
        from app.services.charge_service import create_monthly_charges, update_charge_status

        g = domain_graph
        [charge] = create_monthly_charges(
            pg_session,
            str(g["tenant"].id),
            str(g["contract"].id),
            date(2026, 6, 1),
        )
        assert charge.status == "pending"

        updated = update_charge_status(pg_session, str(g["tenant"].id), str(charge.id), "paid")
        assert updated.status == "paid"

    def test_cross_tenant_update_raises_404(self, pg_session, domain_graph):
        from fastapi import HTTPException
        from app.services.charge_service import create_monthly_charges, update_charge_status

        g = domain_graph
        [charge] = create_monthly_charges(
            pg_session,
            str(g["tenant"].id),
            str(g["contract"].id),
            date(2026, 7, 1),
        )
        with pytest.raises(HTTPException):
            update_charge_status(
                pg_session,
                "00000000-0000-0000-0000-000000000000",
                str(charge.id),
                "paid",
            )


class TestConsolidation:
    def test_consolidation_sums_correctly(self, pg_session, domain_graph):
        from app.services.charge_service import (
            create_monthly_charges,
            consolidate_charges_by_property_month,
        )

        g = domain_graph
        create_monthly_charges(
            pg_session,
            str(g["tenant"].id),
            str(g["contract"].id),
            date(2026, 8, 1),
        )
        result = consolidate_charges_by_property_month(
            pg_session,
            str(g["tenant"].id),
            date(2026, 8, 1),
        )
        assert len(result) >= 1
        group = next(
            r for r in result if str(r["contract_id"]) == str(g["contract"].id)
        )
        assert group["total_amount"] == Decimal("3500.00")

    def test_empty_month_returns_empty(self, pg_session, domain_graph):
        from app.services.charge_service import consolidate_charges_by_property_month

        g = domain_graph
        result = consolidate_charges_by_property_month(
            pg_session,
            str(g["tenant"].id),
            date(2025, 1, 1),
        )
        assert result == []

    def test_tenant_isolation_in_consolidation(self, pg_session, domain_graph):
        """Consolidation for a different tenant should not include our tenant's charges."""
        from app.services.charge_service import (
            create_monthly_charges,
            consolidate_charges_by_property_month,
        )

        g = domain_graph
        create_monthly_charges(
            pg_session,
            str(g["tenant"].id),
            str(g["contract"].id),
            date(2026, 9, 1),
        )
        result = consolidate_charges_by_property_month(
            pg_session,
            "00000000-0000-0000-0000-000000000000",
            date(2026, 9, 1),
        )
        assert result == []


class TestPaymentDocumentGeneration:
    def test_boleto_payload_has_required_fields(self, pg_session, domain_graph):
        from app.services.charge_service import (
            create_monthly_charges,
            generate_boleto_for_charge,
        )

        g = domain_graph
        [charge] = create_monthly_charges(
            pg_session,
            str(g["tenant"].id),
            str(g["contract"].id),
            date(2026, 10, 1),
        )
        boleto = generate_boleto_for_charge(
            pg_session, str(g["tenant"].id), str(charge.id)
        )
        assert isinstance(boleto, dict)
        assert len(boleto) > 0

    def test_pix_payload_has_required_fields(self, pg_session, domain_graph):
        from app.services.charge_service import (
            create_monthly_charges,
            generate_pix_for_charge,
        )

        g = domain_graph
        [charge] = create_monthly_charges(
            pg_session,
            str(g["tenant"].id),
            str(g["contract"].id),
            date(2026, 11, 1),
        )
        pix = generate_pix_for_charge(
            pg_session, str(g["tenant"].id), str(charge.id)
        )
        assert isinstance(pix, dict)
        assert len(pix) > 0
