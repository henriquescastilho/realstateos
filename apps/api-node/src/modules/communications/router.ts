import { Router, Request, Response, NextFunction } from "express";
import { ok, created, paginated } from "../../lib/response";
import { sendMessageSchema, listMessagesQuerySchema } from "./validators";
import { sendMessage, listMessages, getMessageById } from "./service";

export const communicationsRouter = Router();

// POST /messages — send a message via email or whatsapp
communicationsRouter.post(
  "/messages",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = sendMessageSchema.parse(req.body);
      const result = await sendMessage(input);
      created(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /messages — list message records
communicationsRouter.get(
  "/messages",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = listMessagesQuerySchema.parse(req.query);
      const result = await listMessages(query);
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

// GET /messages/:id — get single message record
communicationsRouter.get(
  "/messages/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const record = await getMessageById(req.params.id);
      ok(res, record);
    } catch (err) {
      next(err);
    }
  },
);
