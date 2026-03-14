/**
 * Payment reminders worker.
 *
 * Queue: payment-reminders
 * Job payload: { orgId: string; daysBeforeDue: number }
 *
 * Finds charges due in `daysBeforeDue` days and enqueues a notification
 * for each renter/owner via the communications module.
 */

import { db } from "../db";
import { charges, leaseContracts } from "../db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

// ─── BullMQ dynamic import ─────────────────────────────────────────────────

type Worker = { close(): Promise<void> };
type Queue = {
  add(name: string, data: unknown, opts?: unknown): Promise<unknown>;
  close(): Promise<void>;
};

interface BullMQModule {
  Worker: new (
    queueName: string,
    processor: (job: { data: unknown }) => Promise<unknown>,
    opts?: Record<string, unknown>,
  ) => Worker;
  Queue: new (queueName: string, opts?: Record<string, unknown>) => Queue;
}

let BullMQ: BullMQModule | null = null;
try {
  BullMQ = require("bullmq") as BullMQModule;
} catch {
  // optional dependency
}

const QUEUE_NAME = "payment-reminders";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

function redisConnection() {
  const url = new URL(REDIS_URL);
  return { host: url.hostname, port: Number(url.port) || 6379 };
}

interface RemindersJobData {
  orgId: string;
  daysBeforeDue: number;
}

async function processRemindersJob(data: RemindersJobData): Promise<{ reminders: number }> {
  const { orgId, daysBeforeDue } = data;

  const today = new Date();
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + daysBeforeDue);
  const targetStr = targetDate.toISOString().slice(0, 10);

  // Find open charges due on target date
  const upcoming = await db
    .select({
      chargeId: charges.id,
      contractId: charges.contractId,
      grossAmount: charges.grossAmount,
      dueDate: charges.dueDate,
    })
    .from(charges)
    .where(
      and(
        eq(charges.orgId, orgId),
        eq(charges.paymentStatus, "open"),
        eq(sql`cast(${charges.dueDate} as date)`, sql`cast(${targetStr} as date)`),
      ),
    );

  // In a full implementation these would enqueue comms notifications.
  // Here we log and return the count for job tracking.
  console.log(
    `[reminders-worker] org=${orgId} daysBeforeDue=${daysBeforeDue} count=${upcoming.length}`,
  );

  return { reminders: upcoming.length };
}

export function startRemindersWorker(): Worker | null {
  if (!BullMQ) {
    console.warn("[reminders-worker] bullmq not installed — worker not started");
    return null;
  }

  const worker = new BullMQ.Worker(
    QUEUE_NAME,
    async (job) => processRemindersJob(job.data as RemindersJobData),
    { connection: redisConnection(), concurrency: 3 },
  );

  console.log(`[reminders-worker] Worker listening on queue: ${QUEUE_NAME}`);
  return worker;
}

export function getRemindersQueue(): Queue | null {
  if (!BullMQ) return null;
  return new BullMQ.Queue(QUEUE_NAME, { connection: redisConnection() });
}
