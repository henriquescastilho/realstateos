import { describe, it, expect } from "vitest";
import {
  matchByBankReference,
  matchByAmount,
  classifyReconciliation,
  reconcile,
  type MatchCandidate,
} from "../../src/modules/payments/reconciliation";
import {
  buildStatementEntries,
  type ChargeForStatement,
} from "../../src/modules/payments/statement";

// ─── Test data ───

const candidates: MatchCandidate[] = [
  { chargeId: "c1", netAmount: "1500.00", bankReference: "REF-001", paymentStatus: "open" },
  { chargeId: "c2", netAmount: "2200.00", bankReference: "REF-002", paymentStatus: "open" },
  { chargeId: "c3", netAmount: "1500.00", bankReference: "REF-003", paymentStatus: "paid" },
  { chargeId: "c4", netAmount: "800.00", paymentStatus: "open" },
];

// ─── matchByBankReference ───

describe("matchByBankReference", () => {
  it("matches by exact bank reference on open charge", () => {
    const result = matchByBankReference("REF-001", candidates);
    expect(result?.chargeId).toBe("c1");
  });

  it("returns null for unknown reference", () => {
    expect(matchByBankReference("REF-999", candidates)).toBeNull();
  });

  it("returns null for null/undefined reference", () => {
    expect(matchByBankReference(null, candidates)).toBeNull();
    expect(matchByBankReference(undefined, candidates)).toBeNull();
  });

  it("ignores paid charges even with matching reference", () => {
    expect(matchByBankReference("REF-003", candidates)).toBeNull();
  });
});

// ─── matchByAmount ───

describe("matchByAmount", () => {
  it("matches by exact amount on open charge", () => {
    const result = matchByAmount("2200.00", candidates);
    expect(result?.chargeId).toBe("c2");
  });

  it("returns first match when multiple charges have same amount", () => {
    const result = matchByAmount("1500.00", candidates);
    expect(result?.chargeId).toBe("c1"); // c1 is first open with 1500.00
  });

  it("returns null when no amount matches", () => {
    expect(matchByAmount("9999.99", candidates)).toBeNull();
  });

  it("ignores paid charges", () => {
    // c3 has 1500.00 but is paid — c1 should match instead
    const onlyPaid: MatchCandidate[] = [
      { chargeId: "c3", netAmount: "1500.00", bankReference: "REF-003", paymentStatus: "paid" },
    ];
    expect(matchByAmount("1500.00", onlyPaid)).toBeNull();
  });
});

// ─── classifyReconciliation ───

describe("classifyReconciliation", () => {
  it("classifies exact match", () => {
    const result = classifyReconciliation("1500.00", "1500.00");
    expect(result.status).toBe("matched");
    expect(result.divergenceReason).toBeUndefined();
  });

  it("classifies underpayment as partial", () => {
    const result = classifyReconciliation("1400.00", "1500.00");
    expect(result.status).toBe("partial");
    expect(result.divergenceReason).toContain("100.00");
    expect(result.divergenceReason).toContain("Underpayment");
  });

  it("classifies overpayment as divergent", () => {
    const result = classifyReconciliation("1600.00", "1500.00");
    expect(result.status).toBe("divergent");
    expect(result.divergenceReason).toContain("100.00");
    expect(result.divergenceReason).toContain("Overpayment");
  });

  it("handles penny-level precision", () => {
    expect(classifyReconciliation("1500.01", "1500.01").status).toBe("matched");
    expect(classifyReconciliation("1500.00", "1500.01").status).toBe("partial");
  });

  it("handles invalid amounts", () => {
    const result = classifyReconciliation("abc", "1500.00");
    expect(result.status).toBe("divergent");
    expect(result.divergenceReason).toContain("Invalid");
  });
});

// ─── reconcile (full pipeline) ───

describe("reconcile", () => {
  it("prioritizes bank reference over amount match", () => {
    // Amount matches c1 (1500) but reference matches c2 (REF-002 → 2200)
    const result = reconcile("1500.00", "REF-002", candidates);
    expect(result?.chargeId).toBe("c2");
    expect(result?.status).toBe("partial"); // 1500 < 2200
  });

  it("falls back to amount match when no bank reference", () => {
    const result = reconcile("800.00", null, candidates);
    expect(result?.chargeId).toBe("c4");
    expect(result?.status).toBe("matched");
  });

  it("returns null when nothing matches", () => {
    const result = reconcile("9999.99", "REF-UNKNOWN", candidates);
    expect(result).toBeNull();
  });

  it("correctly matches and classifies exact payment", () => {
    const result = reconcile("1500.00", "REF-001", candidates);
    expect(result?.chargeId).toBe("c1");
    expect(result?.status).toBe("matched");
  });

  it("correctly classifies overpayment via reference", () => {
    const result = reconcile("2500.00", "REF-002", candidates);
    expect(result?.chargeId).toBe("c2");
    expect(result?.status).toBe("divergent");
    expect(result?.divergenceReason).toContain("Overpayment");
  });
});

// ─── buildStatementEntries ───

describe("buildStatementEntries", () => {
  const paidCharges: ChargeForStatement[] = [
    {
      grossAmount: "1500.00",
      penaltyAmount: "0.00",
      discountAmount: "0.00",
      netAmount: "1500.00",
      lineItems: [{ type: "rent", description: "Aluguel", amount: "1500.00" }],
    },
  ];

  it("generates income entry for paid charge", () => {
    const { entries, totalPayout } = buildStatementEntries(paidCharges);
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("income");
    expect(entries[0].amount).toBe("1500.00");
    expect(totalPayout).toBe("1500.00");
  });

  it("deducts admin fee", () => {
    const { entries, totalPayout } = buildStatementEntries(paidCharges, {
      adminFeePercentage: "10.00",
    });

    const adminEntry = entries.find((e) => e.type === "admin_fee");
    expect(adminEntry).toBeDefined();
    expect(adminEntry!.amount).toBe("-150.00");
    expect(totalPayout).toBe("1350.00");
  });

  it("includes penalty income entry when penalties exist", () => {
    const chargesWithPenalty: ChargeForStatement[] = [
      {
        grossAmount: "1500.00",
        penaltyAmount: "32.48",
        discountAmount: "0.00",
        netAmount: "1532.48",
        lineItems: [{ type: "rent", description: "Aluguel", amount: "1500.00" }],
      },
    ];

    const { entries, totalPayout } = buildStatementEntries(chargesWithPenalty);
    expect(entries).toHaveLength(2);
    expect(entries[1].type).toBe("penalty_income");
    expect(entries[1].amount).toBe("32.48");
    expect(totalPayout).toBe("1532.48");
  });

  it("handles multiple charges in one period", () => {
    const multi: ChargeForStatement[] = [
      { grossAmount: "1500.00", penaltyAmount: "0.00", discountAmount: "0.00", netAmount: "1500.00", lineItems: [] },
      { grossAmount: "500.00", penaltyAmount: "0.00", discountAmount: "0.00", netAmount: "500.00", lineItems: [] },
    ];

    const { entries, totalPayout } = buildStatementEntries(multi, {
      adminFeePercentage: "10.00",
    });

    // 2 income + 1 admin fee
    expect(entries).toHaveLength(3);
    // Admin fee on gross: (1500 + 500) * 10% = 200
    const fee = entries.find((e) => e.type === "admin_fee");
    expect(fee!.amount).toBe("-200.00");
    // Payout: 2000 - 200 = 1800
    expect(totalPayout).toBe("1800.00");
  });

  it("returns zero deductions when no admin fee", () => {
    const { entries } = buildStatementEntries(paidCharges, {});
    const fees = entries.filter((e) => e.type === "admin_fee");
    expect(fees).toHaveLength(0);
  });
});
