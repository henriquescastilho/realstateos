import { Worker, Job } from "bullmq";
import { getRedis } from "../lib/redis";
import { QUEUE_NAMES } from "../lib/queue";
import { ingestDocument } from "../modules/ai-assistant/ingestion";

export interface IngestionJob {
  orgId: string;
  documentId: string;
  sourceType: string;
  content: string;
  metadata?: Record<string, unknown>;
}

async function processIngestion(job: Job<IngestionJob>): Promise<void> {
  const { orgId, documentId, sourceType, content, metadata } = job.data;

  await ingestDocument({
    orgId,
    documentId,
    sourceType,
    content,
    metadata,
  });
}

export function createIngestionWorker(): Worker {
  const worker = new Worker(QUEUE_NAMES.INGESTION, processIngestion, {
    connection: getRedis(),
    concurrency: 2,
  });

  worker.on("completed", (job) => {
    console.log(`[worker:ingestion] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[worker:ingestion] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
