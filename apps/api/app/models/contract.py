from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import SoftDeleteMixin, UUIDPrimaryKeyMixin


class Contract(UUIDPrimaryKeyMixin, SoftDeleteMixin, Base):
    __tablename__ = "contracts"

    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    property_id: Mapped[str] = mapped_column(String(36), ForeignKey("properties.id"), nullable=False, index=True)
    renter_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants_renters.id"), nullable=False, index=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    monthly_rent: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    due_day: Mapped[int] = mapped_column(nullable=False)

    tenant = relationship("Tenant", back_populates="contracts")
    property = relationship("Property", back_populates="contracts")
    renter = relationship("Renter", back_populates="contracts")
    charges = relationship("Charge", back_populates="contract")
