from sqlalchemy.orm import Session

from app.config import settings
from app.services.charge_service import generate_boleto_for_charge, generate_pix_for_charge, get_charge_for_tenant


def generate_payment_payload(db: Session, tenant_id: str, charge_id: str) -> dict:
    charge = get_charge_for_tenant(db, tenant_id, charge_id)

    if settings.santander_sandbox_enabled:
        try:
            boleto = generate_boleto_for_charge(db, tenant_id, charge_id)
            pix = generate_pix_for_charge(db, tenant_id, charge_id)
            return {
                "provider": "santander",
                "charge_id": charge.id,
                **boleto,
                **pix,
            }
        except Exception:
            if not settings.payment_mock_fallback_enabled:
                raise

    boleto = generate_boleto_for_charge(db, tenant_id, charge_id)
    pix = generate_pix_for_charge(db, tenant_id, charge_id)
    return {
        "provider": "mock",
        "charge_id": charge.id,
        **boleto,
        **pix,
    }

