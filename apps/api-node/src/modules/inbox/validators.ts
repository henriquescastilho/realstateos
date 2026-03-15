import { z } from "zod";

export const listThreadsQuerySchema = z.object({
  orgId: z.string().uuid(),
  status: z.enum(["open", "snoozed", "closed"]).optional(),
  channel: z.string().optional(),
  linkedEntityType: z.string().optional(),
  assignedTo: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const replyToThreadSchema = z.object({
  content: z.string().min(1).max(4000),
  sentBy: z.string().max(255).optional(),
});

export const updateThreadSchema = z.object({
  status: z.enum(["open", "snoozed", "closed"]).optional(),
  assignedTo: z.string().max(255).nullable().optional(),
  linkedEntityType: z.string().max(50).nullable().optional(),
  linkedEntityId: z.string().uuid().nullable().optional(),
  linkedPropertyId: z.string().uuid().nullable().optional(),
  linkedContractId: z.string().uuid().nullable().optional(),
});

export type ReplyToThreadInput = z.infer<typeof replyToThreadSchema>;
export type UpdateThreadInput = z.infer<typeof updateThreadSchema>;
