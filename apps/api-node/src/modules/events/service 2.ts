import { eq, and, count, desc } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "../../db";
import { webhookSubscriptions, eventLog } from "../../db/schema";
import { NotFoundError } from "../../lib/errors";
import type { CreateSubscriptionInput } from "./validators";

export async function createSubscription(input: CreateSubscriptionInput) {
  const [subscription] = await db
    .insert(webhookSubscriptions)
    .values({
      orgId: input.orgId,
      eventTypes: input.eventTypes,
      targetUrl: input.targetUrl,
      secret: input.secret,
      isActive: true,
    })
    .returning();

  return subscription;
}

export async function listSubscriptions(orgId: string) {
  return db
    .select()
    .from(webhookSubscriptions)
    .where(eq(webhookSubscriptions.orgId, orgId))
    .orderBy(desc(webhookSubscriptions.createdAt));
}

export async function deleteSubscription(subscriptionId: string, orgId: string) {
  const [existing] = await db
    .select()
    .from(webhookSubscriptions)
    .where(
      and(
        eq(webhookSubscriptions.id, subscriptionId),
        eq(webhookSubscriptions.orgId, orgId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new NotFoundError("WebhookSubscription", subscriptionId);
  }

  await db
    .delete(webhookSubscriptions)
    .where(eq(webhookSubscriptions.id, subscriptionId));
}

export async function listEventLog(params: {
  orgId: string;
  eventType?: string;
  page: number;
  pageSize: number;
}) {
  const conditions = [eq(eventLog.orgId, params.orgId)];

  if (params.eventType) {
    conditions.push(eq(eventLog.eventType, params.eventType));
  }

  const whereClause = and(...conditions);

  const [data, totalResult] = await Promise.all([
    db
      .select()
      .from(eventLog)
      .where(whereClause)
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize)
      .orderBy(desc(eventLog.createdAt)),
    db.select({ total: count() }).from(eventLog).where(whereClause),
  ]);

  return {
    data,
    total: totalResult[0]?.total ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}
