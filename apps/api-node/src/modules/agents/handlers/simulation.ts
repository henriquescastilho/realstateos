/**
 * SIMULATION — Runs the full agent pipeline for a single contract
 * and generates a Gemini-powered report sent to the admin email.
 *
 * Flow: Maestro → Cobrador → Sentinela → Pagador → Contador → Gemini Report → Email
 */

import { eq, and } from "drizzle-orm";
import { db } from "../../../db";
import {
  leaseContracts,
  owners,
  tenants,
  properties,
  organizations,
  charges,
  payments,
} from "../../../db/schema";
import { handleMaestroCompose } from "./maestro-compose";
import { handleCobradorCollect } from "./cobrador-collect";
import { handleSentinelaWatch } from "./sentinela-watch";
import { handlePagadorPayout } from "./pagador-payout";
import { handleContadorStatement } from "./contador-statement";
import { sendMessage } from "../../communications/service";
import type { AgentTask } from "../../../types/domain";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

interface SimulationStep {
  agent: string;
  status: string;
  confidence?: number;
  summary: string;
  output: Record<string, unknown>;
  durationMs: number;
}

export interface SimulationResult {
  contractId: string;
  billingPeriod: string;
  steps: SimulationStep[];
  report: string;
  emailSent: boolean;
  totalDurationMs: number;
}

function makeTask(orgId: string, taskType: string, input: Record<string, unknown>): AgentTask {
  return {
    id: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    orgId,
    taskType,
    input,
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as AgentTask;
}

async function callGemini(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) return "Gemini API key not configured.";

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: `Você é o analista-chefe da plataforma Real Estate OS.
Gere relatórios executivos em português brasileiro para donos de imobiliárias.
Seja profissional, direto e use dados concretos. Formate com seções claras.
Inclua: resumo executivo, detalhamento por etapa, métricas, previsões e recomendações.`,
          }],
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
      }),
    },
  );

  const json = await resp.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? "Falha ao gerar relatório.";
}

export async function runSimulation(
  orgId: string,
  contractId: string,
  adminEmail: string,
): Promise<SimulationResult> {
  const totalStart = Date.now();
  const steps: SimulationStep[] = [];

  // Load contract details
  const [contract] = await db.select().from(leaseContracts).where(eq(leaseContracts.id, contractId)).limit(1);
  if (!contract) throw new Error("Contrato não encontrado");

  const [owner] = await db.select().from(owners).where(eq(owners.id, contract.ownerId)).limit(1);
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, contract.tenantId)).limit(1);
  const [property] = await db.select().from(properties).where(eq(properties.id, contract.propertyId)).limit(1);
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);

  // Use next month as billing period
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const billingPeriod = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;

  // ── Step 1: Maestro — Compose charges ──
  let start = Date.now();
  try {
    const result = await handleMaestroCompose(
      makeTask(orgId, "maestro_compose", { orgId, billingPeriod }),
    );
    steps.push({
      agent: "Maestro",
      status: result.status,
      confidence: result.confidence,
      summary: `${(result.output as { chargesCreated?: number }).chargesCreated ?? 0} cobranças compostas para ${billingPeriod}`,
      output: result.output,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    steps.push({ agent: "Maestro", status: "failed", summary: String(err), output: {}, durationMs: Date.now() - start });
  }

  // Get created charge IDs for this specific contract
  const contractCharges = await db
    .select()
    .from(charges)
    .where(
      and(
        eq(charges.leaseContractId, contractId),
        eq(charges.billingPeriod, billingPeriod),
      ),
    );

  const chargeIds = contractCharges.map((c) => c.id);

  // ── Step 2: Cobrador — Issue boletos + notify ──
  start = Date.now();
  if (chargeIds.length > 0) {
    try {
      const result = await handleCobradorCollect(
        makeTask(orgId, "cobrador_collect", { chargeIds }),
      );
      steps.push({
        agent: "Cobrador",
        status: result.status,
        confidence: result.confidence,
        summary: `${(result.output as { successful?: number }).successful ?? 0} boletos emitidos e enviados`,
        output: result.output,
        durationMs: Date.now() - start,
      });
    } catch (err) {
      steps.push({ agent: "Cobrador", status: "failed", summary: String(err), output: {}, durationMs: Date.now() - start });
    }
  } else {
    steps.push({ agent: "Cobrador", status: "skipped", summary: "Nenhuma cobrança para emitir", output: {}, durationMs: 0 });
  }

  // ── Step 3: Sentinela — Check overdue + reconcile ──
  start = Date.now();
  try {
    const result = await handleSentinelaWatch(
      makeTask(orgId, "sentinela_watch", { mode: "cron" }),
    );
    steps.push({
      agent: "Sentinela",
      status: result.status,
      confidence: result.confidence,
      summary: `${(result.output as { overdueCount?: number }).overdueCount ?? 0} cobranças em atraso detectadas`,
      output: result.output,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    steps.push({ agent: "Sentinela", status: "failed", summary: String(err), output: {}, durationMs: Date.now() - start });
  }

  // ── Step 4: Pagador — Pay bills + calculate payout ──
  start = Date.now();
  try {
    const result = await handlePagadorPayout(
      makeTask(orgId, "pagador_payout", { mode: "payout", billingPeriod }),
    );
    steps.push({
      agent: "Pagador",
      status: result.status,
      confidence: result.confidence,
      summary: `Repasses calculados para ${(result.output as { payoutCount?: number }).payoutCount ?? 0} proprietários`,
      output: result.output,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    steps.push({ agent: "Pagador", status: "failed", summary: String(err), output: {}, durationMs: Date.now() - start });
  }

  // ── Step 5: Contador — Generate statements ──
  start = Date.now();
  try {
    const result = await handleContadorStatement(
      makeTask(orgId, "contador_statement", { ownerId: contract.ownerId, period: billingPeriod }),
    );
    steps.push({
      agent: "Contador",
      status: result.status,
      confidence: result.confidence,
      summary: `${(result.output as { statementsGenerated?: number }).statementsGenerated ?? 0} extratos gerados`,
      output: result.output,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    steps.push({ agent: "Contador", status: "failed", summary: String(err), output: {}, durationMs: Date.now() - start });
  }

  // ── Step 6: Gemini — Generate executive report ──
  start = Date.now();
  const reportPrompt = `Gere um relatório executivo completo sobre a simulação do pipeline de gestão imobiliária.

DADOS DA SIMULAÇÃO:
- Imobiliária: ${org?.name ?? "N/A"}
- Período: ${billingPeriod}
- Contrato: ${contract.id}
- Proprietário: ${owner?.fullName ?? "N/A"} (${owner?.email ?? "N/A"})
- Inquilino: ${tenant?.fullName ?? "N/A"} (${tenant?.email ?? "N/A"})
- Imóvel: ${property?.address ?? "N/A"}, ${property?.city ?? "N/A"}/${property?.state ?? "N/A"}
- Aluguel: R$ ${contract.rentAmount}

RESULTADO DE CADA AGENTE:
${steps.map((s) => `
### ${s.agent}
- Status: ${s.status}
- Confiança: ${s.confidence !== undefined ? (s.confidence * 100).toFixed(0) + "%" : "N/A"}
- Resumo: ${s.summary}
- Tempo: ${s.durationMs}ms
- Dados: ${JSON.stringify(s.output, null, 2)}
`).join("\n")}

TOTAL DE AGENTES EXECUTADOS: ${steps.length}
TEMPO TOTAL ATÉ AQUI: ${Date.now() - totalStart}ms

Inclua no relatório:
1. Resumo executivo (2-3 parágrafos)
2. Detalhamento de cada agente com status e observações
3. Métricas de performance do pipeline
4. Previsões financeiras para os próximos 3 meses
5. Recomendações de otimização
6. Indicadores de saúde do portfólio`;

  let report = "";
  try {
    report = await callGemini(reportPrompt);
    steps.push({
      agent: "REOS AI",
      status: "completed",
      confidence: 0.95,
      summary: "Relatório executivo gerado com sucesso",
      output: { reportLength: report.length },
      durationMs: Date.now() - start,
    });
  } catch (err) {
    report = "Falha ao gerar relatório com IA.";
    steps.push({ agent: "REOS AI", status: "failed", summary: String(err), output: {}, durationMs: Date.now() - start });
  }

  // ── Step 7: Send email report ──
  let emailSent = false;
  start = Date.now();
  try {
    await sendMessage({
      orgId,
      entityType: "simulation",
      entityId: contract.id,
      channel: "email",
      templateType: "simulation_report",
      recipient: adminEmail,
      templateData: {
        orgName: org?.name ?? "",
        ownerName: owner?.fullName ?? "",
        tenantName: tenant?.fullName ?? "",
        propertyAddress: property?.address ?? "",
        billingPeriod,
        rentAmount: contract.rentAmount,
        report,
        steps: steps.map((s) => ({
          agent: s.agent,
          status: s.status,
          confidence: s.confidence,
          summary: s.summary,
          durationMs: s.durationMs,
        })),
      },
    });
    emailSent = true;
    steps.push({
      agent: "Email",
      status: "completed",
      summary: `Relatório enviado para ${adminEmail}`,
      output: { recipient: adminEmail },
      durationMs: Date.now() - start,
    });
  } catch (err) {
    steps.push({ agent: "Email", status: "failed", summary: String(err), output: {}, durationMs: Date.now() - start });
  }

  return {
    contractId,
    billingPeriod,
    steps,
    report,
    emailSent,
    totalDurationMs: Date.now() - totalStart,
  };
}
