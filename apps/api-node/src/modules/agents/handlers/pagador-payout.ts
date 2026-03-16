/**
 * PAGADOR — Pagamento de contas do imóvel + repasse ao proprietário.
 * Parte A (dia 5): Paga boletos de condo/IPTU/taxas.
 * Parte B (dia 15): Calcula e registra repasse ao proprietário.
 */

import { eq, and } from "drizzle-orm";
import { db } from "../../../db";
import {
  propertyExpenses,
  leaseContracts,
  charges,
  payments,
  owners,
} from "../../../db/schema";
import { emitDomainEvent } from "../../../lib/events";
import {
  LeaseContractStatus,
  ChargePaymentStatus,
} from "../../../types/domain";
import { toCents, fromCents } from "../../billing/calculator";
import type { AgentTask } from "../../../types/domain";
import type { TaskExecutionResult } from "../executor";

interface PagadorInput {
  mode: "pay_bills" | "payout" | "pay_bills_manual";
  billingPeriod: string; // "2026-04"
  extractedBills?: Array<{
    value: string;
    dueDate: string;
    type: string;
    barcode?: string;
    issuerName?: string;
  }>;
}

/**
 * Part A: Mark approved expenses as paid (simulated — no real outbound payment API).
 */
async function payBills(
  orgId: string,
  billingPeriod: string,
): Promise<{ paidCount: number; totalPaid: string }> {
  const approvedExpenses = await db
    .select()
    .from(propertyExpenses)
    .where(
      and(
        eq(propertyExpenses.orgId, orgId),
        eq(propertyExpenses.referenceMonth, billingPeriod),
        eq(propertyExpenses.status, "approved"),
      ),
    );

  let totalPaidCents = 0;

  for (const expense of approvedExpenses) {
    await db
      .update(propertyExpenses)
      .set({
        status: "paid",
        paidAt: new Date(),
      })
      .where(eq(propertyExpenses.id, expense.id));

    totalPaidCents += toCents(expense.value);
  }

  return {
    paidCount: approvedExpenses.length,
    totalPaid: fromCents(totalPaidCents),
  };
}

/**
 * Part B: Calculate and register payout for each owner.
 */
async function calculatePayouts(
  orgId: string,
  billingPeriod: string,
): Promise<Array<{
  ownerId: string;
  ownerName: string;
  totalReceived: string;
  totalExpenses: string;
  adminFee: string;
  netPayout: string;
  contracts: string[];
}>> {
  // Get all active contracts
  const activeContracts = await db
    .select()
    .from(leaseContracts)
    .where(
      and(
        eq(leaseContracts.orgId, orgId),
        eq(leaseContracts.operationalStatus, LeaseContractStatus.ACTIVE),
      ),
    );

  // Group by owner
  const ownerContracts = new Map<string, typeof activeContracts>();
  for (const contract of activeContracts) {
    const existing = ownerContracts.get(contract.ownerId) ?? [];
    existing.push(contract);
    ownerContracts.set(contract.ownerId, existing);
  }

  const payouts: Array<{
    ownerId: string;
    ownerName: string;
    totalReceived: string;
    totalExpenses: string;
    adminFee: string;
    netPayout: string;
    contracts: string[];
  }> = [];

  for (const [ownerId, contracts] of ownerContracts) {
    let totalReceivedCents = 0;
    let totalExpensesCents = 0;
    let totalGrossRentCents = 0;
    const contractIds: string[] = [];

    for (const contract of contracts) {
      contractIds.push(contract.id);

      // Sum paid charges for this contract in this period
      const paidCharges = await db
        .select()
        .from(charges)
        .where(
          and(
            eq(charges.leaseContractId, contract.id),
            eq(charges.billingPeriod, billingPeriod),
            eq(charges.paymentStatus, ChargePaymentStatus.PAID),
          ),
        );

      for (const charge of paidCharges) {
        totalReceivedCents += toCents(charge.netAmount);
        totalGrossRentCents += toCents(charge.grossAmount);
      }

      // Sum paid expenses for this property in this period
      const paidExpenses = await db
        .select()
        .from(propertyExpenses)
        .where(
          and(
            eq(propertyExpenses.propertyId, contract.propertyId),
            eq(propertyExpenses.referenceMonth, billingPeriod),
            eq(propertyExpenses.status, "paid"),
          ),
        );

      for (const expense of paidExpenses) {
        totalExpensesCents += toCents(expense.value);
      }
    }

    // Calculate admin fee from payout rules
    const payoutRules = contracts[0].payoutRules as { adminFeePercentage?: string } | null;
    const adminPct = parseFloat(payoutRules?.adminFeePercentage ?? "10.00");
    const adminFeeCents = Math.round(totalGrossRentCents * (adminPct / 100));

    const netPayoutCents = totalReceivedCents - totalExpensesCents - adminFeeCents;

    // Get owner name
    const [owner] = await db
      .select()
      .from(owners)
      .where(eq(owners.id, ownerId))
      .limit(1);

    payouts.push({
      ownerId,
      ownerName: owner?.fullName ?? "Unknown",
      totalReceived: fromCents(totalReceivedCents),
      totalExpenses: fromCents(totalExpensesCents),
      adminFee: fromCents(adminFeeCents),
      netPayout: fromCents(Math.max(0, netPayoutCents)),
      contracts: contractIds,
    });
  }

  return payouts;
}

/**
 * Main handler for the Pagador agent task.
 */
export async function handlePagadorPayout(
  task: AgentTask,
): Promise<TaskExecutionResult> {
  const input = task.input as unknown as PagadorInput;
  const orgId = task.orgId;
  const mode = input.mode;
  const billingPeriod = input.billingPeriod;

  if (mode === "pay_bills_manual") {
    // Manual bill payment from extracted PDFs
    const bills = input.extractedBills ?? [];
    let totalPaidCents = 0;

    for (const bill of bills) {
      totalPaidCents += toCents(bill.value);
    }

    await emitDomainEvent(orgId, "payout.bills_paid", {
      billingPeriod,
      paidCount: bills.length,
      totalPaid: fromCents(totalPaidCents),
      manual: true,
    }).catch((e) => console.error("[agent:pagador] Event emit error:", e));

    return {
      status: "completed",
      output: {
        mode: "pay_bills_manual",
        paidCount: bills.length,
        totalPaid: fromCents(totalPaidCents),
        totalPaidCents,
        billingPeriod,
        bills,
      },
      confidence: 0.95,
    };
  }

  if (mode === "pay_bills") {
    const result = await payBills(orgId, billingPeriod);

    await emitDomainEvent(orgId, "payout.bills_paid", {
      billingPeriod,
      paidCount: result.paidCount,
      totalPaid: result.totalPaid,
    }).catch((e) => console.error("[agent:pagador] Event emit error:", e));

    return {
      status: "completed",
      output: {
        mode: "pay_bills",
        ...result,
        billingPeriod,
      },
      confidence: 0.95,
    };
  }

  // mode === "payout"
  const payouts = await calculatePayouts(orgId, billingPeriod);

  for (const payout of payouts) {
    await emitDomainEvent(orgId, "payout.completed", {
      ownerId: payout.ownerId,
      amount: payout.netPayout,
      period: billingPeriod,
      leaseContractIds: payout.contracts,
    }).catch((e) => console.error("[agent:pagador] Event emit error:", e));
  }

  return {
    status: "completed",
    output: {
      mode: "payout",
      billingPeriod,
      payoutCount: payouts.length,
      payouts,
    },
    confidence: 0.95,
  };
}
