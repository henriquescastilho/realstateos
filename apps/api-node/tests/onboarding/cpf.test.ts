import { describe, it, expect } from "vitest";
import { isValidCPF, isValidCNPJ, validateDocument } from "../../src/modules/onboarding/cpf";

describe("CPF validation", () => {
  it("accepts a valid CPF", () => {
    // Known valid CPF: 529.982.247-25
    expect(isValidCPF("52998224725")).toBe(true);
  });

  it("accepts a formatted CPF", () => {
    expect(isValidCPF("529.982.247-25")).toBe(true);
  });

  it("rejects all-same-digit CPF", () => {
    expect(isValidCPF("11111111111")).toBe(false);
    expect(isValidCPF("00000000000")).toBe(false);
  });

  it("rejects wrong check digits", () => {
    expect(isValidCPF("52998224726")).toBe(false); // last digit changed
  });

  it("rejects wrong length", () => {
    expect(isValidCPF("1234567890")).toBe(false);
    expect(isValidCPF("123456789012")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidCPF("")).toBe(false);
  });

  // Additional valid CPFs for coverage
  it("validates multiple known-valid CPFs", () => {
    expect(isValidCPF("11144477735")).toBe(true);
    expect(isValidCPF("45317829097")).toBe(true);
  });
});

describe("CNPJ validation", () => {
  it("accepts a valid CNPJ", () => {
    // Known valid CNPJ: 11.222.333/0001-81
    expect(isValidCNPJ("11222333000181")).toBe(true);
  });

  it("accepts a formatted CNPJ", () => {
    expect(isValidCNPJ("11.222.333/0001-81")).toBe(true);
  });

  it("rejects all-same-digit CNPJ", () => {
    expect(isValidCNPJ("11111111111111")).toBe(false);
  });

  it("rejects wrong check digits", () => {
    expect(isValidCNPJ("11222333000182")).toBe(false);
  });

  it("rejects wrong length", () => {
    expect(isValidCNPJ("1122233300018")).toBe(false);
  });
});

describe("validateDocument", () => {
  it("detects CPF type for 11-digit valid doc", () => {
    const result = validateDocument("529.982.247-25");
    expect(result).toEqual({ type: "cpf", clean: "52998224725" });
  });

  it("detects CNPJ type for 14-digit valid doc", () => {
    const result = validateDocument("11.222.333/0001-81");
    expect(result).toEqual({ type: "cnpj", clean: "11222333000181" });
  });

  it("returns null for invalid document", () => {
    expect(validateDocument("12345678900")).toBeNull();
    expect(validateDocument("")).toBeNull();
    expect(validateDocument("abc")).toBeNull();
  });
});
