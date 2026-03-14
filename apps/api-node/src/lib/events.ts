import { db } from "../db";
import { eventLog } from "../db/schema";
import { eventsQueue } from "./queue";

/**
 * Emit a domain event: persist to eventLog + enqueue for webhook delivery.
 */
export async function emitDomainEvent(
  orgId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const [entry] = await db
    .insert(eventLog)
    .values({ orgId, eventType, payload })
    .returning();

  await eventsQueue().add("deliver", {
    eventLogId: entry.id,
    orgId,
    eventType,
    payload,
  });
}
