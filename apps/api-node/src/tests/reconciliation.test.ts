/**
 * Unit tests for payment reconciliation — pure functions.
 */
import { describe, it, expect } from "vitest";
import {
  matchByBankReference,
  matchByAmount,
  classifyReconciliation,
  reconcile,
} from "../modules/payments/reconciliation";
import type { MatchCandidate } from "../modules/payments/reconciliation";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const openCharge: MatchCandidate = {
  chargeId: "charge-001",
  netAmount: "3500.00",
  bankReference: "REF-001",
  paymentStatus: "open",
};

const paidCharge: MatchCandidate = {
  chargeId: "charge-002",
  netAmount: "3500.00",
  bankReference: "REF-002",
  paymentStatus: "paid", // already paid — should not match
};

// ── matchByBankReference ──────────────────────────────────────────────────────

describe("matchByBankReference", () => {
  it("matches open charge by exact bank reference", () => {
    const result = matchByBankReference("REF-001", [openCharge, paidCharge]);
    expect(result?.chargeId).toBe("charge-001");
  });

  it("returns null when bank reference does not match", () => {
    const result = matchByBankReference("REF-UNKNOWN", [openCharge]);
    expect(result).toBeNull();
  });

  it("returns null when charge is already paid", () => {
    const result = matchByBankReference("REF-002", [paidCharge]);
    expect(result).toBeNull();
  });

  it("returns null for null/undefined bankReference", () => {
    expect(matchByBankReference(null, [openCharge])).toBeNull();
    expect(matchByBankReference(undefined, [openCharge])).toBeNull();
  });

  it("returns null for empty string bankReference", () => {
    expect(matchByBankReference("", [openCharge])).toBeNull();
  });

  it("returns null for empty candidates array", () => {
    expect(matchByBankReference("REF-001", [])).toBeNull();
  });
});

// ── matchByAmount ─────────────────────────────────────────────────────────────

describe("matchByAmount", () => {
  it("matches open charge by exact amount", () => {
    const result = matchByAmount("3500.00", [openCharge, paidCharge]);
    expect(result?.chargeId).toBe("charge-001");
  });

  it("returns null when amount does not match", () => {
    const result = matchByAmount("9999.00", [openCharge]);
    expect(result).toBeNull();
  });

  it("does not match already-paid charge", () => {
    // Only paidCharge has matching amount AND status=paid
    const result = matchByAmount("3500.00", [paidCharge]);
    expect(result).toBeNull();
  });

  it("returns first open match when multiple have same amount", () => {
    const charge2: MatchCandidate = {
      chargeId: "charge-003",
      netAmount: "3500.00",
      paymentStatus: "open",
    };
    const result = matchByAmount("3500.00", [openCharge, charge2]);
    expect(result?.chargeId).toBe("charge-001"); // first one wins
  });

  it("returns null for empty candidates", () => {
    expect(matchByAmount("3500.00", [])).toBeNull();
  });
});

// ── classifyReconciliation ────────────────────────────────────────────────────

describe("classifyReconciliation", () => {
  it("matched when amounts are equal", () => {
    const result = classifyReconciliation("3500.00", "3500.00");
    expect(result.status).toBe("matched");
    expect(result.divergenceReason).toBeUndefined();
  });

  it("partial when received is less than expected", () => {
    const result = classifyReconciliation("3400.00", "3500.00");
    expect(result.status).toBe("partial");
    expect(result.divergenceReason).toContain("Underpayment");
  });

  it("divergent when received is more than expected", () => {
    const result = classifyReconciliation("3600.00", "3500.00");
    expect(result.status).toBe("divergent");
    expect(result.divergenceReason).toContain("Overpayment");
  });

  it("divergent for invalid amount format", () => {
    const result = classifyReconciliation("invalid", "3500.00");
    expect(result.status).toBe("divergent");
    expect(result.divergenceReason).toContain("Invalid amount");
  });

  it("matched for cents-level exact match", () => {
    // 1 cent precision
    const result = classifyReconciliation("3500.01", "3500.01");
    expect(result.status).toBe("matched");
  });

  it("divergence reason mentions amounts", () => {
    const result = classifyReconciliation("3400.00", "3500.00");
    expect(result.divergenceReason).toContain("3500.00");
    expect(result.divergenceReason).toContain("3400.00");
  });
});

// ── reconcile (full pipeline) ─────────────────────────────────────────────────

describe("reconcile", () => {
  it("returns matched result via bank reference", () => {
    const result = reconcile("3500.00", "REF-001", [openCharge]);
    expect(result).not.toBeNull();
    expect(result?.chargeId).toBe("charge-001");
    expect(result?.status).toBe("matched");
  });

  it("falls back to amount match when no bank reference", () => {
    const noRefCharge: MatchCandidate = {
      chargeId: "charge-nref",
      netAmount: "2000.00",
      paymentStatus: "open",
    };
    const result = reconcile("2000.00", null, [noRefCharge]);
    expect(result?.chargeId).toBe("charge-nref");
    expect(result?.status).toBe("matched");
  });

  it("returns null when no candidates match", () => {
    const result = reconcile("999.00", "REF-NONE", [openCharge]);
    expect(result).toBeNull();
  });

  it("prefers bank reference over amount when both could match", () => {
    const refCharge: MatchCandidate = {
      chargeId: "by-ref",
      netAmount: "3500.00",
      bankReference: "REF-X",
      paymentStatus: "open",
    };
    const amtCharge: MatchCandidate = {
      chargeId: "by-amt",
      netAmount: "3500.00",
      paymentStatus: "open",
    };
    const result = reconcile("3500.00", "REF-X", [amtCharge, refCharge]);
    expect(result?.chargeId).toBe("by-ref");
  });

  it("returns partial status for underpayment", () => {
    const result = reconcile("3400.00", "REF-001", [openCharge]);
    expect(result?.status).toBe("partial");
    expect(result?.divergenceReason).toContain("Underpayment");
  });

  it("returns divergent status for overpayment", () => {
    const result = reconcile("3700.00", "REF-001", [openCharge]);
    expect(result?.status).toBe("divergent");
  });

  it("returns null for empty candidates", () => {
    expect(reconcile("3500.00", "REF-001", [])).toBeNull();
  });
});
