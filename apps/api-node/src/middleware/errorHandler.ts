import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors";
import { errorResponse } from "../lib/response";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    const details: Record<string, unknown> = {
      issues: err.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    };
    errorResponse(res, 422, "VALIDATION_ERROR", "Invalid request data", details);
    return;
  }

  // Known app errors
  if (err instanceof AppError) {
    errorResponse(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  // Unknown errors — log internally, return generic message
  console.error("[unhandled_error]", err);
  errorResponse(res, 500, "INTERNAL_ERROR", "An unexpected error occurred");
}
