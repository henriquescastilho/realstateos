import { Router, Request, Response, NextFunction } from "express";
import { ok, created, paginated } from "../../lib/response";
import {
  listThreadsQuerySchema,
  replyToThreadSchema,
  updateThreadSchema,
} from "./validators";
import {
  listThreads,
  getThreadWithMessages,
  replyToThread,
  updateThread,
  getInboxStats,
} from "./service";

export const inboxRouter = Router();

// GET /inbox/threads
inboxRouter.get(
  "/inbox/threads",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = listThreadsQuerySchema.parse({ ...req.query, orgId: req.user?.org_id });
      const result = await listThreads(query);
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

// GET /inbox/stats
inboxRouter.get(
  "/inbox/stats",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.query.orgId as string;
      const stats = await getInboxStats(orgId);
      ok(res, stats);
    } catch (err) {
      next(err);
    }
  },
);

// GET /inbox/threads/:id
inboxRouter.get(
  "/inbox/threads/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.query.orgId as string;
      const result = await getThreadWithMessages(req.params.id, orgId);
      ok(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /inbox/threads/:id/reply
inboxRouter.post(
  "/inbox/threads/:id/reply",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.body.orgId as string;
      const input = replyToThreadSchema.parse(req.body);
      const result = await replyToThread(
        req.params.id,
        orgId,
        input.content,
        input.sentBy,
      );
      created(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /inbox/threads/:id
inboxRouter.put(
  "/inbox/threads/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.body.orgId as string;
      const input = updateThreadSchema.parse(req.body);
      const result = await updateThread(req.params.id, orgId, input);
      ok(res, result);
    } catch (err) {
      next(err);
    }
  },
);
