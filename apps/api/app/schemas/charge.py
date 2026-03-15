from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.schemas.common import ORMModel


class GenerateMonthlyChargeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contract_id: str
    reference_month: date

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "contract_id": "880e8400-e29b-41d4-a716-446655440003",
                    "reference_month": "2026-03-01",
                }
            ]
        }
    }


class ChargeRead(ORMModel):
    id: str
    tenant_id: str
    property_id: str
    contract_id: str
    type: str
    description: str
    amount: Decimal
    due_date: date
    source: str
    status: str


class ChargeStatusUpdate(BaseModel):
    status: str


class BoletoResponse(BaseModel):
    boleto_url: str
    barcode: str


class PixResponse(BaseModel):
    pix_qrcode: str


class ConsolidatedChargeItem(BaseModel):
    charge_id: str
    type: str
    description: str
    amount: Decimal
    due_date: date
    status: str


class ConsolidatedChargeRead(BaseModel):
    property_id: str
    contract_id: str
    reference_month: date
    total_amount: Decimal
    items: list[ConsolidatedChargeItem]
