/**
 * LLM-based ticket classification (replaces keyword classifier for agent tasks).
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export interface TicketClassification {
  category: string;
  priority: string;
  confidence: number;
  reasoning: string;
}

export async function classifyTicketWithLLM(
  description: string,
): Promise<TicketClassification> {
  if (!GEMINI_API_KEY) {
    return {
      category: "general",
      priority: "medium",
      confidence: 0.5,
      reasoning: "LLM not configured, using default classification",
    };
  }

  const prompt = `Classifique este chamado de manutenção de imóvel.

Descrição: "${description}"

Responda APENAS em JSON com este formato:
{
  "category": "plumbing|electrical|structural|appliance|painting|locksmith|pest_control|cleaning|general",
  "priority": "low|medium|high|critical",
  "confidence": 0.0-1.0,
  "reasoning": "breve explicação"
}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
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

    return JSON.parse(jsonMatch[0]) as TicketClassification;
  } catch (err) {
    console.error("[agent:ticket-classifier] LLM error:", err);
    return {
      category: "general",
      priority: "medium",
      confidence: 0.3,
      reasoning: "LLM classification failed, using fallback",
    };
  }
}
