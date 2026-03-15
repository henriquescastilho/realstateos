/**
 * SENTINELA — Vigilante de recebimentos.
 * Monitora pagamentos recebidos e cobra inadimplentes.
 */

import { eq, and, lt } from "drizzle-orm";
import { db } from "../../../db";
import { charges, leaseContracts, tenants, agentTasks } from "../../../db/schema";
import { ChargePaymentStatus } from "../../../types/domain";
import { agentTasksQueue } from "../../../lib/queue";
import type { AgentTask } from "../../../types/domain";
import type { TaskExecutionResult } from "../executor";

interface SentinelaInput {
  mode: "webhook" | "cron";
  // Webhook mode
  paymentId?: string;
  chargeId?: string;
  receivedAmount?: string;
  reconciliationStatus?: string;
  // Cron mode — no extra input needed
}

/**
 * Handle webhook mode: verify reconciliation result and escalate if needed.
 */
async function handleWebhook(
  task: AgentTask,
  input: SentinelaInput,
): Promise<TaskExecutionResult> {
  const status = input.reconciliationStatus ?? "unknown";

  if (status === "matched") {
    return {
      status: "completed",
      output: {
        action: "payment_confirmed",
        paymentId: input.paymentId,
        chargeId: input.chargeId,
      },
      confidence: 1.0,
    };
  }

  // Partial or divergent — escalate for human review
  return {
    status: "escalated",
    output: {
      action: "needs_review",
      paymentId: input.paymentId,
      chargeId: input.chargeId,
      reconciliationStatus: status,
      receivedAmount: input.receivedAmount,
    },
    confidence: 0.5,
  };
}

/**
 * Handle cron mode: find overdue charges and trigger collection reminders.
 */
async function handleCron(
  task: AgentTask,
): Promise<TaskExecutionResult> {
  const today = new Date().toISOString().split("T")[0];

  // Find overdue unpaid charges
  const overdueCharges = await db
    .select({
      charge: charges,
      contract: leaseContracts,
    })
    .from(charges)
    .innerJoin(leaseContracts, eq(charges.leaseContractId, leaseContracts.id))
    .where(
      and(
        eq(charges.orgId, task.orgId),
        lt(charges.dueDate, today),
        eq(charges.issueStatus, "issued"),
        eq(charges.paymentStatus, ChargePaymentStatus.OPEN),
      ),
    );

  // Also include charges already marked overdue
  const alreadyOverdue = await db
    .select({
      charge: charges,
      contract: leaseContracts,
    })
    .from(charges)
    .innerJoin(leaseContracts, eq(charges.leaseContractId, leaseContracts.id))
    .where(
      and(
        eq(charges.orgId, task.orgId),
        eq(charges.paymentStatus, ChargePaymentStatus.OVERDUE),
        eq(charges.issueStatus, "issued"),
      ),
    );

  const allOverdue = [...overdueCharges, ...alreadyOverdue];

  // Deduplicate by charge ID
  const seen = new Set<string>();
  const uniqueOverdue = allOverdue.filter((row) => {
    if (seen.has(row.charge.id)) return false;
    seen.add(row.charge.id);
    return true;
  });

  // Build inadimplency report
  const report: Array<{
    chargeId: string;
    tenantId: string;
    dueDate: string;
    amount: string;
    daysOverdue: number;
  }> = [];

  for (const { charge, contract } of uniqueOverdue) {
    const dueDate = new Date(charge.dueDate);
    const daysOverdue = Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    report.push({
      chargeId: charge.id,
      tenantId: contract.tenantId,
      dueDate: charge.dueDate,
      amount: charge.netAmount,
      daysOverdue,
    });

    // Mark as overdue if still "open"
    if (charge.paymentStatus === ChargePaymentStatus.OPEN) {
      await db
        .update(charges)
        .set({ paymentStatus: ChargePaymentStatus.OVERDUE })
        .where(eq(charges.id, charge.id));
    }

    // Create a Cobrador task to send collection reminder
    const [cobradorTask] = await db
      .insert(agentTasks)
      .values({
        orgId: task.orgId,
        taskType: "cobrador_collect",
        input: { chargeId: charge.id },
        relatedEntityType: "charge",
        relatedEntityId: charge.id,
      })
      .returning();

    await agentTasksQueue().add("process", {
      taskId: cobradorTask.id,
      orgId: task.orgId,
      taskType: "cobrador_collect",
    });
  }

  return {
    status: "completed",
    output: {
      overdueCount: uniqueOverdue.length,
      report,
    },
    confidence: 0.95,
  };
}

/**
 * Main handler for the Sentinela agent task.
 */
export async function handleSentinelaWatch(
  task: AgentTask,
): Promise<TaskExecutionResult> {
  const input = task.input as unknown as SentinelaInput;
  const mode = input.mode ?? "cron";

  if (mode === "webhook") {
    return handleWebhook(task, input);
  }

  return handleCron(task);
}
