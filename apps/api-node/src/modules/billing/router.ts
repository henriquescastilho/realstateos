import { Router, Request, Response, NextFunction } from "express";
import { ok, created, paginated } from "../../lib/response";
import {
  createBillingScheduleSchema,
  generateChargesSchema,
  listChargesQuerySchema,
  issueChargeSchema,
} from "./validators";
import {
  createBillingSchedule,
  generateCharge,
  listCharges,
  issueCharge,
} from "./service";

export const billingRouter = Router();

// POST /billing-schedules — create billing schedule for a contract
billingRouter.post(
  "/billing-schedules",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = createBillingScheduleSchema.parse(req.body);
      const result = await createBillingSchedule(input);
      created(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /charges/generate — generate a charge for a billing period
billingRouter.post(
  "/charges/generate",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = generateChargesSchema.parse(req.body);
      const result = await generateCharge(input);
      created(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /charges — list charges with filters
billingRouter.get(
  "/charges",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = listChargesQuerySchema.parse(req.query);
      const result = await listCharges(query);
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

// PATCH /charges/:id/issue — transition charge to issued
billingRouter.patch(
  "/charges/:id/issue",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      issueChargeSchema.parse(req.body);
      const result = await issueCharge(req.params.id);
      ok(res, result);
    } catch (err) {
      next(err);
    }
  },
);
