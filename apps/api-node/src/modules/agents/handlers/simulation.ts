/**
 * SIMULATION — Runs the full agent pipeline for a single contract,
 * simulates payment (baixa), generates 3 PDFs, and sends them by email.
 *
 * Flow: Maestro → Cobrador → [Baixa] → Sentinela → Pagador → Contador → Gemini Report → PDF → Email
 *
 * PDFs:
 *   1. Boleto do inquilino
 *   2. Extrato de repasse do proprietário
 *   3. Relatório da imobiliária (pipeline + análise IA)
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
import { sendEmail } from "../../communications/channels/email";
import {
  renderBoletoHtml,
  renderStatementHtml,
  renderSimulationReportHtml,
} from "../../communications/html-templates";
import { htmlToPdf } from "../../../lib/pdf";
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

  const json = await resp.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
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

  const orgName = org?.name ?? "Imobiliária";
  const ownerName = owner?.fullName ?? "Proprietário";
  const tenantName = tenant?.fullName ?? "Inquilino";
  const propertyAddress = property ? `${property.address}, ${property.city}/${property.state}` : "Endereço não informado";

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

  // Get created charge for this specific contract
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
  const charge = contractCharges[0]; // main charge for this contract

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

  // ── Step 2.5: Simulate payment (baixa) ──
  // Re-read charge to get boleto data populated by Cobrador
  let chargeAfterIssue = charge;
  if (charge) {
    const [refreshed] = await db.select().from(charges).where(eq(charges.id, charge.id)).limit(1);
    if (refreshed) chargeAfterIssue = refreshed;
  }

  start = Date.now();
  if (chargeAfterIssue) {
    try {
      // Insert simulated payment
      await db.insert(payments).values({
        orgId,
        chargeId: chargeAfterIssue.id,
        receivedAmount: chargeAfterIssue.netAmount,
        receivedAt: new Date(),
        paymentMethod: "boleto",
        bankReference: `SIM-${Date.now()}`,
        reconciliationStatus: "matched",
      });

      // Mark charge as paid
      await db
        .update(charges)
        .set({ paymentStatus: "paid" })
        .where(eq(charges.id, chargeAfterIssue.id));

      steps.push({
        agent: "Baixa (Simulada)",
        status: "completed",
        confidence: 1,
        summary: `Pagamento simulado de R$ ${chargeAfterIssue.netAmount} registrado e reconciliado`,
        output: { chargeId: chargeAfterIssue.id, amount: chargeAfterIssue.netAmount },
        durationMs: Date.now() - start,
      });
    } catch (err) {
      steps.push({ agent: "Baixa (Simulada)", status: "failed", summary: String(err), output: {}, durationMs: Date.now() - start });
    }
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
- Imobiliária: ${orgName}
- Período: ${billingPeriod}
- Contrato: ${contract.id}
- Proprietário: ${ownerName} (${owner?.email ?? "N/A"})
- Inquilino: ${tenantName} (${tenant?.email ?? "N/A"})
- Imóvel: ${propertyAddress}
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

  // ── Step 7: Generate 3 PDFs ──
  start = Date.now();

  const adminFeePercent = parseFloat(String(contract.adminFeePercent ?? "10"));
  const rentAmountNum = parseFloat(String(contract.rentAmount));
  const adminFeeAmount = (rentAmountNum * adminFeePercent / 100).toFixed(2);
  const netPayout = (rentAmountNum - parseFloat(adminFeeAmount)).toFixed(2);

  // Buscar chave PIX do proprietário para incluir no boleto
  const ownerPrefs = owner?.payoutPreferences as Record<string, unknown> | null;
  const ownerPixKey = ownerPrefs?.pixKey as string | undefined;

  // PDF 1: Boleto do inquilino (com PIX Copia e Cola)
  const boletoHtml = renderBoletoHtml({
    orgName,
    tenantName,
    propertyAddress,
    billingPeriod,
    dueDate: chargeAfterIssue?.dueDate ?? new Date(nextMonth.getFullYear(), nextMonth.getMonth(), contract.dueDateDay ?? 10).toISOString().split("T")[0],
    lineItems: (chargeAfterIssue?.lineItems ?? [{ type: "rent", description: "Aluguel", amount: String(contract.rentAmount), source: "contract" }]).map((li) => ({
      description: li.description,
      amount: li.amount,
    })),
    grossAmount: chargeAfterIssue?.grossAmount ?? String(contract.rentAmount),
    penaltyAmount: chargeAfterIssue?.penaltyAmount ?? "0.00",
    discountAmount: chargeAfterIssue?.discountAmount ?? "0.00",
    netAmount: chargeAfterIssue?.netAmount ?? String(contract.rentAmount),
    barcode: chargeAfterIssue?.barcode ?? undefined,
    digitableLine: chargeAfterIssue?.digitableLine ?? undefined,
    pixEmv: chargeAfterIssue?.pixEmv ?? undefined,
    pixKey: ownerPixKey,
  });

  // PDF 2: Extrato de repasse do proprietário
  const statementHtml = renderStatementHtml({
    orgName,
    ownerName,
    propertyAddress,
    statementPeriod: billingPeriod,
    entries: [
      { type: "income", description: `Aluguel recebido — ${tenantName}`, amount: String(contract.rentAmount) },
      { type: "admin_fee", description: `Taxa de administração (${adminFeePercent}%)`, amount: `-${adminFeeAmount}` },
    ],
    totalPayout: netPayout,
    payoutDate: new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 15).toISOString().split("T")[0],
  });

  // PDF 3: Relatório da imobiliária
  const reportHtml = renderSimulationReportHtml({
    orgName,
    billingPeriod,
    contractId: contract.id,
    ownerName,
    tenantName,
    propertyAddress,
    rentAmount: String(contract.rentAmount),
    steps: steps.map((s) => ({
      agent: s.agent,
      status: s.status,
      confidence: s.confidence,
      summary: s.summary,
      durationMs: s.durationMs,
    })),
    totalDurationMs: Date.now() - totalStart,
    geminiReport: report,
  });

  // Convert all 3 HTMLs to PDF in parallel
  let pdfBuffers: { boleto: Buffer; statement: Buffer; report: Buffer };
  try {
    const [boletoPdf, statementPdf, reportPdf] = await Promise.all([
      htmlToPdf(boletoHtml),
      htmlToPdf(statementHtml),
      htmlToPdf(reportHtml),
    ]);
    pdfBuffers = { boleto: boletoPdf, statement: statementPdf, report: reportPdf };

    steps.push({
      agent: "PDF Generator",
      status: "completed",
      confidence: 1,
      summary: `3 PDFs gerados (${(boletoPdf.length / 1024).toFixed(0)}KB + ${(statementPdf.length / 1024).toFixed(0)}KB + ${(reportPdf.length / 1024).toFixed(0)}KB)`,
      output: { pdfCount: 3 },
      durationMs: Date.now() - start,
    });
  } catch (err) {
    steps.push({ agent: "PDF Generator", status: "failed", summary: String(err), output: {}, durationMs: Date.now() - start });
    // Fallback: send email without PDFs
    pdfBuffers = { boleto: Buffer.alloc(0), statement: Buffer.alloc(0), report: Buffer.alloc(0) };
  }

  // ── Step 8: Send 3 separate emails ──
  let emailSent = false;
  start = Date.now();
  const periodLabel = billingPeriod.replace("-", "/");
  let emailsSent = 0;

  try {
    // Email 1: Boleto do inquilino
    if (pdfBuffers.boleto.length > 0) {
      await sendEmail({
        to: adminEmail,
        subject: `[REOS] Boleto — ${periodLabel} — ${tenantName} — ${propertyAddress}`,
        body: `Boleto de aluguel para ${tenantName}, período ${periodLabel}.`,
        html: boletoHtml,
        orgId,
        attachments: [{ filename: `boleto-${billingPeriod}.pdf`, content: pdfBuffers.boleto }],
      });
      emailsSent++;
      console.log(`[simulation] Email 1/3 enviado: Boleto → ${adminEmail}`);
    }

    // Email 2: Extrato de repasse do proprietário
    if (pdfBuffers.statement.length > 0) {
      await sendEmail({
        to: adminEmail,
        subject: `[REOS] Extrato de Repasse — ${periodLabel} — ${ownerName}`,
        body: `Extrato de repasse para ${ownerName}, período ${periodLabel}.`,
        html: statementHtml,
        orgId,
        attachments: [{ filename: `extrato-repasse-${billingPeriod}.pdf`, content: pdfBuffers.statement }],
      });
      emailsSent++;
      console.log(`[simulation] Email 2/3 enviado: Extrato → ${adminEmail}`);
    }

    // Email 3: Relatório da imobiliária
    if (pdfBuffers.report.length > 0) {
      await sendEmail({
        to: adminEmail,
        subject: `[REOS] Relatório da Simulação — ${periodLabel} — ${propertyAddress}`,
        body: `Relatório completo da simulação do pipeline de agentes IA.`,
        html: reportHtml,
        orgId,
        attachments: [{ filename: `relatorio-simulacao-${billingPeriod}.pdf`, content: pdfBuffers.report }],
      });
      emailsSent++;
      console.log(`[simulation] Email 3/3 enviado: Relatório → ${adminEmail}`);
    }

    emailSent = emailsSent === 3;
    steps.push({
      agent: "Email",
      status: emailsSent > 0 ? "completed" : "failed",
      summary: `${emailsSent}/3 emails enviados para ${adminEmail} (Boleto + Extrato + Relatório)`,
      output: { recipient: adminEmail, emailsSent },
      durationMs: Date.now() - start,
    });
  } catch (err) {
    steps.push({ agent: "Email", status: "failed", summary: `${emailsSent}/3 enviados, erro: ${String(err)}`, output: { emailsSent }, durationMs: Date.now() - start });
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
