import { Router, Request, Response, NextFunction } from "express";
import { ok, paginated } from "../../lib/response";
import {
  listAgentTasksQuerySchema,
  approveTaskSchema,
  rejectTaskSchema,
  updateAgentConfigSchema,
  listAgentConfigsQuerySchema,
} from "./validators";
import {
  listAgentTasks,
  getAgentTask,
  approveTask,
  rejectTask,
  updateAgentConfig,
  listAgentConfigs,
  getAgentRegistryWithStats,
  getRecentOrchestratorEvents,
} from "./service";
import { extractBoletoData } from "./handlers/radar-capture";
import { runSimulation } from "./handlers/simulation";

export const agentsRouter = Router();

// GET /agents/tasks
agentsRouter.get(
  "/agents/tasks",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = listAgentTasksQuerySchema.parse({ ...req.query, orgId: req.user?.org_id });
      const result = await listAgentTasks(query);
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

// GET /agents/tasks/:id
agentsRouter.get(
  "/agents/tasks/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.query.orgId as string;
      const task = await getAgentTask(req.params.id, orgId);
      ok(res, task);
    } catch (err) {
      next(err);
    }
  },
);

// POST /agents/tasks/:id/approve
agentsRouter.post(
  "/agents/tasks/:id/approve",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.body.orgId as string;
      const input = approveTaskSchema.parse(req.body);
      const result = await approveTask(req.params.id, orgId, input.reviewedBy);
      ok(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /agents/tasks/:id/reject
agentsRouter.post(
  "/agents/tasks/:id/reject",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.body.orgId as string;
      const input = rejectTaskSchema.parse(req.body);
      const result = await rejectTask(
        req.params.id,
        orgId,
        input.reviewedBy,
        input.overrideOutput,
      );
      ok(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /agents/configs
agentsRouter.put(
  "/agents/configs",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = updateAgentConfigSchema.parse(req.body);
      const result = await updateAgentConfig(input);
      ok(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /agents/configs
agentsRouter.get(
  "/agents/configs",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orgId } = listAgentConfigsQuerySchema.parse({ ...req.query, orgId: req.user?.org_id });
      const data = await listAgentConfigs(orgId);
      ok(res, data);
    } catch (err) {
      next(err);
    }
  },
);

// GET /agents/registry — agent cards with live stats
agentsRouter.get(
  "/agents/registry",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user?.org_id as string;
      const data = await getAgentRegistryWithStats(orgId);
      ok(res, data);
    } catch (err) {
      next(err);
    }
  },
);

// GET /agents/orchestrator/events — recent domain events
agentsRouter.get(
  "/agents/orchestrator/events",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user?.org_id as string;
      const data = await getRecentOrchestratorEvents(orgId);
      ok(res, data);
    } catch (err) {
      next(err);
    }
  },
);

// POST /agents/pagador/extract-bills — extract boleto data from base64 PDF/image
agentsRouter.post(
  "/agents/pagador/extract-bills",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { files } = req.body as { files: Array<{ base64: string; name?: string }> };

      const results = [];
      for (const file of files ?? []) {
        const { data, confidence } = await extractBoletoData(file.base64);
        results.push({ ...data, confidence, fileName: file.name ?? null });
      }

      ok(res, { bills: results });
    } catch (err) {
      next(err);
    }
  },
);

// GET /agents/simulation/contracts — list contracts with owner/tenant/property for simulation picker
agentsRouter.get(
  "/agents/simulation/contracts",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user?.org_id as string;
      const { db: database } = await import("../../db");
      const { leaseContracts, owners, tenants, properties } = await import("../../db/schema");
      const { eq } = await import("drizzle-orm");

      const rows = await database
        .select({
          id: leaseContracts.id,
          ownerName: owners.fullName,
          tenantName: tenants.fullName,
          address: properties.address,
          rentAmount: leaseContracts.rentAmount,
        })
        .from(leaseContracts)
        .innerJoin(owners, eq(owners.id, leaseContracts.ownerId))
        .innerJoin(tenants, eq(tenants.id, leaseContracts.tenantId))
        .innerJoin(properties, eq(properties.id, leaseContracts.propertyId))
        .where(eq(leaseContracts.orgId, orgId));

      ok(res, rows);
    } catch (err) {
      next(err);
    }
  },
);

// POST /agents/simulate — run full pipeline simulation for a contract
agentsRouter.post(
  "/agents/simulate",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user?.org_id as string;
      const { contractId, email } = req.body as { contractId: string; email: string };

      if (!contractId || !email) {
        res.status(422).json({ ok: false, error: { code: "VALIDATION_ERROR", message: "contractId and email are required" } });
        return;
      }

      const result = await runSimulation(orgId, contractId, email);
      ok(res, result);
    } catch (err) {
      next(err);
    }
  },
);
