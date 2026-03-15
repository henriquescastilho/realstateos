import { eq, and, count, desc, sql } from "drizzle-orm";
import { db } from "../../db";
import { inboxThreads, inboxMessages } from "../../db/schema";
import { NotFoundError } from "../../lib/errors";
import { matchContact } from "./matcher";
import { getChannelSender } from "../communications/channel-factory";
import { sendWhatsApp } from "../communications/channels/whatsapp";
import { sendEmail } from "../communications/channels/email";
import type { UpdateThreadInput } from "./validators";

/**
 * Handle an inbound message: create or find thread, add message.
 */
export async function handleInboundMessage(input: {
  orgId: string;
  channel: string;
  contactIdentifier: string;
  contactName?: string;
  content: string;
  mediaUrl?: string;
  externalMessageId?: string;
}) {
  const thread = await getOrCreateThread(input);

  const [message] = await db
    .insert(inboxMessages)
    .values({
      threadId: thread.id,
      direction: "inbound",
      content: input.content,
      mediaUrl: input.mediaUrl ?? null,
      externalMessageId: input.externalMessageId ?? null,
      status: "received",
    })
    .returning();

  // Update thread metadata
  await db
    .update(inboxThreads)
    .set({
      lastMessageAt: new Date(),
      unreadCount: sql`${inboxThreads.unreadCount} + 1`,
      status: "open", // re-open if snoozed
    })
    .where(eq(inboxThreads.id, thread.id));

  return { thread, message };
}

async function getOrCreateThread(input: {
  orgId: string;
  channel: string;
  contactIdentifier: string;
  contactName?: string;
}) {
  // Try to find existing thread
  const [existing] = await db
    .select()
    .from(inboxThreads)
    .where(
      and(
        eq(inboxThreads.orgId, input.orgId),
        eq(inboxThreads.channel, input.channel),
        eq(inboxThreads.contactIdentifier, input.contactIdentifier),
      ),
    )
    .limit(1);

  if (existing) {
    // Update contact name if provided
    if (input.contactName && input.contactName !== existing.contactName) {
      await db
        .update(inboxThreads)
        .set({ contactName: input.contactName })
        .where(eq(inboxThreads.id, existing.id));
    }
    return existing;
  }

  // Match contact to tenant/owner
  const match = await matchContact(input.orgId, input.contactIdentifier);

  const [thread] = await db
    .insert(inboxThreads)
    .values({
      orgId: input.orgId,
      channel: input.channel,
      contactIdentifier: input.contactIdentifier,
      contactName: input.contactName ?? match?.entityName ?? null,
      linkedEntityType: match?.entityType ?? null,
      linkedEntityId: match?.entityId ?? null,
      status: "open",
      lastMessageAt: new Date(),
    })
    .returning();

  return thread;
}

/**
 * List threads with filters.
 */
export async function listThreads(params: {
  orgId: string;
  status?: string;
  channel?: string;
  linkedEntityType?: string;
  assignedTo?: string;
  page: number;
  pageSize: number;
}) {
  const conditions = [eq(inboxThreads.orgId, params.orgId)];

  if (params.status) {
    conditions.push(eq(inboxThreads.status, params.status));
  }
  if (params.channel) {
    conditions.push(eq(inboxThreads.channel, params.channel));
  }
  if (params.linkedEntityType) {
    conditions.push(eq(inboxThreads.linkedEntityType, params.linkedEntityType));
  }
  if (params.assignedTo) {
    conditions.push(eq(inboxThreads.assignedTo, params.assignedTo));
  }

  const whereClause = and(...conditions);

  const [data, totalResult] = await Promise.all([
    db
      .select()
      .from(inboxThreads)
      .where(whereClause)
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize)
      .orderBy(desc(inboxThreads.lastMessageAt)),
    db.select({ total: count() }).from(inboxThreads).where(whereClause),
  ]);

  return {
    data,
    total: totalResult[0]?.total ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}

/**
 * Get thread with its messages.
 */
export async function getThreadWithMessages(threadId: string, orgId: string) {
  const [thread] = await db
    .select()
    .from(inboxThreads)
    .where(
      and(
        eq(inboxThreads.id, threadId),
        eq(inboxThreads.orgId, orgId),
      ),
    )
    .limit(1);

  if (!thread) {
    throw new NotFoundError("InboxThread", threadId);
  }

  const messages = await db
    .select()
    .from(inboxMessages)
    .where(eq(inboxMessages.threadId, threadId))
    .orderBy(inboxMessages.createdAt);

  // Reset unread count
  await db
    .update(inboxThreads)
    .set({ unreadCount: 0 })
    .where(eq(inboxThreads.id, threadId));

  return { thread, messages };
}

/**
 * Reply to a thread — sends via the thread's channel.
 */
export async function replyToThread(
  threadId: string,
  orgId: string,
  content: string,
  sentBy?: string,
) {
  const [thread] = await db
    .select()
    .from(inboxThreads)
    .where(
      and(
        eq(inboxThreads.id, threadId),
        eq(inboxThreads.orgId, orgId),
      ),
    )
    .limit(1);

  if (!thread) {
    throw new NotFoundError("InboxThread", threadId);
  }

  // Send via channel
  let success = false;
  let error: string | undefined;
  let externalMessageId: string | undefined;

  try {
    const sender = await getChannelSender(orgId, thread.channel);
    if (sender) {
      const result = await sender.send({ to: thread.contactIdentifier, body: content });
      success = result.success;
      error = result.error;
      externalMessageId = result.messageId;
    } else if (thread.channel === "whatsapp") {
      const result = await sendWhatsApp({ to: thread.contactIdentifier, body: content });
      success = result.success;
      error = result.error;
      externalMessageId = result.messageId;
    } else if (thread.channel === "email") {
      const result = await sendEmail({ to: thread.contactIdentifier, subject: "Re: Mensagem", body: content, orgId });
      success = result.success;
      error = result.error;
      externalMessageId = result.messageId;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : "Send error";
  }

  // Save outbound message
  const [message] = await db
    .insert(inboxMessages)
    .values({
      threadId,
      direction: "outbound",
      content,
      externalMessageId: externalMessageId ?? null,
      status: success ? "sent" : "failed",
      sentBy: sentBy ?? null,
    })
    .returning();

  // Update thread
  await db
    .update(inboxThreads)
    .set({ lastMessageAt: new Date() })
    .where(eq(inboxThreads.id, threadId));

  return { message, success, error };
}

/**
 * Update thread metadata (assign, status, links).
 */
export async function updateThread(
  threadId: string,
  orgId: string,
  input: UpdateThreadInput,
) {
  const [existing] = await db
    .select()
    .from(inboxThreads)
    .where(
      and(
        eq(inboxThreads.id, threadId),
        eq(inboxThreads.orgId, orgId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new NotFoundError("InboxThread", threadId);
  }

  const updateData: Record<string, unknown> = {};
  if (input.status !== undefined) updateData.status = input.status;
  if (input.assignedTo !== undefined) updateData.assignedTo = input.assignedTo;
  if (input.linkedEntityType !== undefined) updateData.linkedEntityType = input.linkedEntityType;
  if (input.linkedEntityId !== undefined) updateData.linkedEntityId = input.linkedEntityId;
  if (input.linkedPropertyId !== undefined) updateData.linkedPropertyId = input.linkedPropertyId;
  if (input.linkedContractId !== undefined) updateData.linkedContractId = input.linkedContractId;

  const [updated] = await db
    .update(inboxThreads)
    .set(updateData)
    .where(eq(inboxThreads.id, threadId))
    .returning();

  return updated;
}

/**
 * Get inbox stats (counters).
 */
export async function getInboxStats(orgId: string) {
  const [openCount] = await db
    .select({ total: count() })
    .from(inboxThreads)
    .where(
      and(
        eq(inboxThreads.orgId, orgId),
        eq(inboxThreads.status, "open"),
      ),
    );

  const [snoozedCount] = await db
    .select({ total: count() })
    .from(inboxThreads)
    .where(
      and(
        eq(inboxThreads.orgId, orgId),
        eq(inboxThreads.status, "snoozed"),
      ),
    );

  const [unreadResult] = await db
    .select({ total: sql<number>`COALESCE(SUM(${inboxThreads.unreadCount}), 0)` })
    .from(inboxThreads)
    .where(eq(inboxThreads.orgId, orgId));

  return {
    open: openCount?.total ?? 0,
    snoozed: snoozedCount?.total ?? 0,
    totalUnread: unreadResult?.total ?? 0,
  };
}
