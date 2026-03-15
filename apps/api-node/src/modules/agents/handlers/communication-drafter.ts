/**
 * Draft customized communications via Gemini.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export interface DraftResult {
  subject: string;
  body: string;
  confidence: number;
  tone: string;
}

export async function draftCommunicationWithLLM(input: {
  type: string;
  context: Record<string, unknown>;
  tone?: string;
  language?: string;
}): Promise<DraftResult> {
  if (!GEMINI_API_KEY) {
    return {
      subject: `[${input.type}]`,
      body: JSON.stringify(input.context),
      confidence: 0,
      tone: input.tone ?? "formal",
    };
  }

  const prompt = `Redija uma comunicação do tipo "${input.type}" para uma administradora de imóveis.

Contexto:
${JSON.stringify(input.context, null, 2)}

Tom: ${input.tone ?? "formal"}
Idioma: ${input.language ?? "pt-BR"}

Responda APENAS em JSON:
{
  "subject": "assunto",
  "body": "corpo da mensagem",
  "confidence": 0.0-1.0,
  "tone": "tom utilizado"
}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
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

    return JSON.parse(jsonMatch[0]) as DraftResult;
  } catch (err) {
    console.error("[agent:communication-drafter] LLM error:", err);
    return {
      subject: `[${input.type}]`,
      body: "Não foi possível gerar a comunicação automaticamente.",
      confidence: 0.3,
      tone: input.tone ?? "formal",
    };
  }
}
