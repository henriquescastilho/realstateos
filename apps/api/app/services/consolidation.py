from datetime import date
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.charge import Charge


def consolidate_pending_charges(db: Session, tenant_id: str, contract_id: str, reference_month: date) -> dict:
    month_prefix = reference_month.strftime("%Y-%m")
    charges = list(
        db.scalars(
            select(Charge).where(
                Charge.tenant_id == tenant_id,
                Charge.contract_id == contract_id,
                Charge.status == "pending",
            )
        ).all()
    )

    month_charges = [charge for charge in charges if charge.due_date.strftime("%Y-%m") == month_prefix]
    if not month_charges:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No pending charges for this month.")

    total_amount = sum((charge.amount for charge in month_charges), start=Decimal("0.00"))
    consolidated_charge = Charge(
        tenant_id=tenant_id,
        property_id=month_charges[0].property_id,
        contract_id=contract_id,
        type="CONSOLIDATED",
        description="Aluguel + IPTU + Condomínio",
        amount=total_amount,
        due_date=month_charges[0].due_date,
        source="CONSOLIDATION",
        status="pending",
    )
    db.add(consolidated_charge)
    db.commit()
    db.refresh(consolidated_charge)

    return {
        "property_id": consolidated_charge.property_id,
        "contract_id": consolidated_charge.contract_id,
        "reference_month": reference_month,
        "total_amount": consolidated_charge.amount,
        "items": [
            {
                "charge_id": charge.id,
                "type": charge.type,
                "description": charge.description,
                "amount": charge.amount,
                "due_date": charge.due_date,
                "status": charge.status,
            }
            for charge in month_charges
        ],
    }

