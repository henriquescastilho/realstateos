/**
 * Message templates for tenant and owner communications.
 * Each template returns { subject, body } for the given channel.
 */

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
}

export interface RenderedTemplate {
  subject: string;
  body: string;
}

type TemplateFn = (data: TemplateData) => RenderedTemplate;

const templates: Record<string, TemplateFn> = {
  // ─── Billing ───
  charge_issued: (data) => ({
    subject: `Boleto disponível - Vencimento ${data.dueDate}`,
    body: [
      `Olá ${data.tenantName ?? "Inquilino"},`,
      ``,
      `Seu boleto referente ao imóvel ${data.propertyAddress ?? ""} para o período ${data.billingPeriod ?? ""} está disponível.`,
      `Valor: R$ ${data.amount ?? "0,00"}`,
      `Vencimento: ${data.dueDate ?? ""}`,
      ``,
      `Em caso de dúvidas, entre em contato conosco.`,
    ].join("\n"),
  }),

  charge_overdue: (data) => ({
    subject: `Aviso de atraso - Imóvel ${data.propertyAddress ?? ""}`,
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

  // ─── Payments ───
  payment_confirmed: (data) => ({
    subject: `Pagamento confirmado - ${data.billingPeriod ?? ""}`,
    body: [
      `Olá ${data.tenantName ?? "Inquilino"},`,
      ``,
      `Confirmamos o recebimento do seu pagamento no valor de R$ ${data.amount ?? "0,00"} em ${data.paymentDate ?? ""}.`,
      ``,
      `Obrigado!`,
    ].join("\n"),
  }),

  // ─── Statements ───
  statement_ready: (data) => ({
    subject: `Extrato disponível - ${data.statementPeriod ?? ""}`,
    body: [
      `Olá ${data.ownerName ?? "Proprietário"},`,
      ``,
      `O extrato de repasse referente ao período ${data.statementPeriod ?? ""} está disponível.`,
      `Imóvel: ${data.propertyAddress ?? ""}`,
      ``,
      `Acesse o sistema para visualizar os detalhes.`,
    ].join("\n"),
  }),

  // ─── Maintenance ───
  maintenance_opened: (data) => ({
    subject: `Chamado de manutenção aberto - #${data.ticketId ?? ""}`,
    body: [
      `Olá ${data.tenantName ?? "Inquilino"},`,
      ``,
      `Seu chamado de manutenção foi registrado com sucesso.`,
      `Número: #${data.ticketId ?? ""}`,
      `Descrição: ${data.ticketDescription ?? ""}`,
      `Imóvel: ${data.propertyAddress ?? ""}`,
      ``,
      `Nossa equipe entrará em contato em breve.`,
    ].join("\n"),
  }),

  maintenance_resolved: (data) => ({
    subject: `Chamado resolvido - #${data.ticketId ?? ""}`,
    body: [
      `Olá ${data.tenantName ?? "Inquilino"},`,
      ``,
      `Seu chamado #${data.ticketId ?? ""} foi resolvido.`,
      ``,
      `Caso o problema persista, abra um novo chamado.`,
    ].join("\n"),
  }),
};

/**
 * Render a template by name with the given data.
 * Throws if template not found.
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
 * List available template types.
 */
export function getAvailableTemplates(): string[] {
  return Object.keys(templates);
}
