/**
 * Evolution API channel — open-source WhatsApp integration.
 * Same interface as whatsapp.ts but connects to self-hosted Evolution API.
 */

export interface EvolutionConfig {
  baseUrl: string;  // e.g. "https://evolution.example.com"
  apiKey: string;
  instanceName: string;
}

export interface EvolutionResult {
  success: boolean;
  provider: "evolution-api";
  messageId?: string;
  error?: string;
}

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned.startsWith("+")) {
    if (cleaned.startsWith("55") && cleaned.length >= 12) {
      cleaned = `+${cleaned}`;
    } else if (cleaned.length === 10 || cleaned.length === 11) {
      cleaned = `+55${cleaned}`;
    } else {
      cleaned = `+${cleaned}`;
    }
  }
  // Evolution API expects number without + prefix
  return cleaned.replace("+", "");
}

export async function sendTextViaEvolution(
  config: EvolutionConfig,
  payload: { to: string; body: string },
): Promise<EvolutionResult> {
  const phone = normalizePhone(payload.to);

  try {
    const res = await fetch(
      `${config.baseUrl}/message/sendText/${config.instanceName}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.apiKey,
        },
        body: JSON.stringify({
          number: phone,
          text: payload.body,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        provider: "evolution-api",
        error: `HTTP ${res.status}: ${errText.slice(0, 200)}`,
      };
    }

    const data = (await res.json()) as { key?: { id?: string } };
    return {
      success: true,
      provider: "evolution-api",
      messageId: data.key?.id ?? `evo_${Date.now()}`,
    };
  } catch (err) {
    return {
      success: false,
      provider: "evolution-api",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function sendTemplateViaEvolution(
  config: EvolutionConfig,
  payload: { to: string; templateName: string; params?: string[] },
): Promise<EvolutionResult> {
  // Evolution API uses the same sendText for templates
  // Template rendering should be done before calling this
  return sendTextViaEvolution(config, {
    to: payload.to,
    body: `[Template: ${payload.templateName}] ${(payload.params ?? []).join(", ")}`,
  });
}
