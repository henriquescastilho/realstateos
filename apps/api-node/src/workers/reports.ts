/**
 * Report generation worker.
 *
 * Queue: report-generation
 * Job payload: { orgId: string; reportType: string; format: "csv"|"xlsx"|"pdf"; params: Record<string, unknown> }
 *
 * Generates async report jobs. In the full implementation these would
 * query aggregated data, build the document, and upload to MinIO,
 * then update the job record with the download URL.
 */

import { db } from "../db";
import { agentTasks } from "../db/schema";
import { eq, and } from "drizzle-orm";

// ─── BullMQ dynamic import ─────────────────────────────────────────────────

type Worker = { close(): Promise<void> };
type Queue = {
  add(name: string, data: unknown, opts?: unknown): Promise<{ id?: string }>;
  close(): Promise<void>;
};

interface BullMQModule {
  Worker: new (
    queueName: string,
    processor: (job: { data: unknown; id?: string }) => Promise<unknown>,
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

const QUEUE_NAME = "report-generation";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

function redisConnection() {
  const url = new URL(REDIS_URL);
  return { host: url.hostname, port: Number(url.port) || 6379 };
}

export type ReportFormat = "csv" | "xlsx" | "pdf";

interface ReportJobData {
  orgId: string;
  taskId: string; // agent_tasks.id to update with result
  reportType: string;
  format: ReportFormat;
  params: Record<string, unknown>;
}

async function processReportJob(
  data: ReportJobData,
): Promise<{ downloadUrl: string | null; rowCount: number }> {
  const { orgId, taskId, reportType, format, params } = data;

  console.log(
    `[reports-worker] org=${orgId} type=${reportType} format=${format} params=${JSON.stringify(params)}`,
  );

  // TODO: Integrate with StorageService once @aws-sdk/client-s3 is installed.
  // The stub below marks the task complete with a placeholder URL.
  const downloadUrl: string | null = null;
  const rowCount = 0;

  // Update the agent_task record with result
  await db
    .update(agentTasks)
    .set({
      status: "completed",
      output: { downloadUrl, rowCount, format, reportType, completedAt: new Date().toISOString() },
      updatedAt: new Date(),
    })
    .where(and(eq(agentTasks.id, taskId), eq(agentTasks.orgId, orgId)));

  return { downloadUrl, rowCount };
}

export function startReportsWorker(): Worker | null {
  if (!BullMQ) {
    console.warn("[reports-worker] bullmq not installed — report worker not started");
    return null;
  }

  const worker = new BullMQ.Worker(
    QUEUE_NAME,
    async (job) => processReportJob(job.data as ReportJobData),
    { connection: redisConnection(), concurrency: 2 },
  );

  console.log(`[reports-worker] Worker listening on queue: ${QUEUE_NAME}`);
  return worker;
}

let _queue: Queue | null = null;

export function getReportsQueue(): Queue | null {
  if (!BullMQ) return null;
  if (!_queue) _queue = new BullMQ.Queue(QUEUE_NAME, { connection: redisConnection() });
  return _queue;
}

export async function enqueueReportGeneration(data: ReportJobData): Promise<string | undefined> {
  const queue = getReportsQueue();
  if (!queue) {
    await processReportJob(data);
    return undefined;
  }
  const job = await queue.add("generate", data, { attempts: 2 });
  return job.id;
}
