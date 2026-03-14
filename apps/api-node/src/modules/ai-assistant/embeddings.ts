/**
 * Gemini text-embedding-004 client for generating embeddings.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL = "text-embedding-004";
const EMBEDDING_DIMENSION = 768;

export { EMBEDDING_DIMENSION };

export interface EmbeddingResult {
  embedding: number[];
  tokensUsed: number;
}

/**
 * Generate embedding for a single text using Gemini.
 */
export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  if (!GEMINI_API_KEY) {
    // Fallback: return zero vector for development
    console.warn("[embeddings] GEMINI_API_KEY not set, returning zero vector");
    return {
      embedding: new Array(EMBEDDING_DIMENSION).fill(0),
      tokensUsed: 0,
    };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini embedding error: HTTP ${res.status} - ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    embedding?: { values?: number[] };
  };

  const values = data.embedding?.values;
  if (!values || values.length === 0) {
    throw new Error("Gemini returned empty embedding");
  }

  return {
    embedding: values,
    tokensUsed: Math.ceil(text.length / 4), // rough estimate
  };
}

/**
 * Generate embeddings for multiple texts in batch.
 */
export async function generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
  // Process sequentially to avoid rate limits
  const results: EmbeddingResult[] = [];
  for (const text of texts) {
    results.push(await generateEmbedding(text));
  }
  return results;
}
