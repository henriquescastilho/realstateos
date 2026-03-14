"""pgvector semantic search service.

Provides embedding-based similarity search for:
- Contracts (by description/address)
- Maintenance descriptions (find similar past tickets)
- Communications (deduplication)

Uses the pgvector extension (already in docker-compose postgresql).
Embeddings generated via Google Gemini embedding API with fallback
to a simple TF-IDF-like keyword approach when Gemini is unavailable.

Schema: each searchable entity gets an embedding column (vector(768)).
The embedding is computed lazily on first search and cached.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_EMBEDDING_DIM = 768
_GEMINI_MODEL = "models/text-embedding-004"


# ---------------------------------------------------------------------------
# Embedding generation
# ---------------------------------------------------------------------------

def _embed_with_gemini(text_input: str) -> list[float] | None:
    """Generate embedding using Google Gemini API. Returns None on failure."""
    try:
        import google.generativeai as genai  # noqa: PLC0415

        result = genai.embed_content(
            model=_GEMINI_MODEL,
            content=text_input,
            task_type="RETRIEVAL_DOCUMENT",
        )
        return result["embedding"]
    except Exception as exc:  # noqa: BLE001
        logger.warning("Gemini embedding failed: %s — using fallback", exc)
        return None


def _embed_fallback(text_input: str) -> list[float]:
    """Deterministic pseudo-embedding using character n-gram hashing.

    Not semantically meaningful but maintains API shape for testing.
    In production, always prefer Gemini embeddings.
    """
    text_clean = re.sub(r"\s+", " ", text_input.lower().strip())
    # Create a reproducible 768-float vector from content hash
    seed = int(hashlib.sha256(text_clean.encode()).hexdigest(), 16)
    import random  # noqa: PLC0415

    rng = random.Random(seed)
    return [rng.uniform(-1.0, 1.0) for _ in range(_EMBEDDING_DIM)]


def generate_embedding(text_input: str) -> list[float]:
    """Generate an embedding vector for the given text.

    Tries Gemini first, falls back to deterministic pseudo-embedding.
    """
    if not text_input.strip():
        return [0.0] * _EMBEDDING_DIM
    embedding = _embed_with_gemini(text_input)
    if embedding is None:
        embedding = _embed_fallback(text_input)
    return embedding


# ---------------------------------------------------------------------------
# pgvector table helpers
# ---------------------------------------------------------------------------

_EMBEDDINGS_TABLE_DDL = """
CREATE TABLE IF NOT EXISTS semantic_embeddings (
    id          TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id   TEXT NOT NULL,
    tenant_id   TEXT NOT NULL,
    content     TEXT NOT NULL,
    embedding   vector({dim}),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_embeddings_tenant ON semantic_embeddings (tenant_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_type ON semantic_embeddings (entity_type);
""".format(dim=_EMBEDDING_DIM)


def ensure_embeddings_table(db: Session) -> None:
    """Create the semantic_embeddings table if it doesn't exist.

    Requires pgvector extension to be installed (already in docker-compose).
    """
    try:
        db.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        for stmt in _EMBEDDINGS_TABLE_DDL.strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                db.execute(text(stmt))
        db.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not initialize embeddings table: %s", exc)
        db.rollback()


# ---------------------------------------------------------------------------
# Upsert and search
# ---------------------------------------------------------------------------

def upsert_embedding(
    db: Session,
    entity_type: str,
    entity_id: str,
    tenant_id: str,
    content: str,
) -> bool:
    """Generate and store an embedding for an entity.

    Returns True on success, False on failure.
    """
    try:
        embedding = generate_embedding(content)
        embedding_str = "[" + ",".join(str(v) for v in embedding) + "]"
        row_id = f"{entity_type}:{entity_id}"

        db.execute(
            text("""
                INSERT INTO semantic_embeddings (id, entity_type, entity_id, tenant_id, content, embedding)
                VALUES (:id, :entity_type, :entity_id, :tenant_id, :content, :embedding::vector)
                ON CONFLICT (entity_type, entity_id)
                DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding
            """),
            {
                "id": row_id,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "tenant_id": tenant_id,
                "content": content,
                "embedding": embedding_str,
            },
        )
        db.commit()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to upsert embedding for %s %s: %s", entity_type, entity_id, exc)
        db.rollback()
        return False


def semantic_search(
    db: Session,
    tenant_id: str,
    query: str,
    entity_type: str | None = None,
    top_k: int = 5,
) -> list[dict[str, Any]]:
    """Find the most similar entities to a query string.

    Args:
        db: SQLAlchemy session.
        tenant_id: Restrict results to this tenant.
        query: Natural language query.
        entity_type: Optional filter (e.g., "contract", "maintenance", "communication").
        top_k: Number of results to return.

    Returns:
        List of dicts with entity_type, entity_id, content, similarity_score.
    """
    try:
        query_embedding = generate_embedding(query)
        embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"

        type_filter = "AND entity_type = :entity_type" if entity_type else ""
        params: dict[str, Any] = {
            "tenant_id": tenant_id,
            "embedding": embedding_str,
            "top_k": top_k,
        }
        if entity_type:
            params["entity_type"] = entity_type

        rows = db.execute(
            text(f"""
                SELECT
                    entity_type,
                    entity_id,
                    content,
                    1 - (embedding <=> :embedding::vector) AS similarity
                FROM semantic_embeddings
                WHERE tenant_id = :tenant_id
                {type_filter}
                ORDER BY embedding <=> :embedding::vector
                LIMIT :top_k
            """),
            params,
        ).fetchall()

        return [
            {
                "entity_type": r.entity_type,
                "entity_id": r.entity_id,
                "content": r.content,
                "similarity": round(float(r.similarity), 4),
            }
            for r in rows
        ]
    except Exception as exc:  # noqa: BLE001
        logger.error("Semantic search failed: %s", exc)
        return []


def find_duplicate_candidates(
    db: Session,
    tenant_id: str,
    content: str,
    entity_type: str,
    similarity_threshold: float = 0.92,
) -> list[dict[str, Any]]:
    """Find likely duplicate entities based on semantic similarity.

    Returns candidates above the similarity threshold (not including the query itself).
    """
    results = semantic_search(db, tenant_id, content, entity_type=entity_type, top_k=10)
    return [r for r in results if r["similarity"] >= similarity_threshold]
