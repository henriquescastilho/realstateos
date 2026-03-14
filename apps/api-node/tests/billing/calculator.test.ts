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
} from "../../src/modules/billing/calculator";

describe("toCents / fromCents", () => {
  it("converts string amount to cents", () => {
    expect(toCents("1500.00")).toBe(150000);
    expect(toCents("0.01")).toBe(1);
    expect(toCents("99999.99")).toBe(9999999);
  });

  it("converts cents to string amount", () => {
    expect(fromCents(150000)).toBe("1500.00");
    expect(fromCents(1)).toBe("0.01");
    expect(fromCents(0)).toBe("0.00");
  });

  it("throws on invalid amount", () => {
    expect(() => toCents("abc")).toThrow("Invalid amount");
  });
});

describe("buildLineItems", () => {
  it("always includes base rent", () => {
    const items = buildLineItems("1500.00", []);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      type: "rent",
      description: "Aluguel",
      amount: "1500.00",
      source: "contract",
    });
  });

  it("adds additional components", () => {
    const items = buildLineItems("1500.00", [
      { type: "condominio", source: "manual", fixedAmount: "500.00" },
      { type: "iptu", source: "manual", fixedAmount: "200.00" },
    ]);
    expect(items).toHaveLength(3);
    expect(items[1].type).toBe("condominio");
    expect(items[2].amount).toBe("200.00");
  });

  it("skips components without fixedAmount", () => {
    const items = buildLineItems("1500.00", [
      { type: "condominio", source: "manual" },
    ]);
    expect(items).toHaveLength(1);
  });

  it("does not duplicate rent if in components", () => {
    const items = buildLineItems("1500.00", [
      { type: "rent", source: "contract", fixedAmount: "1500.00" },
    ]);
    expect(items).toHaveLength(1);
  });
});

describe("calcGrossAmount", () => {
  it("sums line items correctly", () => {
    const items = [
      { type: "rent", description: "Aluguel", amount: "1500.00", source: "contract" },
      { type: "condominio", description: "Condomínio", amount: "500.00", source: "manual" },
    ];
    expect(calcGrossAmount(items)).toBe("2000.00");
  });

  it("handles single item", () => {
    const items = [
      { type: "rent", description: "Aluguel", amount: "1500.00", source: "contract" },
    ];
    expect(calcGrossAmount(items)).toBe("1500.00");
  });
});

describe("calcLateFee (multa)", () => {
  const gross = "1500.00"; // R$ 1.500,00
  const pct = "2.00"; // 2%

  it("returns 0 if not late", () => {
    expect(calcLateFee(gross, pct, 0)).toBe("0.00");
    expect(calcLateFee(gross, pct, -1)).toBe("0.00");
  });

  it("applies flat 2% fee for 1 day late", () => {
    expect(calcLateFee(gross, pct, 1)).toBe("30.00");
  });

  it("applies same flat 2% fee for 5 days late (not compounding)", () => {
    expect(calcLateFee(gross, pct, 5)).toBe("30.00");
  });

  it("applies same flat 2% fee for 15 days late", () => {
    expect(calcLateFee(gross, pct, 15)).toBe("30.00");
  });

  it("applies same flat 2% fee for 30 days late", () => {
    expect(calcLateFee(gross, pct, 30)).toBe("30.00");
  });

  it("handles 0% fee", () => {
    expect(calcLateFee(gross, "0", 5)).toBe("0.00");
  });
});

describe("calcDailyInterest (juros)", () => {
  const gross = "1500.00";
  const daily = "0.033"; // 0.033% per day ≈ 1% per month

  it("returns 0 if not late", () => {
    expect(calcDailyInterest(gross, daily, 0)).toBe("0.00");
  });

  it("calculates 1 day interest", () => {
    // 1500 * 0.00033 * 1 = 0.495 → rounds to 0.50
    expect(calcDailyInterest(gross, daily, 1)).toBe("0.50");
  });

  it("calculates 5 days interest", () => {
    // 1500 * 0.00033 * 5 = 2.475 → rounds to 2.48
    expect(calcDailyInterest(gross, daily, 5)).toBe("2.48");
  });

  it("calculates 15 days interest", () => {
    // 1500 * 0.00033 * 15 = 7.425 → rounds to 7.43
    expect(calcDailyInterest(gross, daily, 15)).toBe("7.43");
  });

  it("calculates 30 days interest", () => {
    // 1500 * 0.00033 * 30 = 14.85
    expect(calcDailyInterest(gross, daily, 30)).toBe("14.85");
  });

  it("scales linearly with days", () => {
    const d10 = toCents(calcDailyInterest(gross, daily, 10));
    const d20 = toCents(calcDailyInterest(gross, daily, 20));
    // Should be approximately 2x (within rounding)
    expect(Math.abs(d20 - d10 * 2)).toBeLessThanOrEqual(1);
  });
});

describe("calcEarlyDiscount (desconto antecipação)", () => {
  const gross = "1500.00";

  it("returns 0 if not early", () => {
    expect(calcEarlyDiscount(gross, "5.00", 0)).toBe("0.00");
    expect(calcEarlyDiscount(gross, "5.00", -1)).toBe("0.00");
  });

  it("applies 5% discount for early payment", () => {
    expect(calcEarlyDiscount(gross, "5.00", 3)).toBe("75.00");
  });

  it("caps at max discount percentage", () => {
    // Request 15% but max is 10%
    expect(calcEarlyDiscount(gross, "15.00", 5, "10.00")).toBe("150.00");
  });

  it("respects custom max", () => {
    // Request 5% with max 3%
    expect(calcEarlyDiscount(gross, "5.00", 5, "3.00")).toBe("45.00");
  });
});

describe("calculateCharge (integration)", () => {
  it("calculates a standard on-time charge", () => {
    const result = calculateCharge({
      rentAmount: "1500.00",
      components: [],
      lateFeePercentage: "2.00",
      dailyInterestPercentage: "0.033",
      daysLate: 0,
    });

    expect(result.grossAmount).toBe("1500.00");
    expect(result.penaltyAmount).toBe("0.00");
    expect(result.discountAmount).toBe("0.00");
    expect(result.netAmount).toBe("1500.00");
    expect(result.lineItems).toHaveLength(1);
  });

  it("calculates a late charge with fee + interest", () => {
    const result = calculateCharge({
      rentAmount: "1500.00",
      components: [],
      lateFeePercentage: "2.00",
      dailyInterestPercentage: "0.033",
      daysLate: 10,
    });

    expect(result.grossAmount).toBe("1500.00");
    // Late fee: 30.00, Interest: 1500 * 0.00033 * 10 = 4.95
    expect(result.penaltyAmount).toBe("34.95");
    expect(result.netAmount).toBe("1534.95");
  });

  it("calculates a charge with early discount", () => {
    const result = calculateCharge({
      rentAmount: "1500.00",
      components: [],
      lateFeePercentage: "2.00",
      dailyInterestPercentage: "0.033",
      daysLate: 0,
      earlyDiscountPercentage: "5.00",
      daysEarly: 5,
    });

    expect(result.grossAmount).toBe("1500.00");
    expect(result.discountAmount).toBe("75.00");
    expect(result.penaltyAmount).toBe("0.00");
    expect(result.netAmount).toBe("1425.00");
  });

  it("calculates charge with components", () => {
    const result = calculateCharge({
      rentAmount: "1500.00",
      components: [
        { type: "condominio", source: "manual", fixedAmount: "500.00" },
        { type: "iptu", source: "manual", fixedAmount: "200.00" },
      ],
      lateFeePercentage: "2.00",
      dailyInterestPercentage: "0.033",
      daysLate: 0,
    });

    expect(result.grossAmount).toBe("2200.00");
    expect(result.netAmount).toBe("2200.00");
    expect(result.lineItems).toHaveLength(3);
  });

  it("no state regression: late and discount are mutually exclusive", () => {
    // If daysLate > 0 and daysEarly > 0, only penalty applies (daysEarly defaults to 0)
    const result = calculateCharge({
      rentAmount: "1500.00",
      components: [],
      lateFeePercentage: "2.00",
      dailyInterestPercentage: "0.033",
      daysLate: 5,
      earlyDiscountPercentage: "5.00",
      daysEarly: 0, // not early
    });

    expect(result.discountAmount).toBe("0.00");
    expect(parseFloat(result.penaltyAmount)).toBeGreaterThan(0);
    expect(parseFloat(result.netAmount)).toBeGreaterThan(parseFloat(result.grossAmount));
  });
});
