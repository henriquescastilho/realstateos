import { eq, and, count, inArray } from "drizzle-orm";
import { db } from "../../db";
import {
  billingSchedules,
  charges,
  leaseContracts,
  tenants,
  properties,
  owners,
  organizations,
} from "../../db/schema";
import { NotFoundError, ValidationError, ConflictError } from "../../lib/errors";
import { ChargeIssueStatus, LeaseContractStatus, BoletoStatus } from "../../types/domain";
import { calculateCharge } from "./calculator";
import { generateBoleto, getOrgBankCredentials } from "../integrations/connectors/bank";
import { emitDomainEvent } from "../../lib/events";
import { sendMessage } from "../communications/service";
import type { CreateBillingScheduleInput, GenerateChargesInput } from "./validators";

/**
 * Create a billing schedule for a lease contract.
 */
export async function createBillingSchedule(input: CreateBillingScheduleInput) {
  // Verify the lease contract exists and is active
  const [contract] = await db
    .select()
    .from(leaseContracts)
    .where(eq(leaseContracts.id, input.leaseContractId))
    .limit(1);

  if (!contract) {
    throw new NotFoundError("LeaseContract", input.leaseContractId);
  }

  if (contract.orgId !== input.orgId) {
    throw new NotFoundError("LeaseContract", input.leaseContractId);
  }

  const [schedule] = await db
    .insert(billingSchedules)
    .values({
      orgId: input.orgId,
      leaseContractId: input.leaseContractId,
      dueDateRule: input.dueDateRule,
      chargeComponents: input.chargeComponents,
      collectionMethod: input.collectionMethod,
      lateFeeRule: input.lateFeeRule,
      interestRule: input.interestRule,
    })
    .returning();

  return schedule;
}

/**
 * Generate a charge for a specific billing period.
 * Uses the billing schedule's rules + calculator for amounts.
 */
export async function generateCharge(input: GenerateChargesInput) {
  // Find billing schedule for this contract
  const [schedule] = await db
    .select()
    .from(billingSchedules)
    .where(
      and(
        eq(billingSchedules.leaseContractId, input.leaseContractId),
        eq(billingSchedules.status, "active"),
      ),
    )
    .limit(1);

  if (!schedule) {
    throw new NotFoundError(
      "BillingSchedule",
      `for contract ${input.leaseContractId}`,
    );
  }

  // Get the lease contract for rent amount
  const [contract] = await db
    .select()
    .from(leaseContracts)
    .where(eq(leaseContracts.id, input.leaseContractId))
    .limit(1);

  if (!contract) {
    throw new NotFoundError("LeaseContract", input.leaseContractId);
  }

  // Calculate the charge using the billing calculator
  const calculation = calculateCharge({
    rentAmount: contract.rentAmount,
    components: schedule.chargeComponents ?? [],
    lateFeePercentage: schedule.lateFeeRule?.percentage ?? "2.00",
    dailyInterestPercentage: schedule.interestRule?.dailyPercentage ?? "0.033",
    daysLate: input.daysLate,
    earlyDiscountPercentage: input.earlyDiscountPercentage,
    daysEarly: input.daysEarly,
  });

  // Insert charge (idempotency enforced by unique index on contract+period+status)
  try {
    const [charge] = await db
      .insert(charges)
      .values({
        orgId: input.orgId,
        leaseContractId: input.leaseContractId,
        billingPeriod: input.billingPeriod,
        lineItems: calculation.lineItems,
        grossAmount: calculation.grossAmount,
        discountAmount: calculation.discountAmount,
        penaltyAmount: calculation.penaltyAmount,
        netAmount: calculation.netAmount,
        issueStatus: ChargeIssueStatus.DRAFT,
        dueDate: input.dueDate,
      })
      .returning();

    await emitDomainEvent(input.orgId, "charge.created", {
      chargeId: charge.id,
      leaseContractId: input.leaseContractId,
      billingPeriod: input.billingPeriod,
      netAmount: calculation.netAmount,
    }).catch((e) => console.error("[billing] Event emit error:", e));

    return charge;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message.includes("charges_idempotency_idx")
    ) {
      throw new ConflictError(
        `Charge already exists for contract ${input.leaseContractId} period ${input.billingPeriod}`,
      );
    }
    throw err;
  }
}

/**
 * List charges with filters and pagination.
 */
export async function listCharges(params: {
  orgId: string;
  leaseContractId?: string;
  billingPeriod?: string;
  issueStatus?: string;
  paymentStatus?: string;
  page: number;
  pageSize: number;
}) {
  const conditions = [eq(charges.orgId, params.orgId)];

  if (params.leaseContractId) {
    conditions.push(eq(charges.leaseContractId, params.leaseContractId));
  }
  if (params.billingPeriod) {
    conditions.push(eq(charges.billingPeriod, params.billingPeriod));
  }
  if (params.issueStatus) {
    conditions.push(eq(charges.issueStatus, params.issueStatus));
  }
  if (params.paymentStatus) {
    conditions.push(eq(charges.paymentStatus, params.paymentStatus));
  }

  const whereClause = and(...conditions);

  const [data, totalResult] = await Promise.all([
    db
      .select()
      .from(charges)
      .where(whereClause)
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize)
      .orderBy(charges.dueDate),
    db.select({ total: count() }).from(charges).where(whereClause),
  ]);

  // Enrich charges with contract/property/renter names
  const contractIds = [...new Set(data.map((c) => c.leaseContractId))];
  let contractMap = new Map<string, { propertyId: string; tenantId: string; ownerId: string; rentAmount: string }>();
  let propertyMap = new Map<string, string>();
  let tenantMap = new Map<string, string>();

  if (contractIds.length > 0) {
    const contractRows = await db
      .select()
      .from(leaseContracts)
      .where(inArray(leaseContracts.id, contractIds));

    for (const c of contractRows) {
      contractMap.set(c.id, { propertyId: c.propertyId, tenantId: c.tenantId, ownerId: c.ownerId, rentAmount: c.rentAmount });
    }

    const propIds = [...new Set(contractRows.map((c) => c.propertyId))];
    const tenantIds = [...new Set(contractRows.map((c) => c.tenantId))];

    if (propIds.length > 0) {
      const propRows = await db.select({ id: properties.id, address: properties.address }).from(properties).where(inArray(properties.id, propIds));
      for (const p of propRows) propertyMap.set(p.id, p.address);
    }

    if (tenantIds.length > 0) {
      const tenantRows = await db.select({ id: tenants.id, fullName: tenants.fullName }).from(tenants).where(inArray(tenants.id, tenantIds));
      for (const t of tenantRows) tenantMap.set(t.id, t.fullName);
    }
  }

  const enriched = data.map((charge) => {
    const contract = contractMap.get(charge.leaseContractId);
    return {
      ...charge,
      // Frontend-expected fields
      id: charge.id,
      contract_id: charge.leaseContractId,
      description: `Aluguel ${charge.billingPeriod}`,
      property_address: contract ? propertyMap.get(contract.propertyId) ?? "" : "",
      renter_name: contract ? tenantMap.get(contract.tenantId) ?? "" : "",
      contract_monthly_rent: contract?.rentAmount ?? "0",
      type: "RENT",
      amount: charge.netAmount,
      due_date: charge.dueDate,
      status: charge.paymentStatus === "open" ? "pending" : charge.paymentStatus,
    };
  });

  return {
    data: enriched,
    total: totalResult[0]?.total ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}

/**
 * Issue a charge (transition from draft → issued).
 * Automatically generates a Santander boleto if the org has bank credentials configured.
 * If boleto generation fails, the charge is still issued but flagged as boleto_status=failed.
 */
export async function issueCharge(chargeId: string) {
  const [existing] = await db
    .select()
    .from(charges)
    .where(eq(charges.id, chargeId))
    .limit(1);

  if (!existing) {
    throw new NotFoundError("Charge", chargeId);
  }

  if (existing.issueStatus !== ChargeIssueStatus.DRAFT) {
    throw new ConflictError(
      `Charge is '${existing.issueStatus}', can only issue from '${ChargeIssueStatus.DRAFT}'`,
    );
  }

  // ─── Attempt boleto generation ───
  const boletoResult = await attemptBoletoGeneration(existing);

  const [updated] = await db
    .update(charges)
    .set({
      issueStatus: ChargeIssueStatus.ISSUED,
      issuedAt: new Date(),
      boletoId: boletoResult.boletoId ?? null,
      barcode: boletoResult.barcode ?? null,
      digitableLine: boletoResult.digitableLine ?? null,
      boletoStatus: boletoResult.status,
      boletoError: boletoResult.error ?? null,
    })
    .where(eq(charges.id, chargeId))
    .returning();

  await emitDomainEvent(existing.orgId, "charge.issued", {
    chargeId: updated.id,
    leaseContractId: updated.leaseContractId,
    netAmount: updated.netAmount,
    dueDate: updated.dueDate,
    boletoStatus: boletoResult.status,
  }).catch((e) => console.error("[billing] Event emit error:", e));

  // ─── Enviar email do boleto ao inquilino com dados do Santander ───
  await sendChargeIssuedEmail(updated).catch((e) =>
    console.error("[billing] Erro ao enviar email do boleto:", e),
  );

  return updated;
}

/**
 * Try to generate a boleto via Santander for a charge.
 * Returns boleto data on success, or a failed status with error on failure.
 * Never throws — the caller always gets a result.
 */
async function attemptBoletoGeneration(charge: {
  orgId: string;
  leaseContractId: string;
  netAmount: string;
  dueDate: string;
  billingPeriod: string;
}): Promise<{
  status: string;
  boletoId?: string;
  barcode?: string;
  digitableLine?: string;
  error?: string;
}> {
  try {
    // Check if org has bank credentials configured
    const creds = await getOrgBankCredentials(charge.orgId);
    if (!creds) {
      return {
        status: BoletoStatus.PENDING,
        error: "No bank credentials configured for this org",
      };
    }

    // Load tenant data from the lease contract
    const [contract] = await db
      .select()
      .from(leaseContracts)
      .where(eq(leaseContracts.id, charge.leaseContractId))
      .limit(1);

    if (!contract) {
      return {
        status: BoletoStatus.FAILED,
        error: `Lease contract ${charge.leaseContractId} not found`,
      };
    }

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, contract.tenantId))
      .limit(1);

    if (!tenant) {
      return {
        status: BoletoStatus.FAILED,
        error: `Tenant ${contract.tenantId} not found`,
      };
    }

    // Call Santander API
    const result = await generateBoleto({
      orgId: charge.orgId,
      amount: charge.netAmount,
      dueDate: charge.dueDate,
      payerName: tenant.fullName,
      payerDocument: tenant.documentNumber,
      description: `Aluguel ${charge.billingPeriod}`,
    });

    if (result.success) {
      console.log(
        `[billing] Charge boleto generated: boletoId=${result.boletoId}`,
      );
      return {
        status: BoletoStatus.GENERATED,
        boletoId: result.boletoId,
        barcode: result.barcode,
        digitableLine: result.digitableLine,
      };
    }

    console.warn(
      `[billing] Boleto generation failed for charge, issuing without boleto: ${result.error}`,
    );
    return {
      status: BoletoStatus.FAILED,
      error: result.error,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[billing] Boleto generation error: ${errorMsg}`);
    return {
      status: BoletoStatus.FAILED,
      error: errorMsg,
    };
  }
}

/**
 * Envia email HTML do boleto ao inquilino após emissão da cobrança.
 * Inclui dados reais do Santander: código de barras, linha digitável, chave PIX.
 */
async function sendChargeIssuedEmail(charge: {
  id: string;
  orgId: string;
  leaseContractId: string;
  billingPeriod: string;
  dueDate: string;
  lineItems: Array<{ type: string; description: string; amount: string; source: string }> | null;
  grossAmount: string;
  penaltyAmount: string;
  discountAmount: string;
  netAmount: string;
  barcode: string | null;
  digitableLine: string | null;
}): Promise<void> {
  // Buscar contrato, inquilino, imóvel e organização
  const [contract] = await db
    .select()
    .from(leaseContracts)
    .where(eq(leaseContracts.id, charge.leaseContractId))
    .limit(1);
  if (!contract) return;

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, contract.tenantId))
    .limit(1);
  if (!tenant?.email) return;

  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.id, contract.propertyId))
    .limit(1);

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, charge.orgId))
    .limit(1);

  // Buscar chave PIX do proprietário (owner do contrato)
  const [owner] = await db
    .select()
    .from(owners)
    .where(eq(owners.id, contract.ownerId))
    .limit(1);

  const pixKey = (owner?.payoutPreferences as Record<string, unknown>)?.pixKey as string | undefined;

  const lineItems = (charge.lineItems ?? []).map((li) => ({
    description: li.description,
    amount: li.amount,
  }));

  const propertyAddress = property
    ? `${property.address}, ${property.city}/${property.state}`
    : "";

  await sendMessage({
    orgId: charge.orgId,
    entityType: "charge",
    entityId: charge.id,
    channel: "email",
    templateType: "charge_issued",
    recipient: tenant.email,
    templateData: {
      orgName: org?.name ?? "",
      tenantName: tenant.fullName,
      propertyAddress,
      billingPeriod: charge.billingPeriod,
      dueDate: charge.dueDate,
      amount: charge.netAmount,
      // Dados estendidos para o template HTML
      lineItems: JSON.stringify(lineItems),
      grossAmount: charge.grossAmount,
      penaltyAmount: charge.penaltyAmount,
      discountAmount: charge.discountAmount,
      netAmount: charge.netAmount,
      // Dados do Santander
      barcode: charge.barcode ?? "",
      digitableLine: charge.digitableLine ?? "",
      pixKey: pixKey ?? "",
    },
  });

  console.log(`[billing] Email do boleto enviado para ${tenant.email} (cobrança ${charge.id})`);
}
