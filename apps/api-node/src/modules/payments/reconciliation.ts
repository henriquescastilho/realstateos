/**
 * Payment reconciliation algorithm.
 * Pure functions — matching logic with no DB side effects.
 *
 * Priority order:
 *   1. Exact bank_reference match
 *   2. Exact amount match on open charges for the same org
 *
 * After matching, classifies the result:
 *   - matched:   receivedAmount === charge.netAmount
 *   - partial:   receivedAmount < charge.netAmount
 *   - divergent: receivedAmount > charge.netAmount or other mismatch
 */

export interface MatchCandidate {
  chargeId: string;
  netAmount: string;        // decimal string
  bankReference?: string | null;
  paymentStatus: string;
}

export interface ReconciliationResult {
  chargeId: string;
  status: "matched" | "partial" | "divergent";
  divergenceReason?: string;
}

/**
 * Try to match a payment to a charge by bank reference.
 * Returns the matching charge or null.
 */
export function matchByBankReference(
  bankReference: string | undefined | null,
  candidates: MatchCandidate[],
): MatchCandidate | null {
  if (!bankReference) return null;

  const match = candidates.find(
    (c) => c.bankReference === bankReference && c.paymentStatus === "open",
  );
  return match ?? null;
}

/**
 * Try to match a payment to a charge by exact amount.
 * Only matches open charges. If multiple charges have the same amount,
 * returns the first one (oldest by array order — caller should sort by dueDate).
 */
export function matchByAmount(
  receivedAmount: string,
  candidates: MatchCandidate[],
): MatchCandidate | null {
  const match = candidates.find(
    (c) => c.netAmount === receivedAmount && c.paymentStatus === "open",
  );
  return match ?? null;
}

/**
 * Classify a reconciliation based on received vs expected amount.
 */
export function classifyReconciliation(
  receivedAmount: string,
  expectedAmount: string,
): { status: "matched" | "partial" | "divergent"; divergenceReason?: string } {
  const received = parseFloat(receivedAmount);
  const expected = parseFloat(expectedAmount);

  if (isNaN(received) || isNaN(expected)) {
    return { status: "divergent", divergenceReason: "Invalid amount format" };
  }

  // Use cents comparison to avoid floating-point issues
  const receivedCents = Math.round(received * 100);
  const expectedCents = Math.round(expected * 100);

  if (receivedCents === expectedCents) {
    return { status: "matched" };
  }

  if (receivedCents < expectedCents) {
    const diff = ((expectedCents - receivedCents) / 100).toFixed(2);
    return {
      status: "partial",
      divergenceReason: `Underpayment of R$ ${diff} (expected ${expectedAmount}, received ${receivedAmount})`,
    };
  }

  const diff = ((receivedCents - expectedCents) / 100).toFixed(2);
  return {
    status: "divergent",
    divergenceReason: `Overpayment of R$ ${diff} (expected ${expectedAmount}, received ${receivedAmount})`,
  };
}

/**
 * Full reconciliation pipeline.
 * Tries bank reference first, then amount match.
 * Returns the result or null if no match found.
 */
export function reconcile(
  receivedAmount: string,
  bankReference: string | undefined | null,
  candidates: MatchCandidate[],
): ReconciliationResult | null {
  // Priority 1: bank reference
  let match = matchByBankReference(bankReference, candidates);

  // Priority 2: exact amount
  if (!match) {
    match = matchByAmount(receivedAmount, candidates);
  }

  if (!match) return null;

  const classification = classifyReconciliation(receivedAmount, match.netAmount);

  return {
    chargeId: match.chargeId,
    status: classification.status,
    divergenceReason: classification.divergenceReason,
  };
}
