/**
 * Gerador de PIX Copia e Cola (EMV/BRCode) conforme padrão Banco Central do Brasil.
 * Funciona localmente sem depender de API bancária — ideal para sandbox.
 *
 * Referência: https://www.bcb.gov.br/estabilidadefinanceira/pix
 * Especificação EMV: BR Code Manual de Padrões v2.1.0
 */

import { createHash } from "crypto";

interface PixPayload {
  /** Chave PIX do recebedor (CPF, CNPJ, email, telefone, ou chave aleatória) */
  pixKey: string;
  /** Nome do recebedor (max 25 chars) */
  merchantName: string;
  /** Cidade do recebedor (max 15 chars) */
  merchantCity: string;
  /** Valor em reais (ex: "1500.00"). Se omitido, gera PIX sem valor fixo */
  amount?: string;
  /** ID da transação (max 25 chars, [A-Za-z0-9]) */
  txId?: string;
  /** Descrição (informação adicional, max 50 chars) */
  description?: string;
}

// EMV TLV (Tag-Length-Value) helper
function tlv(tag: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${tag}${len}${value}`;
}

// CRC16-CCITT (conforme especificação EMV)
function crc16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Gera o payload EMV (PIX Copia e Cola) conforme padrão BACEN.
 *
 * Campos EMV:
 * - 00: Payload Format Indicator ("01")
 * - 26: Merchant Account Info (PIX)
 *   - 00: GUI ("br.gov.bcb.pix")
 *   - 01: Chave PIX
 *   - 02: Descrição (opcional)
 * - 52: Merchant Category Code ("0000" = não informado)
 * - 53: Transaction Currency ("986" = BRL)
 * - 54: Transaction Amount (opcional)
 * - 58: Country Code ("BR")
 * - 59: Merchant Name
 * - 60: Merchant City
 * - 62: Additional Data
 *   - 05: Reference Label (txId)
 * - 63: CRC16
 */
export function generatePixEmv(payload: PixPayload): string {
  const {
    pixKey,
    merchantName,
    merchantCity,
    amount,
    txId,
    description,
  } = payload;

  // 26: Merchant Account Information (PIX)
  let mai = tlv("00", "br.gov.bcb.pix");
  mai += tlv("01", pixKey);
  if (description) {
    mai += tlv("02", description.slice(0, 50));
  }

  // Build EMV string
  let emv = "";
  emv += tlv("00", "01"); // Payload Format Indicator
  emv += tlv("26", mai); // Merchant Account Info
  emv += tlv("52", "0000"); // Merchant Category Code
  emv += tlv("53", "986"); // Transaction Currency (BRL)

  if (amount) {
    const numAmount = parseFloat(amount);
    if (numAmount > 0) {
      emv += tlv("54", numAmount.toFixed(2));
    }
  }

  emv += tlv("58", "BR"); // Country Code
  emv += tlv("59", merchantName.slice(0, 25)); // Merchant Name
  emv += tlv("60", merchantCity.slice(0, 15)); // Merchant City

  // 62: Additional Data Field
  const refLabel = (txId ?? generateTxId()).slice(0, 25);
  const additionalData = tlv("05", refLabel);
  emv += tlv("62", additionalData);

  // 63: CRC16 — placeholder "6304" + compute CRC over entire string including "6304"
  emv += "6304";
  const checksum = crc16(emv);
  emv = emv.slice(0, -4) + `6304${checksum}`;

  return emv;
}

/** Gera um txId aleatório compatível com PIX (alfanumérico, 25 chars) */
export function generateTxId(): string {
  const hash = createHash("sha256")
    .update(`${Date.now()}-${Math.random()}`)
    .digest("hex");
  return hash.slice(0, 25);
}
