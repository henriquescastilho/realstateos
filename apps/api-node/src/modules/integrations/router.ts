import { Router, Request, Response, NextFunction } from "express";
import { ok, created, paginated } from "../../lib/response";
import {
  registerConnectorSchema,
  listConnectorsQuerySchema,
} from "./validators";
import {
  registerConnector,
  getConnectorById,
  listConnectors,
} from "./service";
import { checkConnectorsHealth } from "./health";

export const integrationsRouter = Router();

// POST /integrations/connectors — register a new connector
integrationsRouter.post(
  "/integrations/connectors",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = registerConnectorSchema.parse(req.body);
      const result = await registerConnector(input);
      created(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /integrations/connectors — list connectors
integrationsRouter.get(
  "/integrations/connectors",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = listConnectorsQuerySchema.parse(req.query);
      const result = await listConnectors(query);
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

// GET /integrations/connectors/:id — get single connector
integrationsRouter.get(
  "/integrations/connectors/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connector = await getConnectorById(req.params.id);
      ok(res, connector);
    } catch (err) {
      next(err);
    }
  },
);

// GET /integrations/health — check all connectors health for an org
integrationsRouter.get(
  "/integrations/health",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.query.orgId as string;
      if (!orgId) {
        res.status(400).json({ ok: false, error: { code: "MISSING_ORG_ID", message: "orgId query parameter is required" } });
        return;
      }
      const health = await checkConnectorsHealth(orgId);
      ok(res, health);
    } catch (err) {
      next(err);
    }
  },
);
