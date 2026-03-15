import type { AgentTask } from "../../types/domain";
import { routeByConfidence } from "./confidence-router";
import { classifyTicketWithLLM } from "./handlers/ticket-classifier";
import { parseDocumentWithLLM } from "./handlers/document-parser";
import { reviewChargeWithLLM } from "./handlers/charge-reviewer";
import { draftCommunicationWithLLM } from "./handlers/communication-drafter";

export interface TaskExecutionResult {
  status: "completed" | "escalated" | "failed";
  output: Record<string, unknown>;
  confidence?: number;
  executedAction?: Record<string, unknown>;
}

type TaskHandler = (task: AgentTask) => Promise<TaskExecutionResult>;

const handlers: Record<string, TaskHandler> = {
  ticket_classifier: handleTicketClassifier,
  document_parser: handleDocumentParser,
  charge_reviewer: handleChargeReviewer,
  communication_drafter: handleCommunicationDrafter,
  maintenance_classification_review: handleTicketClassifier,
};

/**
 * Dispatch a task to the appropriate handler based on taskType.
 */
export async function executeTask(task: AgentTask): Promise<TaskExecutionResult> {
  const handler = handlers[task.taskType];

  if (!handler) {
    return {
      status: "failed",
      output: { error: `Unknown task type: ${task.taskType}` },
    };
  }

  const result = await handler(task);

  // Route by confidence if we got a result
  if (result.confidence !== undefined && result.status === "completed") {
    const decision = await routeByConfidence(
      task.orgId,
      task.taskType,
      result.confidence,
    );

    if (decision === "escalate") {
      return { ...result, status: "escalated" };
    }
    if (decision === "auto_execute") {
      return {
        ...result,
        executedAction: result.output,
      };
    }
  }

  return result;
}

async function handleTicketClassifier(
  task: AgentTask,
): Promise<TaskExecutionResult> {
  const input = task.input as { description?: string };
  const description = input?.description ?? "";

  const classification = await classifyTicketWithLLM(description);

  return {
    status: "completed",
    output: { ...classification },
    confidence: classification.confidence,
  };
}

async function handleDocumentParser(
  task: AgentTask,
): Promise<TaskExecutionResult> {
  const input = task.input as { content?: string; documentType?: string };

  const result = await parseDocumentWithLLM(
    input?.content ?? "",
    input?.documentType ?? "unknown",
  );

  return {
    status: "completed",
    output: { ...result },
    confidence: result.confidence,
  };
}

async function handleChargeReviewer(
  task: AgentTask,
): Promise<TaskExecutionResult> {
  const input = task.input as {
    chargeData?: Record<string, unknown>;
    historicalCharges?: Array<Record<string, unknown>>;
  };

  const result = await reviewChargeWithLLM(
    input?.chargeData ?? {},
    input?.historicalCharges ?? [],
  );

  return {
    status: "completed",
    output: { ...result },
    confidence: result.confidence,
  };
}

async function handleCommunicationDrafter(
  task: AgentTask,
): Promise<TaskExecutionResult> {
  const input = task.input as {
    type?: string;
    context?: Record<string, unknown>;
    tone?: string;
  };

  const result = await draftCommunicationWithLLM({
    type: input?.type ?? "general",
    context: input?.context ?? {},
    tone: input?.tone,
  });

  return {
    status: "completed",
    output: { ...result },
    confidence: result.confidence,
  };
}
