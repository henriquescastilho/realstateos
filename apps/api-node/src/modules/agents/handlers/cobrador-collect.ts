/**
 * COBRADOR — Emissão de boletos e cobrança de inquilinos.
 * Emite boleto, envia WhatsApp, e agenda lembretes.
 */

import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { charges, leaseContracts, tenants } from "../../../db/schema";
import { issueCharge } from "../../billing/service";
import { sendMessage } from "../../communications/service";
import { messagesQueue } from "../../../lib/queue";
import type { AgentTask } from "../../../types/domain";
import type { TaskExecutionResult } from "../executor";

interface CobradorInput {
  chargeId?: string;
  chargeIds?: string[];
}

/**
 * Schedule delayed reminder messages via BullMQ.
 */
async function scheduleReminders(
  orgId: string,
  chargeId: string,
  tenantPhone: string,
  tenantName: string,
  dueDate: string,
  amount: string,
  billingPeriod: string,
): Promise<void> {
  const dueDateObj = new Date(dueDate + "T12:00:00Z");
  const now = Date.now();

  const reminders = [
    { dayOffset: -3, message: `Olá ${tenantName}, seu boleto de R$ ${amount} vence em 3 dias (${dueDate}). Pague via PIX ou boleto.` },
    { dayOffset: -1, message: `Olá ${tenantName}, seu boleto de R$ ${amount} vence amanhã (${dueDate}). Não esqueça de pagar!` },
    { dayOffset: 1, message: `Olá ${tenantName}, seu boleto de R$ ${amount} venceu ontem (${dueDate}). Regularize para evitar multa e juros.` },
    { dayOffset: 3, message: `Olá ${tenantName}, seu boleto de R$ ${amount} está vencido há 3 dias. Por favor regularize o pagamento.` },
  ];

  for (const reminder of reminders) {
    const sendAt = new Date(dueDateObj);
    sendAt.setDate(sendAt.getDate() + reminder.dayOffset);
    sendAt.setHours(14, 0, 0, 0); // 14h UTC

    const delayMs = sendAt.getTime() - now;
    if (delayMs <= 0) continue; // Skip past reminders

    await messagesQueue().add(
      "send",
      {
        messageRecordId: null,
        orgId,
        channel: "whatsapp",
        recipient: tenantPhone,
        templateType: "charge_reminder",
        templateData: {
          tenantName,
          dueDate,
          amount,
          billingPeriod,
          reminderMessage: reminder.message,
        },
      },
      { delay: delayMs },
    );
  }
}

/**
 * Process a single charge: issue boleto + send WhatsApp + schedule reminders.
 */
async function processCharge(
  orgId: string,
  chargeId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Issue the charge (generates boleto + sends email)
    const issued = await issueCharge(chargeId);

    // Get tenant info for WhatsApp
    const [contract] = await db
      .select()
      .from(leaseContracts)
      .where(eq(leaseContracts.id, issued.leaseContractId))
      .limit(1);

    if (!contract) return { success: true };

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, contract.tenantId))
      .limit(1);

    if (!tenant?.phone) return { success: true };

    // Send WhatsApp notification
    await sendMessage({
      orgId,
      entityType: "charge",
      entityId: chargeId,
      channel: "whatsapp",
      templateType: "charge_issued",
      recipient: tenant.phone,
      templateData: {
        tenantName: tenant.fullName,
        dueDate: issued.dueDate,
        amount: issued.netAmount,
        billingPeriod: issued.billingPeriod,
      },
    }).catch((e) => console.error("[agent:cobrador] WhatsApp error:", e));

    // Schedule reminders
    await scheduleReminders(
      orgId,
      chargeId,
      tenant.phone,
      tenant.fullName,
      issued.dueDate,
      issued.netAmount,
      issued.billingPeriod,
    ).catch((e) => console.error("[agent:cobrador] Reminder scheduling error:", e));

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // If charge is already issued, that's OK
    if (msg.includes("can only issue from")) {
      return { success: true, error: "Already issued" };
    }
    return { success: false, error: msg };
  }
}

/**
 * Main handler for the Cobrador agent task.
 */
export async function handleCobradorCollect(
  task: AgentTask,
): Promise<TaskExecutionResult> {
  const input = task.input as unknown as CobradorInput;
  const chargeIds = input.chargeIds ?? (input.chargeId ? [input.chargeId] : []);

  if (chargeIds.length === 0) {
    return {
      status: "failed",
      output: { error: "No charge IDs provided" },
    };
  }

  const results: Array<{ chargeId: string; success: boolean; error?: string }> = [];

  for (const id of chargeIds) {
    const result = await processCharge(task.orgId, id);
    results.push({ chargeId: id, ...result });
  }

  const successCount = results.filter((r) => r.success).length;

  return {
    status: "completed",
    output: {
      processed: results.length,
      successful: successCount,
      failed: results.length - successCount,
      results,
    },
    confidence: successCount === results.length ? 0.95 : 0.70,
  };
}
