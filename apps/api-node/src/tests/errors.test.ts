/**
 * Unit tests for custom error classes.
 */
import { describe, it, expect } from "vitest";
import {
  AppError,
  NotFoundError,
  ValidationError,
  ConflictError,
  IntegrationError,
  UnauthorizedError,
  ForbiddenError,
} from "../lib/errors";

describe("AppError", () => {
  it("has correct properties", () => {
    const err = new AppError("test", 400, "TEST_CODE", { extra: true });
    expect(err.message).toBe("test");
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("TEST_CODE");
    expect(err.details).toEqual({ extra: true });
    expect(err instanceof Error).toBe(true);
  });
});

describe("NotFoundError", () => {
  it("includes entity and id in message", () => {
    const err = new NotFoundError("Contract", "abc-123");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toContain("Contract");
    expect(err.message).toContain("abc-123");
  });

  it("works without id", () => {
    const err = new NotFoundError("Contract");
    expect(err.message).toContain("Contract");
  });
});

describe("ValidationError", () => {
  it("has 422 status", () => {
    const err = new ValidationError("bad input", { field: "email" });
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details).toEqual({ field: "email" });
  });
});

describe("ConflictError", () => {
  it("has 409 status", () => {
    const err = new ConflictError("duplicate");
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe("CONFLICT");
  });
});

describe("IntegrationError", () => {
  it("includes provider in message", () => {
    const err = new IntegrationError("Santander", "webhook failed");
    expect(err.statusCode).toBe(502);
    expect(err.code).toBe("INTEGRATION_ERROR");
    expect(err.message).toContain("Santander");
    expect(err.message).toContain("webhook failed");
  });
});

describe("UnauthorizedError", () => {
  it("has 401 status with default message", () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe("Unauthorized");
  });

  it("accepts custom message", () => {
    const err = new UnauthorizedError("Token expired");
    expect(err.message).toBe("Token expired");
  });
});

describe("ForbiddenError", () => {
  it("has 403 status", () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe("Forbidden");
  });
});
