from datetime import date
from decimal import Decimal

from pydantic import BaseModel, field_validator

from app.schemas.common import ORMModel


class ContractCreate(BaseModel):
    property_id: str
    renter_id: str
    start_date: date
    end_date: date
    monthly_rent: Decimal
    due_day: int

    @field_validator("due_day")
    @classmethod
    def validate_due_day(cls, v: int) -> int:
        if v < 1 or v > 28:
            raise ValueError("due_day must be between 1 and 28")
        return v

    @field_validator("monthly_rent")
    @classmethod
    def validate_monthly_rent(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("monthly_rent must be positive")
        return v

    @field_validator("end_date")
    @classmethod
    def validate_end_after_start(cls, v: date, info) -> date:
        start = info.data.get("start_date")
        if start and v <= start:
            raise ValueError("end_date must be after start_date")
        return v


class ContractRead(ORMModel):
    id: str
    tenant_id: str
    property_id: str
    renter_id: str
    start_date: date
    end_date: date
    monthly_rent: Decimal
    due_day: int
