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
      const query = listContractsQuerySchema.parse(req.query);
      const result = await listContracts(query);
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
