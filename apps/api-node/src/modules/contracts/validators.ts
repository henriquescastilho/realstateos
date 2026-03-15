import { z } from "zod";

// ─── Create contract ───────────────────────────────────────────────────────

export const createContractSchema = z.object({
  orgId: z.string().uuid(),
  propertyId: z.string().uuid(),
  ownerId: z.string().uuid(),
  tenantId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  rentAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Rent amount must be a valid decimal"),
  depositType: z.string().max(50).optional(),
  chargeRules: z.record(z.string(), z.unknown()).optional().default({}),
  payoutRules: z.record(z.string(), z.unknown()).optional().default({}),
});

export type CreateContractInput = z.infer<typeof createContractSchema>;

// ─── Update contract ───────────────────────────────────────────────────────

export const updateContractSchema = z.object({
  orgId: z.string().uuid(),
  rentAmount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  depositType: z.string().max(50).optional(),
  chargeRules: z.record(z.string(), z.unknown()).optional(),
  payoutRules: z.record(z.string(), z.unknown()).optional(),
});

export type UpdateContractInput = z.infer<typeof updateContractSchema>;

// ─── Status transition ─────────────────────────────────────────────────────

export const transitionStatusSchema = z.object({
  orgId: z.string().uuid(),
  status: z.enum(["active", "suspended", "terminated", "pending_onboarding"]),
  reason: z.string().max(500).optional(),
});

export type TransitionStatusInput = z.infer<typeof transitionStatusSchema>;

// ─── List query ────────────────────────────────────────────────────────────

export const listContractsQuerySchema = z.object({
  orgId: z.string().uuid(),
  status: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type ListContractsQuery = z.infer<typeof listContractsQuerySchema>;
