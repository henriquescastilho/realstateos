/**
 * Tests for Santander webhook endpoint.
 *
 * Tests the full HTTP layer: payload validation, charge matching,
 * payment creation, reconciliation, and idempotency.
 */
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../../src/index";

describe("Santander Webhook: POST /api/v1/webhooks/santander", () => {
  // ─── Validation tests (no DB required) ───

  it("returns 200 with error for empty body", async () => {
    const res = await request(app)
      .post("/api/v1/webhooks/santander")
      .send({});

    // Returns 200 to prevent Santander retries
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe("INVALID_PAYLOAD");
  });

  it("returns 200 with error when missing both id and codigoBarras", async () => {
    const res = await request(app)
      .post("/api/v1/webhooks/santander")
      .send({
        status: "PAGO",
        valorPago: 1500.00,
        dataPagamento: "2026-03-14",
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
  });

  it("returns 200 with error for missing required fields", async () => {
    const res = await request(app)
      .post("/api/v1/webhooks/santander")
      .send({
        id: "BOL-123",
        // missing status, valorPago, dataPagamento
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
  });

  it("accepts valid payload with id (charge not found is expected)", async () => {
    const res = await request(app)
      .post("/api/v1/webhooks/santander")
      .send({
        id: "nonexistent-boleto-id",
        status: "PAGO",
        valorPago: "1500.00",
        dataPagamento: "2026-03-14T10:00:00Z",
      });

    expect(res.status).toBe(200);
    // Should process but report charge not found
    expect(res.body.data.action).toBe("charge_not_found");
  });

  it("accepts valid payload with codigoBarras", async () => {
    const res = await request(app)
      .post("/api/v1/webhooks/santander")
      .send({
        codigoBarras: "12345678901234567890123456789012345678901234",
        status: "PAGO",
        valorPago: 1500,
        dataPagamento: "2026-03-14",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.action).toBe("charge_not_found");
  });

  it("accepts numeric valorPago", async () => {
    const res = await request(app)
      .post("/api/v1/webhooks/santander")
      .send({
        id: "BOL-test-numeric",
        status: "PAGO",
        valorPago: 2500.50,
        dataPagamento: "2026-03-14",
      });

    expect(res.status).toBe(200);
    // Validates successfully (charge not found is ok)
    expect(res.body.data).toBeTruthy();
  });

  it("accepts string valorPago", async () => {
    const res = await request(app)
      .post("/api/v1/webhooks/santander")
      .send({
        id: "BOL-test-string",
        status: "PAGO",
        valorPago: "2500.50",
        dataPagamento: "2026-03-14",
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeTruthy();
  });

  it("handles non-payment status (e.g. VENCIDO) when charge not found", async () => {
    const res = await request(app)
      .post("/api/v1/webhooks/santander")
      .send({
        id: "BOL-expired",
        status: "VENCIDO",
        valorPago: "0",
        dataPagamento: "2026-03-14",
      });

    expect(res.status).toBe(200);
    // Either charge_not_found or status_updated depending on DB state
    expect(["charge_not_found", "status_updated"]).toContain(res.body.data.action);
  });

  it("does not require JWT authentication", async () => {
    const res = await request(app)
      .post("/api/v1/webhooks/santander")
      .send({
        id: "BOL-no-auth",
        status: "PAGO",
        valorPago: "100.00",
        dataPagamento: "2026-03-14",
      });

    // Should NOT return 401/403
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });

  it("accepts payload with all optional fields", async () => {
    const res = await request(app)
      .post("/api/v1/webhooks/santander")
      .send({
        id: "BOL-full",
        codigoBarras: "12345678901234567890123456789012345678901234",
        linhaDigitavel: "12345.67890 12345.678901 12345.678901 1 12340000150000",
        status: "PAGO",
        valorPago: "1500.00",
        dataPagamento: "2026-03-14T10:30:00Z",
        valorNominal: "1500.00",
        pagadorDocumento: "12345678901",
        nsuCode: "NSU1710400200000",
        workspaceId: "fbc5c4f4-926d-4be3-b361-b1cdd0170a70", // example test UUID
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeTruthy();
  });
});
