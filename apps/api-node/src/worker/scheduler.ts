import { Queue } from "bullmq";
import { eq, and, lt, ne } from "drizzle-orm";
import { getRedis } from "../lib/redis";
import { db } from "../db";
import { charges, leaseContracts, tenants, agentTasks, organizations } from "../db/schema";
import { emitDomainEvent } from "../lib/events";
import { messagesQueue, agentTasksQueue } from "../lib/queue";
import { ChargePaymentStatus } from "../types/domain";

/**
 * Set up recurring scheduler jobs using BullMQ repeatable jobs.
 */
export async function setupScheduler(): Promise<void> {
  const schedulerQueue = new Queue("scheduler", { connection: getRedis() });

  // Check overdue charges daily at 8am
  await schedulerQueue.add(
    "check-overdue",
    {},
    {
      repeat: { pattern: "0 8 * * *" },
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  );

  // Send charge reminders 3 days before due date, daily at 9am
  await schedulerQueue.add(
    "charge-reminders",
    {},
    {
      repeat: { pattern: "0 9 * * *" },
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  );

  // ─── Agent automation cron jobs ───

  // Maestro: compose charges on day 28 at 10h UTC
  await schedulerQueue.add(
    "maestro-compose",
    {},
    {
      repeat: { pattern: "0 10 28 * *" },
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  );

  // Sentinela: check overdue payments on days 2-4 at 14h UTC
  await schedulerQueue.add(
    "sentinela-watch",
    {},
    {
      repeat: { pattern: "0 14 2-4 * *" },
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  );

  // Pagador: pay bills on day 5 at 10h UTC
  await schedulerQueue.add(
    "pagador-bills",
    {},
    {
      repeat: { pattern: "0 10 5 * *" },
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  );

  // Pagador: owner payout on day 15 at 10h UTC
  await schedulerQueue.add(
    "pagador-payout",
    {},
    {
      repeat: { pattern: "0 10 15 * *" },
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  );

  // Contador: statement fallback on day 16 at 14h UTC
  await schedulerQueue.add(
    "contador-statement",
    {},
    {
      repeat: { pattern: "0 14 16 * *" },
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  );

  console.log("[scheduler] Recurring jobs configured (including agent automation)");
}

/**
 * Mark overdue charges and emit events.
 */
export async function checkOverdueCharges(): Promise<number> {
  const today = new Date().toISOString().split("T")[0];

  const overdueCharges = await db
    .select()
    .from(charges)
    .where(
      and(
        lt(charges.dueDate, today),
        eq(charges.paymentStatus, ChargePaymentStatus.OPEN),
        eq(charges.issueStatus, "issued"),
      ),
    );

  for (const charge of overdueCharges) {
    await db
      .update(charges)
      .set({ paymentStatus: ChargePaymentStatus.OVERDUE })
      .where(eq(charges.id, charge.id));

    await emitDomainEvent(charge.orgId, "charge.overdue", {
      chargeId: charge.id,
      leaseContractId: charge.leaseContractId,
      dueDate: charge.dueDate,
      netAmount: charge.netAmount,
    }).catch((e) => console.error("[scheduler] Event emit error:", e));
  }

  console.log(`[scheduler] Marked ${overdueCharges.length} charges as overdue`);
  return overdueCharges.length;
}

/**
 * Send reminders for charges due in 3 days.
 */
export async function sendChargeReminders(): Promise<number> {
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
  const targetDate = threeDaysFromNow.toISOString().split("T")[0];

  const upcomingCharges = await db
    .select({
      charge: charges,
      contract: leaseContracts,
    })
    .from(charges)
    .innerJoin(leaseContracts, eq(charges.leaseContractId, leaseContracts.id))
    .where(
      and(
        eq(charges.dueDate, targetDate),
        eq(charges.paymentStatus, ChargePaymentStatus.OPEN),
        eq(charges.issueStatus, "issued"),
      ),
    );

  for (const { charge, contract } of upcomingCharges) {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, contract.tenantId))
      .limit(1);

    if (!tenant?.phone) continue;

    await messagesQueue().add("send", {
      messageRecordId: null,
      orgId: charge.orgId,
      channel: "whatsapp",
      recipient: tenant.phone,
      templateType: "charge_issued",
      templateData: {
        tenantName: tenant.fullName,
        dueDate: charge.dueDate,
        amount: charge.netAmount,
        billingPeriod: charge.billingPeriod,
      },
    });
  }

  console.log(`[scheduler] Queued ${upcomingCharges.length} charge reminders`);
  return upcomingCharges.length;
}

// ─── Agent automation cron handlers ───

/**
 * Get the current billing period in YYYY-MM format.
 */
function getCurrentBillingPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Get all org IDs for scheduling agent tasks across all tenants.
 */
async function getAllOrgIds(): Promise<string[]> {
  const orgs = await db.select({ id: organizations.id }).from(organizations);
  return orgs.map((o) => o.id);
}

/**
 * Create an agent task for a cron-triggered job.
 */
async function createScheduledAgentTask(
  orgId: string,
  taskType: string,
  input: Record<string, unknown>,
): Promise<void> {
  const [task] = await db
    .insert(agentTasks)
    .values({ orgId, taskType, input })
    .returning();

  await agentTasksQueue().add("process", {
    taskId: task.id,
    orgId,
    taskType,
  });
}

/**
 * Maestro cron: compose charges for all orgs.
 */
export async function runMaestroCompose(): Promise<void> {
  const billingPeriod = getCurrentBillingPeriod();
  const orgIds = await getAllOrgIds();

  for (const orgId of orgIds) {
    await createScheduledAgentTask(orgId, "maestro_compose", {
      orgId,
      billingPeriod,
    });
  }
  console.log(`[scheduler] Queued maestro_compose for ${orgIds.length} orgs, period ${billingPeriod}`);
}

/**
 * Sentinela cron: check overdue payments for all orgs.
 */
export async function runSentinelaWatch(): Promise<void> {
  const orgIds = await getAllOrgIds();

  for (const orgId of orgIds) {
    await createScheduledAgentTask(orgId, "sentinela_watch", {
      mode: "cron",
    });
  }
  console.log(`[scheduler] Queued sentinela_watch for ${orgIds.length} orgs`);
}

/**
 * Pagador cron (pay bills): pay approved expenses for all orgs.
 */
export async function runPagadorBills(): Promise<void> {
  const billingPeriod = getCurrentBillingPeriod();
  const orgIds = await getAllOrgIds();

  for (const orgId of orgIds) {
    await createScheduledAgentTask(orgId, "pagador_payout", {
      mode: "pay_bills",
      billingPeriod,
    });
  }
  console.log(`[scheduler] Queued pagador_payout (pay_bills) for ${orgIds.length} orgs`);
}

/**
 * Pagador cron (payout): calculate and register owner payouts for all orgs.
 */
export async function runPagadorPayout(): Promise<void> {
  const billingPeriod = getCurrentBillingPeriod();
  const orgIds = await getAllOrgIds();

  for (const orgId of orgIds) {
    await createScheduledAgentTask(orgId, "pagador_payout", {
      mode: "payout",
      billingPeriod,
    });
  }
  console.log(`[scheduler] Queued pagador_payout (payout) for ${orgIds.length} orgs`);
}

/**
 * Contador cron (fallback): generate statements for all orgs.
 */
export async function runContadorStatement(): Promise<void> {
  const billingPeriod = getCurrentBillingPeriod();
  const orgIds = await getAllOrgIds();

  for (const orgId of orgIds) {
    await createScheduledAgentTask(orgId, "contador_statement", {
      period: billingPeriod,
    });
  }
  console.log(`[scheduler] Queued contador_statement for ${orgIds.length} orgs`);
}
