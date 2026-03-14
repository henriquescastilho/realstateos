from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.schemas.common import ORMModel


class ContractCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
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
