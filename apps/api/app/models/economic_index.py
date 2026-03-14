"""Economic index DB model for IGPM/IPCA storage."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EconomicIndex(Base):
    """Monthly IGPM/IPCA index value cache.

    Each row represents one published monthly index for a given indicator.
    The unique constraint on (indicator, year, month) ensures idempotent upserts.
    """

    __tablename__ = "economic_indices"
    __table_args__ = (
        UniqueConstraint("indicator", "year", "month", name="uq_economic_index_period"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    indicator: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    # "IGPM" | "IPCA"

    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)

    # Monthly variation percentage (e.g. 0.54 means +0.54%)
    monthly_rate: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)

    # Accumulated value in the period (optional — not always provided)
    accumulated_rate: Mapped[Decimal | None] = mapped_column(Numeric(10, 6), nullable=True)

    # Source: "FGV" | "IBGE"
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="")

    # Raw value as returned by the API (for auditing)
    raw_value: Mapped[str] = mapped_column(String(64), nullable=False, default="")

    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"EconomicIndex(indicator={self.indicator!r}, "
            f"period={self.year}-{self.month:02d}, "
            f"monthly_rate={self.monthly_rate})"
        )
