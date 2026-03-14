/**
 * Dead Letter Queue (DLQ) worker.
 *
 * Queue: dlq-processing
 *
 * When an agent task fails after maxAttempts it is moved to this queue.
 * The DLQ worker:
 *   1. Creates a human-review escalation record in agent_tasks
 *   2. Logs the failure details
 *   3. (Optional) sends an alert notification
 *
 * Falls back if bullmq not installed.
 */

import { db } from "../db";
import { agentTasks } from "../db/schema";
import { eq, and } from "drizzle-orm";

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
  // optional
}

const QUEUE_NAME = "dlq-processing";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

function redisConnection() {
  const url = new URL(REDIS_URL);
  return { host: url.hostname, port: Number(url.port) || 6379 };
}

interface DlqJobData {
  orgId: string;
  originalTaskId: string;
  taskType: string;
  failureReason: string;
  attemptCount: number;
  payload: Record<string, unknown>;
}

async function processDlqJob(data: DlqJobData): Promise<{ escalated: boolean }> {
  const { orgId, originalTaskId, taskType, failureReason, attemptCount, payload } = data;

  // Mark original task as escalated (needs human review)
  await db
    .update(agentTasks)
    .set({
      status: "escalated",
      failureReason: `DLQ after ${attemptCount} attempts: ${failureReason}`,
      updatedAt: new Date(),
    })
    .where(and(eq(agentTasks.id, originalTaskId), eq(agentTasks.orgId, orgId)));

  // Create a new escalation task for human review
  await db.insert(agentTasks).values({
    orgId,
    taskType: "human_review",
    status: "escalated",
    input: {
      originalTaskId,
      originalTaskType: taskType,
      failureReason,
      attemptCount,
      originalPayload: payload,
      escalatedAt: new Date().toISOString(),
    },
    output: null,
    agentName: "dlq_worker",
    attemptCount: 0,
    failureReason: null,
  });

  console.warn(
    `[dlq-worker] org=${orgId} task=${originalTaskId} type=${taskType} escalated after ${attemptCount} attempts`,
  );
  return { escalated: true };
}

export function startDlqWorker(): Worker | null {
  if (!BullMQ) {
    console.warn("[dlq-worker] bullmq not installed — DLQ worker not started");
    return null;
  }

  const worker = new BullMQ.Worker(
    QUEUE_NAME,
    async (job) => processDlqJob(job.data as DlqJobData),
    { connection: redisConnection(), concurrency: 2 },
  );

  console.log(`[dlq-worker] Worker listening on queue: ${QUEUE_NAME}`);
  return worker;
}

export function getDlqQueue(): Queue | null {
  if (!BullMQ) return null;
  return new BullMQ.Queue(QUEUE_NAME, { connection: redisConnection() });
}

/**
 * Enqueue a failed task for DLQ processing.
 * Call this when an agent task exhausts its retry budget.
 */
export async function enqueueToDeadLetter(data: DlqJobData): Promise<void> {
  const queue = getDlqQueue();
  if (!queue) {
    // Fallback: process synchronously
    await processDlqJob(data);
    return;
  }
  await queue.add("process", data, { attempts: 1 });
}
