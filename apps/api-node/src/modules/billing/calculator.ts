/**
 * Pure financial calculation functions for the billing engine.
 * All monetary values use string representation to avoid floating-point issues.
 * Internally uses integer cents for precision.
 */

// ─── Helpers ───

/** Convert string amount (e.g. "1500.00") to integer cents */
export function toCents(amount: string): number {
  const parsed = parseFloat(amount);
  if (isNaN(parsed)) throw new Error(`Invalid amount: ${amount}`);
  return Math.round(parsed * 100);
}

/** Convert integer cents to string amount with 2 decimal places */
export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

// ─── Line Item Types ───

export interface LineItem {
  type: string;
  description: string;
  amount: string; // decimal string
  source: string;
}

export interface ChargeCalculation {
  lineItems: LineItem[];
  grossAmount: string;
  discountAmount: string;
  penaltyAmount: string;
  netAmount: string;
}

// ─── Core Calculations ───

/**
 * Build line items for a charge period.
 * Always includes base rent; adds any additional components from the billing schedule.
 */
export function buildLineItems(
  rentAmount: string,
  components: Array<{ type: string; source: string; fixedAmount?: string }>,
): LineItem[] {
  const items: LineItem[] = [
    {
      type: "rent",
      description: "Aluguel",
      amount: rentAmount,
      source: "contract",
    },
  ];

  for (const comp of components) {
    if (comp.type === "rent") continue; // already added
    if (!comp.fixedAmount) continue;

    items.push({
      type: comp.type,
      description: comp.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      amount: comp.fixedAmount,
      source: comp.source,
    });
  }

  return items;
}

/**
 * Sum all line item amounts to get gross total.
 */
export function calcGrossAmount(lineItems: LineItem[]): string {
  const totalCents = lineItems.reduce((sum, item) => sum + toCents(item.amount), 0);
  return fromCents(totalCents);
}

/**
 * Calculate late fee (multa) as a percentage of the gross amount.
 * Brazilian standard: typically 2% flat fee applied once.
 *
 * @param grossAmount - the original charge amount
 * @param feePercentage - percentage as string (e.g. "2.00" = 2%)
 * @param daysLate - number of days past due date (0 = no fee)
 * @returns fee amount as string, "0.00" if not late
 */
export function calcLateFee(
  grossAmount: string,
  feePercentage: string,
  daysLate: number,
): string {
  if (daysLate <= 0) return "0.00";

  const grossCents = toCents(grossAmount);
  const pct = parseFloat(feePercentage);
  if (isNaN(pct) || pct <= 0) return "0.00";

  // Late fee is a flat percentage (not compounding per day)
  const feeCents = Math.round(grossCents * (pct / 100));
  return fromCents(feeCents);
}

/**
 * Calculate pro-rata daily interest (juros).
 * Brazilian standard: daily percentage applied per day late.
 *
 * @param grossAmount - the original charge amount
 * @param dailyPercentage - daily interest rate as string (e.g. "0.033" = 0.033%/day)
 * @param daysLate - number of days past due date
 * @returns interest amount as string
 */
export function calcDailyInterest(
  grossAmount: string,
  dailyPercentage: string,
  daysLate: number,
): string {
  if (daysLate <= 0) return "0.00";

  const grossCents = toCents(grossAmount);
  const dailyPct = parseFloat(dailyPercentage);
  if (isNaN(dailyPct) || dailyPct <= 0) return "0.00";

  // Simple interest: principal × rate × days
  const interestCents = Math.round(grossCents * (dailyPct / 100) * daysLate);
  return fromCents(interestCents);
}

/**
 * Calculate early payment discount.
 * Discount applies only if paid before due date.
 *
 * @param grossAmount - the original charge amount
 * @param discountPercentage - discount percentage (e.g. "5.00" = 5%)
 * @param daysEarly - days before due date (positive = early, 0 or negative = no discount)
 * @param maxDiscountPercentage - cap on discount (default 10%)
 * @returns discount amount as string
 */
export function calcEarlyDiscount(
  grossAmount: string,
  discountPercentage: string,
  daysEarly: number,
  maxDiscountPercentage = "10.00",
): string {
  if (daysEarly <= 0) return "0.00";

  const grossCents = toCents(grossAmount);
  let pct = parseFloat(discountPercentage);
  const maxPct = parseFloat(maxDiscountPercentage);

  if (isNaN(pct) || pct <= 0) return "0.00";

  // Cap discount at max
  if (pct > maxPct) pct = maxPct;

  const discountCents = Math.round(grossCents * (pct / 100));
  return fromCents(discountCents);
}

/**
 * Calculate the full charge breakdown.
 * Combines line items, late fees, interest, and early discount.
 */
export function calculateCharge(params: {
  rentAmount: string;
  components: Array<{ type: string; source: string; fixedAmount?: string }>;
  lateFeePercentage: string;
  dailyInterestPercentage: string;
  daysLate: number;
  earlyDiscountPercentage?: string;
  daysEarly?: number;
}): ChargeCalculation {
  const lineItems = buildLineItems(params.rentAmount, params.components);
  const grossAmount = calcGrossAmount(lineItems);

  const lateFee = calcLateFee(grossAmount, params.lateFeePercentage, params.daysLate);
  const interest = calcDailyInterest(grossAmount, params.dailyInterestPercentage, params.daysLate);
  const discount = calcEarlyDiscount(
    grossAmount,
    params.earlyDiscountPercentage ?? "0",
    params.daysEarly ?? 0,
  );

  // penalty = lateFee + interest
  const penaltyCents = toCents(lateFee) + toCents(interest);
  const penaltyAmount = fromCents(penaltyCents);

  // net = gross + penalty - discount
  const netCents = toCents(grossAmount) + penaltyCents - toCents(discount);
  const netAmount = fromCents(netCents);

  return {
    lineItems,
    grossAmount,
    discountAmount: discount,
    penaltyAmount,
    netAmount,
  };
}
