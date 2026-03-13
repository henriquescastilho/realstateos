from datetime import date
from decimal import Decimal

from app.models.contract import Contract
from app.models.tenant import Tenant
from app.models.owner import Owner
from app.models.property import Property
from app.models.renter import Renter
from app.services.billing_service import generate_monthly_rent_charge


def test_generate_monthly_rent_charge_uses_first_business_day_when_due_day_is_one(db_session):
    tenant = Tenant(name="Acme Realty")
    owner = Owner(
        tenant=tenant,
        name="Owner One",
        document="123",
        email="owner@example.com",
        phone="5511999999999",
    )
    renter = Renter(
        tenant=tenant,
        name="Renter One",
        document="456",
        email="renter@example.com",
        phone="5511888888888",
    )
    property_record = Property(
        tenant=tenant,
        owner=owner,
        address="Rua A, 100",
        city="Sao Paulo",
        state="SP",
        zip="01000-000",
        iptu_registration_number="IPTU-1",
    )
    contract = Contract(
        tenant=tenant,
        property=property_record,
        renter=renter,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
        monthly_rent=Decimal("2000.00"),
        due_day=1,
    )

    charge = generate_monthly_rent_charge(contract=contract, reference_month=date(2026, 2, 1))

    assert charge.type == "RENT"
    assert charge.amount == Decimal("2000.00")
    assert charge.due_date == date(2026, 2, 2)
    assert charge.source == "SYSTEM"

