/**
 * Santander webhook service.
 *
 * Processes payment notifications from Santander for boletos.
 * Flow:
 *   1. Parse + validate the Santander payload
 *   2. Find the charge by boletoId or barcode
 *   3. Create a payment record
 *   4. Auto-reconcile (matched/partial/divergent)
 *   5. Update charge paymentStatus
 */

import { eq, and, or } from "drizzle-orm";
import { db } from "../../db";
import { charges, payments } from "../../db/schema";
import { ChargePaymentStatus, ReconciliationStatus } from "../../types/domain";
import { classifyReconciliation } from "../payments/reconciliation";
import type { SantanderWebhookPayload } from "./santander-validator";

// Santander statuses that indicate a payment was made
const PAID_STATUSES = ["PAGO", "LIQUIDADO", "BAIXADO_PAGAMENTO"];

export interface SantanderWebhookResult {
  processed: boolean;
  action: "payment_created" | "status_updated" | "ignored" | "charge_not_found";
  chargeId?: string;
  paymentId?: string;
  reconciliationStatus?: string;
  reason?: string;
}

/**
 * Process a Santander webhook callback.
 */
export async function processSantanderWebhook(
  payload: SantanderWebhookPayload,
): Promise<SantanderWebhookResult> {
  const isPaid = PAID_STATUSES.includes(payload.status.toUpperCase());

  // ─── Find the charge by boletoId or barcode ───
  const charge = await findChargeByBoleto(payload.id, payload.codigoBarras);

  if (!charge) {
    console.warn(
      `[webhook:santander] Charge not found for boleto id=${payload.id} barcode=${payload.codigoBarras}`,
    );
    return {
      processed: false,
      action: "charge_not_found",
      reason: `No charge found for boleto id=${payload.id ?? "N/A"} barcode=${payload.codigoBarras ?? "N/A"}`,
    };
  }

  // ─── Non-payment status (e.g. VENCIDO, CANCELADO) — just log ───
  if (!isPaid) {
    console.log(
      `[webhook:santander] Non-payment status '${payload.status}' for charge ${charge.id}`,
    );
    return {
      processed: true,
      action: "status_updated",
      chargeId: charge.id,
      reason: `Boleto status update: ${payload.status}`,
    };
  }

  // ─── Check for duplicate payment (idempotency) ───
  const existingPayment = await findExistingBoletoPayment(charge.id, payload);
  if (existingPayment) {
    console.log(
      `[webhook:santander] Duplicate webhook for charge ${charge.id}, payment ${existingPayment.id} already exists`,
    );
    return {
      processed: true,
      action: "ignored",
      chargeId: charge.id,
      paymentId: existingPayment.id,
      reason: "Payment already recorded (duplicate webhook)",
    };
  }

  // ─── Create payment + reconcile ───
  const receivedAmount = normalizeAmount(payload.valorPago);
  const classification = classifyReconciliation(receivedAmount, charge.netAmount);

  const result = await db.transaction(async (tx) => {
    // Insert payment
    const [payment] = await tx
      .insert(payments)
      .values({
        orgId: charge.orgId,
        chargeId: charge.id,
        receivedAmount,
        receivedAt: parsePaymentDate(payload.dataPagamento),
        paymentMethod: "boleto",
        bankReference: payload.nsuCode ?? payload.id ?? payload.codigoBarras ?? null,
        reconciliationStatus: classification.status,
        divergenceReason: classification.divergenceReason,
      })
      .returning();

    // Update charge payment status
    let newPaymentStatus: string;
    if (classification.status === "matched") {
      newPaymentStatus = ChargePaymentStatus.PAID;
    } else if (classification.status === "partial") {
      newPaymentStatus = ChargePaymentStatus.PARTIALLY_PAID;
    } else {
      newPaymentStatus = charge.paymentStatus; // keep current on divergent
    }

    await tx
      .update(charges)
      .set({ paymentStatus: newPaymentStatus })
      .where(eq(charges.id, charge.id));

    return { payment, newPaymentStatus };
  });

  console.log(
    `[webhook:santander] Payment created for charge ${charge.id}: ` +
    `amount=${receivedAmount} status=${classification.status} paymentStatus=${result.newPaymentStatus}`,
  );

  return {
    processed: true,
    action: "payment_created",
    chargeId: charge.id,
    paymentId: result.payment.id,
    reconciliationStatus: classification.status,
  };
}

/**
 * Find a charge by boletoId or barcode.
 */
async function findChargeByBoleto(
  boletoId?: string,
  barcode?: string,
) {
  const conditions = [];

  if (boletoId) {
    conditions.push(eq(charges.boletoId, boletoId));
  }
  if (barcode) {
    conditions.push(eq(charges.barcode, barcode));
  }

  if (conditions.length === 0) return null;

  const whereClause = conditions.length === 1 ? conditions[0] : or(...conditions);

  const [charge] = await db
    .select()
    .from(charges)
    .where(whereClause!)
    .limit(1);

  return charge ?? null;
}

/**
 * Check if a payment for this boleto was already recorded (idempotency).
 */
async function findExistingBoletoPayment(
  chargeId: string,
  payload: SantanderWebhookPayload,
) {
  const bankRef = payload.nsuCode ?? payload.id ?? payload.codigoBarras;
  if (!bankRef) return null;

  const [existing] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.chargeId, chargeId),
        eq(payments.bankReference, bankRef),
      ),
    )
    .limit(1);

  return existing ?? null;
}

/**
 * Normalize amount to decimal string with 2 places.
 */
function normalizeAmount(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return num.toFixed(2);
}

/**
 * Parse Santander payment date to a Date object.
 */
function parsePaymentDate(dateStr: string): Date {
  // Santander may send "2026-03-14" or "2026-03-14T10:30:00Z"
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) {
    return new Date(); // fallback to now
  }
  return parsed;
}
