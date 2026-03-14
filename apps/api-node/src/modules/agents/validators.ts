import { z } from "zod";

export const listAgentTasksQuerySchema = z.object({
  orgId: z.string().uuid(),
  status: z.string().optional(),
  taskType: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const approveTaskSchema = z.object({
  reviewedBy: z.string().max(255),
});

export const rejectTaskSchema = z.object({
  reviewedBy: z.string().max(255),
  overrideOutput: z.record(z.string(), z.unknown()).optional(),
});

export const updateAgentConfigSchema = z.object({
  orgId: z.string().uuid(),
  taskType: z.string().min(1).max(50),
  autoExecuteThreshold: z.coerce.number().min(0).max(1).optional(),
  escalateThreshold: z.coerce.number().min(0).max(1).optional(),
  isEnabled: z.boolean().optional(),
});

export type UpdateAgentConfigInput = z.infer<typeof updateAgentConfigSchema>;

export const listAgentConfigsQuerySchema = z.object({
  orgId: z.string().uuid(),
});
