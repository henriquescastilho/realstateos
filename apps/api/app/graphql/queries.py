"""GraphQL Query resolvers.

All resolvers are tenant-scoped via info.context.tenant_id.
"""

from __future__ import annotations

import strawberry
from typing import Optional

from sqlalchemy import select

from app.graphql.context import GraphQLContext
from app.graphql.dataloaders import ChargesByContractLoader
from app.graphql.types import ChargeFilter, ChargeType, ContractFilter, ContractType, TaskFilter, TaskType


@strawberry.type
class Query:
    # ------------------------------------------------------------------
    # Contracts
    # ------------------------------------------------------------------

    @strawberry.field(description="List rental contracts for the authenticated tenant.")
    def contracts(
        self,
        info: strawberry.Info,
        filter: Optional[ContractFilter] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[ContractType]:
        from app.models.contract import Contract  # noqa: PLC0415

        ctx: GraphQLContext = info.context
        q = select(Contract).where(
            Contract.tenant_id == ctx.tenant_id,
            Contract.deleted_at.is_(None),
        )
        if filter:
            if filter.property_id:
                q = q.where(Contract.property_id == filter.property_id)
            if filter.renter_id:
                q = q.where(Contract.renter_id == filter.renter_id)
        q = q.offset(offset).limit(min(limit, 200))
        rows = ctx.db.scalars(q).all()
        return [ContractType.from_orm(r) for r in rows]

    @strawberry.field(description="Get a single contract by ID.")
    def contract(self, info: strawberry.Info, id: str) -> Optional[ContractType]:
        from app.models.contract import Contract  # noqa: PLC0415

        ctx: GraphQLContext = info.context
        row = ctx.db.scalar(
            select(Contract).where(
                Contract.id == id,
                Contract.tenant_id == ctx.tenant_id,
                Contract.deleted_at.is_(None),
            )
        )
        return ContractType.from_orm(row) if row else None

    # ------------------------------------------------------------------
    # Charges  (N+1-safe: use dataloader when coming from ContractType)
    # ------------------------------------------------------------------

    @strawberry.field(description="List billing charges for the authenticated tenant.")
    async def charges(
        self,
        info: strawberry.Info,
        filter: Optional[ChargeFilter] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[ChargeType]:
        ctx: GraphQLContext = info.context

        if filter and filter.contract_id:
            # Use dataloader for single-contract queries (N+1 safe)
            loader: ChargesByContractLoader = ctx.get_loader(
                "charges_by_contract", ChargesByContractLoader
            )
            rows = await loader.load(filter.contract_id)
            if filter.status:
                rows = [r for r in rows if r.status.lower() == filter.status.lower()]
            return [ChargeType.from_orm(r) for r in rows[offset : offset + min(limit, 200)]]

        # Full list query
        from app.models.charge import Charge  # noqa: PLC0415

        q = select(Charge).where(Charge.tenant_id == ctx.tenant_id)
        if filter and filter.status:
            q = q.where(Charge.status == filter.status.lower())
        q = q.offset(offset).limit(min(limit, 200))
        rows = ctx.db.scalars(q).all()
        return [ChargeType.from_orm(r) for r in rows]

    # ------------------------------------------------------------------
    # Agent tasks
    # ------------------------------------------------------------------

    @strawberry.field(description="List agent tasks for the authenticated tenant.")
    def agent_tasks(
        self,
        info: strawberry.Info,
        filter: Optional[TaskFilter] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[TaskType]:
        from app.models.task import Task  # noqa: PLC0415

        ctx: GraphQLContext = info.context
        q = select(Task).where(Task.tenant_id == ctx.tenant_id)
        if filter:
            if filter.status:
                q = q.where(Task.status == filter.status.upper())
            if filter.type:
                q = q.where(Task.type == filter.type.upper())
        q = q.order_by(Task.created_at.desc()).offset(offset).limit(min(limit, 200))
        rows = ctx.db.scalars(q).all()
        return [TaskType.from_orm(r) for r in rows]

    @strawberry.field(description="Get a single agent task by ID.")
    def agent_task(self, info: strawberry.Info, id: str) -> Optional[TaskType]:
        from app.models.task import Task  # noqa: PLC0415

        ctx: GraphQLContext = info.context
        row = ctx.db.scalar(
            select(Task).where(Task.id == id, Task.tenant_id == ctx.tenant_id)
        )
        return TaskType.from_orm(row) if row else None
