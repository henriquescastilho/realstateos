import { Router, Request, Response, NextFunction } from "express";
import { ok } from "../../lib/response";
import { db } from "../../db";
import { properties, leaseContracts, charges, maintenanceTickets } from "../../db/schema";
import { eq, and, sql, gte } from "drizzle-orm";

export const reportsRouter = Router();

// GET /reports/kpis — real portfolio KPIs
reportsRouter.get(
  "/reports/kpis",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.org_id;

      const [propCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(properties)
        .where(eq(properties.orgId, orgId));

      const [activeContracts] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(leaseContracts)
        .where(
          and(
            eq(leaseContracts.orgId, orgId),
            eq(leaseContracts.operationalStatus, "active"),
          ),
        );

      const vacancyRate =
        propCount.count > 0
          ? Math.round(((propCount.count - activeContracts.count) / propCount.count) * 1000) / 10
          : 0;

      const [revenue] = await db
        .select({
          total: sql<number>`coalesce(sum(case when ${charges.paymentStatus} = 'paid' then ${charges.grossAmount}::numeric else 0 end), 0)::float`,
        })
        .from(charges)
        .where(eq(charges.orgId, orgId));

      // Default rate: overdue / (overdue + paid + open) for last 3 months
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const threeMonthsAgoStr = threeMonthsAgo.toISOString().slice(0, 10);

      const [totalCharges] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(charges)
        .where(
          and(eq(charges.orgId, orgId), gte(charges.dueDate, threeMonthsAgoStr)),
        );

      const [overdueCharges] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(charges)
        .where(
          and(
            eq(charges.orgId, orgId),
            gte(charges.dueDate, threeMonthsAgoStr),
            eq(charges.paymentStatus, "overdue"),
          ),
        );

      const defaultRate =
        totalCharges.count > 0
          ? Math.round((overdueCharges.count / totalCharges.count) * 1000) / 10
          : 0;

      ok(res, {
        total_properties: propCount.count,
        occupied: activeContracts.count,
        vacancy_rate: vacancyRate,
        total_revenue: revenue.total,
        total_expenses: 0, // expenses module not yet implemented
        net_income: revenue.total,
        default_rate: defaultRate,
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /reports/revenue — monthly revenue trend (last 6 months)
reportsRouter.get(
  "/reports/revenue",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.org_id;

      const rows = await db
        .select({
          month: charges.billingPeriod,
          charged: sql<number>`coalesce(sum(${charges.grossAmount}::numeric), 0)::float`,
          received: sql<number>`coalesce(sum(case when ${charges.paymentStatus} = 'paid' then ${charges.grossAmount}::numeric else 0 end), 0)::float`,
        })
        .from(charges)
        .where(eq(charges.orgId, orgId))
        .groupBy(charges.billingPeriod)
        .orderBy(charges.billingPeriod);

      ok(res, rows);
    } catch (err) {
      next(err);
    }
  },
);

// GET /reports/default-trend — monthly default rate trend
reportsRouter.get(
  "/reports/default-trend",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.org_id;

      const rows = await db
        .select({
          month: charges.billingPeriod,
          total: sql<number>`count(*)::int`,
          overdue: sql<number>`count(*) filter (where ${charges.paymentStatus} = 'overdue')::int`,
        })
        .from(charges)
        .where(eq(charges.orgId, orgId))
        .groupBy(charges.billingPeriod)
        .orderBy(charges.billingPeriod);

      const trend = rows.map((r) => ({
        month: r.month,
        total_charges: r.total,
        overdue_charges: r.overdue,
        default_rate_pct:
          r.total > 0 ? Math.round((r.overdue / r.total) * 1000) / 10 : 0,
      }));

      ok(res, trend);
    } catch (err) {
      next(err);
    }
  },
);

// GET /reports/maintenance — monthly maintenance cost/ticket summary
reportsRouter.get(
  "/reports/maintenance",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.org_id;

      const rows = await db
        .select({
          month: sql<string>`to_char(${maintenanceTickets.createdAt}, 'YYYY-MM')`,
          tickets: sql<number>`count(*)::int`,
        })
        .from(maintenanceTickets)
        .where(eq(maintenanceTickets.orgId, orgId))
        .groupBy(sql`to_char(${maintenanceTickets.createdAt}, 'YYYY-MM')`)
        .orderBy(sql`to_char(${maintenanceTickets.createdAt}, 'YYYY-MM')`);

      const result = rows.map((r) => ({
        month: r.month,
        cost: 0,
        tickets: r.tickets,
      }));

      ok(res, result);
    } catch (err) {
      next(err);
    }
  },
);

reportsRouter.post("/reports/export", (_req: Request, res: Response) => {
  ok(res, { url: null, message: "Export not yet implemented" });
});
