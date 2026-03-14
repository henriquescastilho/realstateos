"""Maintenance cost estimator — LlmAgent that estimates repair cost from ticket
description + historical similar tickets retrieved via pgvector.

Returns a cost range (min / expected / max) with confidence level.

Non-ADK fallback: rule-based category lookup when google-adk is unavailable.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

logger = logging.getLogger(__name__)

try:
    from google.adk.agents import LlmAgent  # type: ignore
    _ADK_AVAILABLE = True
except ModuleNotFoundError:  # pragma: no cover
    LlmAgent = None  # type: ignore[assignment,misc]
    _ADK_AVAILABLE = False

try:
    from sqlalchemy import text as sqla_text  # type: ignore
    _SQLA_AVAILABLE = True
except ImportError:
    _SQLA_AVAILABLE = False

from app.config import settings

# ---------------------------------------------------------------------------
# Category-based rule fallback
# ---------------------------------------------------------------------------

# Approximate cost ranges in BRL (min, expected, max)
_CATEGORY_RANGES: dict[str, tuple[float, float, float]] = {
    "hidraulica": (150.0, 400.0, 1200.0),
    "eletrica": (200.0, 500.0, 2000.0),
    "pintura": (300.0, 800.0, 3000.0),
    "vidracaria": (200.0, 600.0, 2500.0),
    "serralheria": (150.0, 400.0, 1500.0),
    "limpeza": (100.0, 250.0, 600.0),
    "jardinagem": (80.0, 200.0, 500.0),
    "ar_condicionado": (200.0, 600.0, 2500.0),
    "telhado": (500.0, 1500.0, 6000.0),
    "piso": (400.0, 1200.0, 4000.0),
    "geral": (150.0, 500.0, 2000.0),
}

_KEYWORDS: dict[str, list[str]] = {
    "hidraulica": ["vazamento", "cano", "torneira", "encanamento", "esgoto", "água", "chuveiro", "vaso"],
    "eletrica": ["elétrico", "tomada", "disjuntor", "fio", "curto", "lâmpada", "instalação elétrica"],
    "pintura": ["pintura", "tinta", "reboco", "infiltração", "umidade", "bolor", "mofo"],
    "vidracaria": ["vidro", "janela", "box", "espelho", "vidraça"],
    "serralheria": ["portão", "grade", "fechadura", "porta", "maçaneta", "trava", "chave"],
    "limpeza": ["limpeza", "higienização", "desentupimento"],
    "jardinagem": ["jardim", "grama", "planta", "poda", "árvore"],
    "ar_condicionado": ["ar condicionado", "split", "climatizador", "ventilação"],
    "telhado": ["telhado", "telha", "calha", "goteira"],
    "piso": ["piso", "cerâmica", "porcelanato", "azulejo", "revestimento"],
}


def _classify_category(description: str) -> str:
    desc_lower = description.lower()
    for category, keywords in _KEYWORDS.items():
        if any(kw in desc_lower for kw in keywords):
            return category
    return "geral"


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class CostEstimate:
    ticket_id: str
    description: str
    category: str
    cost_min: Decimal
    cost_expected: Decimal
    cost_max: Decimal
    confidence: str   # "low" | "medium" | "high"
    similar_tickets_used: int = 0
    explanation: str = ""


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

def find_similar_tickets(db: Any, description: str, limit: int = 5) -> list[dict]:
    """
    Retrieve similar past maintenance tickets via pgvector cosine similarity.
    Falls back to full-text search.
    """
    from app.services.vector_search import generate_embedding  # type: ignore

    results: list[dict] = []

    try:
        embedding = generate_embedding(description)
    except Exception:
        embedding = None

    if embedding is not None and _SQLA_AVAILABLE:
        embedding_literal = "[" + ",".join(str(v) for v in embedding) + "]"
        try:
            rows = db.execute(
                sqla_text(
                    """
                    SELECT t.id, t.description, t.resolution_notes,
                           t.actual_cost, t.category,
                           1 - (t.embedding <=> :emb::vector) AS similarity
                    FROM tasks t
                    WHERE t.type = 'maintenance'
                      AND t.status = 'resolved'
                      AND t.actual_cost IS NOT NULL
                      AND t.actual_cost > 0
                    ORDER BY t.embedding <=> :emb::vector
                    LIMIT :lim
                    """
                ),
                {"emb": embedding_literal, "lim": limit},
            ).fetchall()
            results = [
                {
                    "ticket_id": str(r[0]),
                    "description": r[1],
                    "resolution": r[2],
                    "actual_cost": float(r[3] or 0),
                    "category": r[4],
                    "similarity": float(r[5]),
                }
                for r in rows
            ]
            if results:
                return results
        except Exception as exc:
            logger.warning("cost_estimator: pgvector search failed: %s", exc)

    # Full-text fallback
    if _SQLA_AVAILABLE:
        try:
            rows = db.execute(
                sqla_text(
                    """
                    SELECT t.id, t.description, t.resolution_notes,
                           t.actual_cost, t.category, 0.5 AS similarity
                    FROM tasks t
                    WHERE t.type = 'maintenance'
                      AND t.status = 'resolved'
                      AND t.actual_cost IS NOT NULL
                      AND t.actual_cost > 0
                      AND to_tsvector('portuguese', t.description)
                          @@ plainto_tsquery('portuguese', :q)
                    LIMIT :lim
                    """
                ),
                {"q": description, "lim": limit},
            ).fetchall()
            results = [
                {
                    "ticket_id": str(r[0]),
                    "description": r[1],
                    "resolution": r[2],
                    "actual_cost": float(r[3] or 0),
                    "category": r[4],
                    "similarity": float(r[5]),
                }
                for r in rows
            ]
        except Exception as exc:
            logger.warning("cost_estimator: full-text fallback failed: %s", exc)

    return results


def get_ticket_context(db: Any, ticket_id: str) -> dict:
    """Fetch ticket details for cost estimation context."""
    if not _SQLA_AVAILABLE:
        return {}
    try:
        row = db.execute(
            sqla_text(
                """
                SELECT t.id, t.description, t.priority, t.category,
                       p.address AS property_address, p.type AS property_type
                FROM tasks t
                LEFT JOIN properties p ON p.id = t.property_id
                WHERE t.id = :tid
                LIMIT 1
                """
            ),
            {"tid": ticket_id},
        ).fetchone()
        if row is None:
            return {}
        return {
            "ticket_id": str(row[0]),
            "description": row[1],
            "priority": row[2],
            "category": row[3],
            "property_address": row[4],
            "property_type": row[5],
        }
    except Exception as exc:
        logger.warning("cost_estimator: get_ticket_context failed: %s", exc)
        return {}


# ---------------------------------------------------------------------------
# Rule-based fallback
# ---------------------------------------------------------------------------

def estimate_cost_rule_based(db: Any, ticket_id: str) -> CostEstimate:
    """Estimate cost using category rules + historical similar ticket costs."""
    ctx = get_ticket_context(db, ticket_id)
    description = ctx.get("description", "")
    category = ctx.get("category") or _classify_category(description)

    similar = find_similar_tickets(db, description, limit=5)

    if similar:
        costs = [s["actual_cost"] for s in similar if s["actual_cost"] > 0]
        if costs:
            cost_min = Decimal(str(min(costs))).quantize(Decimal("0.01"))
            cost_max = Decimal(str(max(costs))).quantize(Decimal("0.01"))
            cost_expected = Decimal(str(sum(costs) / len(costs))).quantize(Decimal("0.01"))
            confidence = "high" if len(similar) >= 3 else "medium"
            explanation = (
                f"Estimativa baseada em {len(similar)} chamados similares históricos. "
                f"Categoria: {category}. "
                f"Valor esperado: R$ {cost_expected:.2f} "
                f"(mín R$ {cost_min:.2f} / máx R$ {cost_max:.2f})."
            )
            return CostEstimate(
                ticket_id=ticket_id,
                description=description,
                category=category,
                cost_min=cost_min,
                cost_expected=cost_expected,
                cost_max=cost_max,
                confidence=confidence,
                similar_tickets_used=len(similar),
                explanation=explanation,
            )

    # Pure category-based fallback
    range_min, range_expected, range_max = _CATEGORY_RANGES.get(category, _CATEGORY_RANGES["geral"])
    explanation = (
        f"Estimativa baseada na categoria '{category}' (sem histórico similar). "
        f"Valor esperado: R$ {range_expected:.2f} "
        f"(mín R$ {range_min:.2f} / máx R$ {range_max:.2f})."
    )
    return CostEstimate(
        ticket_id=ticket_id,
        description=description,
        category=category,
        cost_min=Decimal(str(range_min)),
        cost_expected=Decimal(str(range_expected)),
        cost_max=Decimal(str(range_max)),
        confidence="low",
        similar_tickets_used=0,
        explanation=explanation,
    )


# ---------------------------------------------------------------------------
# LlmAgent
# ---------------------------------------------------------------------------

_INSTRUCTION = """
You are MaintenanceCostEstimatorAgent for Real Estate OS — a specialist in
estimating residential maintenance and repair costs in Brazil.

Workflow:
1. Call get_ticket_context(ticket_id) to understand the problem.
2. Call find_similar_tickets(description, limit=5) to find historical cases.
3. Analyse the similar tickets and the problem description to produce a cost estimate.
4. Return a JSON with:
   - category: string (e.g. "hidraulica", "eletrica", "pintura")
   - cost_min: string (BRL)
   - cost_expected: string (BRL)
   - cost_max: string (BRL)
   - confidence: "low" | "medium" | "high"
   - explanation: 2-3 sentences in Portuguese explaining the estimate

Rules:
- Base estimates on historical data when available. Do not invent costs.
- If no similar tickets, use typical Brazilian market rates for the category.
- confidence = "high" when 3+ similar tickets found, "medium" for 1-2, "low" for 0.
- Include labour + materials in the estimate.
- Never express uncertainty as a wide range when data is available.
"""


def build_cost_estimator_agent(tools: list) -> Any:
    """Build the MaintenanceCostEstimatorAgent LlmAgent."""
    if not _ADK_AVAILABLE or LlmAgent is None:
        logger.warning("google-adk not installed — CostEstimatorAgent ADK mode unavailable")
        return None

    return LlmAgent(
        name="MaintenanceCostEstimatorAgent",
        model=settings.google_adk_model,
        instruction=_INSTRUCTION,
        tools=tools,
    )
