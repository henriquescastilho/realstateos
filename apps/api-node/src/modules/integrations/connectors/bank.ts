/**
 * Bank connector — Santander integration with mTLS (multi-tenant).
 *
 * Each org has its own credentials + e-CNPJ certificate stored in the
 * `bank_credentials` table. Without a valid certificate the connector
 * refuses to operate (no stub fallback in production).
 *
 * Flow:
 *   1. Load credentials for the requesting org from DB
 *   2. Build an HTTPS agent with the org's cert + key (mTLS)
 *   3. Obtain / cache OAuth token per org
 *   4. Call Santander API
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as https from "node:https";
import { eq, and } from "drizzle-orm";
import { db } from "../../../db";
import { bankCredentials } from "../../../db/schema";

// ─── Interfaces ───

export interface BoletoRequest {
  orgId: string;
  amount: string;
  dueDate: string;
  payerName: string;
  payerDocument: string;
  description: string;
}

export interface BoletoResponse {
  success: boolean;
  provider: "santander" | "stub";
  boletoId?: string;
  barcode?: string;
  digitableLine?: string;
  error?: string;
}

export interface PixQRRequest {
  orgId: string;
  amount: string;
  description: string;
  expiresInMinutes?: number;
}

export interface PixQRResponse {
  success: boolean;
  provider: "santander" | "stub";
  qrCode?: string;
  copyPaste?: string;
  transactionId?: string;
  error?: string;
}

export interface BankCredentialsRow {
  id: string;
  orgId: string;
  provider: string;
  environment: string;
  clientId: string;
  clientSecret: string;
  workspaceId: string | null;
  certPath: string | null;
  keyPath: string | null;
  baseUrl: string;
  isActive: boolean;
}

// ─── Certs root (project-level) ───

const CERTS_ROOT = path.resolve(
  process.env.CERTS_ROOT ?? path.join(__dirname, "../../../../certs"),
);

// ─── Per-org cache ───

const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const agentCache = new Map<string, https.Agent>();

// ─── Credential loader ───

export async function getOrgBankCredentials(
  orgId: string,
  provider = "santander",
): Promise<BankCredentialsRow | null> {
  const [row] = await db
    .select()
    .from(bankCredentials)
    .where(
      and(
        eq(bankCredentials.orgId, orgId),
        eq(bankCredentials.provider, provider),
        eq(bankCredentials.isActive, true),
      ),
    )
    .limit(1);

  return (row as BankCredentialsRow) ?? null;
}

// ─── mTLS Agent (per org, cached) ───

function buildOrgTlsAgent(creds: BankCredentialsRow): https.Agent | null {
  if (!creds.certPath || !creds.keyPath) {
    console.error(`[bank] Org ${creds.orgId}: cert_path or key_path not configured`);
    return null;
  }

  const certAbsolute = path.resolve(CERTS_ROOT, creds.certPath);
  const keyAbsolute = path.resolve(CERTS_ROOT, creds.keyPath);

  if (!fs.existsSync(certAbsolute) || !fs.existsSync(keyAbsolute)) {
    console.error(
      `[bank] Org ${creds.orgId}: certificate files not found: cert=${certAbsolute} key=${keyAbsolute}`,
    );
    return null;
  }

  return new https.Agent({
    cert: fs.readFileSync(certAbsolute),
    key: fs.readFileSync(keyAbsolute),
    rejectUnauthorized: true,
  });
}

function getOrgTlsAgent(creds: BankCredentialsRow): https.Agent | null {
  const cacheKey = creds.id;
  if (!agentCache.has(cacheKey)) {
    const agent = buildOrgTlsAgent(creds);
    if (agent) agentCache.set(cacheKey, agent);
    return agent;
  }
  return agentCache.get(cacheKey)!;
}

// ─── HTTP helper ───

async function santanderFetch(
  creds: BankCredentialsRow,
  urlPath: string,
  options: { method: string; headers: Record<string, string>; body?: string },
): Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<unknown> }> {
  const url = new URL(urlPath, creds.baseUrl);
  const agent = getOrgTlsAgent(creds);

  if (!agent) {
    throw new Error("mTLS certificate not available — cannot connect to Santander");
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: options.method, headers: options.headers, agent },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf-8");
          resolve({
            ok: res.statusCode! >= 200 && res.statusCode! < 300,
            status: res.statusCode!,
            text: async () => body,
            json: async () => JSON.parse(body),
          });
        });
      },
    );
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ─── OAuth (per org, cached) ───

async function getToken(creds: BankCredentialsRow): Promise<string> {
  const cached = tokenCache.get(creds.id);
  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return cached.token;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  }).toString();

  const res = await santanderFetch(creds, "/auth/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Santander auth failed: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(creds.id, {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });

  console.log(`[bank] Org ${creds.orgId}: Santander token obtained`);
  return data.access_token;
}

// ─── Guard: require credentials ───

async function requireCreds(orgId: string): Promise<BankCredentialsRow> {
  const creds = await getOrgBankCredentials(orgId);
  if (!creds) {
    throw new Error(
      `No active bank credentials for org ${orgId}. Register credentials via POST /integrations/bank/credentials first.`,
    );
  }
  return creds;
}

// ─── Boleto ───

export async function generateBoleto(req: BoletoRequest): Promise<BoletoResponse> {
  const creds = await requireCreds(req.orgId);

  try {
    const token = await getToken(creds);

    const payload = {
      environment: creds.environment.toUpperCase(),
      nsuCode: `NSU${Date.now()}`,
      covenantCode: creds.workspaceId,
      bankNumber: 33,
      clientNumber: req.payerDocument.replace(/\D/g, ""),
      dueDate: req.dueDate,
      nominalValue: parseFloat(req.amount),
      payer: {
        name: req.payerName,
        document: req.payerDocument.replace(/\D/g, ""),
        documentType:
          req.payerDocument.replace(/\D/g, "").length === 11 ? "CPF" : "CNPJ",
      },
      message: [req.description.slice(0, 40)],
    };

    const urlPath = creds.workspaceId
      ? `/collection_bill_management/v2/workspaces/${creds.workspaceId}/bank_slips`
      : "/collection_bill_management/v2/bank_slips";

    const res = await santanderFetch(creds, urlPath, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Application-Key": creds.clientId,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[bank] Org ${req.orgId} boleto error: ${res.status}`, errText);
      return {
        success: false,
        provider: "santander",
        error: `Santander API error: ${res.status} — ${errText}`,
      };
    }

    const data = (await res.json()) as {
      id?: string;
      barcode?: string;
      digitableLine?: string;
    };

    return {
      success: true,
      provider: "santander",
      boletoId: data.id,
      barcode: data.barcode,
      digitableLine: data.digitableLine,
    };
  } catch (err) {
    console.error(`[bank] Org ${req.orgId} boleto failed:`, err);
    return {
      success: false,
      provider: "santander",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── PIX ───

export async function generatePixQR(req: PixQRRequest): Promise<PixQRResponse> {
  const creds = await requireCreds(req.orgId);

  try {
    const token = await getToken(creds);

    const payload = {
      amount: parseFloat(req.amount),
      description: req.description.slice(0, 60),
      expiration: (req.expiresInMinutes ?? 60) * 60,
    };

    // PIX endpoint: /pix/v2/emv (only available in production, not sandbox)
    const res = await santanderFetch(creds, "/pix/v2/emv", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Application-Key": creds.clientId,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[bank] Org ${req.orgId} PIX error: ${res.status}`, errText);
      return {
        success: false,
        provider: "santander",
        error: `Santander PIX API error: ${res.status} — ${errText}`,
      };
    }

    const data = (await res.json()) as {
      qrCode?: string;
      emv?: string;
      txId?: string;
    };

    return {
      success: true,
      provider: "santander",
      qrCode: data.qrCode,
      copyPaste: data.emv,
      transactionId: data.txId,
    };
  } catch (err) {
    console.error(`[bank] Org ${req.orgId} PIX failed:`, err);
    return {
      success: false,
      provider: "santander",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Health (per org) ───

export async function checkBankHealth(orgId: string): Promise<{
  configured: boolean;
  reachable: boolean;
  mtls: boolean;
  environment?: string;
  error?: string;
}> {
  const creds = await getOrgBankCredentials(orgId);

  if (!creds) {
    return { configured: false, reachable: false, mtls: false };
  }

  const agent = getOrgTlsAgent(creds);

  if (!agent) {
    return {
      configured: true,
      reachable: false,
      mtls: false,
      environment: creds.environment,
      error: "Certificate files not found or not configured",
    };
  }

  try {
    await getToken(creds);

    // Update health status in DB
    await db
      .update(bankCredentials)
      .set({ lastHealthCheck: new Date(), lastHealthStatus: "healthy" })
      .where(eq(bankCredentials.id, creds.id));

    return {
      configured: true,
      reachable: true,
      mtls: true,
      environment: creds.environment,
    };
  } catch (err) {
    await db
      .update(bankCredentials)
      .set({ lastHealthCheck: new Date(), lastHealthStatus: "down" })
      .where(eq(bankCredentials.id, creds.id));

    return {
      configured: true,
      reachable: false,
      mtls: true,
      environment: creds.environment,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Register / Update credentials ───

export async function registerBankCredentials(input: {
  orgId: string;
  clientId: string;
  clientSecret: string;
  workspaceId?: string;
  certPath: string;
  keyPath: string;
  environment?: string;
  baseUrl?: string;
}) {
  const env = input.environment ?? "sandbox";
  const base =
    input.baseUrl ??
    (env === "production"
      ? "https://trust-open.api.santander.com.br"
      : "https://trust-sandbox.api.santander.com.br");

  // Validate cert files exist
  const certAbsolute = path.resolve(CERTS_ROOT, input.certPath);
  const keyAbsolute = path.resolve(CERTS_ROOT, input.keyPath);

  if (!fs.existsSync(certAbsolute)) {
    throw new Error(`Certificate not found: ${certAbsolute}`);
  }
  if (!fs.existsSync(keyAbsolute)) {
    throw new Error(`Private key not found: ${keyAbsolute}`);
  }

  // Upsert
  const existing = await getOrgBankCredentials(input.orgId);

  if (existing) {
    // Clear cached agent/token for this org
    agentCache.delete(existing.id);
    tokenCache.delete(existing.id);

    const [updated] = await db
      .update(bankCredentials)
      .set({
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        workspaceId: input.workspaceId ?? null,
        certPath: input.certPath,
        keyPath: input.keyPath,
        environment: env,
        baseUrl: base,
        isActive: true,
      })
      .where(eq(bankCredentials.id, existing.id))
      .returning();

    return updated;
  }

  const [created] = await db
    .insert(bankCredentials)
    .values({
      orgId: input.orgId,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      workspaceId: input.workspaceId ?? null,
      certPath: input.certPath,
      keyPath: input.keyPath,
      environment: env,
      baseUrl: base,
    })
    .returning();

  return created;
}

/**
 * Invalidate cached agents/tokens (e.g. after cert rotation).
 */
export function invalidateOrgCache(credentialId: string): void {
  agentCache.delete(credentialId);
  tokenCache.delete(credentialId);
}
