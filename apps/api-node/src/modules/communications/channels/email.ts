/**
 * Email channel — AWS SES integration.
 * Sends transactional emails via SES.
 * Falls back to console logging when SES is not configured.
 */

export interface EmailPayload {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}

export interface EmailResult {
  success: boolean;
  provider: "ses" | "stub";
  messageId?: string;
  error?: string;
}

// ─── Config ───

const AWS_REGION = process.env.AWS_SES_REGION ?? process.env.AWS_REGION ?? "us-east-1";
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL ?? "noreply@realestateos.com.br";

const isSESConfigured = !!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY && process.env.SES_FROM_EMAIL);

// ─── SES Integration ───

async function sendViaSES(payload: EmailPayload): Promise<EmailResult> {
  const { createHmac, createHash } = await import("crypto");

  const service = "ses";
  const host = `email.${AWS_REGION}.amazonaws.com`;
  const now = new Date();
  const dateStamp = now.toISOString().replace(/[-:]/g, "").slice(0, 8);
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  // SES SendEmail via Query API
  const params = new URLSearchParams({
    Action: "SendEmail",
    Version: "2010-12-01",
    "Source": SES_FROM_EMAIL,
    "Destination.ToAddresses.member.1": payload.to,
    "Message.Subject.Data": payload.subject,
    "Message.Subject.Charset": "UTF-8",
    "Message.Body.Text.Data": payload.body,
    "Message.Body.Text.Charset": "UTF-8",
  });

  if (payload.replyTo) {
    params.set("ReplyToAddresses.member.1", payload.replyTo);
  }

  const bodyStr = params.toString();
  const payloadHash = createHash("sha256").update(bodyStr).digest("hex");

  const canonicalHeaders = `content-type:application/x-www-form-urlencoded\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-date";
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const credentialScope = `${dateStamp}/${AWS_REGION}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${createHash("sha256").update(canonicalRequest).digest("hex")}`;

  const sign = (key: Buffer | string, msg: string) => createHmac("sha256", key).update(msg).digest();
  const signingKey = sign(
    sign(sign(sign(`AWS4${AWS_SECRET_ACCESS_KEY}`, dateStamp), AWS_REGION), service),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  const authHeader = `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`https://${host}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Amz-Date": amzDate,
      Authorization: authHeader,
    },
    body: bodyStr,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[email] SES error: ${res.status}`, errText);
    return { success: false, provider: "ses", error: `SES error: ${res.status}` };
  }

  const resText = await res.text();
  const messageIdMatch = resText.match(/<MessageId>(.*?)<\/MessageId>/);
  const messageId = messageIdMatch?.[1] ?? `ses_${Date.now()}`;

  return { success: true, provider: "ses", messageId };
}

// ─── Stub ───

function sendStub(payload: EmailPayload): EmailResult {
  console.log(`[email/stub] Sending to ${payload.to}: ${payload.subject}`);

  if (!payload.to || !payload.to.includes("@")) {
    return { success: false, provider: "stub", error: "Invalid email address" };
  }

  const messageId = `email_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return { success: true, provider: "stub", messageId };
}

// ─── Public API ───

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  if (!payload.to || !payload.to.includes("@")) {
    return { success: false, provider: "stub", error: "Invalid email address" };
  }

  if (isSESConfigured) {
    try {
      return await sendViaSES(payload);
    } catch (err) {
      console.error("[email] SES failed, falling back to stub:", err);
    }
  }
  return sendStub(payload);
}
