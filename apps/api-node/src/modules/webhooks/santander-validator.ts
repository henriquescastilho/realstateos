import { z } from "zod";

/**
 * Santander webhook payload schema.
 *
 * When a boleto is paid, Santander sends a callback with these fields.
 * We normalize the payload to internal format in the service layer.
 *
 * Reference: Santander Collection Bill Management API v2 webhook spec.
 */
export const santanderWebhookSchema = z.object({
  // Santander boleto identifier (maps to our boletoId)
  id: z.string().min(1).optional(),

  // Barcode — used as fallback identifier if id is missing
  codigoBarras: z.string().min(1).optional(),

  // Linha digitavel — for display/reference
  linhaDigitavel: z.string().optional(),

  // Status: PAGO, VENCIDO, CANCELADO, REGISTRADO, etc.
  status: z.string().min(1),

  // Amount actually paid by the payer (may differ from nominal value)
  valorPago: z.union([z.number(), z.string()]),

  // Payment date (ISO or YYYY-MM-DD)
  dataPagamento: z.string().min(1),

  // Nominal value of the boleto
  valorNominal: z.union([z.number(), z.string()]).optional(),

  // Payer document
  pagadorDocumento: z.string().optional(),

  // Our NSU code (includes timestamp, used as bank reference)
  nsuCode: z.string().optional(),

  // Santander workspace
  workspaceId: z.string().optional(),
}).refine(
  (data) => data.id || data.codigoBarras,
  { message: "Either 'id' or 'codigoBarras' must be provided to identify the boleto" },
);

export type SantanderWebhookPayload = z.infer<typeof santanderWebhookSchema>;

/**
 * Santander webhook HMAC verification.
 * Santander typically uses IP whitelisting rather than HMAC,
 * but we support an optional X-Webhook-Signature header for extra safety.
 */
export const SANTANDER_WEBHOOK_IPS = [
  // Santander sandbox IPs (update with production IPs from Santander docs)
  // These are verified at infra/WAF level; app-level check is defense-in-depth
];
