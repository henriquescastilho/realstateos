import { eq, and } from "drizzle-orm";
import { db } from "../../db";
import { agentConfigs } from "../../db/schema";

export type ConfidenceDecision = "auto_execute" | "needs_review" | "escalate";

const DEFAULT_AUTO_THRESHOLD = 0.85;
const DEFAULT_ESCALATE_THRESHOLD = 0.50;

/**
 * Route a task based on confidence score and org config.
 * >= autoExecuteThreshold -> auto_execute
 * >= escalateThreshold -> needs_review
 * < escalateThreshold -> escalate
 */
export async function routeByConfidence(
  orgId: string,
  taskType: string,
  confidence: number,
): Promise<ConfidenceDecision> {
  const [config] = await db
    .select()
    .from(agentConfigs)
    .where(
      and(
        eq(agentConfigs.orgId, orgId),
        eq(agentConfigs.taskType, taskType),
      ),
    )
    .limit(1);

  const autoThreshold = config
    ? parseFloat(config.autoExecuteThreshold)
    : DEFAULT_AUTO_THRESHOLD;
  const escalateThreshold = config
    ? parseFloat(config.escalateThreshold)
    : DEFAULT_ESCALATE_THRESHOLD;

  if (confidence >= autoThreshold) return "auto_execute";
  if (confidence >= escalateThreshold) return "needs_review";
  return "escalate";
}
