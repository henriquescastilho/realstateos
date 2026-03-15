import { Router, Request, Response, NextFunction } from "express";
import { ok, created, paginated } from "../../lib/response";
import {
  paymentWebhookSchema,
  reconcilePaymentSchema,
  listPaymentsQuerySchema,
  generateStatementSchema,
  listStatementsQuerySchema,
} from "./validators";
import {
  processPaymentWebhook,
  reconcilePayment,
  listPayments,
  generateStatement,
  listStatements,
} from "./service";

export const paymentsRouter = Router();

// POST /payments/webhook — receive payment notification from bank/PSP
paymentsRouter.post(
  "/payments/webhook",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = paymentWebhookSchema.parse(req.body);
      const result = await processPaymentWebhook(input);
      created(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /payments — list payments with filters
paymentsRouter.get(
  "/payments",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = listPaymentsQuerySchema.parse({ ...req.query, orgId: req.user?.org_id });
      const result = await listPayments(query);
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

// POST /payments/:id/reconcile — manual reconciliation
paymentsRouter.post(
  "/payments/:id/reconcile",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = reconcilePaymentSchema.parse(req.body);
      const result = await reconcilePayment(req.params.id, input);
      ok(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /statements — generate owner payout statement
paymentsRouter.post(
  "/statements",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = generateStatementSchema.parse(req.body);
      const result = await generateStatement(input);
      created(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /statements — list statements
paymentsRouter.get(
  "/statements",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = listStatementsQuerySchema.parse({ ...req.query, orgId: req.user?.org_id });
      const result = await listStatements(query);
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
