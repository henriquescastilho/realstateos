import { Router, Request, Response, NextFunction } from "express";
import { ok, created, paginated } from "../../lib/response";
import {
  onboardContractSchema,
  activateContractSchema,
  listContractsQuerySchema,
} from "./validators";
import {
  onboardContract,
  getContractById,
  activateContract,
  listContracts,
} from "./service";

export const onboardingRouter = Router();

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
    due_day: 1,
    status: row.operationalStatus === "pending_onboarding" ? "pending" : row.operationalStatus,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

// POST /contracts/onboard — full atomic intake
onboardingRouter.post(
  "/contracts/onboard",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = onboardContractSchema.parse(req.body);
      const result = await onboardContract(input);
      created(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /contracts/:id — single contract with related entities
onboardingRouter.get(
  "/contracts/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await getContractById(req.params.id);
      ok(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /contracts/:id/activate — transition to active
onboardingRouter.patch(
  "/contracts/:id/activate",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      activateContractSchema.parse(req.body);
      const result = await activateContract(req.params.id);
      ok(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /contracts — list with pagination + optional status filter
onboardingRouter.get(
  "/contracts",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = listContractsQuerySchema.parse({
        ...req.query,
        orgId: req.user?.org_id,
      });
      const result = await listContracts(query);
      const mapped = result.data.map((r: Record<string, unknown>) => mapContract(r as Record<string, unknown>));
      paginated(res, mapped, {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      });
    } catch (err) {
      next(err);
    }
  },
);
