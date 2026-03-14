/**
 * Email channel adapter.
 * In production, integrates with an email provider (SES, SendGrid, etc).
 * Currently logs and returns success for development.
 */

export interface EmailPayload {
  to: string;
  subject: string;
  body: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send an email. Stub implementation for MVP.
 * Replace with real provider integration (SES/SendGrid) in production.
 */
export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  // TODO: integrate with real email provider
  console.log(`[email] Sending to ${payload.to}: ${payload.subject}`);

  // Validate basic fields
  if (!payload.to || !payload.to.includes("@")) {
    return { success: false, error: "Invalid email address" };
  }

  // Simulate successful send
  const messageId = `email_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return { success: true, messageId };
}
