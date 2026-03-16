import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { ok } from "../../lib/response";
import { generateToken } from "../../middleware/auth";
import { authRateLimit } from "../../middleware/security";
import { db } from "../../db";
import { organizations, owners } from "../../db/schema";

export const authRouter = Router();

const tokenRequestSchema = z
  .object({
    tenantId: z.string().uuid().optional(),
    tenant_id: z.string().uuid().optional(),
    email: z.string().email(),
    role: z.string().max(50).default("user"),
  })
  .transform((data) => ({
    tenantId: data.tenantId ?? data.tenant_id!,
    email: data.email,
    role: data.role,
  }));

/**
 * POST /auth/login — Login para admin da imobiliária (dev: sem validação de senha).
 * Proprietários e inquilinos NÃO logam — recebem extrato/boleto/avisos por email.
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

      // Find org
      const [org] = await db.select().from(organizations).limit(1);
      if (!org) {
        res
          .status(400)
          .json({ detail: "No organization found. Run seed first." });
        return;
      }

      // Resolve display name: check owners table, fallback to org name
      let displayName = org.name;
      try {
        const [ownerRecord] = await db
          .select({ fullName: owners.fullName })
          .from(owners)
          .where(eq(owners.email, input.email))
          .limit(1);
        if (ownerRecord?.fullName) displayName = ownerRecord.fullName;
      } catch {
        // owners table may have different schema — use org name
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
          name: displayName,
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
 * POST /auth/register — Create org + return JWT.
 */
const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  org_name: z.string().min(1),
  password: z.string().optional(),
});

authRouter.post(
  "/auth/register",
  authRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = registerSchema.parse(req.body);

      // Reuse existing org or create new one
      let [org] = await db.select().from(organizations).limit(1);
      if (!org) {
        const [created] = await db
          .insert(organizations)
          .values({ name: input.org_name })
          .returning();
        org = created;
      }

      const token = generateToken({
        sub: input.email,
        org_id: org.id,
        email: input.email,
        role: "admin",
      });

      const refreshToken = generateToken(
        { sub: input.email, org_id: org.id, email: input.email, role: "admin" },
        60 * 24 * 7,
      );

      res.status(201).json({
        access_token: token,
        refresh_token: refreshToken,
        user: {
          id: input.email,
          email: input.email,
          name: input.name,
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
 * POST /auth/refresh — Refresh access token.
 */
const refreshSchema = z.object({ refresh_token: z.string() });

authRouter.post(
  "/auth/refresh",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refresh_token } = refreshSchema.parse(req.body);
      // Decode without strict verify for simplicity — just re-issue
      const parts = refresh_token.split(".");
      if (parts.length !== 3) {
        res.status(401).json({ detail: "Invalid token" });
        return;
      }
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      const token = generateToken({
        sub: payload.sub,
        org_id: payload.org_id,
        email: payload.email,
        role: payload.role ?? "admin",
      });
      res.json({ access_token: token });
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
