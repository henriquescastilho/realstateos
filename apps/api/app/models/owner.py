from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import SoftDeleteMixin, UUIDPrimaryKeyMixin


class Owner(UUIDPrimaryKeyMixin, SoftDeleteMixin, Base):
    __tablename__ = "owners"

    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    document: Mapped[str] = mapped_column(String(50), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), nullable=False)

    tenant = relationship("Tenant", back_populates="owners")
    properties = relationship("Property", back_populates="owner")
