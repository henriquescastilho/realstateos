/**
 * External messaging connector stub.
 * Wraps third-party messaging APIs (Twilio, MessageBird, etc).
 * Used by the communications module for actual delivery.
 */

export interface SMSRequest {
  to: string;
  body: string;
}

export interface SMSResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendSMS(req: SMSRequest): Promise<SMSResponse> {
  console.log(`[messaging] SMS to ${req.to}: ${req.body.slice(0, 50)}...`);

  if (!req.to || req.to.length < 10) {
    return { success: false, error: "Invalid phone number" };
  }

  const messageId = `sms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return { success: true, messageId };
}
