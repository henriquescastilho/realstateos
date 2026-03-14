/**
 * OCR connector stub.
 * Handles document parsing (contract PDFs, IDs, utility bills).
 * Replace with real OCR provider (e.g., AWS Textract, Google Vision) in production.
 */

export interface OCRRequest {
  documentUrl: string;
  documentType: "contract" | "identity" | "utility_bill" | "bank_statement";
}

export interface OCRResponse {
  success: boolean;
  parsedData?: Record<string, unknown>;
  confidence?: number;
  rawText?: string;
  error?: string;
}

export async function parseDocument(req: OCRRequest): Promise<OCRResponse> {
  console.log(`[ocr] Parsing ${req.documentType}: ${req.documentUrl}`);

  // Stub implementation — returns mock data based on document type
  const mockData: Record<string, Record<string, unknown>> = {
    contract: {
      startDate: "2026-04-01",
      endDate: "2027-03-31",
      rentAmount: "1500.00",
      tenantName: "Parsed Tenant Name",
      ownerName: "Parsed Owner Name",
    },
    identity: {
      fullName: "Parsed Full Name",
      documentNumber: "52998224725",
      birthDate: "1990-01-15",
    },
    utility_bill: {
      address: "Rua Parsed, 123",
      amount: "250.00",
      dueDate: "2026-04-10",
    },
    bank_statement: {
      accountHolder: "Parsed Account Holder",
      balance: "15000.00",
      period: "2026-03",
    },
  };

  return {
    success: true,
    parsedData: mockData[req.documentType] ?? {},
    confidence: 75 + Math.random() * 20, // 75-95% simulated
    rawText: "[stub] Raw OCR text would appear here",
  };
}
