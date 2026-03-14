import { generateEmbeddings } from "./embeddings";
import { insertEmbedding } from "./vector-store";

const CHUNK_SIZE = 500;    // tokens (~4 chars per token)
const CHUNK_OVERLAP = 50;  // tokens overlap

/**
 * Chunk text into overlapping segments.
 */
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const charSize = chunkSize * 4; // rough token-to-char ratio
  const charOverlap = overlap * 4;
  const chunks: string[] = [];

  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + charSize, text.length);
    chunks.push(text.slice(start, end));
    start += charSize - charOverlap;
    if (start >= text.length) break;
  }

  return chunks;
}

/**
 * Ingest a document: chunk -> embed -> store in vector DB.
 */
export async function ingestDocument(input: {
  orgId: string;
  documentId?: string;
  sourceType: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<{ chunksCreated: number }> {
  const chunks = chunkText(input.content, CHUNK_SIZE, CHUNK_OVERLAP);

  if (chunks.length === 0) {
    return { chunksCreated: 0 };
  }

  const embeddings = await generateEmbeddings(chunks);

  for (let i = 0; i < chunks.length; i++) {
    await insertEmbedding({
      orgId: input.orgId,
      documentId: input.documentId,
      sourceType: input.sourceType,
      chunkIndex: i,
      chunkText: chunks[i],
      embedding: embeddings[i].embedding,
      metadata: input.metadata,
    });
  }

  console.log(
    `[ingestion] Ingested document: ${chunks.length} chunks for org ${input.orgId}`,
  );

  return { chunksCreated: chunks.length };
}
