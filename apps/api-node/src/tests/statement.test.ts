/**
 * Unit tests for owner payout statement generation — pure functions.
 */
import { describe, it, expect } from "vitest";
import { buildStatementEntries } from "../modules/payments/statement";
import type { ChargeForStatement } from "../modules/payments/statement";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function charge(
  netAmount: string,
  grossAmount: string = netAmount,
  penaltyAmount = "0.00",
): ChargeForStatement {
  return {
    grossAmount,
    penaltyAmount,
    discountAmount: "0.00",
    netAmount,
    lineItems: [{ type: "rent", description: "Aluguel", amount: grossAmount }],
  };
}

// ── buildStatementEntries ─────────────────────────────────────────────────────

describe("buildStatementEntries", () => {
  it("returns empty entries and 0.00 payout for no charges", () => {
    const { entries, totalPayout } = buildStatementEntries([]);
    expect(entries).toHaveLength(0);
    expect(totalPayout).toBe("0.00");
  });

  it("single charge — payout equals netAmount", () => {
    const { entries, totalPayout } = buildStatementEntries([charge("3500.00")]);
    expect(totalPayout).toBe("3500.00");
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("income");
  });

  it("sums multiple charges", () => {
    const { totalPayout } = buildStatementEntries([charge("3500.00"), charge("2000.00")]);
    expect(totalPayout).toBe("5500.00");
  });

  it("deducts admin fee", () => {
    // 10% of 3500 = 350 deduction, payout = 3150
    const { totalPayout, entries } = buildStatementEntries([charge("3500.00")], {
      adminFeePercentage: "10.00",
    });
    expect(totalPayout).toBe("3150.00");
    const feeEntry = entries.find((e) => e.type === "admin_fee");
    expect(feeEntry).toBeDefined();
    expect(feeEntry?.amount).toBe("-350.00");
  });

  it("no admin fee when adminFeePercentage is 0", () => {
    const { entries } = buildStatementEntries([charge("3500.00")], { adminFeePercentage: "0.00" });
    expect(entries.some((e) => e.type === "admin_fee")).toBe(false);
  });

  it("no admin fee when adminFeePercentage is omitted", () => {
    const { entries } = buildStatementEntries([charge("3500.00")]);
    expect(entries.some((e) => e.type === "admin_fee")).toBe(false);
  });

  it("adds penalty_income entry for charges with penalties", () => {
    const lateCharge = charge("3560.00", "3500.00", "60.00");
    const { entries } = buildStatementEntries([lateCharge]);
    const penaltyEntry = entries.find((e) => e.type === "penalty_income");
    expect(penaltyEntry).toBeDefined();
    expect(penaltyEntry?.amount).toBe("60.00");
  });

  it("no penalty_income when penalty is 0.00", () => {
    const { entries } = buildStatementEntries([charge("3500.00")]);
    expect(entries.some((e) => e.type === "penalty_income")).toBe(false);
  });

  it("admin fee calculated on gross rent, not net", () => {
    // gross=3500, net=3560 (includes penalty), admin fee should be on 3500
    const lateCharge = charge("3560.00", "3500.00", "60.00");
    const { entries } = buildStatementEntries([lateCharge], { adminFeePercentage: "10.00" });
    const feeEntry = entries.find((e) => e.type === "admin_fee");
    // 10% of 3500 = 350
    expect(feeEntry?.amount).toBe("-350.00");
  });

  it("totalPayout is a decimal string with 2 places", () => {
    const { totalPayout } = buildStatementEntries([charge("3333.33")]);
    expect(totalPayout).toMatch(/^\d+\.\d{2}$/);
  });

  it("income entry description contains 'aluguel'", () => {
    const { entries } = buildStatementEntries([charge("2000.00")]);
    const incomeEntry = entries.find((e) => e.type === "income");
    expect(incomeEntry?.description.toLowerCase()).toContain("aluguel");
  });

  it("admin fee entry description contains percentage", () => {
    const { entries } = buildStatementEntries([charge("3000.00")], { adminFeePercentage: "8.00" });
    const feeEntry = entries.find((e) => e.type === "admin_fee");
    expect(feeEntry?.description).toContain("8");
  });
});
