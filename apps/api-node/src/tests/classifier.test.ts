/**
 * Unit tests for maintenance ticket classifier — pure function.
 */
import { describe, it, expect } from "vitest";
import { classifyTicket } from "../modules/maintenance/classifier";

describe("classifyTicket", () => {
  // ── Empty / fallback ──────────────────────────────────────────────────────

  it("empty description returns general/medium", () => {
    const result = classifyTicket("");
    expect(result.category).toBe("general");
    expect(result.priority).toBe("medium");
    expect(result.confidence).toBe(0);
  });

  it("unrecognized description returns general/medium fallback", () => {
    const result = classifyTicket("problem with apartment");
    expect(result.category).toBe("general");
    expect(result.priority).toBe("medium");
  });

  // ── Urgent priorities ─────────────────────────────────────────────────────

  it("gas leak → gas/urgent", () => {
    const result = classifyTicket("Cheiro de gás muito forte no corredor");
    expect(result.category).toBe("gas");
    expect(result.priority).toBe("urgent");
  });

  it("electrical fire → electrical/urgent", () => {
    const result = classifyTicket("Curto circuito na tomada, risco de incêndio");
    expect(result.priority).toBe("urgent");
    expect(result.category).toBe("electrical");
  });

  it("flood / pipe burst → hydraulic/urgent", () => {
    const result = classifyTicket("Cano estourado, alagamento no banheiro");
    expect(result.category).toBe("hydraulic");
    expect(result.priority).toBe("urgent");
  });

  it("structural collapse → structural/urgent", () => {
    const result = classifyTicket("Risco estrutural na parede da garagem");
    expect(result.category).toBe("structural");
    expect(result.priority).toBe("urgent");
  });

  // ── High priorities ───────────────────────────────────────────────────────

  it("broken lock → security/high", () => {
    const result = classifyTicket("Fechadura da porta principal quebrada");
    expect(result.category).toBe("security");
    expect(result.priority).toBe("high");
  });

  it("power outage → electrical/high", () => {
    const result = classifyTicket("Queda de energia no apartamento inteiro");
    expect(result.priority).toBe("high");
    expect(result.category).toBe("electrical");
  });

  it("clogged drain → hydraulic/high", () => {
    const result = classifyTicket("Entupimento no ralo do banheiro");
    expect(result.category).toBe("hydraulic");
    expect(result.priority).toBe("high");
  });

  // ── Medium priorities ─────────────────────────────────────────────────────

  it("broken AC → appliance/medium", () => {
    const result = classifyTicket("Ar condicionado parou de funcionar");
    expect(result.category).toBe("appliance");
    expect(result.priority).toBe("medium");
  });

  it("mold/mildew → structural/medium", () => {
    const result = classifyTicket("Mofo na parede do quarto, infiltração");
    expect(result.category).toBe("structural");
    expect(result.priority).toBe("medium");
  });

  it("broken elevator → elevator/medium", () => {
    const result = classifyTicket("Elevador parou entre os andares");
    expect(result.category).toBe("elevator");
    expect(result.priority).toBe("medium");
  });

  // ── Low priorities ────────────────────────────────────────────────────────

  it("painting → painting/low", () => {
    const result = classifyTicket("Pintura da parede descascando");
    expect(result.category).toBe("painting");
    expect(result.priority).toBe("low");
  });

  it("cleaning → cleaning/low", () => {
    const result = classifyTicket("Limpeza da área comum necessária");
    expect(result.category).toBe("cleaning");
    expect(result.priority).toBe("low");
  });

  // ── Confidence ────────────────────────────────────────────────────────────

  it("confidence is between 0 and 100", () => {
    const cases = [
      "Vazamento urgente",
      "Pintura descascando",
      "Curto circuito",
      "Manutenção geral",
    ];
    for (const desc of cases) {
      const result = classifyTicket(desc);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    }
  });

  it("higher-weight categories produce higher confidence than lower-weight", () => {
    // Gas urgent rule: "cheiro de gás" matches "gás"+"cheiro de gás" = 2/5 keywords, weight=10
    // confidence = round(2/5 * 80 + 10*2) = round(32 + 20) = 52
    // Painting low: "pintura" = 1/6 keywords, weight=3
    // confidence = round(1/6 * 80 + 3*2) = round(13.3 + 6) = 19
    const urgent = classifyTicket("Cheiro de gás no corredor");
    const low = classifyTicket("pintura");
    expect(urgent.confidence).toBeGreaterThan(low.confidence);
  });

  // ── Case insensitivity ────────────────────────────────────────────────────

  it("classification is case-insensitive", () => {
    const lower = classifyTicket("vazamento no banheiro");
    const upper = classifyTicket("VAZAMENTO NO BANHEIRO");
    expect(lower.category).toBe(upper.category);
    expect(lower.priority).toBe(upper.priority);
  });
});
