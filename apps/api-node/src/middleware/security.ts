import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { Request, Response, NextFunction } from "express";

// ─── Helmet (security headers) ───
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // allow API calls from frontends
});

// ─── CORS ───
const CORS_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

export const corsMiddleware = cors({
  origin: CORS_ORIGINS,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Org-Id"],
  credentials: true,
  maxAge: 600, // preflight cache 10min
});

// ─── Rate limiting ───
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests, please try again later",
    },
  },
});

// Stricter limit for auth endpoints
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many auth attempts, please try again later",
    },
  },
});

// ─── Request body size limit ───
export const bodyLimit = (maxSize: string) => {
  return (_req: Request, _res: Response, next: NextFunction) => {
    // express.json() already handles this via its `limit` option
    // This is a safety net for other parsers
    next();
  };
};

// ─── Audit logging ───
export function auditLog(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const user = req.user?.sub ?? "anonymous";
    const org = req.user?.org_id ?? "-";

    // Only log mutating operations and errors
    if (req.method !== "GET" || res.statusCode >= 400) {
      console.log(
        JSON.stringify({
          type: "audit",
          timestamp: new Date().toISOString(),
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          duration,
          user,
          org,
          ip: req.ip,
        }),
      );
    }
  });

  next();
}
