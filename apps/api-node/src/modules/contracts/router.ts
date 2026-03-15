import { Router, Request, Response, NextFunction } from "express";
import { ok, created, noContent, paginated } from "../../lib/response";
import {
  createContractSchema,
  updateContractSchema,
  transitionStatusSchema,
  listContractsQuerySchema,
} from "./validators";
import {
  listContracts,
  getContractById,
  createContract,
  updateContract,
  transitionContractStatus,
  deleteContract,
} from "./service";

export const contractsRouter = Router();

// Map DB row to frontend-expected format
function mapContract(row: Record<string, unknown>) {
  return {
    id: row.id,
    tenant_id: row.orgId,
    property_id: row.propertyId,
    renter_id: row.tenantId,
    owner_id: row.ownerId,
    start_date: row.startDate,
    end_date: row.endDate,
    monthly_rent: row.rentAmount,
    due_day: 1, // not stored in schema yet
    status: row.operationalStatus === "pending_onboarding" ? "pending" : row.operationalStatus,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

// GET /contracts — list with filters + pagination
contractsRouter.get("/contracts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listContractsQuerySchema.parse({
      ...req.query,
      orgId: req.user?.org_id,
    });
    const { rows, total } = await listContracts(query);
    const mapped = rows.map((r) => mapContract(r as unknown as Record<string, unknown>));
    paginated(res, mapped, { total, page: query.page, pageSize: query.pageSize });
  } catch (err) {
    next(err);
  }
});

// GET /contracts/:id — detail
contractsRouter.get("/contracts/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contract = await getContractById(req.params.id!, req.user!.org_id);
    ok(res, mapContract(contract as unknown as Record<string, unknown>));
  } catch (err) {
    next(err);
  }
});

// POST /contracts — create
contractsRouter.post("/contracts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createContractSchema.parse({
      ...req.body,
      orgId: req.user?.org_id,
    });
    const contract = await createContract(input);
    created(res, contract);
  } catch (err) {
    next(err);
  }
});

// PATCH /contracts/:id — partial update
contractsRouter.patch("/contracts/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateContractSchema.parse({
      ...req.body,
      orgId: req.user?.org_id,
    });
    const contract = await updateContract(req.params.id!, input);
    ok(res, contract);
  } catch (err) {
    next(err);
  }
});

// POST /contracts/:id/transition — status workflow
contractsRouter.post(
  "/contracts/:id/transition",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = transitionStatusSchema.parse({
        ...req.body,
        orgId: req.user?.org_id,
      });
      const contract = await transitionContractStatus(req.params.id!, input);
      ok(res, contract);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /contracts/:id — soft delete (sets status=terminated)
contractsRouter.delete(
  "/contracts/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deleteContract(req.params.id!, req.user!.org_id);
      noContent(res);
    } catch (err) {
      next(err);
    }
  },
);
