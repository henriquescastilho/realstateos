import { eq, and, ilike, count, desc } from "drizzle-orm";
import { db } from "../../db";
import { leaseContracts } from "../../db/schema";
import { NotFoundError, ConflictError } from "../../lib/errors";
import type {
  CreateContractInput,
  UpdateContractInput,
  TransitionStatusInput,
  ListContractsQuery,
} from "./validators";

// ─── Valid status transitions ──────────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending_onboarding: ["active"],
  active: ["suspended", "terminated"],
  suspended: ["active", "terminated"],
  terminated: [], // terminal state
};

// ─── List contracts ────────────────────────────────────────────────────────

export async function listContracts(query: ListContractsQuery) {
  const conditions = [eq(leaseContracts.orgId, query.orgId)];

  if (query.status) {
    conditions.push(eq(leaseContracts.operationalStatus, query.status));
  }
  if (query.ownerId) {
    conditions.push(eq(leaseContracts.ownerId, query.ownerId));
  }
  if (query.tenantId) {
    conditions.push(eq(leaseContracts.tenantId, query.tenantId));
  }
  if (query.propertyId) {
    conditions.push(eq(leaseContracts.propertyId, query.propertyId));
  }

  const where = and(...conditions);
  const offset = (query.page - 1) * query.pageSize;

  const [rows, [{ value: total }]] = await Promise.all([
    db
      .select()
      .from(leaseContracts)
      .where(where)
      .orderBy(desc(leaseContracts.createdAt))
      .limit(query.pageSize)
      .offset(offset),
    db.select({ value: count() }).from(leaseContracts).where(where),
  ]);

  return { rows, total: Number(total) };
}

// ─── Get contract by ID ────────────────────────────────────────────────────

export async function getContractById(id: string, orgId: string) {
  const [contract] = await db
    .select()
    .from(leaseContracts)
    .where(and(eq(leaseContracts.id, id), eq(leaseContracts.orgId, orgId)))
    .limit(1);

  if (!contract) {
    throw new NotFoundError("LeaseContract", id);
  }

  return contract;
}

// ─── Create contract ───────────────────────────────────────────────────────

export async function createContract(input: CreateContractInput) {
  const [contract] = await db
    .insert(leaseContracts)
    .values({
      orgId: input.orgId,
      propertyId: input.propertyId,
      ownerId: input.ownerId,
      tenantId: input.tenantId,
      startDate: input.startDate,
      endDate: input.endDate,
      rentAmount: input.rentAmount,
      depositType: input.depositType,
      chargeRules: input.chargeRules ?? {},
      payoutRules: input.payoutRules ?? {},
      operationalStatus: "pending_onboarding",
    })
    .returning();

  return contract;
}

// ─── Update contract ───────────────────────────────────────────────────────

export async function updateContract(
  id: string,
  input: UpdateContractInput,
): Promise<typeof leaseContracts.$inferSelect> {
  // Verify ownership first
  await getContractById(id, input.orgId);

  const updates: Partial<typeof leaseContracts.$inferInsert> = {};
  if (input.rentAmount !== undefined) updates.rentAmount = input.rentAmount;
  if (input.endDate !== undefined) updates.endDate = input.endDate;
  if (input.depositType !== undefined) updates.depositType = input.depositType;
  if (input.chargeRules !== undefined) updates.chargeRules = input.chargeRules;
  if (input.payoutRules !== undefined) updates.payoutRules = input.payoutRules;

  const [updated] = await db
    .update(leaseContracts)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(leaseContracts.id, id), eq(leaseContracts.orgId, input.orgId)))
    .returning();

  return updated!;
}

// ─── Status transition ─────────────────────────────────────────────────────

export async function transitionContractStatus(
  id: string,
  input: TransitionStatusInput,
): Promise<typeof leaseContracts.$inferSelect> {
  const contract = await getContractById(id, input.orgId);

  const allowed = VALID_TRANSITIONS[contract.operationalStatus] ?? [];
  if (!allowed.includes(input.status)) {
    throw new ConflictError(
      `Cannot transition contract from '${contract.operationalStatus}' to '${input.status}'. ` +
        `Allowed transitions: ${allowed.join(", ") || "none"}`,
    );
  }

  const [updated] = await db
    .update(leaseContracts)
    .set({ operationalStatus: input.status, updatedAt: new Date() })
    .where(and(eq(leaseContracts.id, id), eq(leaseContracts.orgId, input.orgId)))
    .returning();

  return updated!;
}

// ─── Soft delete (terminate) ───────────────────────────────────────────────

export async function deleteContract(id: string, orgId: string): Promise<void> {
  const contract = await getContractById(id, orgId);

  if (contract.operationalStatus === "terminated") {
    // Already terminated — idempotent
    return;
  }

  await db
    .update(leaseContracts)
    .set({ operationalStatus: "terminated", updatedAt: new Date() })
    .where(and(eq(leaseContracts.id, id), eq(leaseContracts.orgId, orgId)));
}
