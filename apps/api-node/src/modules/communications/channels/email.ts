/**
 * Email channel — SMTP por imobiliária.
 *
 * Cada imobiliária parceira configura suas credenciais SMTP na tabela organizations.smtp_settings.
 * Os agentes usam essas credenciais para enviar boletos, extratos e avisos aos inquilinos/proprietários.
 *
 * smtp_settings JSON:
 *   { host, port, user, pass, from }
 */

import nodemailer from "nodemailer";
import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { organizations } from "../../../db/schema";

export interface EmailPayload {
  to: string;
  subject: string;
  body: string;
  html?: string;
  replyTo?: string;
  orgId: string;
}

export interface EmailResult {
  success: boolean;
  provider: "smtp" | "stub";
  messageId?: string;
  error?: string;
}

interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

// ─── Transporter cache (per org) ───

const transporterCache = new Map<string, nodemailer.Transporter>();

function getTransporter(smtp: SmtpSettings): nodemailer.Transporter {
  const cacheKey = `${smtp.host}:${smtp.user}`;
  if (!transporterCache.has(cacheKey)) {
    transporterCache.set(
      cacheKey,
      nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: { user: smtp.user, pass: smtp.pass },
      }),
    );
  }
  return transporterCache.get(cacheKey)!;
}

// ─── Load SMTP config from DB ───

async function getOrgSmtpSettings(orgId: string): Promise<SmtpSettings | null> {
  const [org] = await db
    .select({ smtpSettings: organizations.smtpSettings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org?.smtpSettings) return null;

  const s = org.smtpSettings as Record<string, unknown>;
  if (!s.host || !s.user || !s.pass) return null;

  return {
    host: s.host as string,
    port: (s.port as number) ?? 587,
    user: s.user as string,
    pass: s.pass as string,
    from: (s.from as string) ?? (s.user as string),
  };
}

// ─── SMTP send ───

async function sendViaSMTP(smtp: SmtpSettings, payload: EmailPayload): Promise<EmailResult> {
  const info = await getTransporter(smtp).sendMail({
    from: smtp.from,
    to: payload.to,
    subject: payload.subject,
    text: payload.body,
    html: payload.html,
    replyTo: payload.replyTo,
  });

  return { success: true, provider: "smtp", messageId: info.messageId };
}

// ─── Stub (org sem SMTP configurado) ───

function sendStub(payload: EmailPayload): EmailResult {
  console.log(`[email/stub] Org ${payload.orgId} sem SMTP. To: ${payload.to} | Subject: ${payload.subject}`);
  return {
    success: true,
    provider: "stub",
    messageId: `stub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };
}

// ─── Public API ───

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  if (!payload.to || !payload.to.includes("@")) {
    return { success: false, provider: "stub", error: "Invalid email address" };
  }

  const smtp = await getOrgSmtpSettings(payload.orgId);

  if (smtp) {
    try {
      return await sendViaSMTP(smtp, payload);
    } catch (err) {
      console.error(`[email] SMTP failed for org ${payload.orgId}:`, err);
      return { success: false, provider: "smtp", error: String(err) };
    }
  }

  return sendStub(payload);
}
