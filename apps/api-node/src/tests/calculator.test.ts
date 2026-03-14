/**
 * Unit tests for the billing calculator — pure financial functions.
 */
import { describe, it, expect } from "vitest";
import {
  toCents,
  fromCents,
  buildLineItems,
  calcGrossAmount,
  calcLateFee,
  calcDailyInterest,
  calcEarlyDiscount,
  calculateCharge,
} from "../modules/billing/calculator";

// ── toCents ──────────────────────────────────────────────────────────────────

describe("toCents", () => {
  it("converts integer string", () => {
    expect(toCents("1500")).toBe(150000);
  });

  it("converts decimal string with 2 places", () => {
    expect(toCents("1500.00")).toBe(150000);
  });

  it("rounds half-cent correctly", () => {
    expect(toCents("0.005")).toBe(1); // rounds up
  });

  it("handles zero", () => {
    expect(toCents("0.00")).toBe(0);
  });

  it("throws for non-numeric input", () => {
    expect(() => toCents("abc")).toThrow("Invalid amount");
  });

  it("handles large amounts", () => {
    expect(toCents("100000.00")).toBe(10000000);
  });
});

// ── fromCents ─────────────────────────────────────────────────────────────────

describe("fromCents", () => {
  it("converts cents to decimal string", () => {
    expect(fromCents(150000)).toBe("1500.00");
  });

  it("zero cents gives 0.00", () => {
    expect(fromCents(0)).toBe("0.00");
  });

  it("rounds correctly at 2 decimal places", () => {
    expect(fromCents(1)).toBe("0.01");
  });

  it("is inverse of toCents for standard amounts", () => {
    expect(fromCents(toCents("3500.00"))).toBe("3500.00");
  });
});

// ── buildLineItems ────────────────────────────────────────────────────────────

describe("buildLineItems", () => {
  it("always includes a rent line item", () => {
    const items = buildLineItems("2000.00", []);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("rent");
    expect(items[0].amount).toBe("2000.00");
  });

  it("skips components without fixedAmount", () => {
    const items = buildLineItems("2000.00", [
      { type: "condominium", source: "upload" }, // no fixedAmount
    ]);
    expect(items).toHaveLength(1);
  });

  it("adds condominium component when fixedAmount provided", () => {
    const items = buildLineItems("2000.00", [
      { type: "condominium", source: "upload", fixedAmount: "400.00" },
    ]);
    expect(items).toHaveLength(2);
    expect(items[1].type).toBe("condominium");
    expect(items[1].amount).toBe("400.00");
  });

  it("skips duplicate rent component", () => {
    const items = buildLineItems("2000.00", [
      { type: "rent", source: "contract", fixedAmount: "2000.00" },
    ]);
    expect(items).toHaveLength(1); // only the base rent, not the duplicate
  });

  it("adds multiple components", () => {
    const items = buildLineItems("2000.00", [
      { type: "water", source: "utility", fixedAmount: "50.00" },
      { type: "gas", source: "utility", fixedAmount: "30.00" },
    ]);
    expect(items).toHaveLength(3);
  });

  it("source is preserved from contract for rent", () => {
    const items = buildLineItems("1800.00", []);
    expect(items[0].source).toBe("contract");
  });
});

// ── calcGrossAmount ────────────────────────────────────────────────────────────

describe("calcGrossAmount", () => {
  it("sums single item correctly", () => {
    const items = buildLineItems("3000.00", []);
    expect(calcGrossAmount(items)).toBe("3000.00");
  });

  it("sums multiple items", () => {
    const items = buildLineItems("2000.00", [
      { type: "condo", source: "upload", fixedAmount: "500.00" },
    ]);
    expect(calcGrossAmount(items)).toBe("2500.00");
  });

  it("returns 0.00 for empty list", () => {
    expect(calcGrossAmount([])).toBe("0.00");
  });
});

// ── calcLateFee ───────────────────────────────────────────────────────────────

describe("calcLateFee", () => {
  it("returns 0.00 when daysLate is 0", () => {
    expect(calcLateFee("3000.00", "2.00", 0)).toBe("0.00");
  });

  it("returns 0.00 when daysLate is negative", () => {
    expect(calcLateFee("3000.00", "2.00", -5)).toBe("0.00");
  });

  it("calculates 2% late fee correctly", () => {
    // 2% of 3000.00 = 60.00
    expect(calcLateFee("3000.00", "2.00", 1)).toBe("60.00");
  });

  it("flat fee — same for 1 day or 30 days late", () => {
    const fee1 = calcLateFee("3000.00", "2.00", 1);
    const fee30 = calcLateFee("3000.00", "2.00", 30);
    expect(fee1).toBe(fee30); // flat, not daily
  });

  it("returns 0.00 for zero or NaN percentage", () => {
    expect(calcLateFee("3000.00", "0.00", 5)).toBe("0.00");
    expect(calcLateFee("3000.00", "abc", 5)).toBe("0.00");
  });

  it("handles fractional cents without crashing", () => {
    const fee = calcLateFee("333.33", "2.00", 1);
    expect(fee).toMatch(/^\d+\.\d{2}$/);
  });
});

// ── calcDailyInterest ─────────────────────────────────────────────────────────

describe("calcDailyInterest", () => {
  it("returns 0.00 when daysLate is 0", () => {
    expect(calcDailyInterest("3000.00", "0.033", 0)).toBe("0.00");
  });

  it("returns 0.00 when daysLate is negative", () => {
    expect(calcDailyInterest("3000.00", "0.033", -1)).toBe("0.00");
  });

  it("calculates interest for 30 days at 0.033%/day", () => {
    // 0.033% of 3000.00 = 0.99/day × 30 = 29.70
    const interest = calcDailyInterest("3000.00", "0.033", 30);
    expect(parseFloat(interest)).toBeCloseTo(29.7, 1);
  });

  it("interest is proportional to days", () => {
    const i10 = parseFloat(calcDailyInterest("1000.00", "0.033", 10));
    const i20 = parseFloat(calcDailyInterest("1000.00", "0.033", 20));
    expect(i20).toBeCloseTo(i10 * 2, 1);
  });

  it("returns 0.00 for zero percentage", () => {
    expect(calcDailyInterest("3000.00", "0.00", 10)).toBe("0.00");
  });
});

// ── calcEarlyDiscount ─────────────────────────────────────────────────────────

describe("calcEarlyDiscount", () => {
  it("returns 0.00 when daysEarly is 0", () => {
    expect(calcEarlyDiscount("3000.00", "5.00", 0)).toBe("0.00");
  });

  it("returns 0.00 when daysEarly is negative", () => {
    expect(calcEarlyDiscount("3000.00", "5.00", -3)).toBe("0.00");
  });

  it("calculates 5% discount correctly", () => {
    // 5% of 3000.00 = 150.00
    expect(calcEarlyDiscount("3000.00", "5.00", 5)).toBe("150.00");
  });

  it("caps discount at maxDiscountPercentage", () => {
    // 15% requested but max is 10% — should use 10%
    const disc = calcEarlyDiscount("3000.00", "15.00", 5, "10.00");
    expect(disc).toBe("300.00"); // 10% of 3000
  });

  it("returns 0.00 for zero percentage", () => {
    expect(calcEarlyDiscount("3000.00", "0.00", 5)).toBe("0.00");
  });
});

// ── calculateCharge (integration) ─────────────────────────────────────────────

describe("calculateCharge", () => {
  it("returns correct structure", () => {
    const result = calculateCharge({
      rentAmount: "3000.00",
      components: [],
      lateFeePercentage: "2.00",
      dailyInterestPercentage: "0.033",
      daysLate: 0,
    });
    expect(result).toHaveProperty("lineItems");
    expect(result).toHaveProperty("grossAmount");
    expect(result).toHaveProperty("discountAmount");
    expect(result).toHaveProperty("penaltyAmount");
    expect(result).toHaveProperty("netAmount");
  });

  it("on-time payment — net equals gross", () => {
    const result = calculateCharge({
      rentAmount: "3000.00",
      components: [],
      lateFeePercentage: "2.00",
      dailyInterestPercentage: "0.033",
      daysLate: 0,
    });
    expect(result.netAmount).toBe("3000.00");
    expect(result.penaltyAmount).toBe("0.00");
    expect(result.discountAmount).toBe("0.00");
  });

  it("late payment — net includes penalty", () => {
    const result = calculateCharge({
      rentAmount: "3000.00",
      components: [],
      lateFeePercentage: "2.00",
      dailyInterestPercentage: "0.033",
      daysLate: 10,
    });
    // penalty = 2% flat + 0.033%/day × 10 = 60 + 9.90 = 69.90
    const net = parseFloat(result.netAmount);
    expect(net).toBeGreaterThan(3000);
    expect(result.penaltyAmount).not.toBe("0.00");
  });

  it("early payment — net is gross minus discount", () => {
    const result = calculateCharge({
      rentAmount: "3000.00",
      components: [],
      lateFeePercentage: "2.00",
      dailyInterestPercentage: "0.033",
      daysLate: 0,
      earlyDiscountPercentage: "5.00",
      daysEarly: 5,
    });
    // 5% of 3000 = 150 discount, net = 2850
    expect(result.netAmount).toBe("2850.00");
    expect(result.discountAmount).toBe("150.00");
  });

  it("adds components to gross", () => {
    const result = calculateCharge({
      rentAmount: "2000.00",
      components: [{ type: "condo", source: "upload", fixedAmount: "500.00" }],
      lateFeePercentage: "2.00",
      dailyInterestPercentage: "0.033",
      daysLate: 0,
    });
    expect(result.grossAmount).toBe("2500.00");
    expect(result.lineItems).toHaveLength(2);
  });
});
