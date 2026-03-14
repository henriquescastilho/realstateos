/**
 * Unit tests for Zod validation schemas — pure schema validation, no I/O.
 */
import { describe, it, expect } from "vitest";

// ── Billing validators ────────────────────────────────────────────────────────
import {
  createBillingScheduleSchema,
  generateChargesSchema,
  listChargesQuerySchema,
  issueChargeSchema,
} from "../modules/billing/validators";

// ── Payments validators ───────────────────────────────────────────────────────
import {
  paymentWebhookSchema,
  reconcilePaymentSchema,
  listPaymentsQuerySchema,
  generateStatementSchema,
  listStatementsQuerySchema,
} from "../modules/payments/validators";

// ── Maintenance validators ────────────────────────────────────────────────────
import {
  createTicketSchema,
  updateTicketSchema,
  listTicketsQuerySchema,
} from "../modules/maintenance/validators";

// ── Onboarding validators ─────────────────────────────────────────────────────
import {
  onboardContractSchema,
  activateContractSchema,
  listContractsQuerySchema,
} from "../modules/onboarding/validators";

// ── Helpers ───────────────────────────────────────────────────────────────────

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const TODAY = "2026-03-14";
const NOW_ISO = "2026-03-14T10:00:00.000Z";

// ── createBillingScheduleSchema ───────────────────────────────────────────────

describe("createBillingScheduleSchema", () => {
  const valid = {
    orgId: UUID,
    leaseContractId: UUID,
  };

  it("accepts minimal valid payload", () => {
    const result = createBillingScheduleSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("applies defaults for optional fields", () => {
    const result = createBillingScheduleSchema.parse(valid);
    expect(result.dueDateRule).toBe("first_business_day");
    expect(result.chargeComponents).toEqual([]);
    expect(result.collectionMethod).toBe("boleto_pix");
    expect(result.lateFeeRule.percentage).toBe("2.00");
    expect(result.interestRule.dailyPercentage).toBe("0.033");
  });

  it("rejects non-UUID orgId", () => {
    expect(createBillingScheduleSchema.safeParse({ ...valid, orgId: "not-uuid" }).success).toBe(
      false,
    );
  });

  it("rejects missing leaseContractId", () => {
    expect(createBillingScheduleSchema.safeParse({ orgId: UUID }).success).toBe(false);
  });

  it("accepts chargeComponents array with fixedAmount", () => {
    const result = createBillingScheduleSchema.safeParse({
      ...valid,
      chargeComponents: [{ type: "condominium", source: "upload", fixedAmount: "400.00" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects chargeComponent with empty type", () => {
    const result = createBillingScheduleSchema.safeParse({
      ...valid,
      chargeComponents: [{ type: "", source: "upload" }],
    });
    expect(result.success).toBe(false);
  });
});

// ── generateChargesSchema ─────────────────────────────────────────────────────

describe("generateChargesSchema", () => {
  const valid = {
    orgId: UUID,
    leaseContractId: UUID,
    billingPeriod: "2026-03",
    dueDate: TODAY,
  };

  it("accepts valid payload", () => {
    expect(generateChargesSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects billingPeriod not in YYYY-MM format", () => {
    expect(generateChargesSchema.safeParse({ ...valid, billingPeriod: "2026/03" }).success).toBe(
      false,
    );
    expect(generateChargesSchema.safeParse({ ...valid, billingPeriod: "26-03" }).success).toBe(
      false,
    );
  });

  it("rejects invalid dueDate", () => {
    expect(generateChargesSchema.safeParse({ ...valid, dueDate: "not-a-date" }).success).toBe(
      false,
    );
  });

  it("daysLate defaults to 0", () => {
    const result = generateChargesSchema.parse(valid);
    expect(result.daysLate).toBe(0);
  });

  it("rejects negative daysLate", () => {
    expect(generateChargesSchema.safeParse({ ...valid, daysLate: -1 }).success).toBe(false);
  });

  it("accepts earlyDiscountPercentage", () => {
    const result = generateChargesSchema.safeParse({
      ...valid,
      earlyDiscountPercentage: "5.00",
      daysEarly: 3,
    });
    expect(result.success).toBe(true);
  });
});

// ── listChargesQuerySchema ────────────────────────────────────────────────────

describe("listChargesQuerySchema", () => {
  it("accepts minimal orgId", () => {
    expect(listChargesQuerySchema.safeParse({ orgId: UUID }).success).toBe(true);
  });

  it("defaults page=1 and pageSize=20", () => {
    const result = listChargesQuerySchema.parse({ orgId: UUID });
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it("coerces string numbers to integers", () => {
    const result = listChargesQuerySchema.parse({ orgId: UUID, page: "3", pageSize: "50" });
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(50);
  });

  it("rejects pageSize > 100", () => {
    expect(listChargesQuerySchema.safeParse({ orgId: UUID, pageSize: 101 }).success).toBe(false);
  });

  it("rejects page < 1", () => {
    expect(listChargesQuerySchema.safeParse({ orgId: UUID, page: 0 }).success).toBe(false);
  });
});

// ── paymentWebhookSchema ──────────────────────────────────────────────────────

describe("paymentWebhookSchema", () => {
  const valid = {
    orgId: UUID,
    receivedAmount: "3500.00",
    receivedAt: NOW_ISO,
    paymentMethod: "boleto",
  };

  it("accepts valid boleto payment", () => {
    expect(paymentWebhookSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts all payment methods", () => {
    const methods = ["boleto", "pix", "ted", "credit_card", "debit"] as const;
    for (const method of methods) {
      expect(paymentWebhookSchema.safeParse({ ...valid, paymentMethod: method }).success).toBe(
        true,
      );
    }
  });

  it("rejects unknown payment method", () => {
    expect(paymentWebhookSchema.safeParse({ ...valid, paymentMethod: "cash" }).success).toBe(false);
  });

  it("rejects receivedAmount without 2 decimal places", () => {
    expect(paymentWebhookSchema.safeParse({ ...valid, receivedAmount: "3500" }).success).toBe(
      false,
    );
    expect(paymentWebhookSchema.safeParse({ ...valid, receivedAmount: "3500.0" }).success).toBe(
      false,
    );
    expect(paymentWebhookSchema.safeParse({ ...valid, receivedAmount: "3500.000" }).success).toBe(
      false,
    );
  });

  it("rejects non-ISO receivedAt", () => {
    expect(paymentWebhookSchema.safeParse({ ...valid, receivedAt: "2026-03-14" }).success).toBe(
      false,
    );
  });

  it("accepts optional chargeId and bankReference", () => {
    const result = paymentWebhookSchema.safeParse({
      ...valid,
      chargeId: UUID,
      bankReference: "REF-ABC-001",
    });
    expect(result.success).toBe(true);
  });
});

// ── generateStatementSchema ───────────────────────────────────────────────────

describe("generateStatementSchema", () => {
  const valid = {
    orgId: UUID,
    ownerId: UUID,
    leaseContractId: UUID,
    period: "2026-02",
  };

  it("accepts valid payload", () => {
    expect(generateStatementSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects period not in YYYY-MM format", () => {
    expect(generateStatementSchema.safeParse({ ...valid, period: "02/2026" }).success).toBe(false);
  });

  it("accepts optional adminFeePercentage", () => {
    expect(
      generateStatementSchema.safeParse({ ...valid, adminFeePercentage: "10.00" }).success,
    ).toBe(true);
  });

  it("rejects non-UUID ownerId", () => {
    expect(generateStatementSchema.safeParse({ ...valid, ownerId: "not-uuid" }).success).toBe(
      false,
    );
  });
});

// ── reconcilePaymentSchema ────────────────────────────────────────────────────

describe("reconcilePaymentSchema", () => {
  it("accepts valid chargeId UUID", () => {
    expect(reconcilePaymentSchema.safeParse({ chargeId: UUID }).success).toBe(true);
  });

  it("rejects non-UUID chargeId", () => {
    expect(reconcilePaymentSchema.safeParse({ chargeId: "abc" }).success).toBe(false);
  });

  it("rejects missing chargeId", () => {
    expect(reconcilePaymentSchema.safeParse({}).success).toBe(false);
  });
});

// ── createTicketSchema ────────────────────────────────────────────────────────

describe("createTicketSchema", () => {
  const valid = {
    orgId: UUID,
    propertyId: UUID,
    openedBy: "tenant",
    description: "Torneira da cozinha com vazamento constante",
  };

  it("accepts valid ticket", () => {
    expect(createTicketSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects description shorter than 10 chars", () => {
    expect(createTicketSchema.safeParse({ ...valid, description: "curto" }).success).toBe(false);
  });

  it("rejects description longer than 2000 chars", () => {
    expect(createTicketSchema.safeParse({ ...valid, description: "x".repeat(2001) }).success).toBe(
      false,
    );
  });

  it("accepts optional priority override", () => {
    const result = createTicketSchema.safeParse({ ...valid, priority: "urgent" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid priority value", () => {
    expect(createTicketSchema.safeParse({ ...valid, priority: "critical" }).success).toBe(false);
  });

  it("accepts optional leaseContractId", () => {
    expect(createTicketSchema.safeParse({ ...valid, leaseContractId: UUID }).success).toBe(true);
  });
});

// ── updateTicketSchema ────────────────────────────────────────────────────────

describe("updateTicketSchema", () => {
  it("accepts empty update (all optional)", () => {
    expect(updateTicketSchema.safeParse({}).success).toBe(true);
  });

  it("accepts all valid statuses", () => {
    const statuses = [
      "open",
      "triaged",
      "in_progress",
      "waiting_external",
      "resolved",
      "closed",
    ] as const;
    for (const status of statuses) {
      expect(updateTicketSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it("rejects unknown status", () => {
    expect(updateTicketSchema.safeParse({ status: "pending" }).success).toBe(false);
  });

  it("accepts all valid priorities", () => {
    const priorities = ["low", "medium", "high", "urgent"] as const;
    for (const priority of priorities) {
      expect(updateTicketSchema.safeParse({ priority }).success).toBe(true);
    }
  });

  it("rejects resolutionSummary over 2000 chars", () => {
    expect(updateTicketSchema.safeParse({ resolutionSummary: "x".repeat(2001) }).success).toBe(
      false,
    );
  });
});

// ── listTicketsQuerySchema ────────────────────────────────────────────────────

describe("listTicketsQuerySchema", () => {
  it("accepts minimal orgId", () => {
    expect(listTicketsQuerySchema.safeParse({ orgId: UUID }).success).toBe(true);
  });

  it("defaults page=1 and pageSize=20", () => {
    const result = listTicketsQuerySchema.parse({ orgId: UUID });
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it("accepts optional filters", () => {
    const result = listTicketsQuerySchema.safeParse({
      orgId: UUID,
      propertyId: UUID,
      status: "open",
      priority: "high",
    });
    expect(result.success).toBe(true);
  });
});

// ── onboardContractSchema ─────────────────────────────────────────────────────

describe("onboardContractSchema", () => {
  const valid = {
    orgId: UUID,
    property: {
      address: "Rua das Flores, 123",
      city: "São Paulo",
      state: "SP",
      zip: "01310-100",
    },
    owner: {
      fullName: "João da Silva",
      documentNumber: "52998224725",
    },
    tenant: {
      fullName: "Maria Santos",
      documentNumber: "11222333000181",
    },
    lease: {
      startDate: "2026-04-01",
      endDate: "2027-03-31",
      rentAmount: 3500,
    },
  };

  it("accepts minimal valid onboarding payload", () => {
    expect(onboardContractSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects state that is not 2 characters", () => {
    const result = onboardContractSchema.safeParse({
      ...valid,
      property: { ...valid.property, state: "São Paulo" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative rent amount", () => {
    const result = onboardContractSchema.safeParse({
      ...valid,
      lease: { ...valid.lease, rentAmount: -100 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email for owner", () => {
    const result = onboardContractSchema.safeParse({
      ...valid,
      owner: { ...valid.owner, email: "not-an-email" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional confidence score 0-100", () => {
    expect(onboardContractSchema.safeParse({ ...valid, confidence: 92.5 }).success).toBe(true);
  });

  it("rejects confidence score > 100", () => {
    expect(onboardContractSchema.safeParse({ ...valid, confidence: 101 }).success).toBe(false);
  });

  it("accepts owner with payout preferences", () => {
    const result = onboardContractSchema.safeParse({
      ...valid,
      owner: {
        ...valid.owner,
        payoutPreferences: {
          bankCode: "001",
          branch: "1234",
          account: "56789-0",
          accountType: "checking",
          pixKey: "joao@example.com",
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects owner name shorter than 2 chars", () => {
    const result = onboardContractSchema.safeParse({
      ...valid,
      owner: { ...valid.owner, fullName: "A" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects tenant name shorter than 2 chars", () => {
    const result = onboardContractSchema.safeParse({
      ...valid,
      tenant: { ...valid.tenant, fullName: "B" },
    });
    expect(result.success).toBe(false);
  });

  it("requires property address at least 5 chars", () => {
    const result = onboardContractSchema.safeParse({
      ...valid,
      property: { ...valid.property, address: "Rua" },
    });
    expect(result.success).toBe(false);
  });
});

// ── listContractsQuerySchema ──────────────────────────────────────────────────

describe("listContractsQuerySchema", () => {
  it("accepts minimal orgId", () => {
    expect(listContractsQuerySchema.safeParse({ orgId: UUID }).success).toBe(true);
  });

  it("defaults page and pageSize", () => {
    const result = listContractsQuerySchema.parse({ orgId: UUID });
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it("rejects pageSize > 100", () => {
    expect(listContractsQuerySchema.safeParse({ orgId: UUID, pageSize: 200 }).success).toBe(false);
  });

  it("coerces string page to number", () => {
    const result = listContractsQuerySchema.parse({ orgId: UUID, page: "2" });
    expect(result.page).toBe(2);
  });
});

// ── activateContractSchema ────────────────────────────────────────────────────

describe("activateContractSchema", () => {
  it("accepts empty payload (all optional)", () => {
    expect(activateContractSchema.safeParse({}).success).toBe(true);
  });

  it("accepts activatedBy string", () => {
    expect(activateContractSchema.safeParse({ activatedBy: "admin@example.com" }).success).toBe(
      true,
    );
  });
});

// ── listPaymentsQuerySchema ───────────────────────────────────────────────────

describe("listPaymentsQuerySchema", () => {
  it("accepts minimal orgId", () => {
    expect(listPaymentsQuerySchema.safeParse({ orgId: UUID }).success).toBe(true);
  });

  it("accepts optional chargeId and reconciliationStatus filters", () => {
    const result = listPaymentsQuerySchema.safeParse({
      orgId: UUID,
      chargeId: UUID,
      reconciliationStatus: "matched",
    });
    expect(result.success).toBe(true);
  });

  it("rejects page < 1", () => {
    expect(listPaymentsQuerySchema.safeParse({ orgId: UUID, page: 0 }).success).toBe(false);
  });
});
