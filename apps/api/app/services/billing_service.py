from datetime import date

from app.models.charge import Charge
from app.models.contract import Contract
from app.utils.dates import resolve_due_date


def generate_monthly_rent_charge(contract: Contract, reference_month: date) -> Charge:
    due_date = resolve_due_date(reference_month, contract.due_day)
    return Charge(
        tenant_id=contract.tenant_id or contract.tenant.id,
        property_id=contract.property_id or contract.property.id,
        contract_id=contract.id,
        type="RENT",
        description=f"Monthly rent for {reference_month.strftime('%Y-%m')}",
        amount=contract.monthly_rent,
        due_date=due_date,
        source="SYSTEM",
        status="pending",
    )
