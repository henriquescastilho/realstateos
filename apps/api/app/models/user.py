from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import UUIDPrimaryKeyMixin


class User(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "users"

    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False)

    tenant = relationship("Tenant", back_populates="users")
