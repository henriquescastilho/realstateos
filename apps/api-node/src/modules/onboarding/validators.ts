import { z } from "zod";

// ─── Onboard contract (full intake) ───
export const onboardContractSchema = z.object({
  orgId: z.string().uuid(),

  // Property
  property: z.object({
    address: z.string().min(5).max(500),
    city: z.string().min(2).max(100),
    state: z.string().length(2),
    zip: z.string().min(8).max(10),
    type: z.string().max(50).optional(),
    areaSqm: z.number().positive().optional(),
    bedrooms: z.number().int().min(0).optional(),
    registryReference: z.string().max(100).optional(),
  }),

  // Owner
  owner: z.object({
    fullName: z.string().min(2).max(255),
    documentNumber: z.string().min(11).max(20),
    email: z.string().email().optional(),
    phone: z.string().max(20).optional(),
    payoutPreferences: z
      .object({
        bankCode: z.string().optional(),
        branch: z.string().optional(),
        account: z.string().optional(),
        accountType: z.string().optional(),
        pixKey: z.string().optional(),
      })
      .optional(),
  }),

  // Tenant
  tenant: z.object({
    fullName: z.string().min(2).max(255),
    documentNumber: z.string().min(11).max(20),
    email: z.string().email().optional(),
    phone: z.string().max(20).optional(),
    guaranteeProfile: z
      .object({
        type: z.string().optional(),
        details: z.string().optional(),
      })
      .optional(),
  }),

  // Lease terms
  lease: z.object({
    startDate: z.string().date(),
    endDate: z.string().date(),
    rentAmount: z.number().positive(),
    depositType: z.string().max(50).optional(),
    chargeRules: z.record(z.string(), z.unknown()).optional(),
    payoutRules: z.record(z.string(), z.unknown()).optional(),
  }),

  // Optional AI confidence score from document parsing
  confidence: z.number().min(0).max(100).optional(),
});

export type OnboardContractInput = z.infer<typeof onboardContractSchema>;

// ─── Activate contract ───
export const activateContractSchema = z.object({
  activatedBy: z.string().max(100).optional(),
});

// ─── List contracts query ───
export const listContractsQuerySchema = z.object({
  orgId: z.string().uuid(),
  status: z.string().max(30).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
