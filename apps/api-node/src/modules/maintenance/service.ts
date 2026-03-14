import { eq, and, count } from "drizzle-orm";
import { db } from "../../db";
import { maintenanceTickets, agentTasks } from "../../db/schema";
import { NotFoundError, ConflictError } from "../../lib/errors";
import { classifyTicket } from "./classifier";
import { emitDomainEvent } from "../../lib/events";
import type { CreateTicketInput, UpdateTicketInput } from "./validators";

const CLASSIFIER_CONFIDENCE_THRESHOLD = 60;

/**
 * Create a maintenance ticket.
 * Auto-classifies using the keyword classifier if no category/priority provided.
 * Creates an AgentTask if classifier confidence is low.
 */
export async function createTicket(input: CreateTicketInput) {
  const classification = classifyTicket(input.description);

  const category = input.category ?? classification.category;
  const priority = input.priority ?? classification.priority;

  const result = await db.transaction(async (tx) => {
    const [ticket] = await tx
      .insert(maintenanceTickets)
      .values({
        orgId: input.orgId,
        propertyId: input.propertyId,
        leaseContractId: input.leaseContractId,
        openedBy: input.openedBy,
        description: input.description,
        category,
        priority,
        status: "open",
      })
      .returning();

    // If classifier confidence is low and no manual override, create review task
    let agentTask = null;
    if (
      !input.category &&
      !input.priority &&
      classification.confidence < CLASSIFIER_CONFIDENCE_THRESHOLD
    ) {
      const [task] = await tx
        .insert(agentTasks)
        .values({
          orgId: input.orgId,
          taskType: "maintenance_classification_review",
          status: "queued",
          input: {
            ticketId: ticket.id,
            description: input.description,
            autoCategory: classification.category,
            autoPriority: classification.priority,
            confidence: classification.confidence,
          },
          confidence: classification.confidence.toFixed(4),
          relatedEntityType: "maintenance_ticket",
          relatedEntityId: ticket.id,
        })
        .returning();
      agentTask = task;
    }

    return { ticket, classification, agentTask };
  });

  await emitDomainEvent(input.orgId, "ticket.opened", {
    ticketId: result.ticket.id,
    propertyId: input.propertyId,
    category: result.ticket.category,
    priority: result.ticket.priority,
  }).catch((e) => console.error("[maintenance] Event emit error:", e));

  return result;
}

/**
 * Get a ticket by ID.
 */
export async function getTicketById(ticketId: string) {
  const [ticket] = await db
    .select()
    .from(maintenanceTickets)
    .where(eq(maintenanceTickets.id, ticketId))
    .limit(1);

  if (!ticket) {
    throw new NotFoundError("MaintenanceTicket", ticketId);
  }

  return ticket;
}

/**
 * Update a ticket (status, category, priority, resolution).
 */
export async function updateTicket(ticketId: string, input: UpdateTicketInput) {
  const [existing] = await db
    .select()
    .from(maintenanceTickets)
    .where(eq(maintenanceTickets.id, ticketId))
    .limit(1);

  if (!existing) {
    throw new NotFoundError("MaintenanceTicket", ticketId);
  }

  // Validate status transitions
  if (input.status === "closed" && existing.status !== "resolved") {
    throw new ConflictError(
      `Cannot close ticket from '${existing.status}', must resolve first`,
    );
  }

  if (input.resolutionSummary && !["resolved", "closed"].includes(input.status ?? existing.status)) {
    throw new ConflictError(
      "Resolution summary can only be set when status is resolved or closed",
    );
  }

  const updateData: Record<string, unknown> = {};
  if (input.status) updateData.status = input.status;
  if (input.category) updateData.category = input.category;
  if (input.priority) updateData.priority = input.priority;
  if (input.resolutionSummary) updateData.resolutionSummary = input.resolutionSummary;

  const [updated] = await db
    .update(maintenanceTickets)
    .set(updateData)
    .where(eq(maintenanceTickets.id, ticketId))
    .returning();

  if (input.status === "resolved") {
    await emitDomainEvent(existing.orgId, "ticket.resolved", {
      ticketId: updated.id,
      propertyId: updated.propertyId,
      resolutionSummary: updated.resolutionSummary,
    }).catch((e) => console.error("[maintenance] Event emit error:", e));
  }

  return updated;
}

/**
 * List tickets with filters.
 */
export async function listTickets(params: {
  orgId: string;
  propertyId?: string;
  status?: string;
  priority?: string;
  page: number;
  pageSize: number;
}) {
  const conditions = [eq(maintenanceTickets.orgId, params.orgId)];

  if (params.propertyId) {
    conditions.push(eq(maintenanceTickets.propertyId, params.propertyId));
  }
  if (params.status) {
    conditions.push(eq(maintenanceTickets.status, params.status));
  }
  if (params.priority) {
    conditions.push(eq(maintenanceTickets.priority, params.priority));
  }

  const whereClause = and(...conditions);

  const [data, totalResult] = await Promise.all([
    db
      .select()
      .from(maintenanceTickets)
      .where(whereClause)
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize)
      .orderBy(maintenanceTickets.createdAt),
    db.select({ total: count() }).from(maintenanceTickets).where(whereClause),
  ]);

  return {
    data,
    total: totalResult[0]?.total ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}
