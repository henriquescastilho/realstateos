import { eq, and, count, inArray } from "drizzle-orm";
import { db } from "../../db";
import {
  payments,
  charges,
  statements,
  leaseContracts,
  properties,
  tenants,
} from "../../db/schema";
import { NotFoundError, ValidationError, ConflictError } from "../../lib/errors";
import { ChargePaymentStatus, ReconciliationStatus } from "../../types/domain";
import { emitDomainEvent } from "../../lib/events";
import { reconcile, classifyReconciliation } from "./reconciliation";
import { buildStatementEntries } from "./statement";
import type {
  PaymentWebhookInput,
  ReconcilePaymentInput,
  GenerateStatementInput,
} from "./validators";
import type { MatchCandidate } from "./reconciliation";

/**
 * Process a payment webhook from bank/PSP.
 * Auto-reconciles if possible (bank_reference → amount match).
 */
export async function processPaymentWebhook(input: PaymentWebhookInput) {
  // If chargeId is provided directly, skip auto-matching
  if (input.chargeId) {
    return await createPaymentWithCharge(input, input.chargeId);
  }

  // Fetch open charges for this org to attempt auto-reconciliation
  const openCharges = await db
    .select({
      chargeId: charges.id,
      netAmount: charges.netAmount,
      bankReference: charges.id, // charges don't have bankReference, we match on payment side
      paymentStatus: charges.paymentStatus,
    })
    .from(charges)
    .where(
      and(
        eq(charges.orgId, input.orgId),
        eq(charges.paymentStatus, ChargePaymentStatus.OPEN),
      ),
    );

  // Build candidates for reconciliation
  const candidates: MatchCandidate[] = openCharges.map((c) => ({
    chargeId: c.chargeId,
    netAmount: c.netAmount,
    paymentStatus: c.paymentStatus,
  }));

  const result = reconcile(input.receivedAmount, input.bankReference, candidates);

  if (result) {
    return await createPaymentWithCharge(
      input,
      result.chargeId,
      result.status,
      result.divergenceReason,
    );
  }

  // No match found — create unmatched payment
  const [payment] = await db
    .insert(payments)
    .values({
      orgId: input.orgId,
      chargeId: "00000000-0000-0000-0000-000000000000", // placeholder for unmatched
      receivedAmount: input.receivedAmount,
      receivedAt: new Date(input.receivedAt),
      paymentMethod: input.paymentMethod,
      bankReference: input.bankReference,
      reconciliationStatus: ReconciliationStatus.UNMATCHED,
      divergenceReason: "No matching charge found",
    })
    .returning();

  return { payment, autoReconciled: false };
}

/**
 * Create a payment linked to a specific charge and update charge status.
 */
async function createPaymentWithCharge(
  input: PaymentWebhookInput,
  chargeId: string,
  reconStatus?: string,
  divergenceReason?: string,
) {
  // Verify charge exists
  const [charge] = await db
    .select()
    .from(charges)
    .where(eq(charges.id, chargeId))
    .limit(1);

  if (!charge) {
    throw new NotFoundError("Charge", chargeId);
  }

  // Classify if not pre-classified
  const classification = reconStatus
    ? { status: reconStatus, divergenceReason }
    : classifyReconciliation(input.receivedAmount, charge.netAmount);

  const result = await db.transaction(async (tx) => {
    // Insert payment
    const [payment] = await tx
      .insert(payments)
      .values({
        orgId: input.orgId,
        chargeId,
        receivedAmount: input.receivedAmount,
        receivedAt: new Date(input.receivedAt),
        paymentMethod: input.paymentMethod,
        bankReference: input.bankReference,
        reconciliationStatus: classification.status as string,
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

    const [updatedCharge] = await tx
      .update(charges)
      .set({ paymentStatus: newPaymentStatus })
      .where(eq(charges.id, chargeId))
      .returning();

    return { payment, charge: updatedCharge };
  });

  await emitDomainEvent(input.orgId, "payment.received", {
    paymentId: result.payment.id,
    chargeId,
    receivedAmount: input.receivedAmount,
    reconciliationStatus: classification.status,
  }).catch((e) => console.error("[payments] Event emit error:", e));

  return { ...result, autoReconciled: true };
}

/**
 * Manual reconciliation: link an unmatched payment to a charge.
 */
export async function reconcilePayment(
  paymentId: string,
  input: ReconcilePaymentInput,
) {
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);

  if (!payment) {
    throw new NotFoundError("Payment", paymentId);
  }

  if (payment.reconciliationStatus !== ReconciliationStatus.UNMATCHED) {
    throw new ConflictError(
      `Payment is '${payment.reconciliationStatus}', can only reconcile from 'unmatched'`,
    );
  }

  const [charge] = await db
    .select()
    .from(charges)
    .where(eq(charges.id, input.chargeId))
    .limit(1);

  if (!charge) {
    throw new NotFoundError("Charge", input.chargeId);
  }

  const classification = classifyReconciliation(
    payment.receivedAmount,
    charge.netAmount,
  );

  const result = await db.transaction(async (tx) => {
    const [updatedPayment] = await tx
      .update(payments)
      .set({
        chargeId: input.chargeId,
        reconciliationStatus: classification.status,
        divergenceReason: classification.divergenceReason,
      })
      .where(eq(payments.id, paymentId))
      .returning();

    let newPaymentStatus: string;
    if (classification.status === "matched") {
      newPaymentStatus = ChargePaymentStatus.PAID;
    } else if (classification.status === "partial") {
      newPaymentStatus = ChargePaymentStatus.PARTIALLY_PAID;
    } else {
      newPaymentStatus = charge.paymentStatus;
    }

    const [updatedCharge] = await tx
      .update(charges)
      .set({ paymentStatus: newPaymentStatus })
      .where(eq(charges.id, input.chargeId))
      .returning();

    return { payment: updatedPayment, charge: updatedCharge };
  });

  return result;
}

/**
 * List payments with filters.
 */
export async function listPayments(params: {
  orgId: string;
  chargeId?: string;
  reconciliationStatus?: string;
  page: number;
  pageSize: number;
}) {
  const conditions = [eq(payments.orgId, params.orgId)];

  if (params.chargeId) {
    conditions.push(eq(payments.chargeId, params.chargeId));
  }
  if (params.reconciliationStatus) {
    conditions.push(eq(payments.reconciliationStatus, params.reconciliationStatus));
  }

  const whereClause = and(...conditions);

  const [data, totalResult] = await Promise.all([
    db
      .select()
      .from(payments)
      .where(whereClause)
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize)
      .orderBy(payments.receivedAt),
    db.select({ total: count() }).from(payments).where(whereClause),
  ]);

  // Enrich payments with charge/property/renter info
  const chargeIds = [...new Set(data.map((p) => p.chargeId).filter((id) => id && id !== "00000000-0000-0000-0000-000000000000"))];
  let chargeMap = new Map<string, { description: string; amount: string; due_date: string; property_address: string }>();

  if (chargeIds.length > 0) {
    const chargeRows = await db.select().from(charges).where(inArray(charges.id, chargeIds));
    const contractIds = [...new Set(chargeRows.map((c) => c.leaseContractId))];

    let propertyMap = new Map<string, string>();
    let tenantMap = new Map<string, string>();
    let contractPropertyMap = new Map<string, string>();
    let contractTenantMap = new Map<string, string>();

    if (contractIds.length > 0) {
      const contractRows = await db.select().from(leaseContracts).where(inArray(leaseContracts.id, contractIds));
      const propIds = [...new Set(contractRows.map((c) => c.propertyId))];
      const tenantIds = [...new Set(contractRows.map((c) => c.tenantId))];

      if (propIds.length > 0) {
        const propRows = await db.select({ id: properties.id, address: properties.address }).from(properties).where(inArray(properties.id, propIds));
        for (const p of propRows) propertyMap.set(p.id, p.address);
      }
      if (tenantIds.length > 0) {
        const tenantRows = await db.select({ id: tenants.id, fullName: tenants.fullName }).from(tenants).where(inArray(tenants.id, tenantIds));
        for (const t of tenantRows) tenantMap.set(t.id, t.fullName);
      }
      for (const c of contractRows) {
        contractPropertyMap.set(c.id, propertyMap.get(c.propertyId) ?? "");
        contractTenantMap.set(c.id, tenantMap.get(c.tenantId) ?? "");
      }
    }

    for (const ch of chargeRows) {
      chargeMap.set(ch.id, {
        description: `Aluguel ${ch.billingPeriod}`,
        amount: ch.netAmount,
        due_date: ch.dueDate,
        property_address: contractPropertyMap.get(ch.leaseContractId) ?? "",
      });
    }
  }

  const enriched = data.map((payment) => {
    const charge = chargeMap.get(payment.chargeId);
    return {
      id: payment.id,
      charge_id: payment.chargeId,
      amount: payment.receivedAmount,
      paid_at: payment.receivedAt?.toISOString() ?? "",
      method: payment.paymentMethod,
      payer_name: "",
      reference: payment.bankReference ?? "",
      status: payment.reconciliationStatus,
      source: "bank_import",
      charge: charge ? {
        id: payment.chargeId,
        description: charge.description,
        amount: charge.amount,
        due_date: charge.due_date,
        property_address: charge.property_address,
      } : undefined,
    };
  });

  return {
    data: enriched,
    total: totalResult[0]?.total ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}

/**
 * Generate an owner payout statement for a period.
 */
export async function generateStatement(input: GenerateStatementInput) {
  // Get paid charges for this contract + period
  const paidCharges = await db
    .select()
    .from(charges)
    .where(
      and(
        eq(charges.orgId, input.orgId),
        eq(charges.leaseContractId, input.leaseContractId),
        eq(charges.billingPeriod, input.period),
        eq(charges.paymentStatus, ChargePaymentStatus.PAID),
      ),
    );

  if (paidCharges.length === 0) {
    throw new ValidationError(
      `No paid charges found for contract ${input.leaseContractId} in period ${input.period}`,
    );
  }

  const chargesForStatement = paidCharges.map((c) => ({
    grossAmount: c.grossAmount,
    penaltyAmount: c.penaltyAmount,
    discountAmount: c.discountAmount,
    netAmount: c.netAmount,
    lineItems: c.lineItems ?? [],
  }));

  const { entries, totalPayout } = buildStatementEntries(chargesForStatement, {
    adminFeePercentage: input.adminFeePercentage,
  });

  const [statement] = await db
    .insert(statements)
    .values({
      orgId: input.orgId,
      ownerId: input.ownerId,
      leaseContractId: input.leaseContractId,
      period: input.period,
      entries,
    })
    .returning();

  return { statement, totalPayout };
}

/**
 * List statements with filters.
 */
export async function listStatements(params: {
  orgId: string;
  ownerId?: string;
  period?: string;
  page: number;
  pageSize: number;
}) {
  const conditions = [eq(statements.orgId, params.orgId)];

  if (params.ownerId) {
    conditions.push(eq(statements.ownerId, params.ownerId));
  }
  if (params.period) {
    conditions.push(eq(statements.period, params.period));
  }

  const whereClause = and(...conditions);

  const [data, totalResult] = await Promise.all([
    db
      .select()
      .from(statements)
      .where(whereClause)
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize)
      .orderBy(statements.generatedAt),
    db.select({ total: count() }).from(statements).where(whereClause),
  ]);

  return {
    data,
    total: totalResult[0]?.total ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}
