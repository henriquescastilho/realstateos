/**
 * MAESTRO — Compositor de cobranças.
 * Compõe cobranças mensais: aluguel + despesas capturadas do imóvel.
 */

import { eq, and } from "drizzle-orm";
import { db } from "../../../db";
import {
  leaseContracts,
  billingSchedules,
  propertyExpenses,
  charges,
} from "../../../db/schema";
import { emitDomainEvent } from "../../../lib/events";
import { calculateCharge } from "../../billing/calculator";
import { LeaseContractStatus, ChargeIssueStatus } from "../../../types/domain";
import type { AgentTask } from "../../../types/domain";
import type { TaskExecutionResult } from "../executor";

interface MaestroInput {
  orgId?: string;
  billingPeriod: string; // "2026-04"
}

/**
 * Compute the due date for a billing period (1st business day of the period month).
 */
function computeDueDate(billingPeriod: string): string {
  const [year, month] = billingPeriod.split("-").map(Number);
  const date = new Date(year, month - 1, 1);

  // Skip weekends: Sat→Mon, Sun→Mon
  const day = date.getDay();
  if (day === 0) date.setDate(3); // Sunday → next Monday? Actually 1st + 2 = 3rd? No.
  if (day === 6) date.setDate(3); // Saturday → Monday

  // Simpler: find the first weekday
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }

  return date.toISOString().split("T")[0];
}

/**
 * Main handler for the Maestro compose task.
 */
export async function handleMaestroCompose(
  task: AgentTask,
): Promise<TaskExecutionResult> {
  const input = task.input as unknown as MaestroInput;
  const orgId = input.orgId ?? task.orgId;
  const billingPeriod = input.billingPeriod;

  // Get all active contracts for this org
  const activeContracts = await db
    .select()
    .from(leaseContracts)
    .where(
      and(
        eq(leaseContracts.orgId, orgId),
        eq(leaseContracts.operationalStatus, LeaseContractStatus.ACTIVE),
      ),
    );

  if (activeContracts.length === 0) {
    return {
      status: "completed",
      output: { message: "No active contracts found", chargesCreated: 0 },
      confidence: 1.0,
    };
  }

  const createdChargeIds: string[] = [];
  const errors: string[] = [];
  let allExpensesPresent = true;

  for (const contract of activeContracts) {
    try {
      // Check if charge already exists for this contract+period
      const [existing] = await db
        .select()
        .from(charges)
        .where(
          and(
            eq(charges.leaseContractId, contract.id),
            eq(charges.billingPeriod, billingPeriod),
          ),
        )
        .limit(1);

      if (existing) {
        continue; // Skip — already composed
      }

      // Get billing schedule
      const [schedule] = await db
        .select()
        .from(billingSchedules)
        .where(
          and(
            eq(billingSchedules.leaseContractId, contract.id),
            eq(billingSchedules.status, "active"),
          ),
        )
        .limit(1);

      if (!schedule) {
        errors.push(`No billing schedule for contract ${contract.id}`);
        continue;
      }

      // Fetch property expenses for this property + period
      const expenses = await db
        .select()
        .from(propertyExpenses)
        .where(
          and(
            eq(propertyExpenses.propertyId, contract.propertyId),
            eq(propertyExpenses.referenceMonth, billingPeriod),
            eq(propertyExpenses.orgId, orgId),
          ),
        );

      if (expenses.length === 0) {
        allExpensesPresent = false;
      }

      // Build additional components from expenses
      const expenseComponents = expenses.map((exp) => ({
        type: exp.type,
        source: "property_expense",
        fixedAmount: exp.value,
      }));

      // Merge schedule components + expense components
      const allComponents = [
        ...(schedule.chargeComponents ?? []),
        ...expenseComponents,
      ];

      // Calculate charge
      const calculation = calculateCharge({
        rentAmount: contract.rentAmount,
        components: allComponents,
        lateFeePercentage: schedule.lateFeeRule?.percentage ?? "2.00",
        dailyInterestPercentage: schedule.interestRule?.dailyPercentage ?? "0.033",
        daysLate: 0,
      });

      const dueDate = computeDueDate(billingPeriod);

      // Insert charge
      const [charge] = await db
        .insert(charges)
        .values({
          orgId,
          leaseContractId: contract.id,
          billingPeriod,
          lineItems: calculation.lineItems,
          grossAmount: calculation.grossAmount,
          discountAmount: calculation.discountAmount,
          penaltyAmount: calculation.penaltyAmount,
          netAmount: calculation.netAmount,
          issueStatus: ChargeIssueStatus.DRAFT,
          dueDate,
        })
        .returning();

      createdChargeIds.push(charge.id);

      await emitDomainEvent(orgId, "charge.created", {
        chargeId: charge.id,
        leaseContractId: contract.id,
        billingPeriod,
        netAmount: calculation.netAmount,
      }).catch((e) => console.error("[agent:maestro] Event emit error:", e));
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("charges_idempotency_idx")) {
        continue; // Already exists, skip
      }
      errors.push(`Contract ${contract.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Emit charges.composed event
  if (createdChargeIds.length > 0) {
    await emitDomainEvent(orgId, "charges.composed", {
      chargeIds: createdChargeIds,
      billingPeriod,
      count: createdChargeIds.length,
    }).catch((e) => console.error("[agent:maestro] Event emit error:", e));
  }

  const confidence = allExpensesPresent ? 0.95 : 0.70;

  return {
    status: "completed",
    output: {
      chargesCreated: createdChargeIds.length,
      chargeIds: createdChargeIds,
      errors: errors.length > 0 ? errors : undefined,
      billingPeriod,
    },
    confidence,
  };
}
