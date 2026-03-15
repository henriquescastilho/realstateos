import { Router, Request, Response, NextFunction } from "express";
import { ok, created, paginated } from "../../lib/response";
import {
  createBillingScheduleSchema,
  generateChargesSchema,
  listChargesQuerySchema,
  issueChargeSchema,
  addLineItemSchema,
  removeLineItemSchema,
} from "./validators";
import {
  createBillingSchedule,
  generateCharge,
  listCharges,
  issueCharge,
  addLineItem,
  removeLineItem,
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
      const query = listChargesQuerySchema.parse({ ...req.query, orgId: req.user?.org_id });
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

// POST /charges/generate-monthly — alias for generate (frontend compat)
billingRouter.post(
  "/charges/generate-monthly",
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

// POST /charges/consolidate — stub
billingRouter.post(
  "/charges/consolidate",
  (_req: Request, res: Response) => {
    ok(res, { total_amount: "0", items: [], message: "Consolidation not yet implemented" });
  },
);

// POST /charges/:id/generate-payment — stub
billingRouter.post(
  "/charges/:id/generate-payment",
  (_req: Request, res: Response) => {
    ok(res, {
      provider: "mock",
      charge_id: _req.params.id,
      boleto_url: "",
      barcode: "",
      pix_qrcode: "",
      message: "Payment generation not yet implemented",
    });
  },
);

// POST /charges/:id/line-items — add a line item to a draft charge
billingRouter.post(
  "/charges/:id/line-items",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = addLineItemSchema.parse({ ...req.body, orgId: req.user?.org_id });
      const result = await addLineItem(req.params.id!, input);
      ok(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /charges/:id/line-items/:index — remove a line item from a draft charge
billingRouter.delete(
  "/charges/:id/line-items/:index",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = removeLineItemSchema.parse({ orgId: req.user?.org_id, lineItemIndex: req.params.index });
      const result = await removeLineItem(req.params.id!, input);
      ok(res, result);
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
