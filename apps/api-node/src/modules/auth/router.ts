import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ok } from "../../lib/response";
import { generateToken } from "../../middleware/auth";
import { authRateLimit } from "../../middleware/security";

export const authRouter = Router();

const tokenRequestSchema = z.object({
  tenantId: z.string().uuid(),
  email: z.string().email(),
  role: z.string().max(50).default("user"),
});

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
