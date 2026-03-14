import { z } from "zod";

export const registerConnectorSchema = z.object({
  orgId: z.string().uuid(),
  providerName: z.string().min(1).max(100),
  capabilities: z.array(z.string()).default([]),
  authMode: z.enum(["apikey", "oauth2", "basic"]).default("apikey"),
  retryPolicy: z
    .object({
      maxAttempts: z.number().int().min(1).max(10).default(3),
      backoffMs: z.number().int().min(100).max(30000).default(1000),
    })
    .default({ maxAttempts: 3, backoffMs: 1000 }),
});

export type RegisterConnectorInput = z.infer<typeof registerConnectorSchema>;

export const listConnectorsQuerySchema = z.object({
  orgId: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Bank (Santander) ───

export const generateBoletoSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "amount must be a decimal string e.g. '150.00'"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dueDate must be YYYY-MM-DD"),
  payerName: z.string().min(1).max(200),
  payerDocument: z.string().min(11).max(18),
  description: z.string().max(200).default(""),
});

export const generatePixSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "amount must be a decimal string e.g. '50.00'"),
  description: z.string().max(200).default(""),
  expiresInMinutes: z.number().int().min(1).max(1440).optional(),
});

export const registerBankCredentialsSchema = z.object({
  clientId: z.string().min(1).max(255),
  clientSecret: z.string().min(1).max(255),
  workspaceId: z.string().max(255).optional(),
  certPath: z.string().min(1).max(500),
  keyPath: z.string().min(1).max(500),
  environment: z.enum(["sandbox", "production"]).default("sandbox"),
  baseUrl: z.string().url().optional(),
});
