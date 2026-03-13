from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import UUIDPrimaryKeyMixin


class Charge(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "charges"

    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    property_id: Mapped[str] = mapped_column(String(36), ForeignKey("properties.id"), nullable=False, index=True)
    contract_id: Mapped[str] = mapped_column(String(36), ForeignKey("contracts.id"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")

    tenant = relationship("Tenant", back_populates="charges")
    property = relationship("Property", back_populates="charges")
    contract = relationship("Contract", back_populates="charges")
