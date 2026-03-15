import { Router, Request, Response, NextFunction } from "express";
import { ok, created, paginated } from "../../lib/response";
import {
  registerConnectorSchema,
  listConnectorsQuerySchema,
  generateBoletoSchema,
  generatePixSchema,
  registerBankCredentialsSchema,
} from "./validators";
import {
  registerConnector,
  getConnectorById,
  listConnectors,
} from "./service";
import { checkConnectorsHealth } from "./health";
import {
  generateBoleto,
  generatePixQR,
  checkBankHealth,
  registerBankCredentials,
} from "./connectors/bank";

export const integrationsRouter = Router();

// ─── Generic Connectors ───

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
      const query = listConnectorsQuerySchema.parse({ ...req.query, orgId: req.user?.org_id });
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

// ─── Bank (Santander) — per org ───

// POST /integrations/bank/credentials — register bank credentials for org
integrationsRouter.post(
  "/integrations/bank/credentials",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = registerBankCredentialsSchema.parse(req.body);
      const orgId = req.user!.org_id;
      const result = await registerBankCredentials({ ...input, orgId });
      created(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /integrations/bank/health — check Santander connectivity for org
integrationsRouter.get(
  "/integrations/bank/health",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.org_id;
      const health = await checkBankHealth(orgId);
      ok(res, health);
    } catch (err) {
      next(err);
    }
  },
);

// POST /integrations/bank/boleto — generate boleto for org
integrationsRouter.post(
  "/integrations/bank/boleto",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = generateBoletoSchema.parse(req.body);
      const orgId = req.user!.org_id;
      const result = await generateBoleto({ ...input, orgId });
      if (result.success) {
        created(res, result);
      } else {
        res.status(502).json({ ok: false, error: result.error });
      }
    } catch (err) {
      next(err);
    }
  },
);

// POST /integrations/bank/pix — generate PIX QR code for org
integrationsRouter.post(
  "/integrations/bank/pix",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = generatePixSchema.parse(req.body);
      const orgId = req.user!.org_id;
      const result = await generatePixQR({ ...input, orgId });
      if (result.success) {
        created(res, result);
      } else {
        res.status(502).json({ ok: false, error: result.error });
      }
    } catch (err) {
      next(err);
    }
  },
);
