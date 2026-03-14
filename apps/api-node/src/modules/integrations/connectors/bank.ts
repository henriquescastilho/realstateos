/**
 * Bank connector stub.
 * Handles boleto generation and PIX QR code creation.
 * Replace with real bank API integration in production.
 */

export interface BoletoRequest {
  amount: string;
  dueDate: string;
  payerName: string;
  payerDocument: string;
  description: string;
}

export interface BoletoResponse {
  success: boolean;
  boletoId?: string;
  barcode?: string;
  digitableLine?: string;
  error?: string;
}

export interface PixQRRequest {
  amount: string;
  description: string;
  expiresInMinutes?: number;
}

export interface PixQRResponse {
  success: boolean;
  qrCode?: string;
  copyPaste?: string;
  transactionId?: string;
  error?: string;
}

export async function generateBoleto(req: BoletoRequest): Promise<BoletoResponse> {
  console.log(`[bank] Generating boleto: R$ ${req.amount} due ${req.dueDate}`);

  // Stub implementation
  const boletoId = `bol_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    success: true,
    boletoId,
    barcode: `23793.38128 60000.000003 ${boletoId.slice(4, 16)} 1 ${req.amount.replace(".", "")}`,
    digitableLine: `23793381286000000000${boletoId.slice(4, 10)}00001${req.amount.replace(".", "")}`,
  };
}

export async function generatePixQR(req: PixQRRequest): Promise<PixQRResponse> {
  console.log(`[bank] Generating PIX QR: R$ ${req.amount}`);

  const transactionId = `pix_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    success: true,
    qrCode: `00020126580014br.gov.bcb.pix0136${transactionId}5204000053039865802BR`,
    copyPaste: `00020126580014br.gov.bcb.pix0136${transactionId}`,
    transactionId,
  };
}
