import { Router, Request, Response, NextFunction } from "express";
import { ok, created, paginated, noContent } from "../../lib/response";
import {
  createSubscriptionSchema,
  listSubscriptionsQuerySchema,
  listEventLogQuerySchema,
} from "./validators";
import {
  createSubscription,
  listSubscriptions,
  deleteSubscription,
  listEventLog,
} from "./service";

export const eventsRouter = Router();

// POST /events/subscriptions
eventsRouter.post(
  "/events/subscriptions",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = createSubscriptionSchema.parse(req.body);
      const result = await createSubscription(input);
      created(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /events/subscriptions
eventsRouter.get(
  "/events/subscriptions",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orgId } = listSubscriptionsQuerySchema.parse({ ...req.query, orgId: req.user?.org_id });
      const data = await listSubscriptions(orgId);
      ok(res, data);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /events/subscriptions/:id
eventsRouter.delete(
  "/events/subscriptions/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req.query.orgId as string) ?? "";
      await deleteSubscription(req.params.id, orgId);
      noContent(res);
    } catch (err) {
      next(err);
    }
  },
);

// GET /events/log
eventsRouter.get(
  "/events/log",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = listEventLogQuerySchema.parse({ ...req.query, orgId: req.user?.org_id });
      const result = await listEventLog(query);
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
