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
} from "./service";

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
