import { eq, and, sql, count } from "drizzle-orm";
import { db } from "../../db";
import {
  properties,
  owners,
  tenants,
  leaseContracts,
  agentTasks,
} from "../../db/schema";
import { NotFoundError, ValidationError, ConflictError } from "../../lib/errors";
import { LeaseContractStatus } from "../../types/domain";
import { validateDocument } from "./cpf";
import type { OnboardContractInput } from "./validators";

const CONFIDENCE_THRESHOLD = 80;

/**
 * Atomic contract onboarding: creates property, owner, tenant, and lease in a single transaction.
 * If AI confidence < 80%, also creates an AgentTask for human review.
 */
export async function onboardContract(input: OnboardContractInput) {
  // Validate documents before starting transaction
  const ownerDoc = validateDocument(input.owner.documentNumber);
  if (!ownerDoc) {
    throw new ValidationError("Invalid owner document (CPF/CNPJ)", {
      field: "owner.documentNumber",
    });
  }

  const tenantDoc = validateDocument(input.tenant.documentNumber);
  if (!tenantDoc) {
    throw new ValidationError("Invalid tenant document (CPF/CNPJ)", {
      field: "tenant.documentNumber",
    });
  }

  // Validate lease dates
  if (input.lease.startDate >= input.lease.endDate) {
    throw new ValidationError("Lease start date must be before end date");
  }

  // Atomic transaction
  const result = await db.transaction(async (tx) => {
    // 1. Create property
    const [property] = await tx
      .insert(properties)
      .values({
        orgId: input.orgId,
        address: input.property.address,
        city: input.property.city,
        state: input.property.state,
        zip: input.property.zip,
        type: input.property.type,
        areaSqm: input.property.areaSqm?.toString(),
        bedrooms: input.property.bedrooms,
        registryReference: input.property.registryReference,
      })
      .returning();

    // 2. Create owner
    const [owner] = await tx
      .insert(owners)
      .values({
        orgId: input.orgId,
        fullName: input.owner.fullName,
        documentNumber: ownerDoc.clean,
        email: input.owner.email,
        phone: input.owner.phone,
        payoutPreferences: input.owner.payoutPreferences,
      })
      .returning();

    // 3. Create tenant
    const [tenant] = await tx
      .insert(tenants)
      .values({
        orgId: input.orgId,
        fullName: input.tenant.fullName,
        documentNumber: tenantDoc.clean,
        email: input.tenant.email,
        phone: input.tenant.phone,
        guaranteeProfile: input.tenant.guaranteeProfile,
      })
      .returning();

    // 4. Create lease contract
    const [lease] = await tx
      .insert(leaseContracts)
      .values({
        orgId: input.orgId,
        propertyId: property.id,
        ownerId: owner.id,
        tenantId: tenant.id,
        startDate: input.lease.startDate,
        endDate: input.lease.endDate,
        rentAmount: input.lease.rentAmount.toString(),
        depositType: input.lease.depositType,
        chargeRules: input.lease.chargeRules ?? {},
        payoutRules: input.lease.payoutRules ?? {},
        operationalStatus: LeaseContractStatus.PENDING_ONBOARDING,
      })
      .returning();

    // 5. If confidence < threshold, create an AgentTask for human review
    let agentTask = null;
    if (
      input.confidence !== undefined &&
      input.confidence < CONFIDENCE_THRESHOLD
    ) {
      const [task] = await tx
        .insert(agentTasks)
        .values({
          orgId: input.orgId,
          taskType: "onboarding_review",
          status: "queued",
          input: {
            leaseContractId: lease.id,
            confidence: input.confidence,
            reason: `Document parsing confidence ${input.confidence}% is below ${CONFIDENCE_THRESHOLD}% threshold`,
          },
          confidence: input.confidence.toFixed(4),
          relatedEntityType: "lease_contract",
          relatedEntityId: lease.id,
        })
        .returning();
      agentTask = task;
    }

    return { property, owner, tenant, lease, agentTask };
  });

  return result;
}

/**
 * Get a single contract with related entities.
 */
export async function getContractById(contractId: string) {
  const [contract] = await db
    .select()
    .from(leaseContracts)
    .where(eq(leaseContracts.id, contractId))
    .limit(1);

  if (!contract) {
    throw new NotFoundError("LeaseContract", contractId);
  }

  // Fetch related entities in parallel
  const [property, owner, tenant] = await Promise.all([
    db
      .select()
      .from(properties)
      .where(eq(properties.id, contract.propertyId))
      .limit(1)
      .then((r) => r[0]),
    db
      .select()
      .from(owners)
      .where(eq(owners.id, contract.ownerId))
      .limit(1)
      .then((r) => r[0]),
    db
      .select()
      .from(tenants)
      .where(eq(tenants.id, contract.tenantId))
      .limit(1)
      .then((r) => r[0]),
  ]);

  return { contract, property, owner, tenant };
}

/**
 * Activate a pending contract.
 */
export async function activateContract(contractId: string) {
  const [existing] = await db
    .select()
    .from(leaseContracts)
    .where(eq(leaseContracts.id, contractId))
    .limit(1);

  if (!existing) {
    throw new NotFoundError("LeaseContract", contractId);
  }

  if (existing.operationalStatus !== LeaseContractStatus.PENDING_ONBOARDING) {
    throw new ConflictError(
      `Contract is '${existing.operationalStatus}', can only activate from '${LeaseContractStatus.PENDING_ONBOARDING}'`,
    );
  }

  const [updated] = await db
    .update(leaseContracts)
    .set({ operationalStatus: LeaseContractStatus.ACTIVE })
    .where(eq(leaseContracts.id, contractId))
    .returning();

  return updated;
}

/**
 * List contracts with pagination and optional status filter.
 */
export async function listContracts(params: {
  orgId: string;
  status?: string;
  page: number;
  pageSize: number;
}) {
  const conditions = [eq(leaseContracts.orgId, params.orgId)];
  if (params.status) {
    conditions.push(eq(leaseContracts.operationalStatus, params.status));
  }

  const whereClause = and(...conditions);

  const [data, totalResult] = await Promise.all([
    db
      .select()
      .from(leaseContracts)
      .where(whereClause)
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize)
      .orderBy(leaseContracts.createdAt),
    db
      .select({ total: count() })
      .from(leaseContracts)
      .where(whereClause),
  ]);

  return {
    data,
    total: totalResult[0]?.total ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}
