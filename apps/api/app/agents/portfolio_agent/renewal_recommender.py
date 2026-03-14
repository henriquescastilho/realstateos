"""Contract renewal recommender — LlmAgent that analyses expiring contracts and
recommends: renew (good payer), renegotiate (late payer with reason), or terminate
(chronic default). Sends draft email to owner.

Non-ADK fallback: rule-based scoring from payment history.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
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
# Constants
# ---------------------------------------------------------------------------

RECOMMENDATION_RENEW = "renew"
RECOMMENDATION_RENEGOTIATE = "renegotiate"
RECOMMENDATION_TERMINATE = "terminate"

# Thresholds for rule-based logic
_CHRONIC_DEFAULT_THRESHOLD = 3    # >= 3 late payments → terminate candidate
_LATE_PAYMENT_RATE_RENEGOTIATE = 0.20   # >= 20% late → renegotiate

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class ContractRenewalSummary:
    contract_id: str
    renter_name: str
    owner_name: str
    owner_email: str
    property_address: str
    end_date: str
    current_rent: float
    payment_count: int
    late_payment_count: int
    late_payment_rate: float
    max_days_late: float
    unpaid_total: float


@dataclass
class RenewalRecommendation:
    contract_id: str
    recommendation: str          # renew | renegotiate | terminate
    confidence: str              # low | medium | high
    reasoning: str               # Plain Portuguese
    draft_email_subject: str = ""
    draft_email_body: str = ""
    recommended_at: datetime = field(default_factory=lambda: datetime.now(tz=timezone.utc))


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

def get_expiring_contracts(db: Any, days_ahead: int = 60) -> list[dict]:
    """Return contracts expiring within `days_ahead` days with payment summary."""
    if not _SQLA_AVAILABLE:
        return []
    try:
        rows = db.execute(
            sqla_text(
                """
                SELECT
                    c.id, c.end_date, c.rent_amount,
                    r.name AS renter_name,
                    o.name AS owner_name, o.email AS owner_email,
                    p.address AS property_address,
                    COUNT(ch.id) AS payment_count,
                    SUM(CASE WHEN ch.paid_at > ch.due_date THEN 1 ELSE 0 END) AS late_count,
                    COALESCE(AVG(GREATEST(
                        EXTRACT(EPOCH FROM (ch.paid_at - ch.due_date)) / 86400, 0
                    )), 0) AS avg_days_late,
                    COALESCE(MAX(GREATEST(
                        EXTRACT(EPOCH FROM (ch.paid_at - ch.due_date)) / 86400, 0
                    )), 0) AS max_days_late,
                    COALESCE(SUM(
                        CASE WHEN ch.status IN ('overdue','partial')
                        THEN ch.amount - COALESCE(ch.paid_amount, 0) ELSE 0 END
                    ), 0) AS unpaid_total
                FROM contracts c
                JOIN tenants_renters r ON r.id = c.renter_id
                JOIN owners o ON o.id = c.owner_id
                JOIN properties p ON p.id = c.property_id
                LEFT JOIN charges ch ON ch.contract_id = c.id
                    AND ch.status IN ('paid', 'partial', 'overdue')
                WHERE c.status = 'active'
                  AND c.end_date BETWEEN NOW() AND NOW() + INTERVAL ':days days'
                GROUP BY c.id, c.end_date, c.rent_amount, r.name, o.name, o.email, p.address
                ORDER BY c.end_date ASC
                """
            ),
            {"days": days_ahead},
        ).fetchall()

        return [
            {
                "contract_id": str(r[0]),
                "end_date": str(r[1]),
                "rent_amount": float(r[2] or 0),
                "renter_name": r[3],
                "owner_name": r[4],
                "owner_email": r[5],
                "property_address": r[6],
                "payment_count": int(r[7] or 0),
                "late_count": int(r[8] or 0),
                "avg_days_late": float(r[9] or 0),
                "max_days_late": float(r[10] or 0),
                "unpaid_total": float(r[11] or 0),
            }
            for r in rows
        ]
    except Exception as exc:
        logger.warning("renewal_recommender: get_expiring_contracts failed: %s", exc)
        return []


def compose_renewal_email(
    owner_name: str,
    renter_name: str,
    property_address: str,
    end_date: str,
    recommendation: str,
    reasoning: str,
) -> dict[str, str]:
    """Compose a draft email to the owner about contract renewal."""
    action_map = {
        RECOMMENDATION_RENEW: "renovar o contrato",
        RECOMMENDATION_RENEGOTIATE: "negociar novos termos",
        RECOMMENDATION_TERMINATE: "encerrar o contrato",
    }
    action = action_map.get(recommendation, "revisar o contrato")

    subject = (
        f"Análise de Renovação — {renter_name} / {property_address} "
        f"(vencimento {end_date})"
    )
    body = (
        f"Prezado(a) {owner_name},\n\n"
        f"O contrato do imóvel {property_address} com o(a) locatário(a) "
        f"{renter_name} vence em {end_date}.\n\n"
        f"Nossa análise recomenda: **{action.upper()}**\n\n"
        f"Justificativa:\n{reasoning}\n\n"
        f"Por favor, entre em contato conosco para confirmar a decisão ou agendar uma reunião.\n\n"
        f"Atenciosamente,\nReal Estate OS"
    )
    return {"subject": subject, "body": body}


# ---------------------------------------------------------------------------
# Rule-based fallback
# ---------------------------------------------------------------------------

def recommend_rule_based(summary: dict) -> RenewalRecommendation:
    """Generate recommendation based on payment history metrics."""
    payment_count = int(summary.get("payment_count", 0))
    late_count = int(summary.get("late_count", 0))
    max_days_late = float(summary.get("max_days_late", 0))
    unpaid_total = float(summary.get("unpaid_total", 0))

    late_rate = late_count / payment_count if payment_count > 0 else 0.0

    # Decision logic
    if late_count >= _CHRONIC_DEFAULT_THRESHOLD and max_days_late > 30:
        recommendation = RECOMMENDATION_TERMINATE
        confidence = "high"
        reasoning = (
            f"O locatário(a) {summary['renter_name']} teve {late_count} pagamentos em atraso "
            f"(taxa de {late_rate:.0%}), com atraso máximo de {max_days_late:.0f} dias. "
            f"Débito pendente: R$ {unpaid_total:.2f}. Recomenda-se encerramento do contrato."
        )
    elif late_rate >= _LATE_PAYMENT_RATE_RENEGOTIATE or unpaid_total > 0:
        recommendation = RECOMMENDATION_RENEGOTIATE
        confidence = "medium"
        reasoning = (
            f"O locatário(a) {summary['renter_name']} apresentou atrasos em {late_rate:.0%} "
            f"dos pagamentos. Recomenda-se renegociar termos (ex.: dia de vencimento, multas) "
            f"antes de renovar. Débito pendente: R$ {unpaid_total:.2f}."
        )
    else:
        recommendation = RECOMMENDATION_RENEW
        confidence = "high" if payment_count >= 6 else "medium"
        reasoning = (
            f"O locatário(a) {summary['renter_name']} é um bom pagador: "
            f"{late_count} atrasos em {payment_count} pagamentos. "
            "Recomenda-se renovação."
        )

    email = compose_renewal_email(
        owner_name=summary.get("owner_name", "Proprietário"),
        renter_name=summary.get("renter_name", "Locatário"),
        property_address=summary.get("property_address", ""),
        end_date=summary.get("end_date", ""),
        recommendation=recommendation,
        reasoning=reasoning,
    )

    return RenewalRecommendation(
        contract_id=summary["contract_id"],
        recommendation=recommendation,
        confidence=confidence,
        reasoning=reasoning,
        draft_email_subject=email["subject"],
        draft_email_body=email["body"],
    )


def process_expiring_contracts(db: Any, days_ahead: int = 60) -> list[RenewalRecommendation]:
    """Rule-based batch: recommend for all expiring contracts."""
    contracts = get_expiring_contracts(db, days_ahead)
    return [recommend_rule_based(c) for c in contracts]


# ---------------------------------------------------------------------------
# LlmAgent
# ---------------------------------------------------------------------------

_INSTRUCTION = """
You are ContractRenewalRecommenderAgent for Real Estate OS — a specialist in
residential tenancy risk assessment in Brazil.

Workflow:
1. Call get_expiring_contracts(days_ahead=60) to list contracts expiring soon.
2. For each contract, analyse payment history (late payments, max days late, unpaid amounts).
3. Classify each contract as one of:
   - renew: good payer (< 20% late payments, no chronic default)
   - renegotiate: occasional late payer OR outstanding balance — recommend new terms
   - terminate: chronic defaulter (3+ late payments AND max delay > 30 days)
4. Call compose_renewal_email(...) to draft the owner communication.
5. Return a list of recommendations with reasoning in plain Portuguese.

Rules:
- Be objective. Use the data — do not invent payment history.
- Termination recommendations require clear evidence (late count AND delay severity).
- Always provide actionable reasoning the property manager can use in a client call.
- Email drafts should be professional and empathetic.
"""


def build_renewal_recommender_agent(tools: list) -> Any:
    """Build the ContractRenewalRecommenderAgent LlmAgent."""
    if not _ADK_AVAILABLE or LlmAgent is None:
        logger.warning("google-adk not installed — RenewalRecommenderAgent ADK mode unavailable")
        return None

    return LlmAgent(
        name="ContractRenewalRecommenderAgent",
        model=settings.google_adk_model,
        instruction=_INSTRUCTION,
        tools=tools,
    )
