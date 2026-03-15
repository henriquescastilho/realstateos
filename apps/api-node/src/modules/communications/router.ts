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
      const query = listMessagesQuerySchema.parse({ ...req.query, orgId: req.user?.org_id });
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

// ─── Compatibility aliases (frontend calls /communications, /v1/communications) ───

communicationsRouter.get(
  "/communications",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = listMessagesQuerySchema.parse({ ...req.query, orgId: req.user?.org_id });
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

communicationsRouter.get("/communications/templates", (_req: Request, res: Response) => {
  ok(res, []);
});

communicationsRouter.get("/communications/recipients", (_req: Request, res: Response) => {
  ok(res, []);
});

communicationsRouter.post("/communications/send", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = sendMessageSchema.parse(req.body);
    const result = await sendMessage(input);
    created(res, result);
  } catch (err) {
    next(err);
  }
});

communicationsRouter.post("/communications/bulk-send", (_req: Request, res: Response) => {
  ok(res, { sent: 0, errors: [] });
});

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
