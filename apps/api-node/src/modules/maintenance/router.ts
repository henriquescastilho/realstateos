import { Router, Request, Response, NextFunction } from "express";
import { ok, created, paginated } from "../../lib/response";
import {
  createTicketSchema,
  updateTicketSchema,
  listTicketsQuerySchema,
} from "./validators";
import {
  createTicket,
  getTicketById,
  updateTicket,
  listTickets,
} from "./service";

export const maintenanceRouter = Router();

// POST /maintenance/tickets — create a ticket (auto-classifies)
maintenanceRouter.post(
  "/maintenance/tickets",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = createTicketSchema.parse(req.body);
      const result = await createTicket(input);
      created(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /maintenance/tickets/:id — get single ticket
maintenanceRouter.get(
  "/maintenance/tickets/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ticket = await getTicketById(req.params.id);
      ok(res, ticket);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /maintenance/tickets/:id — update ticket
maintenanceRouter.patch(
  "/maintenance/tickets/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = updateTicketSchema.parse(req.body);
      const result = await updateTicket(req.params.id, input);
      ok(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /maintenance/tickets — list tickets
maintenanceRouter.get(
  "/maintenance/tickets",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = listTicketsQuerySchema.parse(req.query);
      const result = await listTickets(query);
      paginated(res, result.data, {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      });
    } catch (err) {
      next(err);
    }
  },
);
