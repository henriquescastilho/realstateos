from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import SoftDeleteMixin, UUIDPrimaryKeyMixin


class Property(UUIDPrimaryKeyMixin, SoftDeleteMixin, Base):
    __tablename__ = "properties"

    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    state: Mapped[str] = mapped_column(String(2), nullable=False)
    zip: Mapped[str] = mapped_column(String(20), nullable=False)
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("owners.id"), nullable=False, index=True)
    iptu_registration_number: Mapped[str | None] = mapped_column(String(100), nullable=True)

    tenant = relationship("Tenant", back_populates="properties")
    owner = relationship("Owner", back_populates="properties")
    contracts = relationship("Contract", back_populates="property")
    charges = relationship("Charge", back_populates="property")
    documents = relationship("Document", back_populates="property")
