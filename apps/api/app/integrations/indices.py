"""IGPM / IPCA economic index integration.

Fetches monthly IGPM and IPCA values from public Brazilian government APIs:
  - IGPM: FGV (Fundação Getulio Vargas) via IPEADATA API
    https://ipeadata.gov.br/api/odata4/ValoresSerie(SERCODIGO='IGP12_IGPM12')
  - IPCA: IBGE via SIDRA API
    https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/2266/p/all

Both series return monthly percentage variation.

DB caching:
  - Results are stored in the `economic_indices` table (EconomicIndex model).
  - On each call, the module first checks the DB. If the requested period is
    already cached, it returns the cached value without hitting the API.
  - On API failure, returns the last known cached value and emits a WARNING log.

Used by the billing engine for annual rent adjustments:
    from app.integrations.indices import get_monthly_rate
    rate = await get_monthly_rate(db, "IGPM", year=2026, month=3)

Usage:
    fetcher = IndexFetcher.from_env()

    # Fetch and persist latest available index
    result = await fetcher.fetch_and_store(db, "IGPM")
    print(result.monthly_rate)

    # Get the monthly rate for a specific period (uses DB cache)
    rate = await get_monthly_rate(db, "IPCA", 2026, 2)
"""
from __future__ import annotations

import logging
import os
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import TYPE_CHECKING, Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional dependencies
# ---------------------------------------------------------------------------

try:
    import httpx
    _HAS_HTTPX = True
except ImportError:
    _HAS_HTTPX = False
    logger.warning("httpx not installed — IndexFetcher will only use DB cache")

try:
    from sqlalchemy import select
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    _HAS_SQLALCHEMY = True
except ImportError:
    _HAS_SQLALCHEMY = False

try:
    from app.utils.resilience import retry_with_backoff
except ImportError:
    def retry_with_backoff(**kwargs):  # type: ignore[misc]
        def decorator(fn):
            return fn
        return decorator

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------

# IPEADATA OData API — IGPM monthly series (IGP-M / FGV)
IPEADATA_IGPM_URL = (
    "https://ipeadata.gov.br/api/odata4/ValoresSerie(SERCODIGO='IGP12_IGPM12')"
    "?$select=VALDATA,VALVALOR&$orderby=VALDATA desc&$top=24"
)

# IBGE SIDRA — IPCA table 1737, variable 2266 (monthly % change), all periods
IBGE_IPCA_URL = (
    "https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/2266/p/all"
    "?formato=json"
)

# Fallback: BCB open data API for IPCA (series 433)
BCB_IPCA_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&ultimos=24"

# BCB open data for IGPM (series 189)
BCB_IGPM_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.189/dados?formato=json&ultimos=24"

REQUEST_TIMEOUT = 15.0


# ---------------------------------------------------------------------------
# Data classes (no external deps)
# ---------------------------------------------------------------------------

from dataclasses import dataclass, field


@dataclass
class IndexValue:
    """A single monthly economic index value."""

    indicator: str        # "IGPM" | "IPCA"
    year: int
    month: int
    monthly_rate: Decimal
    source: str           # "BCB" | "IPEADATA" | "IBGE" | "DB"
    raw_value: str = ""
    fetched_at: datetime = field(default_factory=datetime.utcnow)

    @property
    def period_label(self) -> str:
        return f"{self.year}-{self.month:02d}"

    def as_multiplier(self) -> Decimal:
        """Return rate as multiplier: 0.54% → Decimal("1.0054")."""
        return Decimal("1") + (self.monthly_rate / Decimal("100"))


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class IndexUnavailableError(RuntimeError):
    """Raised when the index cannot be fetched from any source and cache is empty."""


# ---------------------------------------------------------------------------
# IndexFetcher
# ---------------------------------------------------------------------------

class IndexFetcher:
    """Fetches and caches IGPM/IPCA monthly rates."""

    def __init__(self, timeout: float = REQUEST_TIMEOUT) -> None:
        self.timeout = timeout

    @classmethod
    def from_env(cls) -> "IndexFetcher":
        return cls(
            timeout=float(os.environ.get("INDICES_TIMEOUT", str(REQUEST_TIMEOUT))),
        )

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    async def fetch_and_store(
        self,
        db: "AsyncSession",
        indicator: str,
    ) -> IndexValue:
        """Fetch the latest available value for an indicator and store in DB.

        Tries BCB API first (most reliable), then provider-specific API as fallback.
        On total failure, returns the most recent cached value from the DB.

        Args:
            db: Async SQLAlchemy session.
            indicator: "IGPM" or "IPCA".

        Returns:
            IndexValue for the most recent available period.

        Raises:
            IndexUnavailableError: If no data available from any source.
        """
        indicator = indicator.upper()
        if indicator not in ("IGPM", "IPCA"):
            raise ValueError(f"Unknown indicator: {indicator!r}. Must be 'IGPM' or 'IPCA'.")

        # Try BCB API first (reliable, covers both IGPM and IPCA)
        try:
            values = await self._fetch_bcb(indicator)
            if values:
                latest = values[0]  # BCB returns newest-first when sorted
                await self._upsert_db(db, latest)
                logger.info(
                    "indices.fetched indicator=%s period=%s rate=%s source=BCB",
                    indicator, latest.period_label, latest.monthly_rate,
                )
                return latest
        except Exception as exc:
            logger.warning("indices.bcb_error indicator=%s: %s", indicator, exc)

        # Try provider-specific API as fallback
        try:
            if indicator == "IGPM":
                values = await self._fetch_ipeadata_igpm()
            else:
                values = await self._fetch_ibge_ipca()

            if values:
                latest = values[0]
                await self._upsert_db(db, latest)
                logger.info(
                    "indices.fetched indicator=%s period=%s rate=%s source=%s",
                    indicator, latest.period_label, latest.monthly_rate, latest.source,
                )
                return latest
        except Exception as exc:
            logger.warning("indices.provider_error indicator=%s: %s", indicator, exc)

        # Fallback: return most recent DB cached value
        cached = await self._get_latest_from_db(db, indicator)
        if cached is not None:
            logger.warning(
                "indices.using_cache indicator=%s period=%s (API unavailable)",
                indicator, cached.period_label,
            )
            return cached

        raise IndexUnavailableError(
            f"Cannot fetch {indicator} index from any source and no cached value available."
        )

    async def get_or_fetch(
        self,
        db: "AsyncSession",
        indicator: str,
        year: int,
        month: int,
    ) -> IndexValue | None:
        """Return the index for a specific period, fetching from API if not cached.

        Returns None if the period is not yet available (future date) or unavailable.
        """
        indicator = indicator.upper()

        # Check DB cache first
        cached = await self._get_period_from_db(db, indicator, year, month)
        if cached is not None:
            return cached

        # Try to fetch all recent values and find the period
        try:
            values = await self._fetch_bcb(indicator)
            for v in values:
                await self._upsert_db(db, v)
                if v.year == year and v.month == month:
                    return v
        except Exception as exc:
            logger.warning("indices.get_or_fetch bcb_error: %s", exc)

        # Check DB again after potential upsert
        return await self._get_period_from_db(db, indicator, year, month)

    # ------------------------------------------------------------------
    # BCB API fetchers (primary source — both indicators)
    # ------------------------------------------------------------------

    @retry_with_backoff(max_attempts=2, base_delay=2.0)
    async def _fetch_bcb(self, indicator: str) -> list[IndexValue]:
        """Fetch from Banco Central do Brasil open data API."""
        if not _HAS_HTTPX:
            return []

        url = BCB_IGPM_URL if indicator == "IGPM" else BCB_IPCA_URL
        import httpx as _httpx

        try:
            async with _httpx.AsyncClient(timeout=self.timeout) as http:
                response = await http.get(url, headers={"Accept": "application/json"})
                response.raise_for_status()
                data = response.json()
        except Exception as exc:
            raise RuntimeError(f"BCB API error: {exc}") from exc

        values: list[IndexValue] = []
        for item in reversed(data):  # BCB returns oldest-first; reverse for newest-first
            val = _parse_bcb_item(item, indicator)
            if val is not None:
                values.insert(0, val)

        return values

    # ------------------------------------------------------------------
    # IPEADATA fetcher (IGPM fallback)
    # ------------------------------------------------------------------

    @retry_with_backoff(max_attempts=2, base_delay=2.0)
    async def _fetch_ipeadata_igpm(self) -> list[IndexValue]:
        """Fetch IGPM from IPEADATA OData API."""
        if not _HAS_HTTPX:
            return []

        import httpx as _httpx

        try:
            async with _httpx.AsyncClient(timeout=self.timeout) as http:
                response = await http.get(
                    IPEADATA_IGPM_URL,
                    headers={"Accept": "application/json"},
                )
                response.raise_for_status()
                data = response.json()
        except Exception as exc:
            raise RuntimeError(f"IPEADATA API error: {exc}") from exc

        values: list[IndexValue] = []
        for item in data.get("value", []):
            val = _parse_ipeadata_item(item)
            if val is not None:
                values.append(val)

        # Sort newest-first
        values.sort(key=lambda v: (v.year, v.month), reverse=True)
        return values

    # ------------------------------------------------------------------
    # IBGE SIDRA fetcher (IPCA fallback)
    # ------------------------------------------------------------------

    @retry_with_backoff(max_attempts=2, base_delay=2.0)
    async def _fetch_ibge_ipca(self) -> list[IndexValue]:
        """Fetch IPCA from IBGE SIDRA API."""
        if not _HAS_HTTPX:
            return []

        import httpx as _httpx

        try:
            async with _httpx.AsyncClient(timeout=self.timeout) as http:
                response = await http.get(
                    IBGE_IPCA_URL,
                    headers={"Accept": "application/json"},
                )
                response.raise_for_status()
                data = response.json()
        except Exception as exc:
            raise RuntimeError(f"IBGE SIDRA API error: {exc}") from exc

        values: list[IndexValue] = []
        for item in data:
            val = _parse_ibge_sidra_item(item)
            if val is not None:
                values.append(val)

        values.sort(key=lambda v: (v.year, v.month), reverse=True)
        return values

    # ------------------------------------------------------------------
    # DB operations
    # ------------------------------------------------------------------

    async def _upsert_db(self, db: "AsyncSession", value: IndexValue) -> None:
        """Insert or update an index value in the DB (idempotent)."""
        if not _HAS_SQLALCHEMY:
            return

        from app.models.economic_index import EconomicIndex  # noqa: PLC0415

        try:
            stmt = (
                pg_insert(EconomicIndex)
                .values(
                    indicator=value.indicator,
                    year=value.year,
                    month=value.month,
                    monthly_rate=value.monthly_rate,
                    source=value.source,
                    raw_value=value.raw_value,
                    fetched_at=value.fetched_at,
                    updated_at=datetime.utcnow(),
                )
                .on_conflict_do_update(
                    constraint="uq_economic_index_period",
                    set_={
                        "monthly_rate": value.monthly_rate,
                        "source": value.source,
                        "raw_value": value.raw_value,
                        "updated_at": datetime.utcnow(),
                    },
                )
            )
            await db.execute(stmt)
            await db.commit()
        except Exception as exc:
            await db.rollback()
            logger.warning("indices.db_upsert_error: %s", exc)

    async def _get_latest_from_db(
        self, db: "AsyncSession", indicator: str
    ) -> IndexValue | None:
        """Return the most recent cached value for an indicator."""
        if not _HAS_SQLALCHEMY:
            return None

        from app.models.economic_index import EconomicIndex  # noqa: PLC0415

        try:
            stmt = (
                select(EconomicIndex)
                .where(EconomicIndex.indicator == indicator)
                .order_by(
                    EconomicIndex.year.desc(),
                    EconomicIndex.month.desc(),
                )
                .limit(1)
            )
            result = await db.execute(stmt)
            row = result.scalar_one_or_none()
            if row is None:
                return None
            return _model_to_value(row)
        except Exception as exc:
            logger.warning("indices.db_get_latest_error: %s", exc)
            return None

    async def _get_period_from_db(
        self, db: "AsyncSession", indicator: str, year: int, month: int
    ) -> IndexValue | None:
        """Return cached value for a specific period, or None."""
        if not _HAS_SQLALCHEMY:
            return None

        from app.models.economic_index import EconomicIndex  # noqa: PLC0415

        try:
            stmt = select(EconomicIndex).where(
                EconomicIndex.indicator == indicator,
                EconomicIndex.year == year,
                EconomicIndex.month == month,
            )
            result = await db.execute(stmt)
            row = result.scalar_one_or_none()
            return _model_to_value(row) if row else None
        except Exception as exc:
            logger.warning("indices.db_get_period_error: %s", exc)
            return None


# ---------------------------------------------------------------------------
# Parsers
# ---------------------------------------------------------------------------

def _parse_bcb_item(item: dict, indicator: str) -> IndexValue | None:
    """Parse a single BCB series item: {"data": "01/03/2026", "valor": "0.56"}"""
    try:
        date_str = item.get("data", "")
        val_str = item.get("valor", "").replace(",", ".")
        day, month, year = date_str.split("/")
        rate = Decimal(val_str)
        return IndexValue(
            indicator=indicator,
            year=int(year),
            month=int(month),
            monthly_rate=rate,
            source="BCB",
            raw_value=val_str,
        )
    except (ValueError, InvalidOperation, AttributeError):
        return None


def _parse_ipeadata_item(item: dict) -> IndexValue | None:
    """Parse IPEADATA OData item: {"VALDATA": "2026-03-01T00:00:00-03:00", "VALVALOR": 0.54}"""
    try:
        date_str = item.get("VALDATA", "")[:10]  # "2026-03-01"
        year, month, _ = date_str.split("-")
        val = item.get("VALVALOR")
        if val is None:
            return None
        rate = Decimal(str(val))
        return IndexValue(
            indicator="IGPM",
            year=int(year),
            month=int(month),
            monthly_rate=rate,
            source="IPEADATA",
            raw_value=str(val),
        )
    except (ValueError, InvalidOperation, AttributeError):
        return None


def _parse_ibge_sidra_item(item: dict) -> IndexValue | None:
    """Parse IBGE SIDRA item.

    SIDRA returns rows with "D3C" (period like "202603") and "V" (value).
    The first row is usually a header with {"D3C": "Mês", "V": "Valor"}.
    """
    try:
        period = item.get("D3C", "")  # e.g. "202603"
        val_str = item.get("V", "").replace(",", ".")
        if not period.isdigit() or len(period) != 6:
            return None
        year = int(period[:4])
        month = int(period[4:])
        rate = Decimal(val_str)
        return IndexValue(
            indicator="IPCA",
            year=year,
            month=month,
            monthly_rate=rate,
            source="IBGE",
            raw_value=val_str,
        )
    except (ValueError, InvalidOperation, AttributeError):
        return None


def _model_to_value(row: Any) -> IndexValue:
    """Convert an EconomicIndex ORM row to an IndexValue."""
    return IndexValue(
        indicator=row.indicator,
        year=row.year,
        month=row.month,
        monthly_rate=row.monthly_rate,
        source=f"{row.source}/DB",
        raw_value=row.raw_value,
        fetched_at=row.fetched_at,
    )


# ---------------------------------------------------------------------------
# Module-level singleton + convenience functions
# ---------------------------------------------------------------------------

_fetcher: IndexFetcher | None = None
_singleton_lock_obj = __import__("threading").Lock()


def get_index_fetcher() -> IndexFetcher:
    """Return module-level IndexFetcher singleton."""
    global _fetcher
    if _fetcher is None:
        with _singleton_lock_obj:
            if _fetcher is None:
                _fetcher = IndexFetcher.from_env()
    return _fetcher


async def get_monthly_rate(
    db: "AsyncSession",
    indicator: str,
    year: int,
    month: int,
) -> Decimal | None:
    """Get the monthly variation rate for a given indicator and period.

    Returns the rate as a Decimal (e.g. Decimal("0.54") for 0.54%).
    Returns None if the period is not cached and cannot be fetched.

    Used by the billing engine for annual rent adjustments:
        rate = await get_monthly_rate(db, "IGPM", 2026, 3)
        if rate is None:
            raise IndexUnavailableError("IGPM 2026-03 not available")
        adjustment_multiplier = 1 + (rate / 100)
    """
    result = await get_index_fetcher().get_or_fetch(db, indicator, year, month)
    if result is None:
        logger.warning(
            "indices.period_unavailable indicator=%s period=%d-%02d",
            indicator, year, month,
        )
        return None
    return result.monthly_rate


async def get_annual_accumulated(
    db: "AsyncSession",
    indicator: str,
    year: int,
) -> Decimal | None:
    """Calculate accumulated annual rate by compounding 12 monthly rates.

    Returns None if any month in the year is missing.
    Used for annual rent adjustment calculations (IGP-M clause).
    """
    fetcher = get_index_fetcher()
    accumulator = Decimal("1")
    missing: list[int] = []

    for month in range(1, 13):
        value = await fetcher.get_or_fetch(db, indicator, year, month)
        if value is None:
            missing.append(month)
        else:
            accumulator *= value.as_multiplier()

    if missing:
        logger.warning(
            "indices.annual_missing indicator=%s year=%d months=%s",
            indicator, year, missing,
        )
        return None

    # Convert multiplier back to percentage: 1.0654 → 6.54
    return (accumulator - Decimal("1")) * Decimal("100")
