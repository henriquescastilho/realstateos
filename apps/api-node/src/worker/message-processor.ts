import { Worker, Job } from "bullmq";
import { eq } from "drizzle-orm";
import { getRedis } from "../lib/redis";
import { QUEUE_NAMES } from "../lib/queue";
import { db } from "../db";
import { messageRecords } from "../db/schema";
import { renderTemplate } from "../modules/communications/templates";
import { sendEmail } from "../modules/communications/channels/email";
import { sendWhatsApp } from "../modules/communications/channels/whatsapp";
import { getChannelSender } from "../modules/communications/channel-factory";
import { emitDomainEvent } from "../lib/events";

export interface MessageJob {
  messageRecordId: string;
  orgId: string;
  channel: string;
  recipient: string;
  templateType: string;
  templateData: Record<string, string>;
}

async function processMessage(job: Job<MessageJob>): Promise<void> {
  const { messageRecordId, orgId, channel, recipient, templateType, templateData } = job.data;

  const rendered = renderTemplate(templateType, templateData);

  let success = false;
  let error: string | undefined;

  try {
    const sender = await getChannelSender(orgId, channel);

    if (sender) {
      const result = await sender.send({ to: recipient, subject: rendered.subject, body: rendered.body, html: rendered.html });
      success = result.success;
      error = result.error;
    } else if (channel === "email") {
      const result = await sendEmail({ to: recipient, subject: rendered.subject, body: rendered.body, html: rendered.html, orgId });
      success = result.success;
      error = result.error;
    } else if (channel === "whatsapp") {
      const result = await sendWhatsApp({ to: recipient, body: `${rendered.subject}\n\n${rendered.body}` });
      success = result.success;
      error = result.error;
    } else {
      error = `Unsupported channel: ${channel}`;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : "Unknown send error";
  }

  await db
    .update(messageRecords)
    .set({
      status: success ? "sent" : "failed",
      sentAt: success ? new Date() : undefined,
    })
    .where(eq(messageRecords.id, messageRecordId));

  const eventType = success ? "message.sent" : "message.failed";
  await emitDomainEvent(orgId, eventType, {
    messageRecordId,
    channel,
    recipient,
    templateType,
  }).catch((e) => console.error("[worker:messages] Event emit error:", e));
}

export function createMessageWorker(): Worker {
  const worker = new Worker(QUEUE_NAMES.MESSAGES, processMessage, {
    connection: getRedis(),
    concurrency: 5,
  });

  worker.on("completed", (job) => {
    console.log(`[worker:messages] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[worker:messages] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
