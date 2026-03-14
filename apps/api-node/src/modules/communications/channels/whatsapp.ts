/**
 * WhatsApp channel adapter.
 * In production, integrates with WhatsApp Business API (via Twilio, Meta, etc).
 * Currently logs and returns success for development.
 */

export interface WhatsAppPayload {
  to: string;  // phone number in E.164 format
  body: string;
}

export interface WhatsAppResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send a WhatsApp message. Stub implementation for MVP.
 * Replace with real provider integration in production.
 */
export async function sendWhatsApp(payload: WhatsAppPayload): Promise<WhatsAppResult> {
  // TODO: integrate with WhatsApp Business API
  console.log(`[whatsapp] Sending to ${payload.to}: ${payload.body.slice(0, 50)}...`);

  // Basic phone validation
  if (!payload.to || payload.to.length < 10) {
    return { success: false, error: "Invalid phone number" };
  }

  const messageId = `wa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return { success: true, messageId };
}
