import { eq, and, count, desc } from "drizzle-orm";
import { db } from "../../db";
import { agentTasks, agentConfigs } from "../../db/schema";
import { NotFoundError, ConflictError } from "../../lib/errors";
import type { UpdateAgentConfigInput } from "./validators";

/**
 * List agent tasks with filters.
 */
export async function listAgentTasks(params: {
  orgId: string;
  status?: string;
  taskType?: string;
  page: number;
  pageSize: number;
}) {
  const conditions = [eq(agentTasks.orgId, params.orgId)];

  if (params.status) {
    conditions.push(eq(agentTasks.status, params.status));
  }
  if (params.taskType) {
    conditions.push(eq(agentTasks.taskType, params.taskType));
  }

  const whereClause = and(...conditions);

  const [data, totalResult] = await Promise.all([
    db
      .select()
      .from(agentTasks)
      .where(whereClause)
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize)
      .orderBy(desc(agentTasks.createdAt)),
    db.select({ total: count() }).from(agentTasks).where(whereClause),
  ]);

  return {
    data,
    total: totalResult[0]?.total ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}

/**
 * Get a single agent task.
 */
export async function getAgentTask(taskId: string, orgId: string) {
  const [task] = await db
    .select()
    .from(agentTasks)
    .where(
      and(eq(agentTasks.id, taskId), eq(agentTasks.orgId, orgId)),
    )
    .limit(1);

  if (!task) {
    throw new NotFoundError("AgentTask", taskId);
  }

  return task;
}

/**
 * Approve a task recommendation.
 */
export async function approveTask(taskId: string, orgId: string, reviewedBy: string) {
  const task = await getAgentTask(taskId, orgId);

  if (task.status !== "completed" && task.status !== "escalated") {
    throw new ConflictError(
      `Cannot approve task in status '${task.status}'. Must be 'completed' or 'escalated'.`,
    );
  }

  const [updated] = await db
    .update(agentTasks)
    .set({
      status: "completed",
      executedAction: task.output,
      reviewedBy,
      reviewedAt: new Date(),
    })
    .where(eq(agentTasks.id, taskId))
    .returning();

  return updated;
}

/**
 * Reject a task recommendation with optional override.
 */
export async function rejectTask(
  taskId: string,
  orgId: string,
  reviewedBy: string,
  overrideOutput?: Record<string, unknown>,
) {
  const task = await getAgentTask(taskId, orgId);

  if (task.status !== "completed" && task.status !== "escalated") {
    throw new ConflictError(
      `Cannot reject task in status '${task.status}'. Must be 'completed' or 'escalated'.`,
    );
  }

  const [updated] = await db
    .update(agentTasks)
    .set({
      status: "cancelled",
      executedAction: overrideOutput ?? null,
      reviewedBy,
      reviewedAt: new Date(),
    })
    .where(eq(agentTasks.id, taskId))
    .returning();

  return updated;
}

/**
 * Upsert agent config (thresholds per org+taskType).
 */
export async function updateAgentConfig(input: UpdateAgentConfigInput) {
  const [config] = await db
    .insert(agentConfigs)
    .values({
      orgId: input.orgId,
      taskType: input.taskType,
      autoExecuteThreshold: input.autoExecuteThreshold?.toFixed(4) ?? "0.8500",
      escalateThreshold: input.escalateThreshold?.toFixed(4) ?? "0.5000",
      isEnabled: input.isEnabled ?? true,
    })
    .onConflictDoUpdate({
      target: [agentConfigs.orgId, agentConfigs.taskType],
      set: {
        ...(input.autoExecuteThreshold !== undefined && {
          autoExecuteThreshold: input.autoExecuteThreshold.toFixed(4),
        }),
        ...(input.escalateThreshold !== undefined && {
          escalateThreshold: input.escalateThreshold.toFixed(4),
        }),
        ...(input.isEnabled !== undefined && { isEnabled: input.isEnabled }),
      },
    })
    .returning();

  return config;
}

/**
 * List agent configs for an org.
 */
export async function listAgentConfigs(orgId: string) {
  return db
    .select()
    .from(agentConfigs)
    .where(eq(agentConfigs.orgId, orgId))
    .orderBy(agentConfigs.taskType);
}
