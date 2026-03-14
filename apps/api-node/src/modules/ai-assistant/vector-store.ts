import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../../db";
import { documentEmbeddings } from "../../db/schema";

export interface VectorSearchResult {
  id: string;
  chunkText: string;
  sourceType: string | null;
  documentId: string | null;
  score: number;
  metadata: Record<string, unknown>;
}

/**
 * Insert an embedding chunk into the vector store.
 */
export async function insertEmbedding(input: {
  orgId: string;
  documentId?: string;
  sourceType: string;
  chunkIndex: number;
  chunkText: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}) {
  const [record] = await db
    .insert(documentEmbeddings)
    .values({
      orgId: input.orgId,
      documentId: input.documentId ?? null,
      sourceType: input.sourceType,
      chunkIndex: input.chunkIndex,
      chunkText: input.chunkText,
      embedding: JSON.stringify(input.embedding),
      metadata: input.metadata ?? {},
    })
    .returning();

  return record;
}

/**
 * Search for similar chunks using cosine similarity.
 * Note: For production, use pgvector extension. This is a text-based fallback.
 */
export async function searchSimilar(
  orgId: string,
  queryEmbedding: number[],
  topK = 5,
): Promise<VectorSearchResult[]> {
  // Fetch all embeddings for this org and compute cosine similarity in-memory
  // For production, replace with pgvector <=> operator
  const allEmbeddings = await db
    .select()
    .from(documentEmbeddings)
    .where(eq(documentEmbeddings.orgId, orgId));

  const scored = allEmbeddings
    .map((row) => {
      let storedEmbedding: number[];
      try {
        storedEmbedding = JSON.parse(row.embedding ?? "[]");
      } catch {
        return null;
      }

      if (storedEmbedding.length !== queryEmbedding.length) return null;

      const score = cosineSimilarity(queryEmbedding, storedEmbedding);
      return {
        id: row.id,
        chunkText: row.chunkText,
        sourceType: row.sourceType,
        documentId: row.documentId,
        score,
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
      };
    })
    .filter((r): r is VectorSearchResult => r !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}
