from datetime import date
from decimal import Decimal

from sqlalchemy import select

import app.models  # noqa: F401
from app.db import SessionLocal
from app.models.contract import Contract
from app.models.owner import Owner
from app.models.property import Property
from app.models.renter import Renter
from app.services.demo_tenant import get_or_create_demo_tenant


def seed_demo_data() -> dict[str, str]:
    db = SessionLocal()
    try:
        tenant = get_or_create_demo_tenant(db)

        owner = db.scalar(select(Owner).where(Owner.tenant_id == tenant.id, Owner.email == "owner@demo.com"))
        if owner is None:
            owner = Owner(
                tenant_id=tenant.id,
                name="Owner Demo",
                document="12345678900",
                email="owner@demo.com",
                phone="(11) 99999-1111",
            )
            db.add(owner)
            db.commit()
            db.refresh(owner)

        property_record = db.scalar(
            select(Property).where(Property.tenant_id == tenant.id, Property.address == "Rua Demo, 100")
        )
        if property_record is None:
            property_record = Property(
                tenant_id=tenant.id,
                owner_id=owner.id,
                address="Rua Demo, 100",
                city="Sao Paulo",
                state="SP",
                zip="01000-000",
                iptu_registration_number="IPTU-100",
            )
            db.add(property_record)
            db.commit()
            db.refresh(property_record)

        renter = db.scalar(select(Renter).where(Renter.tenant_id == tenant.id, Renter.email == "renter@demo.com"))
        if renter is None:
            renter = Renter(
                tenant_id=tenant.id,
                name="Renter Demo",
                document="98765432100",
                email="renter@demo.com",
                phone="(11) 98888-2222",
            )
            db.add(renter)
            db.commit()
            db.refresh(renter)

        contract = db.scalar(
            select(Contract).where(Contract.tenant_id == tenant.id, Contract.property_id == property_record.id)
        )
        if contract is None:
            contract = Contract(
                tenant_id=tenant.id,
                property_id=property_record.id,
                renter_id=renter.id,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
                monthly_rent=Decimal("2000.00"),
                due_day=1,
            )
            db.add(contract)
            db.commit()
            db.refresh(contract)

        return {
            "owner_id": owner.id,
            "property_id": property_record.id,
            "renter_id": renter.id,
            "contract_id": contract.id,
        }
    finally:
        db.close()


if __name__ == "__main__":
    result = seed_demo_data()
    print(result)
