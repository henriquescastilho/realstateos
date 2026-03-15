/**
 * Orchestrator — Encadeia agentes por eventos de domínio.
 * Escuta eventos e cria agent tasks automaticamente.
 */

import { db } from "../../db";
import { agentTasks } from "../../db/schema";
import { agentTasksQueue } from "../../lib/queue";

interface EventPayload {
  orgId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

/**
 * Event-to-agent mapping.
 * When an event fires, creates the corresponding agent task.
 */
const EVENT_HANDLERS: Record<
  string,
  (orgId: string, payload: Record<string, unknown>) => Promise<void>
> = {
  "expense.captured": async (orgId, payload) => {
    // When an expense is captured, check if Maestro should compose charges
    const referenceMonth = payload.referenceMonth as string;
    if (!referenceMonth) return;

    await createAgentTask(orgId, "maestro_compose", {
      orgId,
      billingPeriod: referenceMonth,
    });
  },

  "charges.composed": async (orgId, payload) => {
    // When charges are composed, trigger Cobrador for each charge
    const chargeIds = payload.chargeIds as string[];
    if (!chargeIds || chargeIds.length === 0) return;

    await createAgentTask(orgId, "cobrador_collect", {
      chargeIds,
    });
  },

  "payment.received": async (orgId, payload) => {
    // When a payment is received, trigger Sentinela to verify
    await createAgentTask(orgId, "sentinela_watch", {
      mode: "webhook",
      paymentId: payload.paymentId,
      chargeId: payload.chargeId,
      receivedAmount: payload.receivedAmount,
      reconciliationStatus: payload.reconciliationStatus,
    });
  },

  "payout.completed": async (orgId, payload) => {
    // When payout is done, trigger Contador to generate statement
    const ownerId = payload.ownerId as string;
    const period = payload.period as string;
    const leaseContractIds = payload.leaseContractIds as string[];

    if (!ownerId || !period) return;

    await createAgentTask(orgId, "contador_statement", {
      ownerId,
      period,
      leaseContractIds,
    });
  },
};

/**
 * Create an agent task and enqueue it for processing.
 */
async function createAgentTask(
  orgId: string,
  taskType: string,
  input: Record<string, unknown>,
): Promise<void> {
  const [task] = await db
    .insert(agentTasks)
    .values({
      orgId,
      taskType,
      input,
    })
    .returning();

  await agentTasksQueue().add("process", {
    taskId: task.id,
    orgId,
    taskType,
  });

  console.log(`[orchestrator] Created ${taskType} task ${task.id} for org ${orgId}`);
}

/**
 * Process a domain event through the orchestrator.
 * Called by the event delivery processor when events are emitted.
 */
export async function handleDomainEvent(event: EventPayload): Promise<void> {
  const handler = EVENT_HANDLERS[event.eventType];
  if (!handler) return;

  try {
    await handler(event.orgId, event.payload);
  } catch (err) {
    console.error(
      `[orchestrator] Error handling ${event.eventType}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
