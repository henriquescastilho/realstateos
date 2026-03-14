"""N+1-safe DataLoaders for the GraphQL layer.

Each loader batches DB queries per request.  Strawberry calls ``load_fn``
with a list of keys accumulated during a single resolver cycle, so a query
that would produce N round-trips collapses to 1.

Usage in a resolver::

    async def charges(self, info: strawberry.Info) -> list[ChargeType]:
        ctx: GraphQLContext = info.context
        loader = ctx.get_loader("charges_by_contract", ChargesByContractLoader)
        return await loader.load(self.id)
"""

from __future__ import annotations

from collections import defaultdict
from typing import TYPE_CHECKING

from sqlalchemy import select

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


# ---------------------------------------------------------------------------
# Loader: charges keyed by contract_id
# ---------------------------------------------------------------------------


class ChargesByContractLoader:
    """Batch-load charges for a list of contract IDs in one query."""

    def __init__(self, db: "Session", tenant_id: str) -> None:
        self._db = db
        self._tenant_id = tenant_id
        self._cache: dict[str, list] = {}

    async def load(self, contract_id: str) -> list:
        if contract_id not in self._cache:
            await self._prime([contract_id])
        return self._cache.get(contract_id, [])

    async def load_many(self, contract_ids: list[str]) -> list[list]:
        missing = [cid for cid in contract_ids if cid not in self._cache]
        if missing:
            await self._prime(missing)
        return [self._cache.get(cid, []) for cid in contract_ids]

    async def _prime(self, contract_ids: list[str]) -> None:
        from app.models.charge import Charge  # noqa: PLC0415

        rows = self._db.scalars(
            select(Charge).where(
                Charge.tenant_id == self._tenant_id,
                Charge.contract_id.in_(contract_ids),
            )
        ).all()

        grouped: dict[str, list] = defaultdict(list)
        for row in rows:
            grouped[row.contract_id].append(row)

        for cid in contract_ids:
            self._cache[cid] = grouped.get(cid, [])


# ---------------------------------------------------------------------------
# Loader: tasks keyed by contract_id (from payload)
# ---------------------------------------------------------------------------


class TasksByContractLoader:
    """Batch-load Task records associated with a list of contract IDs.

    Task.payload["contract_id"] is the link — this is a JSON query,
    so we load all tasks for the tenant and bucket by contract_id.
    """

    def __init__(self, db: "Session", tenant_id: str) -> None:
        self._db = db
        self._tenant_id = tenant_id
        self._cache: dict[str, list] | None = None  # lazy full load

    async def load(self, contract_id: str) -> list:
        await self._ensure_loaded()
        return self._cache.get(contract_id, [])  # type: ignore[return-value]

    async def _ensure_loaded(self) -> None:
        if self._cache is not None:
            return
        from app.models.task import Task  # noqa: PLC0415

        rows = self._db.scalars(
            select(Task).where(Task.tenant_id == self._tenant_id)
        ).all()
        grouped: dict[str, list] = defaultdict(list)
        for row in rows:
            cid = (row.payload or {}).get("contract_id")
            if cid:
                grouped[cid].append(row)
        self._cache = dict(grouped)
