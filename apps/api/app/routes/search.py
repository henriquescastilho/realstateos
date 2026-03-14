"""Full-text search endpoint.

GET /search?q=<query>&entity=<contracts|maintenance|communications>&limit=20

Uses PostgreSQL tsvector/tsquery for ranked full-text search across:
- contracts (address, description, renter/owner names via denormalized columns)
- maintenance tasks (type, description from payload)
- tasks (type, payload messages)

tsvector columns and GIN indexes are added via Alembic migration
20260314_0003_fulltext_search.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.middleware.tenant import OrgContext, get_current_org
from app.openapi import AUTH_RESPONSES, RESPONSES_422

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/search", tags=["search"])

_VALID_ENTITIES = frozenset({"contracts", "maintenance", "tasks", "all"})


def _search_contracts(db: Session, tenant_id: str, query: str, limit: int) -> list[dict]:
    """Full-text search on contracts using PostgreSQL tsvector."""
    try:
        rows = db.execute(
            text("""
                SELECT
                    id,
                    'contract' AS entity_type,
                    tenant_id,
                    property_id,
                    renter_id,
                    start_date::text,
                    end_date::text,
                    monthly_rent::text,
                    ts_rank(search_vector, plainto_tsquery('portuguese', :q)) AS rank
                FROM contracts
                WHERE tenant_id = :tenant_id
                  AND search_vector @@ plainto_tsquery('portuguese', :q)
                ORDER BY rank DESC
                LIMIT :limit
            """),
            {"tenant_id": tenant_id, "q": query, "limit": limit},
        ).fetchall()
        return [
            {
                "entity_type": r.entity_type,
                "id": r.id,
                "rank": round(float(r.rank), 4),
                "fields": {
                    "property_id": r.property_id,
                    "renter_id": r.renter_id,
                    "start_date": r.start_date,
                    "end_date": r.end_date,
                    "monthly_rent": r.monthly_rent,
                },
            }
            for r in rows
        ]
    except Exception as exc:  # noqa: BLE001
        logger.warning("FTS contracts failed: %s", exc)
        return []


def _search_tasks(db: Session, tenant_id: str, query: str, limit: int) -> list[dict]:
    """Full-text search on task type and payload text."""
    try:
        rows = db.execute(
            text("""
                SELECT
                    id,
                    'task' AS entity_type,
                    tenant_id,
                    type,
                    status,
                    ts_rank(search_vector, plainto_tsquery('portuguese', :q)) AS rank
                FROM tasks
                WHERE tenant_id = :tenant_id
                  AND search_vector @@ plainto_tsquery('portuguese', :q)
                ORDER BY rank DESC
                LIMIT :limit
            """),
            {"tenant_id": tenant_id, "q": query, "limit": limit},
        ).fetchall()
        return [
            {
                "entity_type": r.entity_type,
                "id": r.id,
                "rank": round(float(r.rank), 4),
                "fields": {
                    "type": r.type,
                    "status": r.status,
                },
            }
            for r in rows
        ]
    except Exception as exc:  # noqa: BLE001
        logger.warning("FTS tasks failed: %s", exc)
        return []


@router.get(
    "",
    summary="Full-text search",
    description=(
        "Ranked full-text search across contracts and tasks using PostgreSQL `tsvector` "
        "with Portuguese language stemming and stop-word removal. "
        "Pass `entity=contracts`, `entity=tasks`, or `entity=all` (default) to narrow scope. "
        "`q` must be at least 2 characters. Results are sorted by relevance rank."
    ),
    responses={**AUTH_RESPONSES, **RESPONSES_422},
)
def full_text_search(
    q: str = Query(..., min_length=2, max_length=200, description="Search query"),
    entity: str = Query("all", description="Entity type: contracts, tasks, all"),
    limit: int = Query(20, ge=1, le=100),
    org: OrgContext = Depends(get_current_org),
    db: Session = Depends(get_db),
) -> dict:
    """Full-text search across multiple entity types.

    Uses PostgreSQL `plainto_tsquery` with Portuguese language configuration
    for stemming and stop-word removal.

    Results are ranked by ts_rank and merged across entity types.
    """
    if entity not in _VALID_ENTITIES:
        entity = "all"

    results: list[dict] = []

    if entity in ("contracts", "all"):
        results.extend(_search_contracts(db, org.tenant_id, q, limit))

    if entity in ("tasks", "all"):
        results.extend(_search_tasks(db, org.tenant_id, q, limit))

    # Sort merged results by rank descending and apply final limit
    results.sort(key=lambda r: r["rank"], reverse=True)
    results = results[:limit]

    return {
        "query": q,
        "entity_filter": entity,
        "total": len(results),
        "results": results,
    }
