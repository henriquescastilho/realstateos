from datetime import date
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.integrations.bank_mock import build_boleto_payload, build_pix_payload
from app.models.charge import Charge
from app.models.contract import Contract
from app.services.billing_service import generate_monthly_rent_charge


def create_monthly_charges(db: Session, tenant_id: str, contract_id: str, reference_month: date) -> list[Charge]:
    contract = db.scalar(select(Contract).where(Contract.id == contract_id, Contract.tenant_id == tenant_id))
    if contract is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found.")

    charge = generate_monthly_rent_charge(contract=contract, reference_month=reference_month)
    db.add(charge)
    db.commit()
    db.refresh(charge)
    return [charge]


def get_charge_for_tenant(db: Session, tenant_id: str, charge_id: str) -> Charge:
    charge = db.scalar(select(Charge).where(Charge.id == charge_id, Charge.tenant_id == tenant_id))
    if charge is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Charge not found.")
    return charge


def update_charge_status(db: Session, tenant_id: str, charge_id: str, status_value: str) -> Charge:
    charge = get_charge_for_tenant(db, tenant_id, charge_id)
    charge.status = status_value
    db.add(charge)
    db.commit()
    db.refresh(charge)
    return charge


def generate_boleto_for_charge(db: Session, tenant_id: str, charge_id: str) -> dict[str, str]:
    charge = get_charge_for_tenant(db, tenant_id, charge_id)
    return build_boleto_payload(charge.id, charge.amount)


def generate_pix_for_charge(db: Session, tenant_id: str, charge_id: str) -> dict[str, str]:
    charge = get_charge_for_tenant(db, tenant_id, charge_id)
    return build_pix_payload(charge.id, charge.amount)


def consolidate_charges_by_property_month(db: Session, tenant_id: str, reference_month: date) -> list[dict]:
    month_start = date(reference_month.year, reference_month.month, 1)
    if reference_month.month == 12:
        month_end = date(reference_month.year + 1, 1, 1)
    else:
        month_end = date(reference_month.year, reference_month.month + 1, 1)

    charges = list(
        db.scalars(
            select(Charge).where(
                Charge.tenant_id == tenant_id,
                Charge.due_date >= month_start,
                Charge.due_date < month_end,
            )
        ).all()
    )

    grouped: dict[tuple[str, str], dict] = {}
    for charge in charges:
        key = (charge.property_id, charge.contract_id)
        if key not in grouped:
            grouped[key] = {
                "property_id": charge.property_id,
                "contract_id": charge.contract_id,
                "reference_month": month_start,
                "total_amount": Decimal("0.00"),
                "items": [],
            }

        grouped[key]["total_amount"] += charge.amount
        grouped[key]["items"].append(
            {
                "charge_id": charge.id,
                "type": charge.type,
                "description": charge.description,
                "amount": charge.amount,
                "due_date": charge.due_date,
                "status": charge.status,
            }
        )

    return list(grouped.values())
