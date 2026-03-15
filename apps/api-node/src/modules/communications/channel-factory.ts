import { eq, and } from "drizzle-orm";
import { db } from "../../db";
import { channelConfigs } from "../../db/schema";
import { sendTextViaEvolution, type EvolutionConfig } from "./channels/evolution-api";
import { sendWhatsApp } from "./channels/whatsapp";
import { sendEmail } from "./channels/email";

export interface ChannelSender {
  send(payload: { to: string; subject?: string; body: string; html?: string }): Promise<{
    success: boolean;
    error?: string;
    messageId?: string;
  }>;
}

/**
 * Get the appropriate channel sender for an org + channel.
 * Returns null if no custom config exists (callers should fallback to defaults).
 */
export async function getChannelSender(
  orgId: string,
  channel: string,
): Promise<ChannelSender | null> {
  const [config] = await db
    .select()
    .from(channelConfigs)
    .where(
      and(
        eq(channelConfigs.orgId, orgId),
        eq(channelConfigs.channel, channel),
        eq(channelConfigs.isActive, true),
      ),
    )
    .limit(1);

  if (!config) return null;

  if (channel === "whatsapp" && config.provider === "evolution-api") {
    const evoConfig = config.config as unknown as EvolutionConfig;
    return {
      async send(payload) {
        return sendTextViaEvolution(evoConfig, {
          to: payload.to,
          body: payload.body,
        });
      },
    };
  }

  if (channel === "whatsapp" && config.provider === "meta-cloud") {
    return {
      async send(payload) {
        return sendWhatsApp({ to: payload.to, body: payload.body });
      },
    };
  }

  if (channel === "email") {
    return {
      async send(payload) {
        return sendEmail({
          to: payload.to,
          subject: payload.subject ?? "",
          body: payload.body,
          html: payload.html,
          orgId,
        });
      },
    };
  }

  return null;
}
