/**
 * Webhook routes — public endpoints called by external services.
 *
 * These routes do NOT require JWT authentication.
 * Security is handled by:
 *   - IP whitelisting at infra/WAF level
 *   - Payload validation (Zod schema)
 *   - Idempotency checks (duplicate payment detection)
 *   - Rate limiting (global middleware)
 */

import { Router, Request, Response, NextFunction } from "express";
import { ok } from "../../lib/response";
import { santanderWebhookSchema } from "./santander-validator";
import { processSantanderWebhook } from "./santander-service";

export const webhooksRouter = Router();

// POST /webhooks/santander — receive Santander payment notifications
webhooksRouter.post(
  "/webhooks/santander",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = santanderWebhookSchema.parse(req.body);
      const result = await processSantanderWebhook(payload);

      if (result.processed) {
        ok(res, result);
      } else {
        // Return 200 to Santander to prevent retries, but flag as not found
        res.status(200).json({ ok: false, data: result });
      }
    } catch (err) {
      // Always return 200 to Santander to prevent infinite retries
      // Log the error for investigation
      console.error("[webhook:santander] Processing error:", err);

      // If it's a validation error, still return 200 but with error details
      if (err instanceof Error && err.name === "ZodError") {
        res.status(200).json({
          ok: false,
          error: { code: "INVALID_PAYLOAD", message: "Webhook payload validation failed" },
        });
        return;
      }

      // For unexpected errors, pass to error handler
      next(err);
    }
  },
);
