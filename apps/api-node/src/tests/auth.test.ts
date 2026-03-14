/**
 * Unit tests for auth middleware.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Request, Response, NextFunction } from "express";
import { generateToken, requireAuth, requireOrgMatch, requireRole } from "../middleware/auth";
import { UnauthorizedError, ForbiddenError } from "../lib/errors";

// ─── Helpers ───────────────────────────────────────────────────────────────

function mockReq(overrides?: Partial<Request>): Partial<Request> {
  return { headers: {}, body: {}, query: {}, ...overrides };
}

const mockRes = {} as Response;
const mockNext = vi.fn() as NextFunction;

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── generateToken ─────────────────────────────────────────────────────────

describe("generateToken", () => {
  it("returns a non-empty string", () => {
    const token = generateToken({ sub: "user-1", org_id: "org-1", role: "admin" });
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("generates distinct tokens for different payloads", () => {
    const a = generateToken({ sub: "user-1", org_id: "org-1" });
    const b = generateToken({ sub: "user-2", org_id: "org-2" });
    expect(a).not.toBe(b);
  });
});

// ─── requireAuth (test-bypass mode) ───────────────────────────────────────

describe("requireAuth — test mode (no JWT_SECRET)", () => {
  it("injects dev user when NODE_ENV=test and no secret", () => {
    const req = mockReq({ headers: { "x-org-id": "org-abc" } });
    requireAuth(req as Request, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledOnce();
    expect((req as Request).user?.org_id).toBe("org-abc");
    expect((req as Request).user?.role).toBe("admin");
  });

  it("uses fallback org_id when x-org-id header absent", () => {
    const req = mockReq();
    requireAuth(req as Request, mockRes, mockNext);
    expect((req as Request).user?.org_id).toBe("dev-placeholder-org-id");
  });
});

// Note: requireAuth JWT validation path requires JWT_SECRET to be set at module load time.
// Integration tests (with a real server) cover that path end-to-end.

// ─── requireOrgMatch ───────────────────────────────────────────────────────

describe("requireOrgMatch", () => {
  it("passes when no orgId in body/query", () => {
    const req = mockReq();
    (req as Request).user = { sub: "u1", org_id: "org-1" };
    requireOrgMatch(req as Request, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledOnce();
  });

  it("passes when orgId matches user org_id", () => {
    const req = mockReq({ body: { orgId: "org-1" } });
    (req as Request).user = { sub: "u1", org_id: "org-1" };
    requireOrgMatch(req as Request, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledOnce();
  });

  it("throws ForbiddenError when orgId mismatches user org_id", () => {
    const req = mockReq({ body: { orgId: "org-2" } });
    (req as Request).user = { sub: "u1", org_id: "org-1" };
    expect(() => requireOrgMatch(req as Request, mockRes, mockNext)).toThrow(ForbiddenError);
  });

  it("throws UnauthorizedError when user is not authenticated", () => {
    const req = mockReq();
    expect(() => requireOrgMatch(req as Request, mockRes, mockNext)).toThrow(UnauthorizedError);
  });
});

// ─── requireRole ───────────────────────────────────────────────────────────

describe("requireRole", () => {
  it("passes when user has required role", () => {
    const req = mockReq();
    (req as Request).user = { sub: "u1", org_id: "org-1", role: "admin" };
    const middleware = requireRole("admin", "manager");
    middleware(req as Request, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledOnce();
  });

  it("throws ForbiddenError when user role not in allowed list", () => {
    const req = mockReq();
    (req as Request).user = { sub: "u1", org_id: "org-1", role: "viewer" };
    const middleware = requireRole("admin");
    expect(() => middleware(req as Request, mockRes, mockNext)).toThrow(ForbiddenError);
  });

  it("throws UnauthorizedError when user not set", () => {
    const req = mockReq();
    const middleware = requireRole("admin");
    expect(() => middleware(req as Request, mockRes, mockNext)).toThrow(UnauthorizedError);
  });
});
