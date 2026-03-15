/**
 * Templates de mensagem para comunicações com inquilinos e proprietários.
 * Cada template retorna { subject, body, html? } para o canal indicado.
 */

import {
  renderBoletoHtml,
  renderStatementHtml,
  renderSimulationReportHtml,
  type BoletoTemplateData,
  type StatementTemplateData,
  type SimulationReportTemplateData,
} from "./html-templates";

export interface TemplateData {
  tenantName?: string;
  ownerName?: string;
  propertyAddress?: string;
  dueDate?: string;
  amount?: string;
  billingPeriod?: string;
  ticketId?: string;
  ticketDescription?: string;
  paymentDate?: string;
  statementPeriod?: string;
  // Campos estendidos para templates HTML
  orgName?: string;
  lineItems?: Array<{ description: string; amount: string }> | string; // string quando JSON do templateData
  grossAmount?: string;
  penaltyAmount?: string;
  discountAmount?: string;
  netAmount?: string;
  barcode?: string;
  digitableLine?: string;
  pixKey?: string;
  // Campos específicos do extrato
  entries?: Array<{ type: string; description: string; amount: string }>;
  totalPayout?: string;
  payoutBank?: { bankCode: string; branch: string; account: string; pixKey?: string };
  payoutDate?: string;
}

export interface RenderedTemplate {
  subject: string;
  body: string;
  html?: string;
}

type TemplateFn = (data: TemplateData) => RenderedTemplate;

const templates: Record<string, TemplateFn> = {
  // ─── Cobranças ───
  charge_issued: (data) => {
    const subject = `Boleto disponível — Vencimento ${data.dueDate}`;
    const body = [
      `Olá ${data.tenantName ?? "Inquilino"},`,
      ``,
      `Seu boleto referente ao imóvel ${data.propertyAddress ?? ""} para o período ${data.billingPeriod ?? ""} está disponível.`,
      `Valor: R$ ${data.amount ?? "0,00"}`,
      `Vencimento: ${data.dueDate ?? ""}`,
      ``,
      `Em caso de dúvidas, entre em contato conosco.`,
    ].join("\n");

    // Gera versão HTML se tiver os dados estendidos (inclui dados do Santander)
    let html: string | undefined;
    if (data.orgName && data.lineItems && data.netAmount) {
      const parsedItems: Array<{ description: string; amount: string }> =
        typeof data.lineItems === "string"
          ? JSON.parse(data.lineItems)
          : data.lineItems;

      html = renderBoletoHtml({
        orgName: data.orgName,
        tenantName: data.tenantName ?? "Inquilino",
        propertyAddress: data.propertyAddress ?? "",
        billingPeriod: data.billingPeriod ?? "",
        dueDate: data.dueDate ?? "",
        lineItems: parsedItems,
        grossAmount: data.grossAmount ?? data.amount ?? "0.00",
        penaltyAmount: data.penaltyAmount ?? "0.00",
        discountAmount: data.discountAmount ?? "0.00",
        netAmount: data.netAmount,
        barcode: data.barcode,
        digitableLine: data.digitableLine,
        pixKey: data.pixKey,
      });
    }

    return { subject, body, html };
  },

  charge_overdue: (data) => ({
    subject: `Aviso de atraso — Imóvel ${data.propertyAddress ?? ""}`,
    body: [
      `Olá ${data.tenantName ?? "Inquilino"},`,
      ``,
      `Identificamos que o pagamento referente ao período ${data.billingPeriod ?? ""} encontra-se em atraso.`,
      `Valor original: R$ ${data.amount ?? "0,00"}`,
      `Vencimento original: ${data.dueDate ?? ""}`,
      ``,
      `Por favor, regularize o pagamento para evitar a incidência de multa e juros.`,
    ].join("\n"),
  }),

  // ─── Pagamentos ───
  payment_confirmed: (data) => ({
    subject: `Pagamento confirmado — ${data.billingPeriod ?? ""}`,
    body: [
      `Olá ${data.tenantName ?? "Inquilino"},`,
      ``,
      `Confirmamos o recebimento do seu pagamento no valor de R$ ${data.amount ?? "0,00"} em ${data.paymentDate ?? ""}.`,
      ``,
      `Obrigado!`,
    ].join("\n"),
  }),

  // ─── Extratos ───
  statement_ready: (data) => {
    const subject = `Extrato de repasse — ${data.statementPeriod ?? ""}`;
    const body = [
      `Olá ${data.ownerName ?? "Proprietário"},`,
      ``,
      `O extrato de repasse referente ao período ${data.statementPeriod ?? ""} está disponível.`,
      `Imóvel: ${data.propertyAddress ?? ""}`,
      `Valor líquido: R$ ${data.totalPayout ?? "0,00"}`,
      ``,
      `Acesse o sistema para visualizar os detalhes.`,
    ].join("\n");

    // Gera versão HTML se tiver os dados estendidos
    let html: string | undefined;
    if (data.orgName && data.entries && data.totalPayout) {
      html = renderStatementHtml({
        orgName: data.orgName,
        ownerName: data.ownerName ?? "Proprietário",
        propertyAddress: data.propertyAddress ?? "",
        statementPeriod: data.statementPeriod ?? "",
        entries: data.entries,
        totalPayout: data.totalPayout,
        payoutBank: data.payoutBank,
        payoutDate: data.payoutDate,
      });
    }

    return { subject, body, html };
  },

  // ─── Relatório de simulação ───
  simulation_report: (data) => {
    const subject = `Relatório de Simulação — ${data.billingPeriod ?? ""}`;
    const body = `Relatório de simulação do pipeline de agentes IA para o período ${data.billingPeriod ?? ""}.`;
    return { subject, body };
  },

};

/**
 * Renderiza um template pelo nome com os dados fornecidos.
 * Lança erro se o template não for encontrado.
 */
export function renderTemplate(
  templateType: string,
  data: TemplateData,
): RenderedTemplate {
  const fn = templates[templateType];
  if (!fn) {
    throw new Error(`Unknown template type: ${templateType}`);
  }
  return fn(data);
}

/**
 * Lista os tipos de template disponíveis.
 */
export function getAvailableTemplates(): string[] {
  return Object.keys(templates);
}
