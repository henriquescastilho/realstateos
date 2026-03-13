from decimal import Decimal


def build_boleto_payload(charge_id: str, amount: Decimal) -> dict[str, str]:
    cents = int(amount * 100)
    barcode = f"34191{charge_id.replace('-', '')[:10]}{cents:010d}"
    return {
        "boleto_url": f"https://mock-bank.local/boleto/{charge_id}",
        "barcode": barcode,
    }


def build_pix_payload(charge_id: str, amount: Decimal) -> dict[str, str]:
    cents = int(amount * 100)
    return {
        "pix_qrcode": f"00020126360014BR.GOV.BCB.PIX0114{charge_id[:14]}520400005303986540{cents}",
    }
