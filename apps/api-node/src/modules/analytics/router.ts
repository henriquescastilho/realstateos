import { Router, Request, Response, NextFunction } from "express";
import { ok } from "../../lib/response";
import { db } from "../../db";
import { leaseContracts, properties, charges, agentTasks, tenants, owners } from "../../db/schema";
import { eq, and, sql, gte, lte, desc } from "drizzle-orm";

export const analyticsRouter = Router();

// GET /analytics/portfolio
analyticsRouter.get(
  "/analytics/portfolio",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.org_id;

      const [contractRows] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(leaseContracts)
        .where(
          and(
            eq(leaseContracts.orgId, orgId),
            eq(leaseContracts.operationalStatus, "active"),
          ),
        );

      const [propertyRows] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(properties)
        .where(eq(properties.orgId, orgId));

      const [revenueRow] = await db
        .select({
          total: sql<number>`coalesce(sum(${leaseContracts.rentAmount}::numeric), 0)::float`,
        })
        .from(leaseContracts)
        .where(
          and(
            eq(leaseContracts.orgId, orgId),
            eq(leaseContracts.operationalStatus, "active"),
          ),
        );

      // Default rate: overdue charges in last 3 months / total charges in last 3 months
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const threeMonthsAgoStr = threeMonthsAgo.toISOString().slice(0, 10);

      const [totalCharges3m] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(charges)
        .where(
          and(
            eq(charges.orgId, orgId),
            gte(charges.dueDate, threeMonthsAgoStr),
          ),
        );

      const [overdueCharges3m] = await db
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
        totalCharges3m.count > 0
          ? (overdueCharges3m.count / totalCharges3m.count) * 100
          : 0;

      const [escalations] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(agentTasks)
        .where(
          and(
            eq(agentTasks.orgId, orgId),
            eq(agentTasks.status, "escalated"),
          ),
        );

      ok(res, {
        active_contracts: contractRows.count,
        total_properties: propertyRows.count,
        monthly_revenue: revenueRow.total,
        default_rate_3m_pct: Math.round(defaultRate * 10) / 10,
        open_escalations: escalations.count,
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /analytics/billing
analyticsRouter.get(
  "/analytics/billing",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.org_id;

      const rows = await db
        .select({
          month: charges.billingPeriod,
          total_charged: sql<number>`coalesce(sum(${charges.grossAmount}::numeric), 0)::float`,
          total_paid: sql<number>`coalesce(sum(case when ${charges.paymentStatus} = 'paid' then ${charges.grossAmount}::numeric else 0 end), 0)::float`,
        })
        .from(charges)
        .where(eq(charges.orgId, orgId))
        .groupBy(charges.billingPeriod)
        .orderBy(charges.billingPeriod);

      const months = rows.map((r) => ({
        month: r.month,
        total_charged: r.total_charged,
        total_paid: r.total_paid,
        payment_rate_pct:
          r.total_charged > 0
            ? Math.round((r.total_paid / r.total_charged) * 1000) / 10
            : 0,
      }));

      ok(res, { months });
    } catch (err) {
      next(err);
    }
  },
);

// GET /analytics/tasks (recent agent tasks for activity feed)
analyticsRouter.get(
  "/analytics/tasks",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.org_id;
      const perPage = Math.min(Number(req.query.per_page) || 10, 50);

      const rows = await db
        .select()
        .from(agentTasks)
        .where(eq(agentTasks.orgId, orgId))
        .orderBy(sql`${agentTasks.createdAt} desc`)
        .limit(perPage);

      const items = rows.map((r) => ({
        id: r.id,
        type: r.taskType,
        status: r.status.toUpperCase(),
        payload: r.input,
        created_at: r.createdAt,
      }));

      ok(res, items);
    } catch (err) {
      next(err);
    }
  },
);

// GET /analytics/delinquent — List overdue charges with tenant and property details
analyticsRouter.get(
  "/analytics/delinquent",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.org_id;

      const rows = await db
        .select({
          tenant_name: tenants.fullName,
          tenant_email: tenants.email,
          property_address: properties.address,
          billing_period: charges.billingPeriod,
          amount: charges.grossAmount,
          due_date: charges.dueDate,
          days_overdue: sql<number>`(current_date - ${charges.dueDate}::date)::int`,
        })
        .from(charges)
        .innerJoin(leaseContracts, eq(charges.leaseContractId, leaseContracts.id))
        .innerJoin(tenants, eq(leaseContracts.tenantId, tenants.id))
        .innerJoin(properties, eq(leaseContracts.propertyId, properties.id))
        .where(
          and(
            eq(charges.orgId, orgId),
            eq(charges.paymentStatus, "overdue"),
          ),
        )
        .orderBy(desc(sql`(current_date - ${charges.dueDate}::date)`));

      ok(res, rows);
    } catch (err) {
      next(err);
    }
  },
);

// GET /analytics/expiring-contracts — Contracts expiring this month or next month
analyticsRouter.get(
  "/analytics/expiring-contracts",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.org_id;

      // Window: first day of current month to last day of next month
      const now = new Date();
      const firstOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .slice(0, 10);
      const lastOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0)
        .toISOString()
        .slice(0, 10);

      const rows = await db
        .select({
          contract_id: leaseContracts.id,
          property_address: properties.address,
          tenant_name: tenants.fullName,
          owner_name: owners.fullName,
          end_date: leaseContracts.endDate,
          end_day: sql<number>`extract(day from ${leaseContracts.endDate}::date)::int`,
          monthly_rent: leaseContracts.rentAmount,
          readjustment_rule: leaseContracts.readjustmentRule,
        })
        .from(leaseContracts)
        .innerJoin(properties, eq(leaseContracts.propertyId, properties.id))
        .innerJoin(tenants, eq(leaseContracts.tenantId, tenants.id))
        .innerJoin(owners, eq(leaseContracts.ownerId, owners.id))
        .where(
          and(
            eq(leaseContracts.orgId, orgId),
            eq(leaseContracts.operationalStatus, "active"),
            gte(leaseContracts.endDate, firstOfCurrentMonth),
            lte(leaseContracts.endDate, lastOfNextMonth),
          ),
        )
        .orderBy(leaseContracts.endDate);

      ok(res, rows);
    } catch (err) {
      next(err);
    }
  },
);
