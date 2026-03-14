/**
 * WhatsApp channel — Meta WhatsApp Business Cloud API integration.
 * Sends messages via WhatsApp Business API.
 * Falls back to console logging when WHATSAPP_TOKEN is not configured.
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/
 */

export interface WhatsAppPayload {
  to: string;  // phone number in E.164 format (e.g., +5511999990000)
  body: string;
  templateName?: string;  // optional: use a pre-approved template
  templateLanguage?: string;
}

export interface WhatsAppResult {
  success: boolean;
  provider: "whatsapp-cloud" | "stub";
  messageId?: string;
  error?: string;
}

// ─── Config ───

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION ?? "v21.0";
const WHATSAPP_API_BASE = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

const isWhatsAppConfigured = !!(WHATSAPP_TOKEN && WHATSAPP_PHONE_NUMBER_ID);

// ─── Normalize phone number ───

function normalizePhone(phone: string): string {
  // Remove everything except digits and leading +
  let cleaned = phone.replace(/[^\d+]/g, "");

  // Ensure E.164 format for Brazil
  if (!cleaned.startsWith("+")) {
    if (cleaned.startsWith("55") && cleaned.length >= 12) {
      cleaned = `+${cleaned}`;
    } else if (cleaned.length === 10 || cleaned.length === 11) {
      cleaned = `+55${cleaned}`;
    } else {
      cleaned = `+${cleaned}`;
    }
  }

  return cleaned;
}

// ─── WhatsApp Cloud API ───

async function sendViaCloudAPI(payload: WhatsAppPayload): Promise<WhatsAppResult> {
  const phone = normalizePhone(payload.to);

  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
  };

  if (payload.templateName) {
    // Use approved template
    body.type = "template";
    body.template = {
      name: payload.templateName,
      language: { code: payload.templateLanguage ?? "pt_BR" },
    };
  } else {
    // Plain text message
    body.type = "text";
    body.text = { preview_url: false, body: payload.body };
  }

  const res = await fetch(
    `${WHATSAPP_API_BASE}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const errData = (await res.json()) as { error?: { message?: string; code?: number } };
    const errMsg = errData.error?.message ?? `HTTP ${res.status}`;
    console.error(`[whatsapp] Cloud API error:`, errMsg);
    return { success: false, provider: "whatsapp-cloud", error: errMsg };
  }

  const data = (await res.json()) as {
    messages?: Array<{ id: string }>;
  };

  const messageId = data.messages?.[0]?.id ?? `wa_${Date.now()}`;

  return { success: true, provider: "whatsapp-cloud", messageId };
}

// ─── Stub ───

function sendStub(payload: WhatsAppPayload): WhatsAppResult {
  console.log(`[whatsapp/stub] Sending to ${payload.to}: ${payload.body.slice(0, 50)}...`);

  if (!payload.to || payload.to.replace(/\D/g, "").length < 10) {
    return { success: false, provider: "stub", error: "Invalid phone number" };
  }

  const messageId = `wa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return { success: true, provider: "stub", messageId };
}

// ─── Public API ───

export async function sendWhatsApp(payload: WhatsAppPayload): Promise<WhatsAppResult> {
  if (!payload.to || payload.to.replace(/\D/g, "").length < 10) {
    return { success: false, provider: "stub", error: "Invalid phone number" };
  }

  if (isWhatsAppConfigured) {
    try {
      return await sendViaCloudAPI(payload);
    } catch (err) {
      console.error("[whatsapp] Cloud API failed, falling back to stub:", err);
    }
  }
  return sendStub(payload);
}

/**
 * Check if WhatsApp integration is configured.
 */
export function checkWhatsAppHealth(): { configured: boolean; provider: string } {
  return {
    configured: isWhatsAppConfigured,
    provider: isWhatsAppConfigured ? "whatsapp-cloud-api" : "stub",
  };
}
