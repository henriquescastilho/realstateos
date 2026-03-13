from decimal import Decimal

from app.integrations.bank_mock import build_boleto_payload, build_pix_payload


def generate_boleto(charge_id: str, amount: Decimal) -> dict[str, str]:
    return build_boleto_payload(charge_id, amount)


def generate_pix(charge_id: str, amount: Decimal) -> dict[str, str]:
    return build_pix_payload(charge_id, amount)
