import { eq, and, count } from "drizzle-orm";
import { db } from "../../db";
import { messageRecords } from "../../db/schema";
import { NotFoundError, ValidationError } from "../../lib/errors";
import { renderTemplate } from "./templates";
import { sendEmail } from "./channels/email";
import { sendWhatsApp } from "./channels/whatsapp";

export interface SendMessageInput {
  orgId: string;
  entityType: string;
  entityId: string;
  channel: "email" | "whatsapp";
  templateType: string;
  recipient: string;
  templateData: Record<string, string>;
}

/**
 * Send a message via the specified channel and record it.
 */
export async function sendMessage(input: SendMessageInput) {
  // Render template
  const rendered = renderTemplate(input.templateType, input.templateData);

  // Create message record as queued
  const [record] = await db
    .insert(messageRecords)
    .values({
      orgId: input.orgId,
      entityType: input.entityType,
      entityId: input.entityId,
      channel: input.channel,
      templateType: input.templateType,
      recipient: input.recipient,
      status: "queued",
    })
    .returning();

  // Send via channel
  let success = false;
  let error: string | undefined;

  try {
    if (input.channel === "email") {
      const result = await sendEmail({
        to: input.recipient,
        subject: rendered.subject,
        body: rendered.body,
      });
      success = result.success;
      error = result.error;
    } else if (input.channel === "whatsapp") {
      const result = await sendWhatsApp({
        to: input.recipient,
        body: `${rendered.subject}\n\n${rendered.body}`,
      });
      success = result.success;
      error = result.error;
    } else {
      throw new ValidationError(`Unsupported channel: ${input.channel}`);
    }
  } catch (err) {
    success = false;
    error = err instanceof Error ? err.message : "Unknown send error";
  }

  // Update record status
  const [updated] = await db
    .update(messageRecords)
    .set({
      status: success ? "sent" : "failed",
      sentAt: success ? new Date() : undefined,
    })
    .where(eq(messageRecords.id, record.id))
    .returning();

  return { record: updated, success, error };
}

/**
 * List message records with filters.
 */
export async function listMessages(params: {
  orgId: string;
  entityType?: string;
  entityId?: string;
  channel?: string;
  status?: string;
  page: number;
  pageSize: number;
}) {
  const conditions = [eq(messageRecords.orgId, params.orgId)];

  if (params.entityType) {
    conditions.push(eq(messageRecords.entityType, params.entityType));
  }
  if (params.entityId) {
    conditions.push(eq(messageRecords.entityId, params.entityId));
  }
  if (params.channel) {
    conditions.push(eq(messageRecords.channel, params.channel));
  }
  if (params.status) {
    conditions.push(eq(messageRecords.status, params.status));
  }

  const whereClause = and(...conditions);

  const [data, totalResult] = await Promise.all([
    db
      .select()
      .from(messageRecords)
      .where(whereClause)
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize)
      .orderBy(messageRecords.createdAt),
    db.select({ total: count() }).from(messageRecords).where(whereClause),
  ]);

  return {
    data,
    total: totalResult[0]?.total ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}

/**
 * Get a single message record.
 */
export async function getMessageById(messageId: string) {
  const [record] = await db
    .select()
    .from(messageRecords)
    .where(eq(messageRecords.id, messageId))
    .limit(1);

  if (!record) {
    throw new NotFoundError("MessageRecord", messageId);
  }

  return record;
}
