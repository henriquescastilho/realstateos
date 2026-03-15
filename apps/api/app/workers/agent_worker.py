import logging

from sqlalchemy.orm import Session

from app.agents.billing_agent.agent import build_billing_agent
from app.agents.billing_agent.tools import BillingAgentTools

logger = logging.getLogger("realestateos.billing_worker")


class BillingAgentWorker:
    """
    OpenClaw-compatible execution wrapper.
    It does not orchestrate autonomously; it just maps a task type to one BillingAgent tool.
    """

    def __init__(self, db: Session, tenant_id: str):
        self.tools = BillingAgentTools(db=db, tenant_id=tenant_id)
        self.agent = build_billing_agent(
            tools=[
                self.tools.generate_monthly_charge,
                self.tools.consolidate_monthly_charges,
                self.tools.generate_payment,
                self.tools.register_task_message,
            ]
        )

    def execute(self, task_type: str, payload: dict) -> dict:
        handlers = {
            "GENERATE_MONTHLY_CHARGE": (
                ("contract_id", "month_ref"),
                lambda data: self.tools.generate_monthly_charge(
                    contract_id=data["contract_id"],
                    month_ref=data["month_ref"],
                ),
            ),
            "CONSOLIDATE_CHARGES": (
                ("contract_id", "property_id", "month_ref"),
                lambda data: self.tools.consolidate_monthly_charges(
                    contract_id=data["contract_id"],
                    property_id=data["property_id"],
                    month_ref=data["month_ref"],
                ),
            ),
            "GENERATE_PAYMENT": (
                ("charge_id",),
                lambda data: self.tools.generate_payment(charge_id=data["charge_id"]),
            ),
        }

        try:
            handler_config = handlers.get(task_type)
            if handler_config is None:
                logger.warning("unsupported_task_type", extra={"task_type": task_type})
                return {
                    "ok": False,
                    "operation": task_type.lower(),
                    "message": "Unsupported billing task.",
                    "error": "unsupported_task",
                }

            required_keys, handler = handler_config
            missing_keys = [key for key in required_keys if key not in payload]
            if missing_keys:
                logger.warning(
                    "invalid_task_payload",
                    extra={"task_type": task_type, "missing_keys": ",".join(missing_keys)},
                )
                return {
                    "ok": False,
                    "operation": task_type.lower(),
                    "message": "Invalid billing task payload.",
                    "error": f"missing_keys:{','.join(missing_keys)}",
                }

            logger.info("dispatch_billing_task", extra={"task_type": task_type, "tenant_id": self.tools.tenant_id})
            return handler(payload)
        except Exception:
            logger.exception("billing_task_failed", extra={"task_type": task_type, "tenant_id": self.tools.tenant_id})
            self.tools.register_task_message(
                task_type=task_type,
                message="Falha ao processar tarefa de billing",
                payload={"task_type": task_type},
                property_id=payload.get("property_id"),
                contract_id=payload.get("contract_id"),
                status_value="FAILED",
            )
            return {
                "ok": False,
                "operation": task_type.lower(),
                "message": "Falha ao processar tarefa de billing",
                "error": "internal_error",
            }
