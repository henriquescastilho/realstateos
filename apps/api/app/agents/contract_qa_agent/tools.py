"""Contract Q&A tools — semantic search over contract chunks via pgvector."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional imports
# ---------------------------------------------------------------------------
try:
    from sqlalchemy.orm import Session  # type: ignore
    _SQLA_AVAILABLE = True
except ImportError:
    _SQLA_AVAILABLE = False

try:
    from sqlalchemy import text  # type: ignore
    _TEXT_AVAILABLE = True
except ImportError:
    _TEXT_AVAILABLE = False


@dataclass
class ContractChunk:
    chunk_id: str
    contract_id: str
    content: str
    similarity: float
    chunk_index: int


# ---------------------------------------------------------------------------
# Embedding helper (reuses vector_search logic)
# ---------------------------------------------------------------------------

def _embed(query: str) -> list[float] | None:
    """Generate embedding for query text. Returns None on failure."""
    try:
        from app.services.vector_search import generate_embedding  # type: ignore
        return generate_embedding(query)
    except Exception as exc:
        logger.warning("contract_qa: embedding failed: %s", exc)
        return None


def _keyword_fallback(db: Any, contract_id: str, query: str, limit: int) -> list[ContractChunk]:
    """Full-text search fallback when pgvector is unavailable."""
    if not _SQLA_AVAILABLE or not _TEXT_AVAILABLE:
        return []
    from sqlalchemy import text  # noqa: PLC0415

    try:
        rows = db.execute(
            text(
                """
                SELECT id, contract_id, content, 0.5 AS similarity, chunk_index
                FROM contract_chunks
                WHERE contract_id = :cid
                  AND to_tsvector('portuguese', content) @@ plainto_tsquery('portuguese', :q)
                ORDER BY chunk_index
                LIMIT :lim
                """
            ),
            {"cid": contract_id, "q": query, "lim": limit},
        ).fetchall()
        return [
            ContractChunk(
                chunk_id=str(r[0]),
                contract_id=str(r[1]),
                content=r[2],
                similarity=float(r[3]),
                chunk_index=int(r[4]),
            )
            for r in rows
        ]
    except Exception as exc:
        logger.warning("contract_qa: keyword fallback failed: %s", exc)
        return []


# ---------------------------------------------------------------------------
# Core tool
# ---------------------------------------------------------------------------

def search_contract_chunks(
    db: Any,
    contract_id: str,
    query: str,
    limit: int = 5,
) -> list[ContractChunk]:
    """
    Semantic search over chunks of a specific contract using pgvector.

    Args:
        db:          SQLAlchemy session.
        contract_id: UUID of the contract to scope the search.
        query:       Natural language question or search text.
        limit:       Maximum number of chunks to return.

    Returns:
        List of ContractChunk ordered by cosine similarity (descending).
        Falls back to full-text search if embeddings are unavailable.
    """
    if not _SQLA_AVAILABLE or not _TEXT_AVAILABLE:
        return []

    from sqlalchemy import text as sqla_text  # noqa: PLC0415

    embedding = _embed(query)

    if embedding is not None:
        embedding_literal = "[" + ",".join(str(v) for v in embedding) + "]"
        try:
            rows = db.execute(
                sqla_text(
                    """
                    SELECT id, contract_id, content,
                           1 - (embedding <=> :emb::vector) AS similarity,
                           chunk_index
                    FROM contract_chunks
                    WHERE contract_id = :cid
                    ORDER BY embedding <=> :emb::vector
                    LIMIT :lim
                    """
                ),
                {"cid": contract_id, "emb": embedding_literal, "lim": limit},
            ).fetchall()
            return [
                ContractChunk(
                    chunk_id=str(r[0]),
                    contract_id=str(r[1]),
                    content=r[2],
                    similarity=float(r[3]),
                    chunk_index=int(r[4]),
                )
                for r in rows
            ]
        except Exception as exc:
            logger.warning("contract_qa: pgvector query failed, falling back: %s", exc)

    return _keyword_fallback(db, contract_id, query, limit)


def get_contract_metadata(db: Any, contract_id: str) -> dict:
    """
    Fetch contract header metadata for context (parties, property, dates, index).

    Returns a dict or empty dict on failure.
    """
    if not _SQLA_AVAILABLE or not _TEXT_AVAILABLE:
        return {}

    from sqlalchemy import text as sqla_text  # noqa: PLC0415

    try:
        row = db.execute(
            sqla_text(
                """
                SELECT c.id, c.status, c.start_date, c.end_date,
                       c.rent_amount, c.adjustment_index,
                       p.address AS property_address,
                       r.name AS renter_name,
                       o.name AS owner_name
                FROM contracts c
                LEFT JOIN properties p ON p.id = c.property_id
                LEFT JOIN tenants_renters r ON r.id = c.renter_id
                LEFT JOIN owners o ON o.id = c.owner_id
                WHERE c.id = :cid
                LIMIT 1
                """
            ),
            {"cid": contract_id},
        ).fetchone()

        if row is None:
            return {}

        return {
            "contract_id": str(row[0]),
            "status": row[1],
            "start_date": str(row[2]) if row[2] else None,
            "end_date": str(row[3]) if row[3] else None,
            "rent_amount": float(row[4]) if row[4] else None,
            "adjustment_index": row[5],
            "property_address": row[6],
            "renter_name": row[7],
            "owner_name": row[8],
        }
    except Exception as exc:
        logger.warning("contract_qa: get_contract_metadata failed: %s", exc)
        return {}
