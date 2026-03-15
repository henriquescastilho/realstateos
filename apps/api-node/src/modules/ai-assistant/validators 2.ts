import { z } from "zod";

export const chatSchema = z.object({
  orgId: z.string().uuid(),
  tenantId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
});

export type ChatInput = z.infer<typeof chatSchema>;

export const listConversationsQuerySchema = z.object({
  orgId: z.string().uuid(),
  tenantId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const ingestDocumentSchema = z.object({
  orgId: z.string().uuid(),
  documentId: z.string().uuid().optional(),
  sourceType: z.string().min(1).max(50),
  content: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type IngestDocumentInput = z.infer<typeof ingestDocumentSchema>;

export const listDocumentsQuerySchema = z.object({
  orgId: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
