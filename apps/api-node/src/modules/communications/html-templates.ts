/**
 * Templates HTML de email para boleto (inquilino) e extrato de repasse (proprietário).
 *
 * Design: limpo, profissional, responsivo para mobile.
 * Usa CSS inline para máxima compatibilidade com clientes de email.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ─── Logo (base64-embedded, loaded once) ───

let _logoBase64: string | null = null;

function getLogoBase64(): string {
  if (!_logoBase64) {
    try {
      const logoPath = resolve(__dirname, "../../../assets/logo.png");
      const buffer = readFileSync(logoPath);
      _logoBase64 = `data:image/png;base64,${buffer.toString("base64")}`;
    } catch {
      _logoBase64 = "";
    }
  }
  return _logoBase64;
}

// ─── Estilos compartilhados ───

const COLORS = {
  primary: "#1a56db",
  primaryDark: "#1e40af",
  success: "#059669",
  warning: "#d97706",
  danger: "#dc2626",
  bg: "#f3f4f6",
  white: "#ffffff",
  text: "#111827",
  textSecondary: "#6b7280",
  border: "#e5e7eb",
  headerBg: "#1e293b",
};

function baseLayout(content: string, orgName: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${orgName}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.bg};font-family:'Segoe UI',Roboto,Arial,sans-serif;color:${COLORS.text};-webkit-text-size-adjust:100%;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${COLORS.bg};">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:${COLORS.white};border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Cabeçalho -->
          <tr>
            <td style="background:${COLORS.headerBg};padding:24px 32px;text-align:center;">
              ${getLogoBase64() ? `<img src="${getLogoBase64()}" alt="${orgName}" style="max-width:180px;height:auto;margin-bottom:12px;" />` : ""}
              <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">${orgName}</h1>
            </td>
          </tr>
          <!-- Corpo -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Rodapé -->
          <tr>
            <td style="background:${COLORS.bg};padding:20px 32px;text-align:center;border-top:1px solid ${COLORS.border};">
              <p style="margin:0;font-size:12px;color:${COLORS.textSecondary};">
                ${orgName} &mdash; Administração de Imóveis<br>
                Este e-mail foi gerado automaticamente. Em caso de dúvidas, entre em contato com a imobiliária.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── BOLETO / COBRANÇA ───

export interface BoletoTemplateData {
  orgName: string;
  tenantName: string;
  propertyAddress: string;
  billingPeriod: string;
  dueDate: string;
  lineItems: Array<{ description: string; amount: string }>;
  grossAmount: string;
  penaltyAmount: string;
  discountAmount: string;
  netAmount: string;
  barcode?: string;
  digitableLine?: string;
  pixKey?: string;
  pixEmv?: string; // PIX Copia e Cola (EMV/BRCode)
  pixQrCode?: string; // imagem QR code em base64 (futuro)
}

function formatBRL(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return "R$ 0,00";
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPeriod(period: string): string {
  const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const [year, month] = period.split("-");
  return `${months[parseInt(month) - 1]} ${year}`;
}

function formatDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

export function renderBoletoHtml(data: BoletoTemplateData): string {
  const lineItemsHtml = data.lineItems
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 0;font-size:14px;color:${COLORS.text};border-bottom:1px solid ${COLORS.border};">
          ${item.description}
        </td>
        <td style="padding:8px 0;font-size:14px;color:${COLORS.text};text-align:right;border-bottom:1px solid ${COLORS.border};white-space:nowrap;">
          ${formatBRL(item.amount)}
        </td>
      </tr>`,
    )
    .join("");

  const hasPenalty = parseFloat(data.penaltyAmount) > 0;
  const hasDiscount = parseFloat(data.discountAmount) > 0;

  const penaltyRow = hasPenalty
    ? `<tr>
        <td style="padding:8px 0;font-size:14px;color:${COLORS.danger};border-bottom:1px solid ${COLORS.border};">Multa e juros</td>
        <td style="padding:8px 0;font-size:14px;color:${COLORS.danger};text-align:right;border-bottom:1px solid ${COLORS.border};">${formatBRL(data.penaltyAmount)}</td>
      </tr>`
    : "";

  const discountRow = hasDiscount
    ? `<tr>
        <td style="padding:8px 0;font-size:14px;color:${COLORS.success};border-bottom:1px solid ${COLORS.border};">Desconto</td>
        <td style="padding:8px 0;font-size:14px;color:${COLORS.success};text-align:right;border-bottom:1px solid ${COLORS.border};">-${formatBRL(data.discountAmount)}</td>
      </tr>`
    : "";

  // Seção do código de barras (representação SVG)
  const barcodeHtml = data.barcode
    ? `<!-- Código de barras -->
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:24px 0 8px;">
        <tr>
          <td style="padding:16px;background:${COLORS.bg};border:1px solid ${COLORS.border};border-radius:8px;">
            <p style="margin:0 0 8px;font-size:11px;color:${COLORS.textSecondary};text-transform:uppercase;letter-spacing:1px;">Código de barras</p>
            <div style="text-align:center;padding:8px 0;">
              ${generateBarcodeSvg(data.barcode)}
            </div>
          </td>
        </tr>
      </table>`
    : "";

  // Linha digitável
  const digitableLineHtml = data.digitableLine
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px;">
        <tr>
          <td style="padding:16px;background:${COLORS.bg};border:1px solid ${COLORS.border};border-radius:8px;">
            <p style="margin:0 0 4px;font-size:11px;color:${COLORS.textSecondary};text-transform:uppercase;letter-spacing:1px;">Linha digitável</p>
            <p style="margin:0;font-size:16px;font-weight:600;color:${COLORS.text};font-family:'Courier New',monospace;letter-spacing:1px;word-break:break-all;">
              ${data.digitableLine}
            </p>
          </td>
        </tr>
      </table>`
    : "";

  // Seção PIX — prioriza PIX Copia e Cola (EMV) quando disponível
  const pixContent = data.pixEmv || data.pixKey;
  const pixLabel = data.pixEmv ? "PIX Copia e Cola" : "Chave PIX";
  const pixInstructions = data.pixEmv
    ? "Copie o código abaixo e cole na opção <strong>PIX Copia e Cola</strong> do app do seu banco:"
    : "Copie a chave abaixo e cole no app do seu banco:";
  const pixHtml = pixContent
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px;">
        <tr>
          <td style="padding:16px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td>
                  <p style="margin:0 0 4px;font-size:11px;color:${COLORS.success};text-transform:uppercase;letter-spacing:1px;font-weight:600;">Pague com PIX</p>
                  <p style="margin:0 0 4px;font-size:10px;color:${COLORS.textSecondary};text-transform:uppercase;letter-spacing:0.5px;">${pixLabel}</p>
                  <p style="margin:0 0 8px;font-size:13px;color:${COLORS.textSecondary};">${pixInstructions}</p>
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="background:${COLORS.white};border:1px solid #a7f3d0;border-radius:6px;padding:12px 16px;">
                        <p style="margin:0;font-size:${data.pixEmv ? "12px" : "15px"};font-weight:600;color:${COLORS.text};font-family:'Courier New',monospace;word-break:break-all;line-height:1.4;">
                          ${pixContent}
                        </p>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:8px 0 0;font-size:12px;color:${COLORS.textSecondary};">Valor: <strong>${formatBRL(data.netAmount)}</strong> &bull; O valor já está embutido no código PIX.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`
    : "";

  const content = `
    <!-- Saudação -->
    <p style="margin:0 0 4px;font-size:14px;color:${COLORS.textSecondary};">Olá, ${data.tenantName}</p>
    <h2 style="margin:0 0 24px;font-size:22px;color:${COLORS.text};font-weight:700;">Cobrança ${formatPeriod(data.billingPeriod)}</h2>

    <!-- Informações do imóvel -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;">
      <tr>
        <td style="padding:12px 16px;background:${COLORS.bg};border-radius:8px;">
          <p style="margin:0 0 2px;font-size:11px;color:${COLORS.textSecondary};text-transform:uppercase;letter-spacing:1px;">Imóvel</p>
          <p style="margin:0;font-size:14px;color:${COLORS.text};font-weight:500;">${data.propertyAddress}</p>
        </td>
      </tr>
    </table>

    <!-- Tabela de itens -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 8px;">
      <thead>
        <tr>
          <th style="padding:8px 0;font-size:11px;color:${COLORS.textSecondary};text-align:left;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${COLORS.border};">Descrição</th>
          <th style="padding:8px 0;font-size:11px;color:${COLORS.textSecondary};text-align:right;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${COLORS.border};">Valor</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHtml}
        ${penaltyRow}
        ${discountRow}
      </tbody>
    </table>

    <!-- Total -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;">
      <tr>
        <td style="padding:16px;background:${COLORS.primary};border-radius:8px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td>
                <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:1px;">Total a pagar</p>
                <p style="margin:4px 0 0;font-size:28px;font-weight:700;color:#ffffff;">${formatBRL(data.netAmount)}</p>
              </td>
              <td style="text-align:right;vertical-align:bottom;">
                <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.8);">Vencimento</p>
                <p style="margin:4px 0 0;font-size:18px;font-weight:600;color:#ffffff;">${formatDate(data.dueDate)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Formas de pagamento -->
    <h3 style="margin:0 0 16px;font-size:16px;color:${COLORS.text};font-weight:600;">Formas de pagamento</h3>

    ${pixHtml}
    ${barcodeHtml}
    ${digitableLineHtml}

    <!-- Aviso -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0 0;">
      <tr>
        <td style="padding:12px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;">
          <p style="margin:0;font-size:13px;color:${COLORS.warning};">
            <strong>Atenção:</strong> Após o vencimento, serão aplicados multa de 2% e juros de 0,033% ao dia conforme contrato.
          </p>
        </td>
      </tr>
    </table>
  `;

  return baseLayout(content, data.orgName);
}

// ─── EXTRATO DE REPASSE ───

export interface StatementTemplateData {
  orgName: string;
  ownerName: string;
  propertyAddress: string;
  statementPeriod: string;
  entries: Array<{
    type: string;
    description: string;
    amount: string;
  }>;
  totalPayout: string;
  payoutBank?: {
    bankCode: string;
    branch: string;
    account: string;
    pixKey?: string;
  };
  payoutDate?: string;
}

export function renderStatementHtml(data: StatementTemplateData): string {
  const incomeEntries = data.entries.filter((e) => !e.amount.startsWith("-"));
  const deductionEntries = data.entries.filter((e) => e.amount.startsWith("-"));

  const totalIncome = incomeEntries.reduce(
    (sum, e) => sum + parseFloat(e.amount),
    0,
  );
  const totalDeductions = deductionEntries.reduce(
    (sum, e) => sum + Math.abs(parseFloat(e.amount)),
    0,
  );

  function renderEntryRows(entries: typeof data.entries, color: string): string {
    return entries
      .map(
        (e) => `
        <tr>
          <td style="padding:8px 0;font-size:14px;color:${COLORS.text};border-bottom:1px solid ${COLORS.border};">${e.description}</td>
          <td style="padding:8px 0;font-size:14px;color:${color};text-align:right;border-bottom:1px solid ${COLORS.border};white-space:nowrap;font-weight:500;">
            ${e.amount.startsWith("-") ? "- " + formatBRL(e.amount.replace("-", "")) : formatBRL(e.amount)}
          </td>
        </tr>`,
      )
      .join("");
  }

  const bankInfoHtml = data.payoutBank
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:24px 0 0;">
        <tr>
          <td style="padding:16px;background:${COLORS.bg};border:1px solid ${COLORS.border};border-radius:8px;">
            <p style="margin:0 0 12px;font-size:11px;color:${COLORS.textSecondary};text-transform:uppercase;letter-spacing:1px;font-weight:600;">Dados bancários para repasse</p>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="padding:4px 0;font-size:13px;color:${COLORS.textSecondary};width:100px;">Banco:</td>
                <td style="padding:4px 0;font-size:13px;color:${COLORS.text};font-weight:500;">${data.payoutBank.bankCode}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;font-size:13px;color:${COLORS.textSecondary};">Agência:</td>
                <td style="padding:4px 0;font-size:13px;color:${COLORS.text};font-weight:500;">${data.payoutBank.branch}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;font-size:13px;color:${COLORS.textSecondary};">Conta:</td>
                <td style="padding:4px 0;font-size:13px;color:${COLORS.text};font-weight:500;">${data.payoutBank.account}</td>
              </tr>
              ${data.payoutBank.pixKey ? `<tr>
                <td style="padding:4px 0;font-size:13px;color:${COLORS.textSecondary};">Chave PIX:</td>
                <td style="padding:4px 0;font-size:13px;color:${COLORS.text};font-weight:500;">${data.payoutBank.pixKey}</td>
              </tr>` : ""}
            </table>
          </td>
        </tr>
      </table>`
    : "";

  const content = `
    <!-- Saudação -->
    <p style="margin:0 0 4px;font-size:14px;color:${COLORS.textSecondary};">Olá, ${data.ownerName}</p>
    <h2 style="margin:0 0 24px;font-size:22px;color:${COLORS.text};font-weight:700;">Extrato de Repasse &mdash; ${formatPeriod(data.statementPeriod)}</h2>

    <!-- Informações do imóvel -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;">
      <tr>
        <td style="padding:12px 16px;background:${COLORS.bg};border-radius:8px;">
          <p style="margin:0 0 2px;font-size:11px;color:${COLORS.textSecondary};text-transform:uppercase;letter-spacing:1px;">Imóvel</p>
          <p style="margin:0;font-size:14px;color:${COLORS.text};font-weight:500;">${data.propertyAddress}</p>
        </td>
      </tr>
    </table>

    <!-- Seção de receitas -->
    <h3 style="margin:0 0 12px;font-size:14px;color:${COLORS.success};text-transform:uppercase;letter-spacing:1px;">Receitas</h3>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 8px;">
      <tbody>
        ${renderEntryRows(incomeEntries, COLORS.success)}
        <tr>
          <td style="padding:10px 0;font-size:14px;color:${COLORS.text};font-weight:700;">Subtotal receitas</td>
          <td style="padding:10px 0;font-size:14px;color:${COLORS.success};text-align:right;font-weight:700;white-space:nowrap;">${formatBRL(totalIncome.toFixed(2))}</td>
        </tr>
      </tbody>
    </table>

    ${deductionEntries.length > 0 ? `
    <!-- Seção de deduções -->
    <h3 style="margin:24px 0 12px;font-size:14px;color:${COLORS.danger};text-transform:uppercase;letter-spacing:1px;">Deduções</h3>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 8px;">
      <tbody>
        ${renderEntryRows(deductionEntries, COLORS.danger)}
        <tr>
          <td style="padding:10px 0;font-size:14px;color:${COLORS.text};font-weight:700;">Subtotal deduções</td>
          <td style="padding:10px 0;font-size:14px;color:${COLORS.danger};text-align:right;font-weight:700;white-space:nowrap;">- ${formatBRL(totalDeductions.toFixed(2))}</td>
        </tr>
      </tbody>
    </table>
    ` : ""}

    <!-- Total do repasse -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:24px 0;">
      <tr>
        <td style="padding:20px;background:${COLORS.success};border-radius:8px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td>
                <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:1px;">Valor líquido do repasse</p>
                <p style="margin:4px 0 0;font-size:28px;font-weight:700;color:#ffffff;">${formatBRL(data.totalPayout)}</p>
              </td>
              ${data.payoutDate ? `
              <td style="text-align:right;vertical-align:bottom;">
                <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.8);">Previsão</p>
                <p style="margin:4px 0 0;font-size:18px;font-weight:600;color:#ffffff;">${formatDate(data.payoutDate)}</p>
              </td>
              ` : ""}
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${bankInfoHtml}

    <!-- Aviso -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:24px 0 0;">
      <tr>
        <td style="padding:12px 16px;background:${COLORS.bg};border:1px solid ${COLORS.border};border-radius:8px;">
          <p style="margin:0;font-size:13px;color:${COLORS.textSecondary};">
            Este extrato é referente aos recebimentos do período <strong>${formatPeriod(data.statementPeriod)}</strong>.
            O repasse será efetuado conforme as regras do contrato de administração.
          </p>
        </td>
      </tr>
    </table>
  `;

  return baseLayout(content, data.orgName);
}

// ─── RELATÓRIO DE SIMULAÇÃO (IMOBILIÁRIA) ───

export interface SimulationReportTemplateData {
  orgName: string;
  billingPeriod: string;
  contractId: string;
  ownerName: string;
  tenantName: string;
  propertyAddress: string;
  rentAmount: string;
  steps: Array<{
    agent: string;
    status: string;
    confidence?: number;
    summary: string;
    durationMs: number;
  }>;
  totalDurationMs: number;
  geminiReport: string;
}

// CSS-only icons for each agent (no emoji dependency)
function agentIconSvg(agent: string): string {
  const size = 28;
  const icons: Record<string, { bg: string; path: string }> = {
    Maestro: {
      bg: "#6366f1",
      // brain
      path: `<path d="M12 2a5 5 0 0 1 4.9 4 4.5 4.5 0 0 1 2.1 4 4.5 4.5 0 0 1-1.4 5.5A4.5 4.5 0 0 1 12 22a4.5 4.5 0 0 1-5.6-6.5A4.5 4.5 0 0 1 5 10a4.5 4.5 0 0 1 2.1-4A5 5 0 0 1 12 2z" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 2v20M5 10h14" stroke="#fff" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.5"/>`,
    },
    Cobrador: {
      bg: "#0891b2",
      // paper plane / send
      path: `<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    },
    Sentinela: {
      bg: "#7c3aed",
      // eye / watch
      path: `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke="#fff" stroke-width="1.5" fill="none"/><circle cx="12" cy="12" r="3" stroke="#fff" stroke-width="1.5" fill="none"/>`,
    },
    Pagador: {
      bg: "#059669",
      // dollar sign
      path: `<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    },
    Contador: {
      bg: "#d97706",
      // bar chart
      path: `<path d="M18 20V10M12 20V4M6 20v-6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    },
    "REOS AI": {
      bg: "#1a56db",
      // cpu / brain
      path: `<rect x="4" y="4" width="16" height="16" rx="2" stroke="#fff" stroke-width="1.5" fill="none"/><path d="M9 9h6v6H9z" stroke="#fff" stroke-width="1.5" fill="none"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round"/>`,
    },
    Email: {
      bg: "#64748b",
      // mail
      path: `<rect x="2" y="4" width="20" height="16" rx="2" stroke="#fff" stroke-width="1.5" fill="none"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    },
    "Baixa (Simulada)": {
      bg: "#059669",
      // check circle
      path: `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M22 4 12 14.01l-3-3" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    },
    "PDF Generator": {
      bg: "#dc2626",
      // file-text
      path: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#fff" stroke-width="1.5" fill="none"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round"/>`,
    },
  };

  const icon = icons[agent] ?? { bg: "#64748b", path: `<circle cx="12" cy="12" r="6" stroke="#fff" stroke-width="1.5" fill="none"/><path d="M12 9v3l2 1" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round"/>` };

  return `<div style="width:${size}px;height:${size}px;border-radius:6px;background:${icon.bg};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none">${icon.path}</svg>
  </div>`;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  completed: { bg: "#ecfdf5", text: COLORS.success, label: "Concluído" },
  failed: { bg: "#fef2f2", text: COLORS.danger, label: "Falhou" },
  skipped: { bg: "#fffbeb", text: COLORS.warning, label: "Pulado" },
  escalated: { bg: "#fffbeb", text: COLORS.warning, label: "Escalado" },
};

export function renderSimulationReportHtml(data: SimulationReportTemplateData): string {
  const agentStepsHtml = data.steps
    .map((step) => {
      const icon = agentIconSvg(step.agent);
      const sc = STATUS_COLORS[step.status] ?? STATUS_COLORS.completed;
      const confidenceBar = step.confidence !== undefined
        ? `<div style="margin-top:6px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="flex:1;height:6px;background:${COLORS.border};border-radius:3px;overflow:hidden;">
                <div style="width:${(step.confidence * 100).toFixed(0)}%;height:100%;background:${COLORS.primary};border-radius:3px;"></div>
              </div>
              <span style="font-size:12px;color:${COLORS.textSecondary};white-space:nowrap;">${(step.confidence * 100).toFixed(0)}%</span>
            </div>
          </div>`
        : "";

      return `
        <tr>
          <td style="padding:16px;border-bottom:1px solid ${COLORS.border};">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="width:40px;vertical-align:top;">
                  ${icon}
                </td>
                <td style="vertical-align:top;">
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td>
                        <span style="font-size:15px;font-weight:600;color:${COLORS.text};">${step.agent}</span>
                        <span style="display:inline-block;margin-left:8px;padding:2px 8px;background:${sc.bg};color:${sc.text};font-size:11px;font-weight:600;border-radius:4px;">${sc.label}</span>
                      </td>
                      <td style="text-align:right;">
                        <span style="font-size:12px;color:${COLORS.textSecondary};">${step.durationMs}ms</span>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:4px 0 0;font-size:13px;color:${COLORS.textSecondary};">${step.summary}</p>
                  ${confidenceBar}
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    })
    .join("");

  const completedCount = data.steps.filter((s) => s.status === "completed").length;
  const failedCount = data.steps.filter((s) => s.status === "failed").length;

  // Convert markdown-style report to simple HTML
  const reportHtml = data.geminiReport
    .replace(/### (.+)/g, '<h4 style="margin:16px 0 8px;font-size:15px;color:' + COLORS.text + ';font-weight:600;">$1</h4>')
    .replace(/## (.+)/g, '<h3 style="margin:20px 0 10px;font-size:17px;color:' + COLORS.text + ';font-weight:700;">$1</h3>')
    .replace(/# (.+)/g, '<h2 style="margin:24px 0 12px;font-size:19px;color:' + COLORS.text + ';font-weight:700;">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");

  const content = `
    <!-- Título -->
    <h2 style="margin:0 0 4px;font-size:22px;color:${COLORS.text};font-weight:700;">Relatório de Simulação</h2>
    <p style="margin:0 0 24px;font-size:14px;color:${COLORS.textSecondary};">Pipeline de Agentes IA &mdash; ${formatPeriod(data.billingPeriod)}</p>

    <!-- Dados do contrato -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;">
      <tr>
        <td style="padding:16px;background:${COLORS.bg};border:1px solid ${COLORS.border};border-radius:8px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="padding:4px 16px 4px 0;font-size:13px;color:${COLORS.textSecondary};width:110px;">Contrato:</td>
              <td style="padding:4px 0;font-size:13px;color:${COLORS.text};font-weight:500;">${data.contractId.slice(0, 8)}...</td>
            </tr>
            <tr>
              <td style="padding:4px 16px 4px 0;font-size:13px;color:${COLORS.textSecondary};">Proprietário:</td>
              <td style="padding:4px 0;font-size:13px;color:${COLORS.text};font-weight:500;">${data.ownerName}</td>
            </tr>
            <tr>
              <td style="padding:4px 16px 4px 0;font-size:13px;color:${COLORS.textSecondary};">Inquilino:</td>
              <td style="padding:4px 0;font-size:13px;color:${COLORS.text};font-weight:500;">${data.tenantName}</td>
            </tr>
            <tr>
              <td style="padding:4px 16px 4px 0;font-size:13px;color:${COLORS.textSecondary};">Imóvel:</td>
              <td style="padding:4px 0;font-size:13px;color:${COLORS.text};font-weight:500;">${data.propertyAddress}</td>
            </tr>
            <tr>
              <td style="padding:4px 16px 4px 0;font-size:13px;color:${COLORS.textSecondary};">Aluguel:</td>
              <td style="padding:4px 0;font-size:13px;color:${COLORS.text};font-weight:500;">${formatBRL(data.rentAmount)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Métricas rápidas -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;">
      <tr>
        <td style="width:33%;padding:12px;background:${COLORS.primary};border-radius:8px 0 0 8px;text-align:center;">
          <p style="margin:0;font-size:24px;font-weight:700;color:#ffffff;">${data.steps.length}</p>
          <p style="margin:2px 0 0;font-size:11px;color:rgba(255,255,255,0.8);text-transform:uppercase;">Agentes</p>
        </td>
        <td style="width:33%;padding:12px;background:${COLORS.success};text-align:center;">
          <p style="margin:0;font-size:24px;font-weight:700;color:#ffffff;">${completedCount}</p>
          <p style="margin:2px 0 0;font-size:11px;color:rgba(255,255,255,0.8);text-transform:uppercase;">Sucesso</p>
        </td>
        <td style="width:34%;padding:12px;background:${COLORS.headerBg};border-radius:0 8px 8px 0;text-align:center;">
          <p style="margin:0;font-size:24px;font-weight:700;color:#ffffff;">${(data.totalDurationMs / 1000).toFixed(1)}s</p>
          <p style="margin:2px 0 0;font-size:11px;color:rgba(255,255,255,0.8);text-transform:uppercase;">Tempo total</p>
        </td>
      </tr>
    </table>

    <!-- Pipeline de agentes -->
    <h3 style="margin:0 0 12px;font-size:16px;color:${COLORS.text};font-weight:600;">Pipeline de Agentes</h3>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;border:1px solid ${COLORS.border};border-radius:8px;overflow:hidden;">
      ${agentStepsHtml}
    </table>

    <!-- Relatório IA -->
    <h3 style="margin:0 0 12px;font-size:16px;color:${COLORS.text};font-weight:600;">Análise Executiva (IA)</h3>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px;">
      <tr>
        <td style="padding:20px;background:${COLORS.bg};border:1px solid ${COLORS.border};border-radius:8px;">
          <div style="font-size:14px;color:${COLORS.text};line-height:1.6;">
            ${reportHtml}
          </div>
        </td>
      </tr>
    </table>

    <!-- Rodapé técnico -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0 0;">
      <tr>
        <td style="padding:12px 16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;">
          <p style="margin:0;font-size:12px;color:${COLORS.primary};">
            <strong>Real Estate OS</strong> &mdash; Simulação executada em ${new Date().toLocaleString("pt-BR")}
            ${failedCount > 0 ? ` | <span style="color:${COLORS.danger};">${failedCount} agente(s) com falha</span>` : ""}
          </p>
        </td>
      </tr>
    </table>
  `;

  return baseLayout(content, data.orgName);
}

// ─── Gerador de código de barras SVG (representação visual ITF-25) ───

function generateBarcodeSvg(barcode: string): string {
  const digits = barcode.replace(/\D/g, "");
  if (!digits) return "";

  let bars = "";
  let x = 0;
  const height = 50;

  // Guard inicial
  bars += `<rect x="${x}" y="0" width="2" height="${height}" fill="#000"/>`;
  x += 4;
  bars += `<rect x="${x}" y="0" width="2" height="${height}" fill="#000"/>`;
  x += 4;

  for (let i = 0; i < digits.length; i++) {
    const d = parseInt(digits[i]);
    const widths = [
      [2, 2, 4, 2, 2], // 0
      [4, 2, 2, 2, 2], // 1
      [2, 4, 2, 2, 2], // 2
      [4, 4, 2, 2, 2], // 3
      [2, 2, 4, 2, 2], // 4
      [4, 2, 4, 2, 2], // 5
      [2, 4, 4, 2, 2], // 6
      [2, 2, 2, 4, 2], // 7
      [4, 2, 2, 4, 2], // 8
      [2, 4, 2, 4, 2], // 9
    ];
    const pattern = widths[d];
    for (let j = 0; j < pattern.length; j++) {
      if (j % 2 === 0) {
        bars += `<rect x="${x}" y="0" width="${pattern[j]}" height="${height}" fill="#000"/>`;
      }
      x += pattern[j];
    }
    x += 1;
  }

  // Guard final
  bars += `<rect x="${x}" y="0" width="2" height="${height}" fill="#000"/>`;
  x += 4;
  bars += `<rect x="${x}" y="0" width="2" height="${height}" fill="#000"/>`;
  x += 4;

  const totalWidth = x;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${height}" style="width:100%;max-width:${totalWidth}px;height:auto;">${bars}</svg>`;
}
