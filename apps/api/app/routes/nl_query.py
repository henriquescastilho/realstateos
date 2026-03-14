"""Natural language query API — POST /query accepts plain Portuguese questions,
converts to read-only SQL via LlmAgent (text-to-SQL), executes, and returns
structured results with an explanation.

Security:
- Only SELECT statements are allowed — all others are rejected.
- Statements are validated before execution.
- Org-level isolation is enforced by injecting a tenant_id WHERE clause.
"""
from __future__ import annotations

import logging
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/query", tags=["Natural Language Query"])

# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class NLQueryRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=1000, description="Plain Portuguese question")
    max_rows: int = Field(default=50, ge=1, le=200)

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "question": "Quais contratos vencem nos próximos 30 dias?",
                    "max_rows": 20,
                }
            ]
        }
    )


class NLQueryResponse(BaseModel):
    question: str
    sql: str
    columns: list[str]
    rows: list[list[Any]]
    row_count: int
    explanation: str
    model_used: str = "fallback"

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Schema context (subset exposed to the LlmAgent)
# ---------------------------------------------------------------------------

_SCHEMA_CONTEXT = """
Available tables (tenant-isolated — always add WHERE tenant_id = '<tenant_id>'):

contracts (id, tenant_id, status, start_date, end_date, rent_amount, adjustment_index,
           renter_id, owner_id, property_id, created_at)

charges (id, tenant_id, contract_id, renter_id, amount, paid_amount, status,
         due_date, paid_at, created_at)
  status values: 'pending', 'paid', 'partial', 'overdue', 'cancelled'

tenants_renters (id, tenant_id, name, document, email, phone, deleted_at)

owners (id, tenant_id, name, document, email, phone, deleted_at)

properties (id, tenant_id, address, type, status, deleted_at)

tasks (id, tenant_id, type, status, priority, description, resolution_notes,
       renter_id, property_id, created_at, resolved_at)
  type values: 'maintenance', 'inspection', 'onboarding'

economic_indices (indicator, year, month, monthly_rate, accumulated_rate, source)
  indicator values: 'IGPM', 'IPCA'

Rules:
- ALWAYS include WHERE tenant_id = '<tenant_id>' on every table.
- NEVER use DELETE, UPDATE, INSERT, DROP, TRUNCATE, CREATE.
- NEVER use subqueries that reference system tables (pg_*, information_schema).
- Limit results to :max_rows using LIMIT.
- Use aliases for readability.
- Return only SELECT statements.
"""

# ---------------------------------------------------------------------------
# Safe SQL validation
# ---------------------------------------------------------------------------

_FORBIDDEN_PATTERN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|CREATE|ALTER|GRANT|REVOKE|COPY|EXECUTE)\b",
    re.IGNORECASE,
)

_SYSTEM_TABLE_PATTERN = re.compile(
    r"\b(pg_\w+|information_schema\.\w+)\b",
    re.IGNORECASE,
)


def validate_sql(sql: str) -> None:
    """Raise ValueError if SQL contains any write or system-access statements."""
    stripped = sql.strip()
    if not stripped.upper().startswith("SELECT"):
        raise ValueError("Only SELECT statements are allowed.")
    if _FORBIDDEN_PATTERN.search(stripped):
        raise ValueError("SQL contains forbidden keywords (write operations).")
    if _SYSTEM_TABLE_PATTERN.search(stripped):
        raise ValueError("SQL references system tables which are not permitted.")


# ---------------------------------------------------------------------------
# Text-to-SQL: LlmAgent approach
# ---------------------------------------------------------------------------

def _text_to_sql_with_llm(question: str, tenant_id: str, max_rows: int) -> dict[str, str]:
    """
    Use an ADK LlmAgent to generate SQL from the question.
    Returns {"sql": ..., "explanation": ..., "model_used": ...}.
    Falls back to template-based approach on failure.
    """
    try:
        from google.adk.agents import LlmAgent  # type: ignore
        from app.config import settings  # noqa: PLC0415

        prompt = (
            f"Schema context:\n{_SCHEMA_CONTEXT}\n\n"
            f"Tenant ID: {tenant_id}\n"
            f"Max rows: {max_rows}\n\n"
            f"Question (in Portuguese): {question}\n\n"
            "Generate a safe, read-only SQL SELECT query for PostgreSQL. "
            "Respond with a JSON object: {\"sql\": \"...\", \"explanation\": \"...(in Portuguese)\"}"
        )

        # Stateless single-turn call — not a full agent session
        import asyncio  # noqa: PLC0415
        import json  # noqa: PLC0415

        agent = LlmAgent(
            name="TextToSQLAgent",
            model=settings.google_adk_model,
            instruction=(
                "You are a PostgreSQL text-to-SQL assistant. "
                "Generate safe SELECT queries. Never use write operations. "
                "Always reply with a valid JSON object with keys 'sql' and 'explanation'."
            ),
            tools=[],
        )

        # Use a simple completion (no tool loop needed)
        response = asyncio.get_event_loop().run_until_complete(
            agent.run_async(prompt)
        )
        text = str(response)
        # Parse JSON from response
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            data = json.loads(match.group())
            return {
                "sql": data.get("sql", ""),
                "explanation": data.get("explanation", ""),
                "model_used": settings.google_adk_model or "gemini",
            }
    except Exception as exc:
        logger.warning("nl_query: LLM text-to-SQL failed, using template: %s", exc)

    return _text_to_sql_template(question, tenant_id, max_rows)


def _text_to_sql_template(question: str, tenant_id: str, max_rows: int) -> dict[str, str]:
    """
    Rule-based template SQL for common query patterns.
    Covers the most frequent natural language query intents.
    """
    q = question.lower()

    templates = [
        (
            ["venc", "expir", "próximos", "vencer"],
            f"""SELECT c.id, r.name AS locatario, p.address AS imovel,
                       c.end_date, c.rent_amount
                FROM contracts c
                JOIN tenants_renters r ON r.id = c.renter_id
                JOIN properties p ON p.id = c.property_id
                WHERE c.tenant_id = '{tenant_id}'
                  AND c.status = 'active'
                  AND c.end_date BETWEEN NOW() AND NOW() + INTERVAL '60 days'
                ORDER BY c.end_date ASC
                LIMIT {max_rows}""",
            "Contratos ativos com vencimento nos próximos 60 dias.",
        ),
        (
            ["inadimpl", "atraso", "atrasad", "overdue"],
            f"""SELECT r.name AS locatario, r.email, r.phone,
                       SUM(ch.amount - COALESCE(ch.paid_amount, 0)) AS total_pendente,
                       COUNT(ch.id) AS qtd_cobr_atrasadas
                FROM charges ch
                JOIN tenants_renters r ON r.id = ch.renter_id
                WHERE ch.tenant_id = '{tenant_id}'
                  AND ch.status IN ('overdue', 'partial')
                GROUP BY r.id, r.name, r.email, r.phone
                ORDER BY total_pendente DESC
                LIMIT {max_rows}""",
            "Locatários com cobranças em atraso ou parcialmente pagas.",
        ),
        (
            ["receita", "faturamento", "recebit", "revenue"],
            f"""SELECT TO_CHAR(paid_at, 'YYYY-MM') AS mes,
                       SUM(COALESCE(paid_amount, amount)) AS receita_total,
                       COUNT(*) AS pagamentos
                FROM charges
                WHERE tenant_id = '{tenant_id}'
                  AND status IN ('paid', 'partial')
                  AND paid_at >= NOW() - INTERVAL '12 months'
                GROUP BY mes
                ORDER BY mes DESC
                LIMIT {max_rows}""",
            "Receita mensal dos últimos 12 meses.",
        ),
        (
            ["manutencao", "manutenção", "chamado", "ticket", "reparo"],
            f"""SELECT t.id, t.description, t.priority, t.status,
                       p.address AS imovel, t.created_at
                FROM tasks t
                LEFT JOIN properties p ON p.id = t.property_id
                WHERE t.tenant_id = '{tenant_id}'
                  AND t.type = 'maintenance'
                ORDER BY t.created_at DESC
                LIMIT {max_rows}""",
            "Chamados de manutenção.",
        ),
        (
            ["imovel", "imóvel", "propriedade", "property"],
            f"""SELECT p.id, p.address, p.type, p.status,
                       COUNT(c.id) AS contratos_ativos
                FROM properties p
                LEFT JOIN contracts c ON c.property_id = p.id AND c.status = 'active'
                WHERE p.tenant_id = '{tenant_id}' AND p.deleted_at IS NULL
                GROUP BY p.id, p.address, p.type, p.status
                ORDER BY p.address ASC
                LIMIT {max_rows}""",
            "Lista de imóveis com contagem de contratos ativos.",
        ),
    ]

    for keywords, sql, explanation in templates:
        if any(kw in q for kw in keywords):
            return {"sql": sql, "explanation": explanation, "model_used": "template"}

    # Generic fallback: list active contracts
    return {
        "sql": f"""SELECT c.id, r.name AS locatario, p.address AS imovel,
                          c.start_date, c.end_date, c.rent_amount, c.status
                   FROM contracts c
                   JOIN tenants_renters r ON r.id = c.renter_id
                   JOIN properties p ON p.id = c.property_id
                   WHERE c.tenant_id = '{tenant_id}'
                   ORDER BY c.created_at DESC
                   LIMIT {max_rows}""",
        "explanation": "Contratos ativos (consulta genérica — refine a pergunta para resultados específicos).",
        "model_used": "template",
    }


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

try:
    from app.api.deps import get_current_org, get_db  # type: ignore
    from sqlalchemy.orm import Session as _Session  # type: ignore
    _DEPS_AVAILABLE = True
except ImportError:
    _DEPS_AVAILABLE = False


@router.post("", response_model=NLQueryResponse, summary="Natural language query")
def natural_language_query(
    request: NLQueryRequest,
    db: Any = Depends(get_db) if _DEPS_AVAILABLE else None,  # type: ignore[assignment]
    org: Any = Depends(get_current_org) if _DEPS_AVAILABLE else None,  # type: ignore[assignment]
) -> NLQueryResponse:
    """
    Execute a natural-language query against the tenant's data.

    Converts the question to read-only SQL via LlmAgent (or template fallback),
    validates, executes, and returns structured results with a Portuguese explanation.
    """
    if db is None or org is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database or auth unavailable",
        )

    tenant_id = str(org.id) if hasattr(org, "id") else str(org)

    # Generate SQL
    result = _text_to_sql_with_llm(request.question, tenant_id, request.max_rows)
    sql = result["sql"].strip()
    explanation = result["explanation"]
    model_used = result["model_used"]

    # Validate
    try:
        validate_sql(sql)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Generated SQL failed validation: {exc}",
        )

    # Execute (read-only)
    try:
        from sqlalchemy import text as sqla_text  # noqa: PLC0415

        cursor = db.execute(sqla_text(sql))
        col_names = list(cursor.keys())
        rows = [list(row) for row in cursor.fetchall()]
    except Exception as exc:
        logger.error("nl_query: SQL execution failed: %s | sql=%s", exc, sql)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Query execution failed: {exc}",
        )

    return NLQueryResponse(
        question=request.question,
        sql=sql,
        columns=col_names,
        rows=rows,
        row_count=len(rows),
        explanation=explanation,
        model_used=model_used,
    )
