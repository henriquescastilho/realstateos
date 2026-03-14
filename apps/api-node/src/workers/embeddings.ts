/**
 * Vector embedding worker.
 *
 * Queue: vector-embedding
 * Job payload: { orgId: string; entityType: "contract"|"maintenance"|"communication"; entityId: string; text: string }
 *
 * Generates embeddings for semantic search using pgvector.
 * In production this would call the Gemini embeddings API.
 * Falls back to a no-op if the embedding provider is unavailable.
 */

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

const QUEUE_NAME = "vector-embedding";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

function redisConnection() {
  const url = new URL(REDIS_URL);
  return { host: url.hostname, port: Number(url.port) || 6379 };
}

export type EmbeddingEntityType = "contract" | "maintenance" | "communication";

interface EmbeddingJobData {
  orgId: string;
  entityType: EmbeddingEntityType;
  entityId: string;
  text: string;
}

async function processEmbeddingJob(
  data: EmbeddingJobData,
): Promise<{ embedded: boolean; dimensions?: number }> {
  const { orgId, entityType, entityId, text } = data;

  // TODO: Call Gemini embeddings API when GEMINI_API_KEY is set:
  //   const embedding = await gemini.embedContent(text);
  //   await db.insert(vectorEmbeddings).values({ orgId, entityType, entityId, embedding });
  //
  // For now, log and return stub result.
  console.log(
    `[embeddings-worker] org=${orgId} type=${entityType} id=${entityId} text_len=${text.length}`,
  );

  return { embedded: false };
}

export function startEmbeddingsWorker(): Worker | null {
  if (!BullMQ) {
    console.warn("[embeddings-worker] bullmq not installed — embeddings worker not started");
    return null;
  }

  const worker = new BullMQ.Worker(
    QUEUE_NAME,
    async (job) => processEmbeddingJob(job.data as EmbeddingJobData),
    { connection: redisConnection(), concurrency: 4 },
  );

  console.log(`[embeddings-worker] Worker listening on queue: ${QUEUE_NAME}`);
  return worker;
}

let _queue: Queue | null = null;

export function getEmbeddingsQueue(): Queue | null {
  if (!BullMQ) return null;
  if (!_queue) _queue = new BullMQ.Queue(QUEUE_NAME, { connection: redisConnection() });
  return _queue;
}

export async function enqueueEmbedding(data: EmbeddingJobData): Promise<void> {
  const queue = getEmbeddingsQueue();
  if (!queue) {
    // best-effort: skip embeddings if queue unavailable
    return;
  }
  await queue.add("embed", data, { attempts: 2, backoff: { type: "fixed", delay: 2000 } });
}
