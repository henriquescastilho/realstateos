from datetime import date
from decimal import Decimal

from app.models.charge import Charge
from app.models.contract import Contract
from app.models.owner import Owner
from app.models.property import Property
from app.models.renter import Renter
from app.models.tenant import Tenant
from app.services.charge_service import consolidate_charges_by_property_month


def test_consolidate_charges_groups_items_by_property_and_month(db_session):
    tenant = Tenant(name="Consolidation Realty")
    owner = Owner(
        tenant=tenant,
        name="Owner Consolidated",
        document="123",
        email="owner@consolidated.com",
        phone="1111",
    )
    renter = Renter(
        tenant=tenant,
        name="Renter Consolidated",
        document="456",
        email="renter@consolidated.com",
        phone="2222",
    )
    property_record = Property(
        tenant=tenant,
        owner=owner,
        address="Rua Consolidada, 100",
        city="Sao Paulo",
        state="SP",
        zip="01000-000",
        iptu_registration_number="IPTU-C",
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
    db_session.add_all([tenant, owner, renter, property_record, contract])
    db_session.flush()

    db_session.add_all(
        [
            Charge(
                tenant_id=tenant.id,
                property_id=property_record.id,
                contract_id=contract.id,
                type="RENT",
                description="Rent",
                amount=Decimal("2000.00"),
                due_date=date(2026, 2, 2),
                source="SYSTEM",
                status="pending",
            ),
            Charge(
                tenant_id=tenant.id,
                property_id=property_record.id,
                contract_id=contract.id,
                type="CONDO",
                description="Condo",
                amount=Decimal("500.00"),
                due_date=date(2026, 2, 5),
                source="EMAIL",
                status="pending",
            ),
            Charge(
                tenant_id=tenant.id,
                property_id=property_record.id,
                contract_id=contract.id,
                type="IPTU",
                description="IPTU",
                amount=Decimal("300.00"),
                due_date=date(2026, 2, 10),
                source="CITY_HALL",
                status="pending",
            ),
        ]
    )
    db_session.commit()

    result = consolidate_charges_by_property_month(db_session, tenant.id, date(2026, 2, 1))

    assert len(result) == 1
    assert result[0]["property_id"] == property_record.id
    assert result[0]["total_amount"] == Decimal("2800.00")
    assert len(result[0]["items"]) == 3
