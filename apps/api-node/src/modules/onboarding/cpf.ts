/**
 * CPF and CNPJ validation using the official Brazilian algorithm.
 * Pure functions — no side effects.
 */

function stripNonDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Validates a Brazilian CPF (11 digits).
 * Algorithm: two check-digit modulo-11 verifications.
 */
export function isValidCPF(raw: string): boolean {
  const cpf = stripNonDigits(raw);
  if (cpf.length !== 11) return false;

  // Reject known invalid sequences (all same digit)
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  // First check digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf[i], 10) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(cpf[9], 10)) return false;

  // Second check digit
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf[i], 10) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(cpf[10], 10)) return false;

  return true;
}

/**
 * Validates a Brazilian CNPJ (14 digits).
 * Algorithm: two check-digit modulo-11 verifications with positional weights.
 */
export function isValidCNPJ(raw: string): boolean {
  const cnpj = stripNonDigits(raw);
  if (cnpj.length !== 14) return false;

  // Reject all same digit
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  // First check digit
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(cnpj[i], 10) * weights1[i];
  }
  let remainder = sum % 11;
  const firstDigit = remainder < 2 ? 0 : 11 - remainder;
  if (firstDigit !== parseInt(cnpj[12], 10)) return false;

  // Second check digit
  sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += parseInt(cnpj[i], 10) * weights2[i];
  }
  remainder = sum % 11;
  const secondDigit = remainder < 2 ? 0 : 11 - remainder;
  if (secondDigit !== parseInt(cnpj[13], 10)) return false;

  return true;
}

/**
 * Validates a document number as either CPF or CNPJ based on length.
 * Returns the type detected or null if invalid.
 */
export function validateDocument(raw: string): { type: "cpf" | "cnpj"; clean: string } | null {
  const clean = stripNonDigits(raw);
  if (clean.length === 11 && isValidCPF(clean)) {
    return { type: "cpf", clean };
  }
  if (clean.length === 14 && isValidCNPJ(clean)) {
    return { type: "cnpj", clean };
  }
  return null;
}
