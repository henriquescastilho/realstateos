/**
 * RENOVADOR — Identifica contratos prestes a vencer e calcula reajuste de aluguel.
 * Gera um agentTask do tipo "renewal_draft" para revisão humana antes de renovar.
 */

import { and, between, eq } from "drizzle-orm";
import { db } from "../../../db";
import { agentTasks, leaseContracts, owners, properties, tenants } from "../../../db/schema";

// ─── BCB SGS series codes ───
const INDEX_SERIES: Record<string, number> = {
  IGPM: 189,
  IPCA: 433,
  INPC: 188,
};

interface BcbDataPoint {
  data: string;
  valor: string;
}

async function fetchAccumulatedIndex(index: string): Promise<number | null> {
  const code = INDEX_SERIES[index.toUpperCase()];
  if (!code) return null;

  try {
    const res = await fetch(
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/12?formato=json`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) {
      console.error(`[renovador] BCB API error: ${res.status} for index ${index}`);
      return null;
    }
    const data = (await res.json()) as BcbDataPoint[];
    if (!data || data.length === 0) return null;

    const accumulated = data.reduce(
      (acc, d) => acc * (1 + parseFloat(d.valor) / 100),
      1,
    );
    return (accumulated - 1) * 100;
  } catch (err) {
    console.error(`[renovador] Failed to fetch BCB index ${index}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toISODate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function contractDurationDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Process a single expiring contract: fetch index, calculate new rent, create agentTask.
 */
async function processExpiringContract(
  orgId: string,
  contractId: string,
): Promise<{ contractId: string; success: boolean; error?: string }> {
  try {
    // ─── Fetch contract with related entities ───
    const [contract] = await db
      .select()
      .from(leaseContracts)
      .where(and(eq(leaseContracts.id, contractId), eq(leaseContracts.orgId, orgId)))
      .limit(1);

    if (!contract) return { contractId, success: false, error: "Contract not found" };

    const [[property], [owner], [tenant]] = await Promise.all([
      db.select().from(properties).where(eq(properties.id, contract.propertyId)).limit(1),
      db.select().from(owners).where(eq(owners.id, contract.ownerId)).limit(1),
      db.select().from(tenants).where(eq(tenants.id, contract.tenantId)).limit(1),
    ]);

    // ─── Determine index and fetch accumulated value ───
    const readjustmentRule = contract.readjustmentRule;
    const indexName = readjustmentRule?.index ?? "IGPM";
    const currentRent = parseFloat(contract.rentAmount);

    let accumulatedPercent: number | null = null;
    let indexUsed = indexName;

    if (indexName.toLowerCase() === "fixed") {
      accumulatedPercent = parseFloat(readjustmentRule?.fixedPercent ?? "0");
      indexUsed = "fixed";
    } else {
      accumulatedPercent = await fetchAccumulatedIndex(indexName);
    }

    if (accumulatedPercent === null) {
      console.warn(`[renovador] Could not fetch index ${indexName} for contract ${contractId}, skipping`);
      return { contractId, success: false, error: `Index fetch failed for ${indexName}` };
    }

    const newRent = currentRent * (1 + accumulatedPercent / 100);

    // ─── Calculate proposed dates ───
    const currentEndDate = new Date(contract.endDate);
    const proposedStartDate = toISODate(addDays(currentEndDate, 1));
    const durationDays = contractDurationDays(contract.startDate, contract.endDate);
    const proposedEndDate = toISODate(addDays(new Date(proposedStartDate), durationDays));

    // ─── Assemble property address ───
    const propertyAddress = property
      ? `${property.address}, ${property.city} - ${property.state}`
      : "Endereço não encontrado";

    // ─── Create agentTask record ───
    await db.insert(agentTasks).values({
      orgId,
      taskType: "renewal_draft",
      status: "done",
      input: {},
      output: {
        agent_name: "Renovador",
        contract_id: contractId,
        current_rent: currentRent.toFixed(2),
        new_rent: newRent.toFixed(2),
        index_used: indexUsed,
        accumulated_percent: accumulatedPercent.toFixed(4),
        tenant_name: tenant?.fullName ?? "Inquilino não encontrado",
        owner_name: owner?.fullName ?? "Proprietário não encontrado",
        property_address: propertyAddress,
        proposed_start_date: proposedStartDate,
        proposed_end_date: proposedEndDate,
        current_end_date: contract.endDate,
      },
      confidence: "0.9000",
      relatedEntityType: "lease_contract",
      relatedEntityId: contractId,
    });

    console.log(`[renovador] Renewal draft created for contract ${contractId} — new rent: R$ ${newRent.toFixed(2)}`);
    return { contractId, success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[renovador] Error processing contract ${contractId}:`, msg);
    return { contractId, success: false, error: msg };
  }
}

/**
 * Main handler: finds all active contracts expiring within 60 days for an org
 * and creates renewal draft tasks for each.
 */
export async function handleRenewalDraft(orgId: string): Promise<{
  processed: number;
  successful: number;
  failed: number;
  results: Array<{ contractId: string; success: boolean; error?: string }>;
}> {
  const now = new Date();
  const in60Days = new Date(now);
  in60Days.setDate(in60Days.getDate() + 60);

  const nowDate = toISODate(now);
  const in60Date = toISODate(in60Days);

  // ─── Find active contracts expiring in the next 60 days ───
  const expiring = await db
    .select({ id: leaseContracts.id })
    .from(leaseContracts)
    .where(
      and(
        eq(leaseContracts.orgId, orgId),
        eq(leaseContracts.operationalStatus, "active"),
        between(leaseContracts.endDate, nowDate, in60Date),
      ),
    );

  if (expiring.length === 0) {
    console.log(`[renovador] No expiring contracts found for org ${orgId}`);
    return { processed: 0, successful: 0, failed: 0, results: [] };
  }

  console.log(`[renovador] Found ${expiring.length} expiring contracts for org ${orgId}`);

  const results: Array<{ contractId: string; success: boolean; error?: string }> = [];

  for (const { id } of expiring) {
    const result = await processExpiringContract(orgId, id);
    results.push(result);
  }

  const successful = results.filter((r) => r.success).length;

  return {
    processed: results.length,
    successful,
    failed: results.length - successful,
    results,
  };
}
