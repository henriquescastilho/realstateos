import { Worker, Job } from "bullmq";
import { eq, and } from "drizzle-orm";
import { createHmac } from "crypto";
import { getRedis } from "../lib/redis";
import { QUEUE_NAMES } from "../lib/queue";
import { db } from "../db";
import { webhookSubscriptions } from "../db/schema";

export interface EventDeliveryJob {
  eventLogId: string;
  orgId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

async function processEventDelivery(job: Job<EventDeliveryJob>): Promise<void> {
  const { orgId, eventType, payload, eventLogId } = job.data;

  // Find active subscriptions matching this event type for this org
  const subscriptions = await db
    .select()
    .from(webhookSubscriptions)
    .where(
      and(
        eq(webhookSubscriptions.orgId, orgId),
        eq(webhookSubscriptions.isActive, true),
      ),
    );

  // Filter subscriptions that include this event type
  const matching = subscriptions.filter((sub) =>
    sub.eventTypes.includes(eventType) || sub.eventTypes.includes("*"),
  );

  for (const sub of matching) {
    try {
      const body = JSON.stringify({
        id: eventLogId,
        type: eventType,
        orgId,
        payload,
        timestamp: new Date().toISOString(),
      });

      const signature = createHmac("sha256", sub.secret)
        .update(body)
        .digest("hex");

      const res = await fetch(sub.targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Event-Type": eventType,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      const status = res.ok ? "success" : "failed";

      await db
        .update(webhookSubscriptions)
        .set({
          lastDeliveryAt: new Date(),
          lastDeliveryStatus: status,
        })
        .where(eq(webhookSubscriptions.id, sub.id));

      if (!res.ok) {
        console.warn(
          `[worker:events] Webhook delivery failed for sub ${sub.id}: HTTP ${res.status}`,
        );
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `[worker:events] Webhook delivery error for sub ${sub.id}:`,
        errorMsg,
      );

      await db
        .update(webhookSubscriptions)
        .set({
          lastDeliveryAt: new Date(),
          lastDeliveryStatus: "failed",
        })
        .where(eq(webhookSubscriptions.id, sub.id));
    }
  }
}

export function createEventDeliveryWorker(): Worker {
  const worker = new Worker(QUEUE_NAMES.EVENTS, processEventDelivery, {
    connection: getRedis(),
    concurrency: 5,
  });

  worker.on("completed", (job) => {
    console.log(`[worker:events] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[worker:events] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
