from datetime import date

from sqlalchemy.orm import Session

from app.services.charge_service import create_monthly_charges


def create_monthly_rent_charge(db: Session, tenant_id: str, contract_id: str, reference_month: date):
    return create_monthly_charges(db, tenant_id, contract_id, reference_month)

