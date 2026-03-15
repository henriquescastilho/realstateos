import { Router, Request, Response } from "express";
import { ok } from "../../lib/response";

export const reportsRouter = Router();

// Stub endpoints — return empty/zero data until reports module is fully implemented

reportsRouter.get("/reports/kpis", (_req: Request, res: Response) => {
  ok(res, {
    total_properties: 0,
    occupied: 0,
    vacancy_rate: 0,
    total_revenue: 0,
    total_expenses: 0,
    net_income: 0,
    default_rate: 0,
  });
});

reportsRouter.get("/reports/revenue", (_req: Request, res: Response) => {
  ok(res, []);
});

reportsRouter.get("/reports/default-trend", (_req: Request, res: Response) => {
  ok(res, []);
});

reportsRouter.get("/reports/maintenance", (_req: Request, res: Response) => {
  ok(res, []);
});

reportsRouter.post("/reports/export", (_req: Request, res: Response) => {
  ok(res, { url: null, message: "Export not yet implemented" });
});
