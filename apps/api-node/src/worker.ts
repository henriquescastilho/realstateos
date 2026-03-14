import "dotenv/config";
import { Worker } from "bullmq";
import { getRedis } from "./lib/redis";
import { createMessageWorker } from "./worker/message-processor";
import { createAgentTaskWorker } from "./worker/agent-task-processor";
import { createEventDeliveryWorker } from "./worker/event-delivery-processor";
import { createIngestionWorker } from "./worker/ingestion-processor";
import { setupScheduler, checkOverdueCharges, sendChargeReminders } from "./worker/scheduler";
import { QUEUE_NAMES } from "./lib/queue";

const workers: Worker[] = [];

async function start(): Promise<void> {
  console.log("[worker] Starting workers...");

  // Verify Redis connection
  const redis = getRedis();
  await redis.ping();
  console.log("[worker] Redis connected");

  // Start workers
  workers.push(createMessageWorker());
  workers.push(createAgentTaskWorker());
  workers.push(createEventDeliveryWorker());
  workers.push(createIngestionWorker());

  // Scheduler worker for recurring jobs
  const { Worker: BullWorker } = await import("bullmq");
  const schedulerWorker = new BullWorker(
    "scheduler",
    async (job) => {
      if (job.name === "check-overdue") {
        await checkOverdueCharges();
      } else if (job.name === "charge-reminders") {
        await sendChargeReminders();
      }
    },
    { connection: getRedis(), concurrency: 1 },
  );
  workers.push(schedulerWorker);

  // Set up repeatable jobs
  await setupScheduler();

  console.log(`[worker] All workers started: ${Object.values(QUEUE_NAMES).join(", ")}, scheduler`);
}

async function shutdown(): Promise<void> {
  console.log("[worker] Shutting down...");
  await Promise.all(workers.map((w) => w.close()));
  const redis = getRedis();
  await redis.quit();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start().catch((err) => {
  console.error("[worker] Failed to start:", err);
  process.exit(1);
});
