import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { ok } from "../../lib/response";
import { generateToken } from "../../middleware/auth";
import { authRateLimit } from "../../middleware/security";
import { db } from "../../db";
import { organizations } from "../../db/schema";

export const authRouter = Router();

const tokenRequestSchema = z.object({
  tenantId: z.string().uuid().optional(),
  tenant_id: z.string().uuid().optional(),
  email: z.string().email(),
  role: z.string().max(50).default("user"),
}).transform((data) => ({
  tenantId: data.tenantId ?? data.tenant_id!,
  email: data.email,
  role: data.role,
}));

/**
 * POST /auth/login — Login with email/password (dev: no password check).
 * Finds the first org and generates a token.
 */
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().optional(),
});

authRouter.post(
  "/auth/login",
  authRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = loginSchema.parse(req.body);

      // Dev mode: find first org, no password validation
      const [org] = await db.select().from(organizations).limit(1);
      if (!org) {
        res.status(400).json({ detail: "No organization found. Run seed first." });
        return;
      }

      const token = generateToken({
        sub: input.email,
        org_id: org.id,
        email: input.email,
        role: "admin",
      });

      const refreshToken = generateToken(
        { sub: input.email, org_id: org.id, email: input.email, role: "admin" },
        60 * 24 * 7, // 7 days
      );

      res.json({
        access_token: token,
        refresh_token: refreshToken,
        user: {
          id: input.email,
          email: input.email,
          name: input.email.split("@")[0],
          role: "admin",
          org_id: org.id,
          org_name: org.name,
        },
        orgs: [{ id: org.id, name: org.name }],
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /auth/token — Generate a JWT token.
 * In production, this should validate credentials.
 * Currently mirrors the Python API's token endpoint for dev/testing.
 */
authRouter.post(
  "/auth/token",
  authRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = tokenRequestSchema.parse(req.body);

      // TODO: In production, validate credentials against a user store
      const token = generateToken({
        sub: input.email,
        org_id: input.tenantId,
        email: input.email,
        role: input.role,
      });

      ok(res, {
        access_token: token,
        token_type: "bearer",
      });
    } catch (err) {
      next(err);
    }
  },
);
