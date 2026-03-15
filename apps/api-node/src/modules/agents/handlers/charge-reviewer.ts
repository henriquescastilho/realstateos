/**
 * Anomaly detection in charges via Gemini.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export interface ChargeReviewResult {
  isAnomaly: boolean;
  confidence: number;
  reasoning: string;
  suggestedAction?: string;
}

export async function reviewChargeWithLLM(
  chargeData: Record<string, unknown>,
  historicalCharges: Array<Record<string, unknown>>,
): Promise<ChargeReviewResult> {
  if (!GEMINI_API_KEY) {
    return {
      isAnomaly: false,
      confidence: 0.5,
      reasoning: "LLM not configured",
    };
  }

  const prompt = `Analise esta cobrança de aluguel e verifique se há anomalias.

Cobrança atual:
${JSON.stringify(chargeData, null, 2)}

Histórico recente (últimas cobranças):
${JSON.stringify(historicalCharges.slice(0, 5), null, 2)}

Responda APENAS em JSON:
{
  "isAnomaly": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "explicação",
  "suggestedAction": "ação sugerida ou null"
}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
        }),
        signal: AbortSignal.timeout(15_000),
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

    return JSON.parse(jsonMatch[0]) as ChargeReviewResult;
  } catch (err) {
    console.error("[agent:charge-reviewer] LLM error:", err);
    return {
      isAnomaly: false,
      confidence: 0.3,
      reasoning: "LLM review failed",
    };
  }
}
