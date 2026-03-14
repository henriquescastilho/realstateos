/**
 * Maintenance ticket classifier.
 * Assigns category and priority based on description keywords.
 * Pure function — no DB or external dependencies.
 */

export interface ClassificationResult {
  category: string;
  priority: "low" | "medium" | "high" | "urgent";
  confidence: number; // 0-100
}

interface Rule {
  category: string;
  priority: "low" | "medium" | "high" | "urgent";
  keywords: string[];
  weight: number; // higher = stronger match
}

const RULES: Rule[] = [
  // ─── Urgent ───
  {
    category: "hydraulic",
    priority: "urgent",
    keywords: ["vazamento", "leak", "inundação", "flood", "alagamento", "cano estourado", "pipe burst", "água", "water damage"],
    weight: 10,
  },
  {
    category: "electrical",
    priority: "urgent",
    keywords: ["curto circuito", "short circuit", "choque", "shock", "faísca", "spark", "incêndio", "fire", "fio exposto", "exposed wire"],
    weight: 10,
  },
  {
    category: "gas",
    priority: "urgent",
    keywords: ["gás", "gas leak", "vazamento de gás", "cheiro de gás", "gas smell"],
    weight: 10,
  },
  {
    category: "structural",
    priority: "urgent",
    keywords: ["desabamento", "collapse", "rachadura estrutural", "structural crack", "risco estrutural"],
    weight: 10,
  },

  // ─── High ───
  {
    category: "hydraulic",
    priority: "high",
    keywords: ["entupimento", "clog", "descarga", "flush", "torneira", "faucet", "encanamento", "plumbing", "esgoto", "sewer"],
    weight: 7,
  },
  {
    category: "electrical",
    priority: "high",
    keywords: ["disjuntor", "breaker", "queda de energia", "power outage", "tomada", "outlet", "fiação", "wiring"],
    weight: 7,
  },
  {
    category: "security",
    priority: "high",
    keywords: ["fechadura", "lock", "porta", "door", "arrombamento", "break-in", "alarme", "alarm", "câmera", "camera"],
    weight: 7,
  },

  // ─── Medium ───
  {
    category: "appliance",
    priority: "medium",
    keywords: ["geladeira", "fridge", "fogão", "stove", "máquina de lavar", "washing machine", "ar condicionado", "ac", "chuveiro", "shower", "aquecedor", "heater"],
    weight: 5,
  },
  {
    category: "structural",
    priority: "medium",
    keywords: ["rachadura", "crack", "infiltração", "seepage", "mofo", "mold", "umidade", "humidity", "goteira", "roof leak", "telhado", "roof"],
    weight: 5,
  },
  {
    category: "elevator",
    priority: "medium",
    keywords: ["elevador", "elevator", "lift"],
    weight: 5,
  },

  // ─── Low ───
  {
    category: "painting",
    priority: "low",
    keywords: ["pintura", "paint", "parede", "wall", "descascando", "peeling"],
    weight: 3,
  },
  {
    category: "cleaning",
    priority: "low",
    keywords: ["limpeza", "cleaning", "sujeira", "dirt", "área comum", "common area"],
    weight: 3,
  },
  {
    category: "general",
    priority: "low",
    keywords: ["manutenção", "maintenance", "reparo", "repair", "conserto", "fix"],
    weight: 2,
  },
];

/**
 * Classify a maintenance ticket description.
 * Returns the best-matching category and priority.
 */
export function classifyTicket(description: string): ClassificationResult {
  const normalized = description.toLowerCase().trim();

  if (!normalized) {
    return { category: "general", priority: "medium", confidence: 0 };
  }

  let bestMatch: { rule: Rule; matchCount: number } | null = null;

  for (const rule of RULES) {
    const matchCount = rule.keywords.filter((kw) =>
      normalized.includes(kw.toLowerCase()),
    ).length;

    if (matchCount === 0) continue;

    const score = matchCount * rule.weight;

    if (!bestMatch || score > bestMatch.matchCount * bestMatch.rule.weight) {
      bestMatch = { rule, matchCount: score / rule.weight };
    }
  }

  if (!bestMatch) {
    return { category: "general", priority: "medium", confidence: 20 };
  }

  // Confidence based on keyword matches and weight
  const maxPossibleMatches = bestMatch.rule.keywords.length;
  const matchRatio = bestMatch.matchCount / maxPossibleMatches;
  const confidence = Math.min(95, Math.round(matchRatio * 80 + bestMatch.rule.weight * 2));

  return {
    category: bestMatch.rule.category,
    priority: bestMatch.rule.priority,
    confidence,
  };
}
