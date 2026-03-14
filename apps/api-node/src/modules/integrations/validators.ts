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
