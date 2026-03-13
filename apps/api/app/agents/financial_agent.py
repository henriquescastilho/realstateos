from datetime import date

from sqlalchemy.orm import Session

from app.services.charge_service import create_monthly_charges


class FinancialAgent:
    def run(self, db: Session, task) -> dict:
        reference_month = date.fromisoformat(task.payload["reference_month"])
        charges = create_monthly_charges(
            db=db,
            tenant_id=task.payload["tenant_id"],
            contract_id=task.payload["contract_id"],
            reference_month=reference_month,
        )
        return {"status": "completed", "generated_charges": len(charges)}

