import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UnauthorizedError, ForbiddenError } from "../lib/errors";

// ─── Config ───

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ALGORITHM = "HS256";

if (!JWT_SECRET && process.env.NODE_ENV !== "test") {
  throw new Error("JWT_SECRET environment variable is required");
}

// ─── Types ───

export interface JWTPayload {
  sub: string; // user/service ID
  org_id: string; // organization ID (multi-tenant)
  email?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

// Extend Express Request to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

// ─── Middleware ───

/**
 * JWT authentication middleware.
 * Extracts and verifies Bearer token from Authorization header.
 * Attaches decoded payload to req.user.
 *
 * In development (no JWT_SECRET set), allows unauthenticated access
 * with a synthetic user for testing convenience.
 */
export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  // Test-only bypass — only allowed when NODE_ENV=test and JWT_SECRET is not configured
  if (!JWT_SECRET && process.env.NODE_ENV === "test") {
    req.user = {
      sub: "dev-user",
      org_id: (req.headers["x-org-id"] as string) || "dev-placeholder-org-id", // example fallback for dev mode
      email: "dev@localhost",
      role: "admin",
    };
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    throw new UnauthorizedError("Missing Authorization header");
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    throw new UnauthorizedError("Authorization header must be: Bearer <token>");
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    }) as JWTPayload;

    if (!decoded.sub || !decoded.org_id) {
      throw new UnauthorizedError(
        "Token missing required claims (sub, org_id)",
      );
    }

    req.user = decoded;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError("Token expired");
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError("Invalid token");
    }
    throw err;
  }
}

/**
 * Org-scoping middleware.
 * Ensures the authenticated user's org_id matches the orgId in the request body or query.
 * Must be used AFTER requireAuth.
 */
export function requireOrgMatch(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const user = req.user;
  if (!user) {
    throw new UnauthorizedError("Authentication required");
  }

  // Check body.orgId or query.orgId
  const requestOrgId = req.body?.orgId || req.query?.orgId;

  if (requestOrgId && requestOrgId !== user.org_id) {
    throw new ForbiddenError("Access denied: org_id mismatch");
  }

  next();
}

/**
 * Role-based access control middleware.
 * Restricts access to users with specific roles.
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedError("Authentication required");
    }

    if (!user.role || !allowedRoles.includes(user.role)) {
      throw new ForbiddenError(`Required role: ${allowedRoles.join(" or ")}`);
    }

    next();
  };
}

/**
 * Generate a JWT token (for /auth/token endpoint and testing).
 */
export function generateToken(
  payload: Omit<JWTPayload, "iat" | "exp">,
  expiresInMinutes = 60,
): string {
  const secret = JWT_SECRET || "dev-secret";
  return jwt.sign(payload, secret, {
    algorithm: JWT_ALGORITHM,
    expiresIn: `${expiresInMinutes}m`,
  });
}
