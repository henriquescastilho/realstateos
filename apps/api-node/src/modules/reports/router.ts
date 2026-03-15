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

      // Occupancy rate as decimal (0-1)
      const occupancyRate =
        propCount.count > 0
          ? activeContracts.count / propCount.count
          : 0;

      // Monthly revenue (average per month from paid charges)
      const [revenueData] = await db
        .select({
          total: sql<number>`coalesce(sum(case when ${charges.paymentStatus} = 'paid' then ${charges.grossAmount}::numeric else 0 end), 0)::float`,
          months: sql<number>`greatest(count(distinct ${charges.billingPeriod}), 1)::int`,
          paid_count: sql<number>`count(*) filter (where ${charges.paymentStatus} = 'paid')::int`,
          paid_sum: sql<number>`coalesce(sum(case when ${charges.paymentStatus} = 'paid' then ${charges.grossAmount}::numeric else 0 end), 0)::float`,
        })
        .from(charges)
        .where(eq(charges.orgId, orgId));

      const monthlyRevenue = revenueData.total / revenueData.months;
      const avgTicket = revenueData.paid_count > 0 ? revenueData.paid_sum / revenueData.paid_count : 0;

      // Default rate as decimal (0-1): overdue / total for last 3 months
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

      // Return as decimal 0-1 (frontend multiplies by 100)
      const defaultRate =
        totalCharges.count > 0
          ? overdueCharges.count / totalCharges.count
          : 0;

      ok(res, {
        total_properties: propCount.count,
        active_contracts: activeContracts.count,
        monthly_revenue: monthlyRevenue.toFixed(2),
        occupancy_rate: occupancyRate,
        default_rate: defaultRate,
        avg_ticket: avgTicket.toFixed(2),
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
          expected: sql<number>`coalesce(sum(${charges.grossAmount}::numeric), 0)::float`,
          received: sql<number>`coalesce(sum(case when ${charges.paymentStatus} = 'paid' then ${charges.grossAmount}::numeric else 0 end), 0)::float`,
          overdue: sql<number>`coalesce(sum(case when ${charges.paymentStatus} = 'overdue' then ${charges.grossAmount}::numeric else 0 end), 0)::float`,
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
        rate:
          r.total > 0 ? Math.round((r.overdue / r.total) * 1000) / 10 / 100 : 0,
        overdue_count: r.overdue,
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
