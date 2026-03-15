/**
 * Stub routes for frontend pages that call endpoints not yet fully implemented.
 * These return empty/mock data so the UI renders without errors.
 *
 * Covers:
 *   - /agent-tasks      (alias for /agents/tasks + retry/resolve)
 *   - /tasks            (simple task log)
 *   - /documents        (alias for /ai-assistant/documents + upload)
 *   - /analytics/agents (agent performance metrics)
 *   - /org/profile      (organization profile CRUD)
 *   - /org/team         (team management)
 *   - /org/team/invite
 *   - /org/team/:id/remove
 *   - /org/notifications
 *   - /webhooks         (GET list + POST create)
 *   - /api-keys         (GET list + POST create + revoke)
 */

import { Router, Request, Response, NextFunction } from "express";
import { ok, created } from "../../lib/response";
import { db } from "../../db";
import { agentTasks } from "../../db/schema";
import { eq, sql } from "drizzle-orm";

export const stubsRouter = Router();

// ─── /agent-tasks (frontend alias for /agents/tasks) ───

stubsRouter.get(
  "/agent-tasks",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.org_id;
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const status = req.query.status as string | undefined;

      let query = db
        .select()
        .from(agentTasks)
        .where(eq(agentTasks.orgId, orgId))
        .orderBy(sql`${agentTasks.createdAt} desc`)
        .limit(limit);

      const rows = await query;

      const items = rows
        .filter((r) => !status || r.status.toUpperCase() === status.toUpperCase())
        .map((r) => ({
          id: r.id,
          type: r.taskType,
          status: r.status.toUpperCase(),
          payload: r.input ?? {},
          created_at: r.createdAt,
        }));

      ok(res, items);
    } catch (err) {
      next(err);
    }
  },
);

stubsRouter.post(
  "/agent-tasks/:id/retry",
  async (_req: Request, res: Response) => {
    ok(res, { status: "queued", message: "Task queued for retry" });
  },
);

stubsRouter.post(
  "/agent-tasks/:id/resolve",
  async (_req: Request, res: Response) => {
    ok(res, { status: "resolved", message: "Task resolved" });
  },
);

// ─── /tasks (BillingAgent task log) ───

stubsRouter.get(
  "/tasks",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.org_id;

      const rows = await db
        .select()
        .from(agentTasks)
        .where(eq(agentTasks.orgId, orgId))
        .orderBy(sql`${agentTasks.createdAt} desc`)
        .limit(200);

      const items = rows.map((r) => ({
        id: r.id,
        type: r.taskType,
        status: r.status.toUpperCase(),
        payload: r.input ?? {},
        created_at: r.createdAt,
      }));

      ok(res, items);
    } catch (err) {
      next(err);
    }
  },
);

stubsRouter.post("/tasks", async (_req: Request, res: Response) => {
  created(res, {
    id: crypto.randomUUID(),
    status: "PENDING",
    message: "Task created",
  });
});

// ─── /documents (alias for ai-assistant/documents + upload stub) ───

stubsRouter.get(
  "/documents",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Proxy to the ai-assistant documents endpoint logic
      // For now return empty array — the real data is at /ai-assistant/documents
      ok(res, []);
    } catch (err) {
      next(err);
    }
  },
);

stubsRouter.post(
  "/documents/upload",
  async (_req: Request, res: Response) => {
    created(res, {
      id: crypto.randomUUID(),
      status: "uploaded",
      message: "Document uploaded successfully",
    });
  },
);

// ─── /analytics/agents ───

stubsRouter.get(
  "/analytics/agents",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.org_id;

      const rows = await db
        .select()
        .from(agentTasks)
        .where(eq(agentTasks.orgId, orgId));

      const total = rows.length;
      const done = rows.filter((r) => r.status === "done").length;
      const escalated = rows.filter((r) => r.status === "escalated").length;
      const failed = rows.filter((r) => r.status === "failed").length;

      const byType: Record<string, { total: number; done: number; escalated: number; failed: number; automation_rate_pct: number; escalation_rate_pct: number }> = {};
      for (const r of rows) {
        const t = r.taskType;
        if (!byType[t]) {
          byType[t] = { total: 0, done: 0, escalated: 0, failed: 0, automation_rate_pct: 0, escalation_rate_pct: 0 };
        }
        byType[t].total++;
        if (r.status === "done") byType[t].done++;
        if (r.status === "escalated") byType[t].escalated++;
        if (r.status === "failed") byType[t].failed++;
      }

      for (const key of Object.keys(byType)) {
        const entry = byType[key];
        entry.automation_rate_pct = entry.total > 0 ? Math.round((entry.done / entry.total) * 1000) / 10 : 0;
        entry.escalation_rate_pct = entry.total > 0 ? Math.round((entry.escalated / entry.total) * 1000) / 10 : 0;
      }

      ok(res, {
        overall: {
          total_tasks: total,
          automation_rate_pct: total > 0 ? Math.round((done / total) * 1000) / 10 : 0,
          escalation_rate_pct: total > 0 ? Math.round((escalated / total) * 1000) / 10 : 0,
        },
        by_task_type: byType,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── /org/profile ───

stubsRouter.get("/org/profile", async (req: Request, res: Response) => {
  ok(res, {
    id: req.user!.org_id,
    name: "Minha Imobiliária",
    email: req.user!.email ?? "contato@imobiliaria.com",
    phone: "",
    document: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    plan: "Professional",
  });
});

stubsRouter.post("/org/profile", async (_req: Request, res: Response) => {
  ok(res, { message: "Profile updated" });
});

// ─── /org/team ───

stubsRouter.get("/org/team", async (req: Request, res: Response) => {
  ok(res, [
    {
      id: req.user!.sub ?? "1",
      name: req.user!.email?.split("@")[0] ?? "Admin",
      email: req.user!.email ?? "",
      role: "admin",
      status: "active",
      joined_at: new Date().toISOString(),
    },
  ]);
});

stubsRouter.post("/org/team/invite", async (_req: Request, res: Response) => {
  created(res, { message: "Invite sent" });
});

stubsRouter.post("/org/team/:id/remove", async (_req: Request, res: Response) => {
  ok(res, { message: "Member removed" });
});

// ─── /org/notifications ───

stubsRouter.post("/org/notifications", async (_req: Request, res: Response) => {
  ok(res, { message: "Notification preferences saved" });
});

// ─── /webhooks (GET list for settings page) ───
// Note: POST webhooks for external services (santander/evolution) are in webhooks/router.ts

stubsRouter.get("/webhooks", async (_req: Request, res: Response) => {
  ok(res, []);
});

stubsRouter.post("/webhooks", async (_req: Request, res: Response) => {
  created(res, {
    id: crypto.randomUUID(),
    active: true,
    message: "Webhook created",
  });
});

// ─── /api-keys ───

stubsRouter.get("/api-keys", async (_req: Request, res: Response) => {
  ok(res, []);
});

stubsRouter.post("/api-keys", async (req: Request, res: Response) => {
  const name = req.body?.name ?? "key";
  const id = crypto.randomUUID();
  const prefix = `rso_${id.slice(0, 8)}`;
  created(res, {
    id,
    key: `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`,
    name,
  });
});

stubsRouter.post("/api-keys/:id/revoke", async (_req: Request, res: Response) => {
  ok(res, { message: "API key revoked" });
});
