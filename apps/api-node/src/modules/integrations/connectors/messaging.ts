/**
 * External messaging connector — Twilio integration.
 * Handles SMS delivery via Twilio API.
 * Falls back to console logging when TWILIO_ACCOUNT_SID is not configured.
 */

export interface SMSRequest {
  to: string;
  body: string;
}

export interface SMSResponse {
  success: boolean;
  provider: "twilio" | "stub";
  messageId?: string;
  error?: string;
}

// ─── Config ───

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;

const isTwilioConfigured = !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER);

// ─── Twilio API ───

async function sendViaTwilio(req: SMSRequest): Promise<SMSResponse> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;

  const credentials = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");

  const body = new URLSearchParams({
    To: req.to,
    From: TWILIO_FROM_NUMBER!,
    Body: req.body,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errData = (await res.json()) as { message?: string; code?: number };
    const errMsg = errData.message ?? `Twilio error: ${res.status}`;
    console.error(`[messaging] Twilio error:`, errMsg);
    return { success: false, provider: "twilio", error: errMsg };
  }

  const data = (await res.json()) as { sid?: string; status?: string };

  return {
    success: true,
    provider: "twilio",
    messageId: data.sid ?? `twilio_${Date.now()}`,
  };
}

// ─── Stub ───

function sendStub(req: SMSRequest): SMSResponse {
  console.log(`[messaging/stub] SMS to ${req.to}: ${req.body.slice(0, 50)}...`);

  if (!req.to || req.to.replace(/\D/g, "").length < 10) {
    return { success: false, provider: "stub", error: "Invalid phone number" };
  }

  const messageId = `sms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return { success: true, provider: "stub", messageId };
}

// ─── Public API ───

export async function sendSMS(req: SMSRequest): Promise<SMSResponse> {
  if (!req.to || req.to.replace(/\D/g, "").length < 10) {
    return { success: false, provider: "stub", error: "Invalid phone number" };
  }

  if (isTwilioConfigured) {
    try {
      return await sendViaTwilio(req);
    } catch (err) {
      console.error("[messaging] Twilio failed, falling back to stub:", err);
    }
  }
  return sendStub(req);
}

/**
 * Check if Twilio integration is configured.
 */
export function checkMessagingHealth(): { configured: boolean; provider: string } {
  return {
    configured: isTwilioConfigured,
    provider: isTwilioConfigured ? "twilio" : "stub",
  };
}
