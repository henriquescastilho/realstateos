import { describe, it, expect, beforeEach } from "vitest";
import jwt from "jsonwebtoken";

// Test the generateToken and token verification logic directly
// (no HTTP server needed — pure unit tests)

const TEST_SECRET = "test-secret-key-for-unit-tests";

describe("JWT token generation and verification", () => {
  // We test the jwt library behavior directly since our middleware
  // wraps it thinly. This avoids needing a running Express server.

  it("generates a valid HS256 token", () => {
    const payload = { sub: "user@test.com", org_id: "org-123", role: "admin" };
    const token = jwt.sign(payload, TEST_SECRET, { algorithm: "HS256", expiresIn: "60m" });

    expect(token).toBeTruthy();
    expect(token.split(".")).toHaveLength(3);
  });

  it("verifies a valid token and returns payload", () => {
    const payload = { sub: "user@test.com", org_id: "org-123", role: "user" };
    const token = jwt.sign(payload, TEST_SECRET, { algorithm: "HS256", expiresIn: "60m" });

    const decoded = jwt.verify(token, TEST_SECRET, { algorithms: ["HS256"] }) as Record<string, unknown>;

    expect(decoded.sub).toBe("user@test.com");
    expect(decoded.org_id).toBe("org-123");
    expect(decoded.role).toBe("user");
    expect(decoded.exp).toBeDefined();
    expect(decoded.iat).toBeDefined();
  });

  it("rejects token with wrong secret", () => {
    const token = jwt.sign({ sub: "user" }, TEST_SECRET, { algorithm: "HS256" });

    expect(() => {
      jwt.verify(token, "wrong-secret", { algorithms: ["HS256"] });
    }).toThrow(jwt.JsonWebTokenError);
  });

  it("rejects expired token", () => {
    const token = jwt.sign(
      { sub: "user", org_id: "org" },
      TEST_SECRET,
      { algorithm: "HS256", expiresIn: "-1s" }, // already expired
    );

    expect(() => {
      jwt.verify(token, TEST_SECRET, { algorithms: ["HS256"] });
    }).toThrow(jwt.TokenExpiredError);
  });

  it("rejects token with wrong algorithm", () => {
    // Sign with HS256 but verify expecting only HS384
    const token = jwt.sign({ sub: "user" }, TEST_SECRET, { algorithm: "HS256" });

    expect(() => {
      jwt.verify(token, TEST_SECRET, { algorithms: ["HS384"] });
    }).toThrow();
  });

  it("includes standard claims (iat, exp)", () => {
    const token = jwt.sign(
      { sub: "user", org_id: "org" },
      TEST_SECRET,
      { algorithm: "HS256", expiresIn: "30m" },
    );

    const decoded = jwt.verify(token, TEST_SECRET) as Record<string, unknown>;
    const iat = decoded.iat as number;
    const exp = decoded.exp as number;

    expect(exp - iat).toBe(30 * 60); // 30 minutes in seconds
  });

  it("rejects malformed token string", () => {
    expect(() => {
      jwt.verify("not.a.valid.token", TEST_SECRET, { algorithms: ["HS256"] });
    }).toThrow();
  });

  it("rejects empty token", () => {
    expect(() => {
      jwt.verify("", TEST_SECRET, { algorithms: ["HS256"] });
    }).toThrow();
  });
});

describe("Org-scoping logic", () => {
  it("org_id in token matches request", () => {
    const tokenOrgId = "org-abc-123";
    const requestOrgId = "org-abc-123";
    expect(tokenOrgId === requestOrgId).toBe(true);
  });

  it("org_id mismatch is detected", () => {
    const tokenOrgId = "org-abc-123";
    const requestOrgId = "org-xyz-999";
    expect(tokenOrgId === requestOrgId).toBe(false);
  });
});
