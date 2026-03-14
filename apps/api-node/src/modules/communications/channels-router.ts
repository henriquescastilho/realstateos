import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { ok, created } from "../../lib/response";
import { db } from "../../db";
import { channelConfigs } from "../../db/schema";
import { NotFoundError } from "../../lib/errors";

export const channelsRouter = Router();

const createChannelConfigSchema = z.object({
  orgId: z.string().uuid(),
  channel: z.enum(["email", "whatsapp"]),
  provider: z.string().min(1).max(50),
  config: z.record(z.string(), z.unknown()).default({}),
});

const updateChannelConfigSchema = z.object({
  provider: z.string().min(1).max(50).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

// POST /channels/configs
channelsRouter.post(
  "/channels/configs",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = createChannelConfigSchema.parse(req.body);
      const [config] = await db
        .insert(channelConfigs)
        .values({
          orgId: input.orgId,
          channel: input.channel,
          provider: input.provider,
          config: input.config,
        })
        .onConflictDoUpdate({
          target: [channelConfigs.orgId, channelConfigs.channel],
          set: {
            provider: input.provider,
            config: input.config,
            isActive: true,
          },
        })
        .returning();
      created(res, config);
    } catch (err) {
      next(err);
    }
  },
);

// GET /channels/configs
channelsRouter.get(
  "/channels/configs",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.query.orgId as string;
      const data = await db
        .select()
        .from(channelConfigs)
        .where(eq(channelConfigs.orgId, orgId));
      ok(res, data);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /channels/configs/:id
channelsRouter.put(
  "/channels/configs/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = updateChannelConfigSchema.parse(req.body);
      const updateData: Record<string, unknown> = {};
      if (input.provider !== undefined) updateData.provider = input.provider;
      if (input.config !== undefined) updateData.config = input.config;
      if (input.isActive !== undefined) updateData.isActive = input.isActive;

      const [updated] = await db
        .update(channelConfigs)
        .set(updateData)
        .where(eq(channelConfigs.id, req.params.id))
        .returning();

      if (!updated) {
        throw new NotFoundError("ChannelConfig", req.params.id);
      }

      ok(res, updated);
    } catch (err) {
      next(err);
    }
  },
);
