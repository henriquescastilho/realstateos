import { Router, Request, Response, NextFunction } from "express";
import { ok, created, paginated } from "../../lib/response";
import {
  chatSchema,
  listConversationsQuerySchema,
  ingestDocumentSchema,
  listDocumentsQuerySchema,
} from "./validators";
import {
  chat,
  listConversations,
  getConversationMessages,
  listDocuments,
} from "./service";
import { ingestDocument } from "./ingestion";
import { ingestionQueue } from "../../lib/queue";

export const aiAssistantRouter = Router();

// POST /ai-assistant/chat
aiAssistantRouter.post(
  "/ai-assistant/chat",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = chatSchema.parse(req.body);
      const result = await chat(input);
      ok(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /ai-assistant/conversations
aiAssistantRouter.get(
  "/ai-assistant/conversations",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = listConversationsQuerySchema.parse(req.query);
      const result = await listConversations(query);
      paginated(res, result.data, {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /ai-assistant/conversations/:id/messages
aiAssistantRouter.get(
  "/ai-assistant/conversations/:id/messages",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await getConversationMessages(req.params.id);
      ok(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /ai-assistant/documents/ingest
aiAssistantRouter.post(
  "/ai-assistant/documents/ingest",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = ingestDocumentSchema.parse(req.body);

      // Queue async ingestion if content is large
      if (input.content.length > 5000) {
        await ingestionQueue().add("ingest", {
          orgId: input.orgId,
          documentId: input.documentId ?? null,
          sourceType: input.sourceType,
          content: input.content,
          metadata: input.metadata,
        });
        ok(res, { status: "queued", message: "Document queued for ingestion" });
      } else {
        const result = await ingestDocument(input);
        created(res, result);
      }
    } catch (err) {
      next(err);
    }
  },
);

// GET /ai-assistant/documents
aiAssistantRouter.get(
  "/ai-assistant/documents",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = listDocumentsQuerySchema.parse(req.query);
      const result = await listDocuments(query);
      paginated(res, result.data, {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      });
    } catch (err) {
      next(err);
    }
  },
);
