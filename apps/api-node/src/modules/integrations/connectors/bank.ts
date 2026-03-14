/**
 * Bank connector — Santander sandbox integration.
 * Generates boletos and PIX QR codes via Santander Open Banking API.
 * Falls back to local stub when SANTANDER_CLIENT_ID is not configured.
 */

export interface BoletoRequest {
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

// ─── Config ───

const SANTANDER_BASE_URL = process.env.SANTANDER_BASE_URL ?? "https://trust-sandbox.api.santander.com.br";
const SANTANDER_CLIENT_ID = process.env.SANTANDER_CLIENT_ID;
const SANTANDER_CLIENT_SECRET = process.env.SANTANDER_CLIENT_SECRET;
const SANTANDER_WORKSPACE_ID = process.env.SANTANDER_WORKSPACE_ID;

const isSantanderConfigured = !!(SANTANDER_CLIENT_ID && SANTANDER_CLIENT_SECRET);

let cachedToken: { token: string; expiresAt: number } | null = null;

// ─── Santander OAuth ───

async function getSantanderToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const res = await fetch(`${SANTANDER_BASE_URL}/auth/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: SANTANDER_CLIENT_ID!,
      client_secret: SANTANDER_CLIENT_SECRET!,
    }),
  });

  if (!res.ok) {
    throw new Error(`Santander auth failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}

// ─── Boleto ───

async function generateBoletoSantander(req: BoletoRequest): Promise<BoletoResponse> {
  const token = await getSantanderToken();

  const payload = {
    environment: "SANDBOX",
    nsuCode: `NSU${Date.now()}`,
    covenantCode: SANTANDER_WORKSPACE_ID,
    bankNumber: 33,
    clientNumber: req.payerDocument.replace(/\D/g, ""),
    dueDate: req.dueDate,
    nominalValue: parseFloat(req.amount),
    payer: {
      name: req.payerName,
      document: req.payerDocument.replace(/\D/g, ""),
      documentType: req.payerDocument.replace(/\D/g, "").length === 11 ? "CPF" : "CNPJ",
    },
    message: [req.description.slice(0, 40)],
  };

  const res = await fetch(`${SANTANDER_BASE_URL}/collection_bill_management/v2/workspaces/${SANTANDER_WORKSPACE_ID}/bank_slips`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Application-Key": SANTANDER_CLIENT_ID!,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[bank] Santander boleto error: ${res.status}`, errText);
    return { success: false, provider: "santander", error: `Santander API error: ${res.status}` };
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
}

async function generateBoletoStub(req: BoletoRequest): Promise<BoletoResponse> {
  console.log(`[bank/stub] Generating boleto: R$ ${req.amount} due ${req.dueDate}`);
  const boletoId = `bol_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    success: true,
    provider: "stub",
    boletoId,
    barcode: `23793.38128 60000.000003 ${boletoId.slice(4, 16)} 1 ${req.amount.replace(".", "")}`,
    digitableLine: `23793381286000000000${boletoId.slice(4, 10)}00001${req.amount.replace(".", "")}`,
  };
}

// ─── PIX ───

async function generatePixQRSantander(req: PixQRRequest): Promise<PixQRResponse> {
  const token = await getSantanderToken();

  const payload = {
    amount: parseFloat(req.amount),
    description: req.description.slice(0, 60),
    expiration: (req.expiresInMinutes ?? 60) * 60,
  };

  const res = await fetch(`${SANTANDER_BASE_URL}/pix_collection_qrcodes/v1/cobqrcode`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Application-Key": SANTANDER_CLIENT_ID!,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[bank] Santander PIX error: ${res.status}`, errText);
    return { success: false, provider: "santander", error: `Santander PIX API error: ${res.status}` };
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
}

async function generatePixQRStub(req: PixQRRequest): Promise<PixQRResponse> {
  console.log(`[bank/stub] Generating PIX QR: R$ ${req.amount}`);
  const transactionId = `pix_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    success: true,
    provider: "stub",
    qrCode: `00020126580014br.gov.bcb.pix0136${transactionId}5204000053039865802BR`,
    copyPaste: `00020126580014br.gov.bcb.pix0136${transactionId}`,
    transactionId,
  };
}

// ─── Public API (auto-selects real or stub) ───

export async function generateBoleto(req: BoletoRequest): Promise<BoletoResponse> {
  if (isSantanderConfigured) {
    try {
      return await generateBoletoSantander(req);
    } catch (err) {
      console.error("[bank] Santander boleto failed, falling back to stub:", err);
    }
  }
  return generateBoletoStub(req);
}

export async function generatePixQR(req: PixQRRequest): Promise<PixQRResponse> {
  if (isSantanderConfigured) {
    try {
      return await generatePixQRSantander(req);
    } catch (err) {
      console.error("[bank] Santander PIX failed, falling back to stub:", err);
    }
  }
  return generatePixQRStub(req);
}

/**
 * Check if the Santander integration is configured and reachable.
 */
export async function checkBankHealth(): Promise<{ configured: boolean; reachable: boolean }> {
  if (!isSantanderConfigured) {
    return { configured: false, reachable: false };
  }
  try {
    await getSantanderToken();
    return { configured: true, reachable: true };
  } catch {
    return { configured: true, reachable: false };
  }
}
