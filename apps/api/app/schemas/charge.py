from datetime import date
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.common import ORMModel


class GenerateMonthlyChargeRequest(BaseModel):
    contract_id: str
    reference_month: date


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
