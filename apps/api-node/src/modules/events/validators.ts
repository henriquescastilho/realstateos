import { z } from "zod";

export const createSubscriptionSchema = z.object({
  orgId: z.string().uuid(),
  eventTypes: z.array(z.string().min(1)).min(1),
  targetUrl: z.string().url().max(500),
  secret: z.string().min(16).max(255),
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;

export const listSubscriptionsQuerySchema = z.object({
  orgId: z.string().uuid(),
});

export const listEventLogQuerySchema = z.object({
  orgId: z.string().uuid(),
  eventType: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
