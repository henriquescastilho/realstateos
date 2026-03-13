from datetime import date
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.common import ORMModel


class ContractCreate(BaseModel):
    property_id: str
    renter_id: str
    start_date: date
    end_date: date
    monthly_rent: Decimal
    due_day: int


class ContractRead(ORMModel):
    id: str
    tenant_id: str
    property_id: str
    renter_id: str
    start_date: date
    end_date: date
    monthly_rent: Decimal
    due_day: int

