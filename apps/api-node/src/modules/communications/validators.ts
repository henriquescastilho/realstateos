import { z } from "zod";

export const sendMessageSchema = z.object({
  orgId: z.string().uuid(),
  entityType: z.string().min(1).max(50),
  entityId: z.string().uuid(),
  channel: z.enum(["email", "whatsapp"]),
  templateType: z.string().min(1).max(50),
  recipient: z.string().min(1).max(255),
  templateData: z.record(z.string(), z.string()).default({}),
});

export type SendMessageSchemaInput = z.infer<typeof sendMessageSchema>;

export const listMessagesQuerySchema = z.object({
  orgId: z.string().uuid(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  channel: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
