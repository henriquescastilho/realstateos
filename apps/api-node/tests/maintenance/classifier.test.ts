import { describe, it, expect } from "vitest";
import { classifyTicket } from "../../src/modules/maintenance/classifier";

describe("classifyTicket", () => {
  // ─── Urgent cases ───
  it("classifies water leak as urgent hydraulic", () => {
    const result = classifyTicket("Há um vazamento de água no banheiro, está inundando");
    expect(result.category).toBe("hydraulic");
    expect(result.priority).toBe("urgent");
    expect(result.confidence).toBeGreaterThan(20);
  });

  it("classifies gas leak as urgent", () => {
    const result = classifyTicket("Estou sentindo cheiro de gás na cozinha");
    expect(result.category).toBe("gas");
    expect(result.priority).toBe("urgent");
  });

  it("classifies exposed wire as urgent electrical", () => {
    const result = classifyTicket("Tem um fio exposto na sala, dando faísca");
    expect(result.category).toBe("electrical");
    expect(result.priority).toBe("urgent");
  });

  // ─── High priority ───
  it("classifies clogged drain as high hydraulic", () => {
    const result = classifyTicket("O encanamento da pia está com entupimento");
    expect(result.category).toBe("hydraulic");
    expect(result.priority).toBe("high");
  });

  it("classifies broken lock as high security", () => {
    const result = classifyTicket("A fechadura da porta principal quebrou");
    expect(result.category).toBe("security");
    expect(result.priority).toBe("high");
  });

  it("classifies power outage as high electrical", () => {
    const result = classifyTicket("Queda de energia no apartamento, o disjuntor não liga");
    expect(result.category).toBe("electrical");
    expect(result.priority).toBe("high");
  });

  // ─── Medium priority ───
  it("classifies broken AC as medium appliance", () => {
    const result = classifyTicket("O ar condicionado parou de funcionar");
    expect(result.category).toBe("appliance");
    expect(result.priority).toBe("medium");
  });

  it("classifies roof leak as medium structural", () => {
    const result = classifyTicket("Tem uma goteira no teto do quarto");
    expect(result.category).toBe("structural");
    expect(result.priority).toBe("medium");
  });

  it("classifies mold as medium structural", () => {
    const result = classifyTicket("Apareceu mofo na parede do banheiro com infiltração");
    expect(result.category).toBe("structural");
    expect(result.priority).toBe("medium");
  });

  // ─── Low priority ───
  it("classifies peeling paint as low painting", () => {
    const result = classifyTicket("A pintura da parede está descascando");
    expect(result.category).toBe("painting");
    expect(result.priority).toBe("low");
  });

  it("classifies cleaning issue as low", () => {
    const result = classifyTicket("A área comum precisa de limpeza");
    expect(result.category).toBe("cleaning");
    expect(result.priority).toBe("low");
  });

  // ─── Edge cases ───
  it("returns general/medium for unrecognized description", () => {
    const result = classifyTicket("Preciso de ajuda com algo no apartamento");
    expect(result.category).toBe("general");
    expect(result.priority).toBe("medium");
    expect(result.confidence).toBeLessThanOrEqual(20);
  });

  it("returns general/medium/0 for empty description", () => {
    const result = classifyTicket("");
    expect(result.category).toBe("general");
    expect(result.priority).toBe("medium");
    expect(result.confidence).toBe(0);
  });

  it("is case insensitive", () => {
    const lower = classifyTicket("vazamento de água");
    const upper = classifyTicket("VAZAMENTO DE ÁGUA");
    expect(lower.category).toBe(upper.category);
    expect(lower.priority).toBe(upper.priority);
  });

  it("handles English descriptions", () => {
    const result = classifyTicket("There is a water leak in the bathroom");
    expect(result.category).toBe("hydraulic");
    expect(result.priority).toBe("urgent");
  });

  it("higher urgency wins over lower for multi-keyword match", () => {
    // "vazamento" (urgent) + "torneira" (high) → urgent should win due to higher weight
    const result = classifyTicket("Vazamento na torneira da cozinha");
    expect(result.priority).toBe("urgent");
  });

  it("confidence increases with more keyword matches", () => {
    const single = classifyTicket("vazamento");
    const multi = classifyTicket("vazamento de água com inundação");
    expect(multi.confidence).toBeGreaterThanOrEqual(single.confidence);
  });
});
