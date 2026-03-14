"""
PaymentsAgent tools — bank webhook ingestion, LLM-powered payment reconciliation,
divergence handling, and owner statement generation.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.services.task_service import create_task_record

logger = logging.getLogger(__name__)

# ── Reconciliation classification ─────────────────────────────────────────────

ReconciliationResult = str  # EXACT | OVERPAYMENT | UNDERPAYMENT | UNMATCHED | DUPLICATE

DIVERGENCE_THRESHOLD_CENTS = 100  # > R$1.00 difference triggers divergence handling


class PaymentsTools:
    """Tools exposed to the PaymentsAgent LlmAgent."""

    def ingest_bank_webhook(
        self,
        tenant_id: str,
        webhook_payload: dict[str, Any],
        source: str = "santander",
    ) -> dict[str, Any]:
        """
        Ingest and normalize a bank webhook payment notification.

        Extracts: payer info, amount, payment date, transaction ID, and payment method.
        Normalizes amounts to decimal (centavos avoided — use R$ float).

        Args:
            tenant_id: Organization identifier.
            webhook_payload: Raw webhook body from the bank.
            source: Bank identifier (santander | bradesco | itau | mock).

        Returns:
            dict with ok, normalized_payment, raw_reference, message.
        """
        try:
            normalized = self._normalize_webhook(webhook_payload, source)
            logger.info(
                "payments.ingest_bank_webhook",
                extra={
                    "tenant_id": tenant_id,
                    "transaction_id": normalized.get("transaction_id"),
                    "amount": normalized.get("amount"),
                    "source": source,
                },
            )
            return {
                "ok": True,
                "normalized_payment": normalized,
                "source": source,
                "message": f"Webhook ingested from {source}: transaction {normalized.get('transaction_id')}",
            }
        except Exception as exc:
            logger.exception("payments.ingest_bank_webhook.error")
            return {"ok": False, "error": str(exc), "source": source}

    def match_payment_to_charge(
        self,
        tenant_id: str,
        transaction_id: str,
        payer_document: str,
        amount: float,
        payment_date: str,
    ) -> dict[str, Any]:
        """
        Match an incoming payment to an existing charge using multiple strategies:
        1. Exact transaction_id match (e.g. boleto barcode)
        2. Payer CPF/CNPJ + amount + approximate due date
        3. Fuzzy amount match within tenant scope

        Args:
            tenant_id: Organization identifier.
            transaction_id: Bank transaction reference (boleto barcode, PIX txid, etc.).
            payer_document: CPF or CNPJ of the payer (digits only or formatted).
            amount: Payment amount in R$.
            payment_date: ISO date string (e.g. '2024-01-15').

        Returns:
            dict with ok, charge_id, match_strategy, confidence, contract_id.
        """
        db: Session = SessionLocal()
        try:
            from app.models.charge import Charge  # type: ignore[import]

            # Strategy 1: Transaction ID in charge metadata
            charge = self._match_by_transaction_id(db, tenant_id, transaction_id)
            if charge:
                return self._match_result(charge, "transaction_id", 1.0)

            # Strategy 2: Amount + payer document
            amount_decimal = Decimal(str(amount))
            charge = self._match_by_amount_and_payer(db, tenant_id, amount_decimal, payer_document)
            if charge:
                return self._match_result(charge, "amount_and_payer", 0.85)

            # Strategy 3: Amount only (within tenant)
            charge = self._match_by_amount_only(db, tenant_id, amount_decimal)
            if charge:
                return self._match_result(charge, "amount_only", 0.60)

            return {
                "ok": False,
                "charge_id": None,
                "match_strategy": "none",
                "confidence": 0.0,
                "message": f"No matching charge found for transaction {transaction_id} amount={amount}",
            }
        except Exception as exc:
            logger.exception("payments.match_payment_to_charge.error")
            return {"ok": False, "error": str(exc)}
        finally:
            db.close()

    def classify_reconciliation(
        self,
        received_amount: float,
        expected_amount: float,
        charge_id: str,
    ) -> dict[str, Any]:
        """
        Classify a payment reconciliation result by comparing received vs expected amounts.

        Classification:
        - EXACT: amounts match within R$0.01
        - OVERPAYMENT: received > expected
        - UNDERPAYMENT: received < expected (within threshold → partial; beyond → divergence)
        - UNMATCHED: no charge_id found

        Args:
            received_amount: Amount received from bank (R$).
            expected_amount: Expected charge amount (R$).
            charge_id: ID of the matched charge (empty string if unmatched).

        Returns:
            dict with ok, classification, delta, requires_human_review, message.
        """
        if not charge_id:
            return {
                "ok": True,
                "classification": "UNMATCHED",
                "delta": received_amount,
                "requires_human_review": True,
                "message": "Payment has no matching charge — human review required",
            }

        received = Decimal(str(received_amount))
        expected = Decimal(str(expected_amount))
        delta = received - expected
        delta_cents = int(delta * 100)

        if abs(delta_cents) <= 1:  # within R$0.01
            classification = "EXACT"
            requires_review = False
            msg = f"Exact match: R${received_amount}"
        elif delta > 0:
            classification = "OVERPAYMENT"
            requires_review = abs(delta_cents) > DIVERGENCE_THRESHOLD_CENTS
            msg = f"Overpayment: received R${received_amount}, expected R${expected_amount}, delta=+R${float(delta):.2f}"
        else:
            classification = "UNDERPAYMENT"
            requires_review = abs(delta_cents) > DIVERGENCE_THRESHOLD_CENTS
            msg = f"Underpayment: received R${received_amount}, expected R${expected_amount}, delta=R${float(delta):.2f}"

        return {
            "ok": True,
            "classification": classification,
            "delta": float(delta),
            "delta_cents": delta_cents,
            "requires_human_review": requires_review,
            "charge_id": charge_id,
            "message": msg,
        }

    def handle_divergence(
        self,
        tenant_id: str,
        payment_id: str,
        charge_id: str,
        classification: str,
        delta: float,
        context: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Handle a payment divergence by creating an escalation task for human review.

        Called when reconciliation finds OVERPAYMENT, UNDERPAYMENT, or UNMATCHED.

        Args:
            tenant_id: Organization identifier.
            payment_id: Bank transaction reference.
            charge_id: Matched charge ID (may be empty for UNMATCHED).
            classification: OVERPAYMENT | UNDERPAYMENT | UNMATCHED.
            delta: Amount difference (positive = overpayment).
            context: Additional context (webhook data, match confidence, etc.).

        Returns:
            dict with ok, divergence_task_id, message.
        """
        db: Session = SessionLocal()
        try:
            severity = "HIGH" if abs(delta) > 100 else "MEDIUM"
            payload = {
                "payment_id": payment_id,
                "charge_id": charge_id,
                "classification": classification,
                "delta": delta,
                "context": context,
                "escalated_by": "PaymentsAgent",
                "escalated_at": datetime.now(timezone.utc).isoformat(),
            }
            task = create_task_record(
                db=db,
                tenant_id=tenant_id,
                task_type="HANDLE_PAYMENT_DIVERGENCE",
                status_value="PENDING_HUMAN",
                message=f"[{severity}] Payment divergence: {classification} delta=R${delta:.2f} (payment={payment_id})",
                payload=payload,
            )
            logger.warning(
                "payments.handle_divergence",
                extra={
                    "divergence_id": task.id,
                    "classification": classification,
                    "delta": delta,
                    "tenant_id": tenant_id,
                },
            )
            return {
                "ok": True,
                "divergence_task_id": task.id,
                "severity": severity,
                "message": f"Divergence task created (id={task.id}): {classification} R${delta:.2f}",
            }
        except Exception as exc:
            logger.exception("payments.handle_divergence.error")
            return {"ok": False, "error": str(exc)}
        finally:
            db.close()

    def generate_owner_statement(
        self,
        tenant_id: str,
        contract_id: str,
        month_ref: str,
    ) -> dict[str, Any]:
        """
        Generate a monthly financial statement for a property owner.

        Aggregates: charges generated, payments received, outstanding balance,
        maintenance costs, administration fees, and net transfer amount.

        Args:
            tenant_id: Organization identifier.
            contract_id: Contract ID to generate statement for.
            month_ref: Month reference in 'YYYY-MM' format.

        Returns:
            dict with ok, statement, statement_task_id, message.
        """
        db: Session = SessionLocal()
        try:
            from app.models.charge import Charge  # type: ignore[import]

            ref_date_str = f"{month_ref}-01"
            from datetime import date
            ref_date = date.fromisoformat(ref_date_str)

            # Fetch charges for this contract in the month
            charges = db.scalars(
                select(Charge).where(
                    Charge.tenant_id == tenant_id,
                    Charge.contract_id == contract_id,
                    Charge.due_date >= ref_date,
                    Charge.due_date < date(ref_date.year + (ref_date.month // 12), (ref_date.month % 12) + 1, 1),
                )
            ).all()

            total_charged = sum(float(c.amount) for c in charges if hasattr(c, "amount"))
            total_paid = sum(
                float(c.amount) for c in charges if hasattr(c, "status") and c.status == "paid"
            )
            outstanding = total_charged - total_paid

            statement = {
                "contract_id": contract_id,
                "month_ref": month_ref,
                "total_charged": round(total_charged, 2),
                "total_paid": round(total_paid, 2),
                "outstanding_balance": round(outstanding, 2),
                "charges_count": len(charges),
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }

            # Audit record
            task = create_task_record(
                db=db,
                tenant_id=tenant_id,
                task_type="GENERATE_OWNER_STATEMENT",
                status_value="DONE",
                message=f"Owner statement generated for {month_ref}: charged=R${total_charged:.2f}, paid=R${total_paid:.2f}",
                payload={"contract_id": contract_id, "month_ref": month_ref, "statement": statement},
                contract_id=contract_id,
            )
            return {
                "ok": True,
                "statement": statement,
                "statement_task_id": task.id,
                "message": f"Statement generated for {month_ref} (outstanding=R${outstanding:.2f})",
            }
        except Exception as exc:
            logger.exception("payments.generate_owner_statement.error")
            return {"ok": False, "error": str(exc)}
        finally:
            db.close()

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _normalize_webhook(self, payload: dict[str, Any], source: str) -> dict[str, Any]:
        """Normalize bank-specific webhook formats into a canonical payment dict."""
        # Santander webhook format
        if source == "santander":
            return {
                "transaction_id": payload.get("codigoBoleto") or payload.get("txId") or payload.get("id"),
                "amount": float(payload.get("valorPago") or payload.get("amount") or 0),
                "payment_date": payload.get("dataPagamento") or payload.get("paymentDate"),
                "payer_name": payload.get("nomePagador") or payload.get("payerName"),
                "payer_document": payload.get("cpfCnpjPagador") or payload.get("payerDocument"),
                "payment_method": payload.get("tipoPagamento") or "boleto",
                "raw": payload,
            }
        # Generic/mock format
        return {
            "transaction_id": payload.get("transaction_id") or payload.get("id"),
            "amount": float(payload.get("amount") or 0),
            "payment_date": payload.get("payment_date") or payload.get("date"),
            "payer_name": payload.get("payer_name"),
            "payer_document": payload.get("payer_document"),
            "payment_method": payload.get("payment_method") or "unknown",
            "raw": payload,
        }

    def _match_by_transaction_id(self, db: Session, tenant_id: str, transaction_id: str):
        """Try to find a charge by stored transaction ID in payload."""
        from app.models.charge import Charge  # type: ignore[import]
        # Charges with matching barcode/txid stored in their payload/metadata
        try:
            charges = db.scalars(
                select(Charge).where(
                    Charge.tenant_id == tenant_id,
                    Charge.status.in_(["pending", "issued"]),
                )
            ).all()
            for c in charges:
                meta = getattr(c, "metadata", {}) or {}
                if meta.get("transaction_id") == transaction_id or meta.get("barcode") == transaction_id:
                    return c
        except Exception:
            pass
        return None

    def _match_by_amount_and_payer(self, db: Session, tenant_id: str, amount: Decimal, payer_document: str):
        """Match by amount AND payer document (strategy 2 — higher confidence than amount-only)."""
        from app.models.charge import Charge  # type: ignore[import]
        try:
            charges = db.scalars(
                select(Charge).where(
                    Charge.tenant_id == tenant_id,
                    Charge.status.in_(["pending", "issued"]),
                )
            ).all()
            for c in charges:
                if not (hasattr(c, "amount") and abs(Decimal(str(c.amount)) - amount) < Decimal("0.01")):
                    continue
                if payer_document:
                    charge_doc = getattr(c, "payer_document", None) or getattr(c, "debtor_cpf", None) or ""
                    if charge_doc and charge_doc != payer_document:
                        continue
                return c
        except Exception:
            pass
        return None

    def _match_by_amount_only(self, db: Session, tenant_id: str, amount: Decimal):
        """Last-resort: match by amount only."""
        from app.models.charge import Charge  # type: ignore[import]
        try:
            charges = db.scalars(
                select(Charge).where(
                    Charge.tenant_id == tenant_id,
                    Charge.status.in_(["pending", "issued"]),
                )
            ).all()
            for c in charges:
                if hasattr(c, "amount") and abs(Decimal(str(c.amount)) - amount) < Decimal("0.01"):
                    return c
        except Exception:
            pass
        return None

    def _match_result(self, charge: Any, strategy: str, confidence: float) -> dict[str, Any]:
        return {
            "ok": True,
            "charge_id": str(charge.id),
            "contract_id": str(getattr(charge, "contract_id", "")),
            "match_strategy": strategy,
            "confidence": confidence,
            "expected_amount": float(getattr(charge, "amount", 0)),
            "message": f"Matched via {strategy} (confidence={confidence:.0%})",
        }

    def as_tool_list(self) -> list:
        """Return all tool methods for LlmAgent registration."""
        return [
            self.ingest_bank_webhook,
            self.match_payment_to_charge,
            self.classify_reconciliation,
            self.handle_divergence,
            self.generate_owner_statement,
        ]
