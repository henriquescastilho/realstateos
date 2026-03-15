/**
 * Endpoints de preview de templates — SOMENTE DEV.
 * Renderiza os templates HTML de email com dados de exemplo para inspeção visual.
 *
 * GET /preview/boleto           → Email de cobrança (inquilino)
 * GET /preview/boleto-overdue   → Email de cobrança com multa (inquilino)
 * GET /preview/statement        → Extrato de repasse (proprietário)
 */

import { Router, Request, Response } from "express";
import { renderBoletoHtml, renderStatementHtml } from "./html-templates";

export const previewRouter = Router();

previewRouter.get("/preview/boleto", (_req: Request, res: Response) => {
  const html = renderBoletoHtml({
    orgName: "L CASTILHO IMÓVEIS",
    tenantName: "Pedro Henrique Martins",
    propertyAddress: "Rua Augusta, 1200 - Apto 31, São Paulo/SP",
    billingPeriod: "2026-03",
    dueDate: "2026-03-10",
    lineItems: [
      { description: "Aluguel", amount: "3200.00" },
      { description: "Condomínio", amount: "780.00" },
      { description: "IPTU", amount: "450.00" },
    ],
    grossAmount: "4430.00",
    penaltyAmount: "0.00",
    discountAmount: "0.00",
    netAmount: "4430.00",
    barcode: "23793381286000000043380000000012500690000044300",
    digitableLine: "23793.38128 60000.000433 80000.000125 0 06900000443000",
    pixKey: "lcastilho@lcastilho.com.br",
  });

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

previewRouter.get("/preview/boleto-overdue", (_req: Request, res: Response) => {
  const html = renderBoletoHtml({
    orgName: "L CASTILHO IMÓVEIS",
    tenantName: "Lucas Gabriel Moreira",
    propertyAddress: "Rua Haddock Lobo, 888 - Apto 12, São Paulo/SP",
    billingPeriod: "2026-02",
    dueDate: "2026-02-10",
    lineItems: [
      { description: "Aluguel", amount: "1500.00" },
    ],
    grossAmount: "1500.00",
    penaltyAmount: "30.00",
    discountAmount: "0.00",
    netAmount: "1530.00",
    barcode: "23793381286000000043380000000012500690000015300",
    digitableLine: "23793.38128 60000.000433 80000.000125 0 06900000153000",
    pixKey: "lcastilho@lcastilho.com.br",
  });

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

previewRouter.get("/preview/statement", (_req: Request, res: Response) => {
  const html = renderStatementHtml({
    orgName: "L CASTILHO IMÓVEIS",
    ownerName: "Henrique Scheer de Castilho",
    propertyAddress: "Rua Jerônimo da Veiga, 384 - Cobertura Duplex, São Paulo/SP",
    statementPeriod: "2026-03",
    entries: [
      { type: "income", description: "Recebimento aluguel", amount: "12500.00" },
      { type: "admin_fee", description: "Taxa de administração (10%)", amount: "-1250.00" },
    ],
    totalPayout: "11250.00",
    payoutBank: {
      bankCode: "033 - Santander",
      branch: "0001",
      account: "99000-1",
      pixKey: "henrique009.hsc@gmail.com",
    },
    payoutDate: "2026-03-15",
  });

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});
