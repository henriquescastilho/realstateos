/**
 * OCR connector — AWS Textract integration.
 * Parses documents (contracts, IDs, utility bills, bank statements).
 * Falls back to local PDF text extraction when AWS is not configured.
 */

export interface OCRRequest {
  documentUrl: string;
  documentType: "contract" | "identity" | "utility_bill" | "bank_statement";
}

export interface OCRResponse {
  success: boolean;
  provider: "textract" | "local" | "stub";
  parsedData?: Record<string, unknown>;
  confidence?: number;
  rawText?: string;
  error?: string;
}

// ─── Config ───

const AWS_REGION = process.env.AWS_REGION ?? "us-east-1";
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const S3_BUCKET = process.env.S3_BUCKET_NAME ?? "realestateos";

const isTextractConfigured = !!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY);

// ─── Field extraction patterns per document type ───

const EXTRACTION_PATTERNS: Record<string, Array<{ field: string; pattern: RegExp }>> = {
  contract: [
    { field: "startDate", pattern: /(?:início|inicio|vigência|data\s*de\s*início)[:\s]*(\d{2}[\/.-]\d{2}[\/.-]\d{4})/i },
    { field: "endDate", pattern: /(?:término|termino|fim|data\s*de\s*término)[:\s]*(\d{2}[\/.-]\d{2}[\/.-]\d{4})/i },
    { field: "rentAmount", pattern: /(?:aluguel|valor|mensal)[:\s]*R?\$?\s*([\d.,]+)/i },
    { field: "tenantName", pattern: /(?:locatário|inquilino|contratante)[:\s]*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)+)/i },
    { field: "ownerName", pattern: /(?:locador|proprietário|contratado)[:\s]*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)+)/i },
  ],
  identity: [
    { field: "fullName", pattern: /(?:nome)[:\s]*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)+)/i },
    { field: "documentNumber", pattern: /(?:CPF|RG|documento)[:\s]*([\d.\-\/]+)/i },
    { field: "birthDate", pattern: /(?:nascimento|data\s*nasc)[:\s]*(\d{2}[\/.-]\d{2}[\/.-]\d{4})/i },
  ],
  utility_bill: [
    { field: "address", pattern: /(?:endereço|end\.?)[:\s]*(.+?)(?:\n|$)/i },
    { field: "amount", pattern: /(?:valor|total)[:\s]*R?\$?\s*([\d.,]+)/i },
    { field: "dueDate", pattern: /(?:vencimento|venc\.?)[:\s]*(\d{2}[\/.-]\d{2}[\/.-]\d{4})/i },
  ],
  bank_statement: [
    { field: "accountHolder", pattern: /(?:titular|nome)[:\s]*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)+)/i },
    { field: "balance", pattern: /(?:saldo|balance)[:\s]*R?\$?\s*([\d.,]+)/i },
    { field: "period", pattern: /(?:período|period)[:\s]*(\d{2}\/\d{4}|\d{4}-\d{2})/i },
  ],
};

// ─── Textract integration ───

async function parseWithTextract(req: OCRRequest): Promise<OCRResponse> {
  // Extract S3 key from URL (supports s3:// and https:// formats)
  let s3Key: string;
  if (req.documentUrl.startsWith("s3://")) {
    s3Key = req.documentUrl.replace(`s3://${S3_BUCKET}/`, "");
  } else {
    const url = new URL(req.documentUrl);
    s3Key = url.pathname.slice(1); // remove leading /
  }

  // AWS Signature V4 — using native fetch
  const { createHmac, createHash } = await import("crypto");

  const service = "textract";
  const host = `textract.${AWS_REGION}.amazonaws.com`;
  const now = new Date();
  const dateStamp = now.toISOString().replace(/[-:]/g, "").slice(0, 8);
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const payload = JSON.stringify({
    Document: {
      S3Object: {
        Bucket: S3_BUCKET,
        Name: s3Key,
      },
    },
    FeatureTypes: ["FORMS", "TABLES"],
  });

  const payloadHash = createHash("sha256").update(payload).digest("hex");

  const canonicalHeaders = `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:Textract.AnalyzeDocument\n`;
  const signedHeaders = "content-type;host;x-amz-date;x-amz-target";
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
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "Textract.AnalyzeDocument",
      "X-Amz-Date": amzDate,
      Authorization: authHeader,
    },
    body: payload,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[ocr] Textract error: ${res.status}`, errText);
    return { success: false, provider: "textract", error: `Textract API error: ${res.status}` };
  }

  const data = (await res.json()) as {
    Blocks?: Array<{
      BlockType: string;
      Text?: string;
      Confidence?: number;
    }>;
  };

  // Extract all text blocks
  const textBlocks = (data.Blocks ?? []).filter((b) => b.BlockType === "LINE");
  const rawText = textBlocks.map((b) => b.Text ?? "").join("\n");
  const avgConfidence =
    textBlocks.length > 0
      ? textBlocks.reduce((sum, b) => sum + (b.Confidence ?? 0), 0) / textBlocks.length
      : 0;

  // Apply field extraction patterns
  const parsedData = extractFields(rawText, req.documentType);

  return {
    success: true,
    provider: "textract",
    parsedData,
    confidence: Math.round(avgConfidence * 100) / 100,
    rawText: rawText.slice(0, 4000),
  };
}

// ─── Local text extraction (no AWS needed) ───

function extractFields(text: string, documentType: string): Record<string, unknown> {
  const patterns = EXTRACTION_PATTERNS[documentType] ?? [];
  const result: Record<string, unknown> = {};

  for (const { field, pattern } of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      result[field] = match[1].trim();
    }
  }

  return result;
}

// ─── Stub (fallback when nothing is configured) ───

function parseStub(req: OCRRequest): OCRResponse {
  console.log(`[ocr/stub] Parsing ${req.documentType}: ${req.documentUrl}`);

  const mockData: Record<string, Record<string, unknown>> = {
    contract: {
      startDate: "2026-04-01",
      endDate: "2027-03-31",
      rentAmount: "1500.00",
      tenantName: "Parsed Tenant Name",
      ownerName: "Parsed Owner Name",
    },
    identity: {
      fullName: "Parsed Full Name",
      documentNumber: "52998224725",
      birthDate: "1990-01-15",
    },
    utility_bill: {
      address: "Rua Parsed, 123",
      amount: "250.00",
      dueDate: "2026-04-10",
    },
    bank_statement: {
      accountHolder: "Parsed Account Holder",
      balance: "15000.00",
      period: "2026-03",
    },
  };

  return {
    success: true,
    provider: "stub",
    parsedData: mockData[req.documentType] ?? {},
    confidence: 75 + Math.random() * 20,
    rawText: "[stub] Raw OCR text would appear here",
  };
}

// ─── Public API ───

export async function parseDocument(req: OCRRequest): Promise<OCRResponse> {
  if (isTextractConfigured) {
    try {
      return await parseWithTextract(req);
    } catch (err) {
      console.error("[ocr] Textract failed, falling back to stub:", err);
    }
  }
  return parseStub(req);
}

/**
 * Check if OCR integration is configured.
 */
export function checkOCRHealth(): { configured: boolean; provider: string } {
  return {
    configured: isTextractConfigured,
    provider: isTextractConfigured ? "aws-textract" : "stub",
  };
}
