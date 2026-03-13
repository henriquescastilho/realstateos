from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.services.consolidation import consolidate_pending_charges
from app.services.monthly_billing import create_monthly_rent_charge
from app.services.santander import generate_payment_payload
from app.services.task_service import create_agent_message


class BillingAgentTools:
    def __init__(self, db: Session, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id

    def generate_monthly_charge(self, contract_id: str, month_ref: str) -> dict[str, Any]:
        """Generate the monthly rent charge for a contract and month reference."""
        reference_month = self._parse_month_ref(month_ref)
        charges = create_monthly_rent_charge(self.db, self.tenant_id, contract_id, reference_month)
        task = create_agent_message(
            self.db,
            tenant_id=self.tenant_id,
            task_type="GENERATE_MONTHLY_CHARGE",
            message="Cobrança mensal gerada automaticamente",
            payload={"contract_id": contract_id, "month_ref": month_ref},
            contract_id=contract_id,
        )
        return {
            "ok": True,
            "operation": "generate_monthly_charge",
            "contract_id": contract_id,
            "month_ref": month_ref,
            "generated_charge_ids": [charge.id for charge in charges],
            "message": "Cobrança mensal gerada automaticamente",
            "task_id": task.id,
        }

    def consolidate_monthly_charges(
        self,
        contract_id: str,
        property_id: str,
        month_ref: str,
    ) -> dict[str, Any]:
        """Consolidate pending monthly charges for a property and contract."""
        reference_month = self._parse_month_ref(month_ref)
        result = consolidate_pending_charges(self.db, self.tenant_id, contract_id, reference_month)
        task = create_agent_message(
            self.db,
            tenant_id=self.tenant_id,
            task_type="CONSOLIDATE_CHARGES",
            message="Consolidação realizada",
            payload={"contract_id": contract_id, "property_id": property_id, "month_ref": month_ref},
            property_id=property_id,
            contract_id=contract_id,
        )
        return {
            "ok": True,
            "operation": "consolidate_monthly_charges",
            "property_id": property_id,
            "contract_id": contract_id,
            "month_ref": month_ref,
            "consolidated_charge_id": self._find_consolidated_charge_id(contract_id, reference_month),
            "total_amount": self._format_amount(result["total_amount"]),
            "message": "Consolidação realizada",
            "task_id": task.id,
        }

    def generate_payment(self, charge_id: str) -> dict[str, Any]:
        """Generate boleto and PIX for a consolidated charge."""
        try:
            payment = generate_payment_payload(self.db, self.tenant_id, charge_id)
            message = (
                "Boleto Santander emitido"
                if payment["provider"] == "santander"
                else "Falha ao emitir boleto; usar mock"
            )
            task = create_agent_message(
                self.db,
                tenant_id=self.tenant_id,
                task_type="GENERATE_PAYMENT",
                message=message,
                payload={"charge_id": charge_id, "provider": payment["provider"]},
            )
            return {
                "ok": True,
                "operation": "generate_payment",
                "charge_id": charge_id,
                "payment": payment,
                "message": message,
                "task_id": task.id,
            }
        except Exception as exc:
            task = create_agent_message(
                self.db,
                tenant_id=self.tenant_id,
                task_type="GENERATE_PAYMENT",
                message="Falha ao emitir boleto; usar mock",
                payload={"charge_id": charge_id, "error": str(exc)},
                status_value="FAILED",
            )
            return {
                "ok": False,
                "operation": "generate_payment",
                "charge_id": charge_id,
                "message": "Falha ao emitir boleto; usar mock",
                "error": str(exc),
                "task_id": task.id,
            }

    def register_task_message(
        self,
        task_type: str,
        message: str,
        payload: dict | None = None,
        property_id: str | None = None,
        contract_id: str | None = None,
        status_value: str = "DONE",
    ) -> dict[str, Any]:
        """Write a deterministic dashboard-visible task message."""
        task = create_agent_message(
            db=self.db,
            tenant_id=self.tenant_id,
            task_type=task_type,
            message=message,
            payload=payload or {},
            property_id=property_id,
            contract_id=contract_id,
            status_value=status_value,
        )
        return {
            "ok": True,
            "operation": "register_task_message",
            "task_id": task.id,
            "message": message,
            "status": status_value,
        }

    @staticmethod
    def _parse_month_ref(month_ref: str) -> date:
        return date.fromisoformat(f"{month_ref}-01")

    @staticmethod
    def _format_amount(value: Any) -> str:
        return f"{value:.2f}"

    def _find_consolidated_charge_id(self, contract_id: str, reference_month: date) -> str | None:
        from sqlalchemy import select

        from app.models.charge import Charge

        consolidated_charge = self.db.scalar(
            select(Charge).where(
                Charge.tenant_id == self.tenant_id,
                Charge.contract_id == contract_id,
                Charge.type == "CONSOLIDATED",
                Charge.due_date >= reference_month,
            )
        )
        return consolidated_charge.id if consolidated_charge is not None else None
