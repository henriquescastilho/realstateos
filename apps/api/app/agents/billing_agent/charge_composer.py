"""Smart charge composition — LlmAgent that analyses contract terms + indices
+ late fees + discounts to compute a detailed charge breakdown with plain-Portuguese
explanation for owner statements.

Non-ADK fallback: deterministic rule-based composition returns the same structure
without the LLM explanation layer.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
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

_TWO = Decimal("0.01")

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class LineItem:
    description: str
    amount: Decimal
    item_type: str  # "base_rent" | "index_adjustment" | "late_fee" | "discount" | "condominium" | "other"
    rate: Decimal | None = None  # percentage applied (for adjustments/fees)


@dataclass
class ChargeComposition:
    contract_id: str
    reference_month: str           # "YYYY-MM"
    line_items: list[LineItem] = field(default_factory=list)
    subtotal: Decimal = Decimal("0")
    total: Decimal = Decimal("0")
    explanation_pt: str = ""       # Plain Portuguese explanation
    model_used: str = "rule-based"

    def add_item(self, item: LineItem) -> None:
        self.line_items.append(item)
        # Discounts are negative
        if item.item_type == "discount":
            self.subtotal -= item.amount
        else:
            self.subtotal += item.amount
        self.total = self.subtotal.quantize(_TWO, rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# Tools for the LlmAgent
# ---------------------------------------------------------------------------

def get_contract_terms(db: Any, contract_id: str) -> dict:
    """Fetch contract financial terms for charge composition."""
    if not _SQLA_AVAILABLE:
        return {}
    try:
        row = db.execute(
            sqla_text(
                """
                SELECT c.id, c.rent_amount, c.adjustment_index, c.start_date, c.end_date,
                       c.late_fee_pct, c.discount_pct, c.condominium_amount,
                       c.last_adjusted_at
                FROM contracts c
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
            "base_rent": str(row[1] or "0"),
            "adjustment_index": row[2],
            "start_date": str(row[3]) if row[3] else None,
            "end_date": str(row[4]) if row[4] else None,
            "late_fee_pct": str(row[5] or "2.00"),
            "discount_pct": str(row[6] or "0"),
            "condominium_amount": str(row[7] or "0"),
            "last_adjusted_at": str(row[8]) if row[8] else None,
        }
    except Exception as exc:
        logger.warning("charge_composer: get_contract_terms failed: %s", exc)
        return {}


def get_applicable_index(db: Any, contract_id: str, reference_month: str) -> dict:
    """
    Return the monthly index rate applicable to this contract for the given month.
    reference_month: "YYYY-MM"
    """
    try:
        terms = get_contract_terms(db, contract_id)
        indicator = (terms.get("adjustment_index") or "IGPM").upper()

        year, month = reference_month.split("-")

        if _SQLA_AVAILABLE:
            row = db.execute(
                sqla_text(
                    """
                    SELECT monthly_rate, accumulated_rate, source
                    FROM economic_indices
                    WHERE indicator = :ind AND year = :y AND month = :m
                    LIMIT 1
                    """
                ),
                {"ind": indicator, "y": int(year), "m": int(month)},
            ).fetchone()

            if row:
                return {
                    "indicator": indicator,
                    "year": int(year),
                    "month": int(month),
                    "monthly_rate": str(row[0]),
                    "accumulated_rate": str(row[1]) if row[1] else None,
                    "source": row[2],
                }
    except Exception as exc:
        logger.warning("charge_composer: get_applicable_index failed: %s", exc)

    return {
        "indicator": "IGPM",
        "year": int(reference_month.split("-")[0]),
        "month": int(reference_month.split("-")[1]),
        "monthly_rate": "0",
        "accumulated_rate": None,
        "source": "unavailable",
    }


def get_late_charges(db: Any, contract_id: str, reference_month: str) -> dict:
    """Return any pending late fees or overdue amounts for the given month."""
    if not _SQLA_AVAILABLE:
        return {"overdue_count": 0, "overdue_total": "0"}
    try:
        row = db.execute(
            sqla_text(
                """
                SELECT COUNT(*), COALESCE(SUM(amount - COALESCE(paid_amount, 0)), 0)
                FROM charges
                WHERE contract_id = :cid
                  AND status IN ('overdue', 'partial')
                  AND TO_CHAR(due_date, 'YYYY-MM') < :ref_month
                """
            ),
            {"cid": contract_id, "ref_month": reference_month},
        ).fetchone()
        return {
            "overdue_count": int(row[0] or 0),
            "overdue_total": str(row[1] or "0"),
        }
    except Exception as exc:
        logger.warning("charge_composer: get_late_charges failed: %s", exc)
        return {"overdue_count": 0, "overdue_total": "0"}


# ---------------------------------------------------------------------------
# Rule-based composition (non-ADK)
# ---------------------------------------------------------------------------

def compose_charge_rule_based(
    db: Any,
    contract_id: str,
    reference_month: str,
) -> ChargeComposition:
    """
    Deterministic charge composition without LLM.
    Applies: base rent + annual index adjustment (if due) + late fees + discounts.
    """
    composition = ChargeComposition(
        contract_id=contract_id,
        reference_month=reference_month,
    )

    terms = get_contract_terms(db, contract_id)
    if not terms:
        composition.explanation_pt = "Contrato não encontrado."
        return composition

    base_rent = Decimal(str(terms.get("base_rent", "0")))
    composition.add_item(LineItem(
        description="Aluguel base",
        amount=base_rent,
        item_type="base_rent",
    ))

    # Annual index adjustment: check if this is the anniversary month
    start_date = terms.get("start_date", "")
    if start_date:
        ref_year, ref_month_num = reference_month.split("-")
        start_month = start_date[5:7] if len(start_date) >= 7 else "01"
        if ref_month_num == start_month:
            # Anniversary month — apply accumulated annual index
            idx = get_applicable_index(db, contract_id, reference_month)
            annual_rate = Decimal(str(idx.get("accumulated_rate") or idx.get("monthly_rate") or "0"))
            if annual_rate > 0:
                adjustment = (base_rent * annual_rate / 100).quantize(_TWO, rounding=ROUND_HALF_UP)
                composition.add_item(LineItem(
                    description=f"Reajuste anual ({idx.get('indicator', 'IGPM')} acumulado {annual_rate}%)",
                    amount=adjustment,
                    item_type="index_adjustment",
                    rate=annual_rate,
                ))

    # Condominium
    condo = Decimal(str(terms.get("condominium_amount", "0")))
    if condo > 0:
        composition.add_item(LineItem(
            description="Taxa de condomínio",
            amount=condo,
            item_type="condominium",
        ))

    # Late fees
    late = get_late_charges(db, contract_id, reference_month)
    overdue_total = Decimal(str(late.get("overdue_total", "0")))
    late_fee_pct = Decimal(str(terms.get("late_fee_pct", "2")))
    if overdue_total > 0 and late_fee_pct > 0:
        late_fee = (overdue_total * late_fee_pct / 100).quantize(_TWO, rounding=ROUND_HALF_UP)
        composition.add_item(LineItem(
            description=f"Multa por atraso ({late_fee_pct}% s/ R$ {overdue_total:.2f})",
            amount=late_fee,
            item_type="late_fee",
            rate=late_fee_pct,
        ))

    # Discount
    discount_pct = Decimal(str(terms.get("discount_pct", "0")))
    if discount_pct > 0:
        discount_amount = (base_rent * discount_pct / 100).quantize(_TWO, rounding=ROUND_HALF_UP)
        composition.add_item(LineItem(
            description=f"Desconto ({discount_pct}%)",
            amount=discount_amount,
            item_type="discount",
        ))

    # Build plain-Portuguese explanation
    lines = [f"Demonstrativo de cobrança — {reference_month}:"]
    for item in composition.line_items:
        sign = "-" if item.item_type == "discount" else "+"
        lines.append(f"  {sign} {item.description}: R$ {item.amount:.2f}")
    lines.append(f"  = Total: R$ {composition.total:.2f}")
    composition.explanation_pt = "\n".join(lines)

    return composition


# ---------------------------------------------------------------------------
# LlmAgent builder
# ---------------------------------------------------------------------------

_INSTRUCTION = """
You are ChargeCompositionAgent for Real Estate OS — a billing specialist.

For a given contract and reference month your job is:
1. Call get_contract_terms(contract_id) to load financial terms.
2. Call get_applicable_index(contract_id, reference_month) to get the index rate.
3. Call get_late_charges(contract_id, reference_month) to check overdue amounts.
4. Compose a detailed charge with each line item explained.
5. Return a JSON object with keys:
   - line_items: list of {description, amount, item_type, rate}
   - total: string (BRL amount)
   - explanation_pt: plain-Portuguese narrative for the owner statement

Rules:
- Always express amounts as BRL strings with 2 decimal places ("1234.56").
- Apply index adjustment only in the anniversary month (start_date month == reference month).
- If index is unavailable say so in the explanation — never invent a rate.
- Late fees: apply configured late_fee_pct on overdue total.
- Be precise and concise in the Portuguese explanation.
"""


def build_charge_composer_agent(tools: list) -> Any:
    """Build the ChargeCompositionAgent LlmAgent."""
    if not _ADK_AVAILABLE or LlmAgent is None:
        logger.warning("google-adk not installed — ChargeCompositionAgent ADK mode unavailable")
        return None

    return LlmAgent(
        name="ChargeCompositionAgent",
        model=settings.google_adk_model,
        instruction=_INSTRUCTION,
        tools=tools,
    )
