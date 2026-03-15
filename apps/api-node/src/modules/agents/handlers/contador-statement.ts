/**
 * CONTADOR — Geração de extratos e envio ao proprietário.
 * Gera extrato de repasse pós-pagamento e envia email.
 */

import { eq, and } from "drizzle-orm";
import { db } from "../../../db";
import {
  leaseContracts,
  owners,
  properties,
  organizations,
  propertyExpenses,
  charges,
} from "../../../db/schema";
import { generateStatement } from "../../payments/service";
import { sendMessage } from "../../communications/service";
import { emitDomainEvent } from "../../../lib/events";
import { LeaseContractStatus } from "../../../types/domain";
import type { AgentTask } from "../../../types/domain";
import type { TaskExecutionResult } from "../executor";

interface ContadorInput {
  ownerId?: string;
  period: string; // "2026-04"
  leaseContractIds?: string[];
}

/**
 * Main handler for the Contador statement task.
 */
export async function handleContadorStatement(
  task: AgentTask,
): Promise<TaskExecutionResult> {
  const input = task.input as unknown as ContadorInput;
  const orgId = task.orgId;
  const period = input.period;

  // Determine which contracts to process
  let contractIds = input.leaseContractIds ?? [];

  if (contractIds.length === 0 && input.ownerId) {
    // Get all active contracts for this owner
    const contracts = await db
      .select()
      .from(leaseContracts)
      .where(
        and(
          eq(leaseContracts.orgId, orgId),
          eq(leaseContracts.ownerId, input.ownerId),
          eq(leaseContracts.operationalStatus, LeaseContractStatus.ACTIVE),
        ),
      );
    contractIds = contracts.map((c) => c.id);
  }

  if (contractIds.length === 0) {
    // Fallback: all active contracts for the org
    const contracts = await db
      .select()
      .from(leaseContracts)
      .where(
        and(
          eq(leaseContracts.orgId, orgId),
          eq(leaseContracts.operationalStatus, LeaseContractStatus.ACTIVE),
        ),
      );
    contractIds = contracts.map((c) => c.id);
  }

  const statementsGenerated: string[] = [];
  const errors: string[] = [];

  for (const contractId of contractIds) {
    try {
      // Get contract details
      const [contract] = await db
        .select()
        .from(leaseContracts)
        .where(eq(leaseContracts.id, contractId))
        .limit(1);

      if (!contract) {
        errors.push(`Contract ${contractId} not found`);
        continue;
      }

      // Get payout rules for admin fee
      const payoutRules = contract.payoutRules as { adminFeePercentage?: string } | null;
      const adminFeePercentage = payoutRules?.adminFeePercentage ?? "10.00";

      // Generate statement
      const { statement, totalPayout } = await generateStatement({
        orgId,
        ownerId: contract.ownerId,
        leaseContractId: contractId,
        period,
        adminFeePercentage,
      });

      statementsGenerated.push(statement.id);

      // Get owner, property, and org for email
      const [owner] = await db
        .select()
        .from(owners)
        .where(eq(owners.id, contract.ownerId))
        .limit(1);

      const [property] = await db
        .select()
        .from(properties)
        .where(eq(properties.id, contract.propertyId))
        .limit(1);

      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      if (!owner?.email) {
        errors.push(`Owner ${contract.ownerId} has no email`);
        continue;
      }

      // Get expense entries for the statement email
      const expenses = await db
        .select()
        .from(propertyExpenses)
        .where(
          and(
            eq(propertyExpenses.propertyId, contract.propertyId),
            eq(propertyExpenses.referenceMonth, period),
            eq(propertyExpenses.status, "paid"),
          ),
        );

      // Build entries for the template
      const statementEntries = statement.entries ?? [];

      // Add expense deductions if not already in entries
      for (const exp of expenses) {
        const desc = exp.type === "condo"
          ? `Condomínio - ${exp.referenceMonth}`
          : exp.type === "iptu"
            ? `IPTU - ${exp.referenceMonth}`
            : `Taxa - ${exp.referenceMonth}`;

        const alreadyIncluded = statementEntries.some(
          (e) => e.type === "expense" && e.description === desc,
        );

        if (!alreadyIncluded) {
          statementEntries.push({
            type: "expense",
            description: desc,
            amount: `-${exp.value}`,
          });
        }
      }

      const propertyAddress = property
        ? `${property.address}, ${property.city}/${property.state}`
        : "";

      const payoutBank = owner.payoutPreferences as {
        bankCode?: string;
        branch?: string;
        account?: string;
        pixKey?: string;
      } | null;

      // Send email to owner
      await sendMessage({
        orgId,
        entityType: "statement",
        entityId: statement.id,
        channel: "email",
        templateType: "statement_ready",
        recipient: owner.email,
        templateData: {
          orgName: org?.name ?? "",
          ownerName: owner.fullName,
          propertyAddress,
          statementPeriod: period,
          totalPayout,
        },
      }).catch((e) => console.error("[agent:contador] Email error:", e));

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Contract ${contractId}: ${msg}`);
    }
  }

  // Emit statement.ready event
  if (statementsGenerated.length > 0) {
    await emitDomainEvent(orgId, "statement.ready", {
      statementIds: statementsGenerated,
      period,
      count: statementsGenerated.length,
    }).catch((e) => console.error("[agent:contador] Event emit error:", e));
  }

  // Generate simulated NFs
  const nfsEmitted: string[] = [];
  for (let i = 0; i < statementsGenerated.length; i++) {
    const nfNumber = `NF-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    nfsEmitted.push(nfNumber);
  }

  return {
    status: "completed",
    output: {
      statementsGenerated: statementsGenerated.length,
      statementIds: statementsGenerated,
      nfsEmitted,
      errors: errors.length > 0 ? errors : undefined,
      period,
    },
    confidence: errors.length === 0 ? 0.95 : 0.70,
  };
}
