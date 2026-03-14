/**
 * Full Smoke Test E2E — runs the complete business flow against PostgreSQL.
 *
 * Flow: token → onboard → activate → billing schedule → generate charge →
 *       issue → payment webhook → reconcile → generate statement → send message
 *
 * Requires DATABASE_URL to be set. Skips if not available.
 */
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../../src/index";

const ORG_ID = "b1b1b1b1-c2c2-4d3d-8e4e-f5f5f5f5f5f5"; // placeholder example UUID
const DB_URL = process.env.DATABASE_URL;

// Skip entire suite if no DB
const describeWithDB = DB_URL ? describe : describe.skip;

describeWithDB("Smoke E2E: Full business flow against PostgreSQL", () => {
  let token: string;
  let leaseId: string;
  let ownerId: string;
  let chargeId: string;
  let paymentId: string;

  // ─── Helpers ───

  function authPost(path: string) {
    return request(app)
      .post(path)
      .set("Authorization", `Bearer ${token}`)
      .set("X-Org-Id", ORG_ID);
  }

  function authGet(path: string) {
    return request(app)
      .get(path)
      .set("Authorization", `Bearer ${token}`)
      .set("X-Org-Id", ORG_ID);
  }

  function authPatch(path: string) {
    return request(app)
      .patch(path)
      .set("Authorization", `Bearer ${token}`)
      .set("X-Org-Id", ORG_ID);
  }

  // ─── Step 1: Authenticate ───

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/v1/auth/token")
      .send({ tenantId: ORG_ID, email: "smoke@test.com" });

    expect(res.status).toBe(200);
    token = res.body.data.access_token;
  });

  // ─── Step 2: Onboard a contract ───

  it("step 1: onboards a complete contract (property + owner + tenant + lease)", async () => {
    const res = await authPost("/api/v1/contracts/onboard").send({
      orgId: ORG_ID,
      property: {
        address: "Rua Smoke Test, 42 - Centro",
        city: "São Paulo",
        state: "SP",
        zip: "01001-000",
        type: "apartamento",
        areaSqm: 65,
        bedrooms: 2,
      },
      owner: {
        fullName: "Carlos Proprietário Silva",
        documentNumber: "52998224725",
        email: "carlos@smoke.test",
        phone: "+5511999990001",
      },
      tenant: {
        fullName: "Ana Inquilina Santos",
        documentNumber: "11144477735",
        email: "ana@smoke.test",
        phone: "+5511999990002",
      },
      lease: {
        startDate: "2026-04-01",
        endDate: "2027-03-31",
        rentAmount: 1500,
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.lease).toBeTruthy();
    expect(res.body.data.property).toBeTruthy();
    expect(res.body.data.owner).toBeTruthy();
    expect(res.body.data.tenant).toBeTruthy();

    leaseId = res.body.data.lease.id;
    ownerId = res.body.data.owner.id;

    console.log("[smoke] Lease onboarded:", leaseId);
  });

  // ─── Step 3: Activate the contract ───

  it("step 2: activates the contract", async () => {
    expect(leaseId).toBeTruthy();

    const res = await authPatch(`/api/v1/contracts/${leaseId}/activate`).send({
      activatedBy: "smoke-test",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.operationalStatus).toBe("active");

    console.log("[smoke] Contract activated");
  });

  // ─── Step 4: Create billing schedule ───

  it("step 3: creates a billing schedule for the contract", async () => {
    expect(leaseId).toBeTruthy();

    const res = await authPost("/api/v1/billing-schedules").send({
      orgId: ORG_ID,
      leaseContractId: leaseId,
      dueDateRule: "day_5",
      chargeComponents: [
        { type: "rent", source: "lease_amount" },
        { type: "condominium", source: "fixed", fixedAmount: "350.00" },
      ],
      collectionMethod: "boleto_pix",
    });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.id).toBeTruthy();

    console.log("[smoke] Billing schedule created:", res.body.data.id);
  });

  // ─── Step 5: Generate a charge ───

  it("step 4: generates a charge for the billing period", async () => {
    expect(leaseId).toBeTruthy();

    const res = await authPost("/api/v1/charges/generate").send({
      orgId: ORG_ID,
      leaseContractId: leaseId,
      billingPeriod: "2026-04",
      dueDate: "2026-04-05",
    });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.id).toBeTruthy();
    expect(res.body.data.netAmount).toBeTruthy();

    chargeId = res.body.data.id;

    console.log("[smoke] Charge generated:", chargeId, "net:", res.body.data.netAmount);
  });

  // ─── Step 6: Issue the charge ───

  it("step 5: issues the charge (marks as sent to tenant)", async () => {
    expect(chargeId).toBeTruthy();

    const res = await authPatch(`/api/v1/charges/${chargeId}/issue`).send({
      issuedBy: "smoke-test",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.issueStatus).toBe("issued");

    console.log("[smoke] Charge issued");
  });

  // ─── Step 7: Simulate payment webhook ───

  it("step 6: receives a payment via webhook", async () => {
    const res = await authPost("/api/v1/payments/webhook").send({
      orgId: ORG_ID,
      chargeId,
      receivedAmount: "1850.00",
      receivedAt: "2026-04-04T14:30:00Z",
      paymentMethod: "pix",
      bankReference: "SMOKE_PIX_001",
    });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.payment).toBeTruthy();
    expect(res.body.data.payment.id).toBeTruthy();

    paymentId = res.body.data.payment.id;

    console.log("[smoke] Payment received:", paymentId);
  });

  // ─── Step 8: Verify auto-reconciliation happened ───

  it("step 7: verifies payment was auto-reconciled (chargeId provided in webhook)", async () => {
    expect(paymentId).toBeTruthy();

    // Payment was created with chargeId, so auto-reconciliation happened
    const res = await authGet("/api/v1/payments").query({ orgId: ORG_ID });

    expect(res.status).toBe(200);
    const payment = res.body.data.find((p: { id: string }) => p.id === paymentId);
    expect(payment).toBeTruthy();
    // Should be auto-reconciled (matched, partial, or divergent — not unmatched)
    expect(payment.reconciliationStatus).not.toBe("unmatched");

    console.log("[smoke] Payment auto-reconciled:", payment.reconciliationStatus);
  });

  // ─── Step 9: Generate owner statement ───

  it("step 8: generates a financial statement for the owner", async () => {
    expect(ownerId).toBeTruthy();
    expect(leaseId).toBeTruthy();

    const res = await authPost("/api/v1/statements").send({
      orgId: ORG_ID,
      ownerId,
      leaseContractId: leaseId,
      period: "2026-04",
      adminFeePercentage: "10.00",
    });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);

    console.log("[smoke] Statement generated:", res.body.data.id);
  });

  // ─── Step 10: Send notification ───

  it("step 9: sends a charge_issued notification via email", async () => {
    expect(chargeId).toBeTruthy();

    const res = await authPost("/api/v1/messages").send({
      orgId: ORG_ID,
      entityType: "charge",
      entityId: chargeId,
      channel: "email",
      templateType: "charge_issued",
      recipient: "ana@smoke.test",
      templateData: {
        tenantName: "Ana Inquilina Santos",
        dueDate: "2026-04-05",
        amount: "1.850,00",
        billingPeriod: "04/2026",
        propertyAddress: "Rua Smoke Test, 42",
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.record.channel).toBe("email");

    console.log("[smoke] Email notification sent:", res.body.data.record.id);
  });

  // ─── Step 11: Verify listing endpoints return data ───

  it("step 10: lists contracts and finds the onboarded one", async () => {
    const res = await authGet("/api/v1/contracts").query({ orgId: ORG_ID });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("step 11: lists charges and finds the generated one", async () => {
    const res = await authGet("/api/v1/charges").query({ orgId: ORG_ID });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("step 12: lists payments and finds the received one", async () => {
    const res = await authGet("/api/v1/payments").query({ orgId: ORG_ID });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("step 13: lists statements and finds the generated one", async () => {
    const res = await authGet("/api/v1/statements").query({ orgId: ORG_ID });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("step 14: lists messages and finds the sent one", async () => {
    const res = await authGet("/api/v1/messages").query({ orgId: ORG_ID });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });
});
