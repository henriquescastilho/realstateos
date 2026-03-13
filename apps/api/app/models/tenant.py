from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Tenant(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(255), nullable=False)

    users = relationship("User", back_populates="tenant")
    owners = relationship("Owner", back_populates="tenant")
    renters = relationship("Renter", back_populates="tenant")
    properties = relationship("Property", back_populates="tenant")
    contracts = relationship("Contract", back_populates="tenant")
    charges = relationship("Charge", back_populates="tenant")
    documents = relationship("Document", back_populates="tenant")
    tasks = relationship("Task", back_populates="tenant")
