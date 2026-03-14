/**
 * Unit tests for CPF/CNPJ validation — pure functions.
 */
import { describe, it, expect } from "vitest";
import { isValidCPF, isValidCNPJ, validateDocument } from "../modules/onboarding/cpf";

// ── isValidCPF ────────────────────────────────────────────────────────────────

describe("isValidCPF", () => {
  it("validates a known valid CPF (formatted)", () => {
    expect(isValidCPF("529.982.247-25")).toBe(true);
  });

  it("validates a known valid CPF (digits only)", () => {
    expect(isValidCPF("52998224725")).toBe(true);
  });

  it("validates second known valid CPF", () => {
    expect(isValidCPF("111.444.777-35")).toBe(true);
  });

  it("rejects all-same-digit CPF (000...)", () => {
    expect(isValidCPF("000.000.000-00")).toBe(false);
  });

  it("rejects all-same-digit CPF (111...)", () => {
    expect(isValidCPF("111.111.111-11")).toBe(false);
  });

  it("rejects CPF with wrong check digit", () => {
    // Flip the last digit of a valid CPF
    expect(isValidCPF("529.982.247-26")).toBe(false);
  });

  it("rejects CPF that is too short", () => {
    expect(isValidCPF("1234567890")).toBe(false);
  });

  it("rejects CPF that is too long", () => {
    expect(isValidCPF("123456789012")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidCPF("")).toBe(false);
  });

  it("rejects alphabetic string", () => {
    expect(isValidCPF("abcdefghijk")).toBe(false);
  });

  it("strips formatting before validating", () => {
    // Same CPF with various formats
    expect(isValidCPF("529982247-25")).toBe(true);
    expect(isValidCPF("529.982.24725")).toBe(true);
  });
});

// ── isValidCNPJ ───────────────────────────────────────────────────────────────

describe("isValidCNPJ", () => {
  it("validates a known valid CNPJ (digits only)", () => {
    expect(isValidCNPJ("11222333000181")).toBe(true);
  });

  it("validates known valid CNPJ (formatted)", () => {
    expect(isValidCNPJ("11.222.333/0001-81")).toBe(true);
  });

  it("rejects all-same-digit CNPJ", () => {
    expect(isValidCNPJ("00000000000000")).toBe(false);
    expect(isValidCNPJ("11111111111111")).toBe(false);
  });

  it("rejects CNPJ with wrong check digit", () => {
    expect(isValidCNPJ("11222333000182")).toBe(false);
  });

  it("rejects CNPJ that is too short", () => {
    expect(isValidCNPJ("1122233300018")).toBe(false);
  });

  it("rejects CNPJ that is too long", () => {
    expect(isValidCNPJ("112223330001810")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidCNPJ("")).toBe(false);
  });

  it("strips formatting before validating", () => {
    expect(isValidCNPJ("11222333/0001-81")).toBe(true);
  });
});

// ── validateDocument ──────────────────────────────────────────────────────────

describe("validateDocument", () => {
  it("returns cpf type for valid CPF", () => {
    const result = validateDocument("529.982.247-25");
    expect(result).not.toBeNull();
    expect(result?.type).toBe("cpf");
    expect(result?.clean).toBe("52998224725");
  });

  it("returns cnpj type for valid CNPJ", () => {
    const result = validateDocument("11.222.333/0001-81");
    expect(result).not.toBeNull();
    expect(result?.type).toBe("cnpj");
    expect(result?.clean).toBe("11222333000181");
  });

  it("returns null for invalid CPF", () => {
    expect(validateDocument("000.000.000-00")).toBeNull();
  });

  it("returns null for invalid CNPJ", () => {
    expect(validateDocument("11222333000182")).toBeNull();
  });

  it("returns null for random string", () => {
    expect(validateDocument("not-a-document")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(validateDocument("")).toBeNull();
  });

  it("clean field has only digits", () => {
    const result = validateDocument("529.982.247-25");
    expect(result?.clean).toMatch(/^\d+$/);
  });
});
