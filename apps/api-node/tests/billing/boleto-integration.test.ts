/**
 * Tests for automatic boleto generation when issuing a charge.
 *
 * These tests verify:
 * 1. Boleto fields are returned when a charge is issued
 * 2. Charge is still issued even if boleto generation fails
 * 3. boletoStatus reflects the correct state
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the bank connector before importing the service
vi.mock("../../src/modules/integrations/connectors/bank", () => ({
  getOrgBankCredentials: vi.fn(),
  generateBoleto: vi.fn(),
}));

// Mock the db module
vi.mock("../../src/db", () => {
  const selectResult = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };

  return {
    db: {
      select: vi.fn(() => selectResult),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([]),
        })),
      })),
    },
  };
});

import { db } from "../../src/db";
import {
  getOrgBankCredentials,
  generateBoleto,
} from "../../src/modules/integrations/connectors/bank";
import { issueCharge } from "../../src/modules/billing/service";

const MOCK_CHARGE = {
  id: "charge-1",
  orgId: "org-1",
  leaseContractId: "contract-1",
  billingPeriod: "2026-04",
  netAmount: "1500.00",
  dueDate: "2026-04-05",
  issueStatus: "draft",
  paymentStatus: "open",
};

const MOCK_CONTRACT = {
  id: "contract-1",
  orgId: "org-1",
  tenantId: "tenant-1",
  ownerId: "owner-1",
  propertyId: "property-1",
  rentAmount: "1500.00",
};

const MOCK_TENANT = {
  id: "tenant-1",
  orgId: "org-1",
  fullName: "Joao da Silva",
  documentNumber: "12345678901",
};

const MOCK_CREDS = {
  id: "cred-1",
  orgId: "org-1",
  provider: "santander",
  environment: "sandbox",
  clientId: "client-1",
  clientSecret: "secret",
  workspaceId: "ws-1",
  certPath: "cert.pem",
  keyPath: "key.pem",
  baseUrl: "https://sandbox.api.santander.com.br",
  isActive: true,
};

describe("Boleto auto-generation on charge issue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupDbMock(charge: unknown, contract?: unknown, tenant?: unknown) {
    let callCount = 0;
    const updateResult = {
      ...charge,
      issueStatus: "issued",
      issuedAt: new Date(),
    };

    // select().from().where().limit() chain — called multiple times
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const currentCall = callCount++;
      return {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue(
              currentCall === 0
                ? [charge] // first call: charge lookup
                : currentCall === 1
                  ? contract ? [contract] : [] // second: contract
                  : tenant ? [tenant] : [], // third: tenant
            ),
          })),
        })),
      };
    });

    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([updateResult]),
        })),
      })),
    });

    return updateResult;
  }

  it("issues charge with boleto_status=generated when Santander succeeds", async () => {
    setupDbMock(MOCK_CHARGE, MOCK_CONTRACT, MOCK_TENANT);

    (getOrgBankCredentials as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_CREDS);
    (generateBoleto as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      provider: "santander",
      boletoId: "BOL-123",
      barcode: "12345.67890 12345.678901 12345.678901 1 12340000150000",
      digitableLine: "12345678901234567890123456789012345678901234567",
    });

    await issueCharge("charge-1");

    // Verify generateBoleto was called with correct params
    expect(generateBoleto).toHaveBeenCalledWith({
      orgId: "org-1",
      amount: "1500.00",
      dueDate: "2026-04-05",
      payerName: "Joao da Silva",
      payerDocument: "12345678901",
      description: "Aluguel 2026-04",
    });

    // Verify the update included boleto fields
    const updateCall = (db.update as ReturnType<typeof vi.fn>).mock.results[0];
    const setCall = updateCall.value.set;
    expect(setCall).toHaveBeenCalledWith(
      expect.objectContaining({
        issueStatus: "issued",
        boletoId: "BOL-123",
        boletoStatus: "generated",
      }),
    );
  });

  it("issues charge with boleto_status=failed when Santander returns error", async () => {
    setupDbMock(MOCK_CHARGE, MOCK_CONTRACT, MOCK_TENANT);

    (getOrgBankCredentials as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_CREDS);
    (generateBoleto as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      provider: "santander",
      error: "Santander API error: 503 — Service Unavailable",
    });

    await issueCharge("charge-1");

    // Charge should still be issued
    const updateCall = (db.update as ReturnType<typeof vi.fn>).mock.results[0];
    const setCall = updateCall.value.set;
    expect(setCall).toHaveBeenCalledWith(
      expect.objectContaining({
        issueStatus: "issued",
        boletoStatus: "failed",
        boletoError: "Santander API error: 503 — Service Unavailable",
      }),
    );
  });

  it("issues charge with boleto_status=pending when org has no bank credentials", async () => {
    setupDbMock(MOCK_CHARGE);

    (getOrgBankCredentials as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await issueCharge("charge-1");

    // Charge should be issued, boleto pending
    const updateCall = (db.update as ReturnType<typeof vi.fn>).mock.results[0];
    const setCall = updateCall.value.set;
    expect(setCall).toHaveBeenCalledWith(
      expect.objectContaining({
        issueStatus: "issued",
        boletoStatus: "pending",
      }),
    );

    // generateBoleto should NOT have been called
    expect(generateBoleto).not.toHaveBeenCalled();
  });

  it("issues charge with boleto_status=failed when generateBoleto throws", async () => {
    setupDbMock(MOCK_CHARGE, MOCK_CONTRACT, MOCK_TENANT);

    (getOrgBankCredentials as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_CREDS);
    (generateBoleto as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("mTLS certificate not available"),
    );

    await issueCharge("charge-1");

    // Charge should still be issued even though boleto threw
    const updateCall = (db.update as ReturnType<typeof vi.fn>).mock.results[0];
    const setCall = updateCall.value.set;
    expect(setCall).toHaveBeenCalledWith(
      expect.objectContaining({
        issueStatus: "issued",
        boletoStatus: "failed",
        boletoError: "mTLS certificate not available",
      }),
    );
  });

  it("issues charge with boleto_status=failed when tenant not found", async () => {
    setupDbMock(MOCK_CHARGE, MOCK_CONTRACT, undefined /* no tenant */);

    (getOrgBankCredentials as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_CREDS);

    await issueCharge("charge-1");

    const updateCall = (db.update as ReturnType<typeof vi.fn>).mock.results[0];
    const setCall = updateCall.value.set;
    expect(setCall).toHaveBeenCalledWith(
      expect.objectContaining({
        issueStatus: "issued",
        boletoStatus: "failed",
        boletoError: expect.stringContaining("Tenant"),
      }),
    );

    // generateBoleto should NOT be called if tenant is missing
    expect(generateBoleto).not.toHaveBeenCalled();
  });
});
