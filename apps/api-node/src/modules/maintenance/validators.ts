import { z } from "zod";

export const createTicketSchema = z.object({
  orgId: z.string().uuid(),
  propertyId: z.string().uuid(),
  leaseContractId: z.string().uuid().optional(),
  openedBy: z.string().min(1).max(50),
  description: z.string().min(10).max(2000),
  // Optional overrides (if not provided, classifier assigns them)
  category: z.string().max(50).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = z.object({
  status: z.enum(["open", "triaged", "in_progress", "waiting_external", "resolved", "closed"]).optional(),
  category: z.string().max(50).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  resolutionSummary: z.string().max(2000).optional(),
});

export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const listTicketsQuerySchema = z.object({
  orgId: z.string().uuid(),
  propertyId: z.string().uuid().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
