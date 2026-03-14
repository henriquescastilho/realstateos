import { eq, and, count } from "drizzle-orm";
import { db } from "../../db";
import { messageRecords } from "../../db/schema";
import { NotFoundError, ValidationError } from "../../lib/errors";
import { messagesQueue } from "../../lib/queue";

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
 * Queue a message for async delivery via BullMQ.
 * No longer sends synchronously — the worker handles actual sending.
 */
export async function sendMessage(input: SendMessageInput) {
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

  // Enqueue for async processing
  await messagesQueue().add("send", {
    messageRecordId: record.id,
    orgId: input.orgId,
    channel: input.channel,
    recipient: input.recipient,
    templateType: input.templateType,
    templateData: input.templateData,
  });

  return { record, queued: true };
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
