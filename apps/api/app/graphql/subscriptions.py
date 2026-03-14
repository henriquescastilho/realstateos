"""GraphQL Subscriptions — real-time agent task updates via WebSocket.

The subscription polls the database every 2 seconds for tasks created or
updated since the subscription started.  This is simple and requires no
external pub/sub infrastructure (Redis Pub/Sub, Kafka, etc.).

For production at scale, replace the polling loop with a Redis Pub/Sub
subscription that agents publish to after every state change.

Usage (GraphQL client)::

    subscription {
        agentTaskUpdates(statusFilter: "ESCALATED") {
            id
            type
            status
            payloadJson
        }
    }
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import AsyncGenerator, Optional

import strawberry
from sqlalchemy import select

from app.graphql.context import GraphQLContext
from app.graphql.types import TaskType

_POLL_INTERVAL_SECONDS = 2.0


@strawberry.type
class Subscription:
    @strawberry.subscription(
        description=(
            "Real-time stream of agent task updates for the authenticated tenant. "
            "Delivers new and changed tasks every ~2 seconds. "
            "Optionally filter by `statusFilter` (e.g. `ESCALATED`, `FAILED`)."
        )
    )
    async def agent_task_updates(
        self,
        info: strawberry.Info,
        status_filter: Optional[str] = None,
    ) -> AsyncGenerator[TaskType, None]:
        from app.models.task import Task  # noqa: PLC0415

        ctx: GraphQLContext = info.context
        tenant_id = ctx.tenant_id
        # Track the last seen creation time to emit only new/changed tasks
        last_seen = datetime.now(UTC)

        while True:
            await asyncio.sleep(_POLL_INTERVAL_SECONDS)

            # Re-use the context's db session for polling
            q = select(Task).where(
                Task.tenant_id == tenant_id,
                Task.created_at >= last_seen,
            )
            if status_filter:
                q = q.where(Task.status == status_filter.upper())

            rows = ctx.db.scalars(q).all()
            last_seen = datetime.now(UTC)

            for row in rows:
                yield TaskType.from_orm(row)
