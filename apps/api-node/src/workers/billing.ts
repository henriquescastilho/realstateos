/**
 * Billing generation worker.
 *
 * Queue: billing-generation
 * Job payload: { orgId: string; billingPeriod: string }  (billingPeriod = "YYYY-MM")
 *
 * Generates monthly charges for all active contracts in an organisation.
 * On failure the job is moved to the DLQ after maxAttempts.
 *
 * Falls back gracefully if bullmq/ioredis is not installed.
 */

import { db } from "../db";
import { leaseContracts, charges } from "../db/schema";
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
    processor: (job: { data: unknown; id?: string }) => Promise<unknown>,
    opts?: Record<string, unknown>,
  ) => Worker;
  Queue: new (queueName: string, opts?: Record<string, unknown>) => Queue;
}

let BullMQ: BullMQModule | null = null;

try {
  BullMQ = require("bullmq") as BullMQModule;
} catch {
  // Installed as optional — warn once
}

const QUEUE_NAME = "billing-generation";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

function redisConnection() {
  const url = new URL(REDIS_URL);
  return { host: url.hostname, port: Number(url.port) || 6379 };
}

// ─── Queue (for enqueueing from other modules) ─────────────────────────────

let _queue: Queue | null = null;

export function getBillingQueue(): Queue | null {
  if (!BullMQ) return null;
  if (!_queue) {
    _queue = new BullMQ.Queue(QUEUE_NAME, { connection: redisConnection() });
  }
  return _queue;
}

export async function enqueueBillingGeneration(
  orgId: string,
  billingPeriod: string,
): Promise<void> {
  const queue = getBillingQueue();
  if (!queue) {
    console.warn("[billing-worker] BullMQ not available — running billing synchronously");
    await processBillingJob({ orgId, billingPeriod });
    return;
  }
  await queue.add(
    "generate",
    { orgId, billingPeriod },
    { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
  );
}

// ─── Core billing logic ────────────────────────────────────────────────────

interface BillingJobData {
  orgId: string;
  billingPeriod: string; // YYYY-MM
}

async function processBillingJob(
  data: BillingJobData,
): Promise<{ generated: number; skipped: number }> {
  const { orgId, billingPeriod } = data;

  // Fetch all active contracts for the org
  const activeContracts = await db
    .select()
    .from(leaseContracts)
    .where(and(eq(leaseContracts.orgId, orgId), eq(leaseContracts.operationalStatus, "active")));

  let generated = 0;
  let skipped = 0;

  for (const contract of activeContracts) {
    // Check if charge already exists for this period (idempotency)
    const existing = await db
      .select({ id: charges.id })
      .from(charges)
      .where(
        and(
          eq(charges.leaseContractId, contract.id),
          eq(charges.billingPeriod, billingPeriod),
          eq(charges.orgId, orgId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    const rentAmount = String(contract.rentAmount ?? "0");
    const dueDate = `${billingPeriod}-05`; // default due day 5th

    await db.insert(charges).values({
      orgId,
      leaseContractId: contract.id,
      billingPeriod,
      dueDate,
      grossAmount: rentAmount,
      netAmount: rentAmount,
      paymentStatus: "open",
      lineItems: [{ type: "rent", description: "Aluguel", amount: rentAmount, source: "contract" }],
    });

    generated++;
  }

  console.log(
    `[billing-worker] org=${orgId} period=${billingPeriod} generated=${generated} skipped=${skipped}`,
  );
  return { generated, skipped };
}

// ─── Worker ────────────────────────────────────────────────────────────────

export function startBillingWorker(): Worker | null {
  if (!BullMQ) {
    console.warn(
      "[billing-worker] bullmq not installed — worker not started. Install: npm install bullmq ioredis",
    );
    return null;
  }

  const worker = new BullMQ.Worker(
    QUEUE_NAME,
    async (job) => {
      const data = job.data as BillingJobData;
      return processBillingJob(data);
    },
    {
      connection: redisConnection(),
      concurrency: 5,
    },
  );

  console.log(`[billing-worker] Worker listening on queue: ${QUEUE_NAME}`);
  return worker;
}
