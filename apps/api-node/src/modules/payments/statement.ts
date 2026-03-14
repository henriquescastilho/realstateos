/**
 * Owner payout statement generation.
 * Builds a statement of entries for a given owner + contract + period.
 */

export interface StatementEntry {
  type: string;
  description: string;
  amount: string; // positive = credit to owner, negative = deduction
}

export interface ChargeForStatement {
  grossAmount: string;
  penaltyAmount: string;
  discountAmount: string;
  netAmount: string;
  lineItems: Array<{
    type: string;
    description: string;
    amount: string;
  }>;
}

export interface StatementConfig {
  adminFeePercentage?: string;  // e.g. "10.00" = 10% management fee
}

/**
 * Build statement entries from paid charges in a period.
 * Standard deductions: admin/management fee.
 * Returns entries array and total payout.
 */
export function buildStatementEntries(
  paidCharges: ChargeForStatement[],
  config: StatementConfig = {},
): { entries: StatementEntry[]; totalPayout: string } {
  const entries: StatementEntry[] = [];
  let totalIncomeCents = 0;
  let totalDeductionsCents = 0;

  // Aggregate income from all paid charges
  for (const charge of paidCharges) {
    const netCents = Math.round(parseFloat(charge.netAmount) * 100);
    totalIncomeCents += netCents;

    entries.push({
      type: "income",
      description: `Recebimento aluguel`,
      amount: charge.netAmount,
    });

    // If there were penalties collected, add as income line
    const penaltyCents = Math.round(parseFloat(charge.penaltyAmount) * 100);
    if (penaltyCents > 0) {
      entries.push({
        type: "penalty_income",
        description: "Multa e juros recebidos",
        amount: charge.penaltyAmount,
      });
      // Penalty is already included in netAmount, so don't double-count
    }
  }

  // Admin fee deduction
  const adminPct = parseFloat(config.adminFeePercentage ?? "0");
  if (adminPct > 0 && totalIncomeCents > 0) {
    // Admin fee is calculated on gross rent income (before penalties)
    const grossRentCents = paidCharges.reduce(
      (sum, c) => sum + Math.round(parseFloat(c.grossAmount) * 100),
      0,
    );
    const feeCents = Math.round(grossRentCents * (adminPct / 100));
    totalDeductionsCents += feeCents;

    entries.push({
      type: "admin_fee",
      description: `Taxa de administração (${adminPct}%)`,
      amount: `-${(feeCents / 100).toFixed(2)}`,
    });
  }

  const payoutCents = totalIncomeCents - totalDeductionsCents;
  const totalPayout = (payoutCents / 100).toFixed(2);

  return { entries, totalPayout };
}
