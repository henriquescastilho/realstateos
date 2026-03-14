import { eq, and, count, desc } from "drizzle-orm";
import { db } from "../../db";
import { chatConversations, chatMessages, documentEmbeddings } from "../../db/schema";
import { NotFoundError } from "../../lib/errors";
import { generateEmbedding } from "./embeddings";
import { searchSimilar } from "./vector-store";
import type { ChatInput } from "./validators";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CHAT_MODEL = "gemini-2.0-flash";

/**
 * RAG pipeline: embed query -> search vectors -> call Gemini -> save.
 */
export async function chat(input: ChatInput) {
  // Get or create conversation
  let conversationId = input.conversationId;

  if (!conversationId) {
    const [conv] = await db
      .insert(chatConversations)
      .values({
        orgId: input.orgId,
        tenantId: input.tenantId ?? null,
        title: input.message.slice(0, 100),
        status: "active",
      })
      .returning();
    conversationId = conv.id;
  }

  // Save user message
  await db.insert(chatMessages).values({
    conversationId,
    role: "user",
    content: input.message,
  });

  // Get conversation history (last 10 messages)
  const history = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(10);

  // RAG: embed query and search
  const queryEmbedding = await generateEmbedding(input.message);
  const relevantChunks = await searchSimilar(input.orgId, queryEmbedding.embedding, 5);

  // Build context from relevant chunks
  const context = relevantChunks
    .filter((c) => c.score > 0.3)
    .map((c) => c.chunkText)
    .join("\n---\n");

  // Call Gemini for response
  const response = await callGemini(input.message, context, history.reverse());

  // Save assistant message
  const sources = relevantChunks
    .filter((c) => c.score > 0.3)
    .map((c) => ({
      chunkId: c.id,
      text: c.chunkText.slice(0, 200),
      score: c.score,
    }));

  const [assistantMessage] = await db
    .insert(chatMessages)
    .values({
      conversationId,
      role: "assistant",
      content: response.text,
      sources,
      tokensUsed: response.tokensUsed,
    })
    .returning();

  return {
    conversationId,
    message: assistantMessage,
    sources,
  };
}

async function callGemini(
  query: string,
  context: string,
  history: Array<{ role: string; content: string }>,
): Promise<{ text: string; tokensUsed: number }> {
  if (!GEMINI_API_KEY) {
    return {
      text: "[AI Assistant desativado] Configure GEMINI_API_KEY para habilitar o assistente. Sua pergunta foi: " + query,
      tokensUsed: 0,
    };
  }

  const systemPrompt = `Você é um assistente virtual de uma administradora de imóveis.
Responda perguntas sobre contratos, pagamentos, regras do condomínio e manutenção.
Seja educado, conciso e objetivo. Responda em português do Brasil.
Se não souber a resposta, diga que vai encaminhar para a equipe.

${context ? `Contexto relevante:\n${context}` : "Nenhum contexto específico disponível."}`;

  const contents = [
    ...history.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    })),
    { role: "user", parts: [{ text: query }] },
  ];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini chat error: HTTP ${res.status} - ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
    usageMetadata?: { totalTokenCount?: number };
  };

  const text =
    data.candidates?.[0]?.content?.parts?.[0]?.text ??
    "Desculpe, não consegui processar sua pergunta.";

  return {
    text,
    tokensUsed: data.usageMetadata?.totalTokenCount ?? 0,
  };
}

/**
 * List conversations.
 */
export async function listConversations(params: {
  orgId: string;
  tenantId?: string;
  page: number;
  pageSize: number;
}) {
  const conditions = [eq(chatConversations.orgId, params.orgId)];

  if (params.tenantId) {
    conditions.push(eq(chatConversations.tenantId, params.tenantId));
  }

  const whereClause = and(...conditions);

  const [data, totalResult] = await Promise.all([
    db
      .select()
      .from(chatConversations)
      .where(whereClause)
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize)
      .orderBy(desc(chatConversations.updatedAt)),
    db.select({ total: count() }).from(chatConversations).where(whereClause),
  ]);

  return {
    data,
    total: totalResult[0]?.total ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}

/**
 * Get conversation messages.
 */
export async function getConversationMessages(conversationId: string) {
  const [conversation] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, conversationId))
    .limit(1);

  if (!conversation) {
    throw new NotFoundError("ChatConversation", conversationId);
  }

  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(chatMessages.createdAt);

  return { conversation, messages };
}

/**
 * List documents with embedding status.
 */
export async function listDocuments(params: {
  orgId: string;
  page: number;
  pageSize: number;
}) {
  const [data, totalResult] = await Promise.all([
    db
      .select()
      .from(documentEmbeddings)
      .where(eq(documentEmbeddings.orgId, params.orgId))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize)
      .orderBy(desc(documentEmbeddings.createdAt)),
    db
      .select({ total: count() })
      .from(documentEmbeddings)
      .where(eq(documentEmbeddings.orgId, params.orgId)),
  ]);

  return {
    data: data.map((d) => ({
      id: d.id,
      documentId: d.documentId,
      sourceType: d.sourceType,
      chunkIndex: d.chunkIndex,
      chunkText: d.chunkText.slice(0, 100) + "...",
      metadata: d.metadata,
      createdAt: d.createdAt,
    })),
    total: totalResult[0]?.total ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}
