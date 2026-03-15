import { Worker, Job } from "bullmq";
import { eq } from "drizzle-orm";
import { getRedis } from "../lib/redis";
import { QUEUE_NAMES } from "../lib/queue";
import { db } from "../db";
import { agentTasks } from "../db/schema";
import { executeTask } from "../modules/agents/executor";

export interface AgentTaskJob {
  taskId: string;
  orgId: string;
  taskType: string;
}

async function processAgentTask(job: Job<AgentTaskJob>): Promise<void> {
  const { taskId } = job.data;

  // Mark as running
  await db
    .update(agentTasks)
    .set({ status: "running", attemptCount: job.attemptsMade + 1 })
    .where(eq(agentTasks.id, taskId));

  try {
    const [task] = await db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.id, taskId))
      .limit(1);

    if (!task) {
      console.warn(`[worker:agent-tasks] Task ${taskId} not found`);
      return;
    }

    const result = await executeTask(task);

    await db
      .update(agentTasks)
      .set({
        status: result.status,
        output: result.output,
        confidence: result.confidence?.toFixed(4),
        executedAction: result.executedAction,
      })
      .where(eq(agentTasks.id, taskId));
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await db
      .update(agentTasks)
      .set({ status: "failed", failureReason: errorMsg })
      .where(eq(agentTasks.id, taskId));
  }
}

export function createAgentTaskWorker(): Worker {
  const worker = new Worker(QUEUE_NAMES.AGENT_TASKS, processAgentTask, {
    connection: getRedis(),
    concurrency: 3,
  });

  worker.on("completed", (job) => {
    console.log(`[worker:agent-tasks] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[worker:agent-tasks] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
