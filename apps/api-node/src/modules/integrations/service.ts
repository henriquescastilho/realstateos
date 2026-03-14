import { eq, count } from "drizzle-orm";
import { db } from "../../db";
import { integrationConnectors } from "../../db/schema";
import { NotFoundError } from "../../lib/errors";
import type { RegisterConnectorInput } from "./validators";

/**
 * Register a new integration connector.
 */
export async function registerConnector(input: RegisterConnectorInput) {
  const [connector] = await db
    .insert(integrationConnectors)
    .values({
      orgId: input.orgId,
      providerName: input.providerName,
      capabilities: input.capabilities,
      authMode: input.authMode,
      retryPolicy: input.retryPolicy,
    })
    .returning();

  return connector;
}

/**
 * Get a connector by ID.
 */
export async function getConnectorById(connectorId: string) {
  const [connector] = await db
    .select()
    .from(integrationConnectors)
    .where(eq(integrationConnectors.id, connectorId))
    .limit(1);

  if (!connector) {
    throw new NotFoundError("IntegrationConnector", connectorId);
  }

  return connector;
}

/**
 * List connectors for an org.
 */
export async function listConnectors(params: {
  orgId: string;
  page: number;
  pageSize: number;
}) {
  const [data, totalResult] = await Promise.all([
    db
      .select()
      .from(integrationConnectors)
      .where(eq(integrationConnectors.orgId, params.orgId))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize)
      .orderBy(integrationConnectors.createdAt),
    db
      .select({ total: count() })
      .from(integrationConnectors)
      .where(eq(integrationConnectors.orgId, params.orgId)),
  ]);

  return {
    data,
    total: totalResult[0]?.total ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}

/**
 * Update connector sync status (called after integration sync runs).
 */
export async function updateSyncStatus(
  connectorId: string,
  status: "success" | "error",
) {
  const [updated] = await db
    .update(integrationConnectors)
    .set({
      lastSyncStatus: status,
      lastSyncAt: new Date(),
    })
    .where(eq(integrationConnectors.id, connectorId))
    .returning();

  if (!updated) {
    throw new NotFoundError("IntegrationConnector", connectorId);
  }

  return updated;
}
