/**
 * RADAR — Captura de boletos de condomínio/IPTU/taxas via Gemini Vision.
 * Extrai dados do boleto, faz match com o imóvel, e salva em property_expenses.
 */

import { eq, or } from "drizzle-orm";
import { db } from "../../../db";
import { properties, propertyExpenses } from "../../../db/schema";
import { emitDomainEvent } from "../../../lib/events";
import type { AgentTask } from "../../../types/domain";
import type { TaskExecutionResult } from "../executor";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

interface RadarInput {
  imageBase64?: string;
  textContent?: string;
  sourceType: "email" | "whatsapp" | "manual";
  sourceReference?: string;
}

interface ExtractedBoletoData {
  value: string;
  dueDate: string;
  barcode?: string;
  digitableLine?: string;
  type: "condo" | "iptu" | "taxa";
  issuerCnpj?: string;
  issuerName?: string;
  referenceMonth?: string;
  municipalRegistration?: string;
}

/**
 * Extract boleto data from image or text using Gemini.
 */
export async function extractBoletoData(
  imageBase64?: string,
  textContent?: string,
): Promise<{ data: ExtractedBoletoData; confidence: number }> {
  if (!GEMINI_API_KEY) {
    return {
      data: {
        value: "0.00",
        dueDate: new Date().toISOString().split("T")[0],
        type: "condo",
      },
      confidence: 0,
    };
  }

  const prompt = `Analise este boleto/documento e extraia os seguintes dados em JSON:
{
  "value": "valor numérico com 2 decimais (ex: 780.50)",
  "dueDate": "data de vencimento formato YYYY-MM-DD",
  "barcode": "código de barras numérico se visível",
  "digitableLine": "linha digitável se visível",
  "type": "condo (condomínio) ou iptu ou taxa",
  "issuerCnpj": "CNPJ do emissor/administradora",
  "issuerName": "nome do emissor/administradora",
  "referenceMonth": "mês de referência formato YYYY-MM",
  "municipalRegistration": "inscrição municipal/imobiliária se for IPTU",
  "confidence": 0.0 a 1.0
}
Responda APENAS o JSON.`;

  const parts: Array<Record<string, unknown>> = [{ text: prompt }];

  if (imageBase64) {
    parts.unshift({
      inline_data: {
        mime_type: "image/png",
        data: imageBase64,
      },
    });
  } else if (textContent) {
    parts.push({ text: `\n\nConteúdo do documento:\n${textContent.slice(0, 3000)}` });
  }

  try {
    const model = imageBase64 ? "gemini-2.0-flash" : "gemini-2.0-flash";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const parsed = JSON.parse(jsonMatch[0]) as ExtractedBoletoData & { confidence?: number };
    const confidence = parsed.confidence ?? 0.7;

    return { data: parsed, confidence };
  } catch (err) {
    console.error("[agent:radar] LLM error:", err);
    return {
      data: {
        value: "0.00",
        dueDate: new Date().toISOString().split("T")[0],
        type: "condo",
      },
      confidence: 0,
    };
  }
}

/**
 * Match extracted boleto data to a property by CNPJ (condo admin) or municipal registration.
 */
async function matchProperty(
  orgId: string,
  extracted: ExtractedBoletoData,
): Promise<string | null> {
  if (!extracted.issuerCnpj && !extracted.municipalRegistration) return null;

  // Try matching by condo admin CNPJ
  if (extracted.issuerCnpj) {
    const allProps = await db
      .select()
      .from(properties)
      .where(eq(properties.orgId, orgId));

    for (const prop of allProps) {
      const condoAdmin = prop.condoAdmin as { cnpj?: string } | null;
      if (condoAdmin?.cnpj === extracted.issuerCnpj) {
        return prop.id;
      }
    }
  }

  // Try matching by municipal registration (IPTU)
  if (extracted.municipalRegistration) {
    const [prop] = await db
      .select()
      .from(properties)
      .where(eq(properties.municipalRegistration, extracted.municipalRegistration))
      .limit(1);

    if (prop && prop.orgId === orgId) return prop.id;
  }

  return null;
}

/**
 * Main handler for the Radar agent task.
 */
export async function handleRadarCapture(
  task: AgentTask,
): Promise<TaskExecutionResult> {
  const input = task.input as unknown as RadarInput;

  // Step 1: Extract boleto data via Gemini
  const { data: extracted, confidence } = await extractBoletoData(
    input.imageBase64,
    input.textContent,
  );

  // Step 2: Match to property
  const propertyId = await matchProperty(task.orgId, extracted);

  if (!propertyId) {
    return {
      status: "escalated",
      output: {
        message: "Could not match boleto to any property",
        extractedData: extracted,
      },
      confidence,
    };
  }

  // Determine reference month
  const refMonth = extracted.referenceMonth ??
    extracted.dueDate.substring(0, 7);

  const output: Record<string, unknown> = {
    propertyId,
    extractedData: extracted,
    confidence,
    referenceMonth: refMonth,
  };

  // Step 3: If confidence >= 0.85, auto-insert into property_expenses
  if (confidence >= 0.85) {
    try {
      const [expense] = await db
        .insert(propertyExpenses)
        .values({
          orgId: task.orgId,
          propertyId,
          type: extracted.type,
          issuer: extracted.issuerName ?? null,
          value: extracted.value,
          dueDate: extracted.dueDate,
          barcode: extracted.barcode ?? null,
          digitableLine: extracted.digitableLine ?? null,
          referenceMonth: refMonth,
          sourceType: input.sourceType,
          sourceReference: input.sourceReference ?? null,
          captureConfidence: confidence.toFixed(4),
          status: "captured",
          agentTaskId: task.id,
        })
        .returning();

      await emitDomainEvent(task.orgId, "expense.captured", {
        expenseId: expense.id,
        propertyId,
        type: extracted.type,
        value: extracted.value,
        referenceMonth: refMonth,
      }).catch((e) => console.error("[agent:radar] Event emit error:", e));

      output.expenseId = expense.id;
      output.autoInserted = true;
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("property_expenses_idempotency_idx")) {
        output.autoInserted = false;
        output.message = "Expense already exists for this property/type/month";
      } else {
        throw err;
      }
    }
  }

  return {
    status: "completed",
    output,
    confidence,
  };
}
