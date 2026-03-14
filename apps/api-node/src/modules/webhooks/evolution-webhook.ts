import { eq, and } from "drizzle-orm";
import { db } from "../../db";
import { inboundMessages, channelConfigs } from "../../db/schema";
import * as inboxService from "../inbox/service";
import { emitDomainEvent } from "../../lib/events";

export interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data: {
    key?: {
      remoteJid?: string;
      fromMe?: boolean;
      id?: string;
    };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
      imageMessage?: { url?: string; caption?: string };
    };
    messageTimestamp?: number;
  };
}

/**
 * Process an inbound message from Evolution API webhook.
 */
export async function processEvolutionWebhook(
  payload: EvolutionWebhookPayload,
): Promise<{ processed: boolean; action: string; inboundMessageId?: string }> {
  // Only process messages.upsert events
  if (payload.event !== "messages.upsert") {
    return { processed: false, action: "ignored_event" };
  }

  const data = payload.data;
  const isFromMe = data.key?.fromMe ?? false;

  // Skip outgoing messages
  if (isFromMe) {
    return { processed: false, action: "outgoing_skipped" };
  }

  const senderJid = data.key?.remoteJid ?? "";
  const senderPhone = senderJid.replace("@s.whatsapp.net", "").replace("@g.us", "");
  const senderName = data.pushName ?? "";
  const externalMessageId = data.key?.id ?? "";

  // Extract message content
  const content =
    data.message?.conversation ??
    data.message?.extendedTextMessage?.text ??
    data.message?.imageMessage?.caption ??
    "";

  const mediaUrl = data.message?.imageMessage?.url ?? undefined;

  // Find which org this instance belongs to
  const [config] = await db
    .select()
    .from(channelConfigs)
    .where(
      and(
        eq(channelConfigs.channel, "whatsapp"),
        eq(channelConfigs.provider, "evolution-api"),
        eq(channelConfigs.isActive, true),
      ),
    );

  if (!config) {
    console.warn(`[webhook:evolution] No active evolution config found for instance ${payload.instance}`);
    return { processed: false, action: "no_config" };
  }

  // Save inbound message
  const [inbound] = await db
    .insert(inboundMessages)
    .values({
      orgId: config.orgId,
      channel: "whatsapp",
      provider: "evolution-api",
      externalMessageId,
      senderPhone,
      senderName,
      content,
      mediaUrl: mediaUrl ?? null,
    })
    .returning();

  // Route to inbox
  try {
    await inboxService.handleInboundMessage({
      orgId: config.orgId,
      channel: "whatsapp",
      contactIdentifier: senderPhone,
      contactName: senderName,
      content,
      mediaUrl,
      externalMessageId,
    });
  } catch (err) {
    console.error("[webhook:evolution] Inbox routing error:", err);
  }

  // Emit event
  await emitDomainEvent(config.orgId, "message.inbound", {
    inboundMessageId: inbound.id,
    channel: "whatsapp",
    provider: "evolution-api",
    senderPhone,
    content: content.slice(0, 200),
  }).catch((e) => console.error("[webhook:evolution] Event emit error:", e));

  return { processed: true, action: "message_saved", inboundMessageId: inbound.id };
}
