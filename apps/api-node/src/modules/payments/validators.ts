import { z } from "zod";

// ─── Payment webhook (bank notification) ───
export const paymentWebhookSchema = z.object({
  orgId: z.string().uuid(),
  chargeId: z.string().uuid().optional(),
  receivedAmount: z.string().regex(/^\d+\.\d{2}$/, "Must be decimal with 2 places"),
  receivedAt: z.string().datetime(),
  paymentMethod: z.enum(["boleto", "pix", "ted", "credit_card", "debit"]),
  bankReference: z.string().max(100).optional(),
});

export type PaymentWebhookInput = z.infer<typeof paymentWebhookSchema>;

// ─── Manual reconciliation ───
export const reconcilePaymentSchema = z.object({
  chargeId: z.string().uuid(),
});

export type ReconcilePaymentInput = z.infer<typeof reconcilePaymentSchema>;

// ─── List payments query ───
export const listPaymentsQuerySchema = z.object({
  orgId: z.string().uuid(),
  chargeId: z.string().uuid().optional(),
  reconciliationStatus: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Generate statement ───
export const generateStatementSchema = z.object({
  orgId: z.string().uuid(),
  ownerId: z.string().uuid(),
  leaseContractId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/, "Must be YYYY-MM format"),
  adminFeePercentage: z.string().optional(),
});

export type GenerateStatementInput = z.infer<typeof generateStatementSchema>;

// ─── List statements query ───
export const listStatementsQuerySchema = z.object({
  orgId: z.string().uuid(),
  ownerId: z.string().uuid().optional(),
  period: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
