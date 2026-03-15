import { z } from "zod";

// ─── Create billing schedule ───
export const createBillingScheduleSchema = z.object({
  orgId: z.string().uuid(),
  leaseContractId: z.string().uuid(),
  dueDateRule: z.string().max(50).default("first_business_day"),
  chargeComponents: z
    .array(
      z.object({
        type: z.string().min(1),
        source: z.string().min(1),
        fixedAmount: z.string().optional(),
      }),
    )
    .default([]),
  collectionMethod: z.string().max(50).default("boleto_pix"),
  lateFeeRule: z
    .object({ percentage: z.string().default("2.00") })
    .default({ percentage: "2.00" }),
  interestRule: z
    .object({ dailyPercentage: z.string().default("0.033") })
    .default({ dailyPercentage: "0.033" }),
});

export type CreateBillingScheduleInput = z.infer<typeof createBillingScheduleSchema>;

// ─── Generate charges ───
export const generateChargesSchema = z.object({
  orgId: z.string().uuid(),
  leaseContractId: z.string().uuid(),
  billingPeriod: z.string().regex(/^\d{4}-\d{2}$/, "Must be YYYY-MM format"),
  dueDate: z.string().date(),
  daysLate: z.number().int().min(0).default(0),
  earlyDiscountPercentage: z.string().optional(),
  daysEarly: z.number().int().min(0).default(0),
});

export type GenerateChargesInput = z.infer<typeof generateChargesSchema>;

// ─── List charges query ───
export const listChargesQuerySchema = z.object({
  orgId: z.string().uuid(),
  leaseContractId: z.string().uuid().optional(),
  billingPeriod: z.string().optional(),
  issueStatus: z.string().optional(),
  paymentStatus: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Add line item to draft charge ───
export const addLineItemSchema = z.object({
  orgId: z.string().uuid(),
  type: z.string().min(1).max(50),
  description: z.string().min(1).max(255),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Amount must be a valid decimal"),
  source: z.string().max(50).default("manual"),
});

export type AddLineItemInput = z.infer<typeof addLineItemSchema>;

// ─── Remove line item from draft charge ───
export const removeLineItemSchema = z.object({
  orgId: z.string().uuid(),
  lineItemIndex: z.coerce.number().int().min(0),
});

export type RemoveLineItemInput = z.infer<typeof removeLineItemSchema>;

// ─── Issue charge ───
export const issueChargeSchema = z.object({
  issuedBy: z.string().max(100).optional(),
});
