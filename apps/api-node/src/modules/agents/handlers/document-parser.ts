/**
 * Extract structured data from documents via Gemini.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export interface ParsedDocument {
  fields: Record<string, string>;
  confidence: number;
  documentType: string;
}

export async function parseDocumentWithLLM(
  content: string,
  documentType: string,
): Promise<ParsedDocument> {
  if (!GEMINI_API_KEY) {
    return {
      fields: {},
      confidence: 0,
      documentType,
    };
  }

  const prompt = `Extraia dados estruturados deste documento do tipo "${documentType}".

Conteúdo:
${content.slice(0, 3000)}

Responda APENAS em JSON com este formato:
{
  "fields": { "campo": "valor", ... },
  "confidence": 0.0-1.0,
  "documentType": "${documentType}"
}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
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

    return JSON.parse(jsonMatch[0]) as ParsedDocument;
  } catch (err) {
    console.error("[agent:document-parser] LLM error:", err);
    return { fields: {}, confidence: 0, documentType };
  }
}
