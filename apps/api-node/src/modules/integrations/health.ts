import { eq } from "drizzle-orm";
import { db } from "../../db";
import { integrationConnectors } from "../../db/schema";

export interface ConnectorHealth {
  providerName: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
}

/**
 * Check health of all registered integration connectors for an org.
 */
export async function checkConnectorsHealth(orgId: string): Promise<ConnectorHealth[]> {
  const connectors = await db
    .select()
    .from(integrationConnectors)
    .where(eq(integrationConnectors.orgId, orgId));

  return connectors.map((c) => {
    let status: ConnectorHealth["status"] = "unknown";

    if (c.lastSyncStatus === "success") {
      // If last sync was more than 24h ago, consider degraded
      const lastSync = c.lastSyncAt ? new Date(c.lastSyncAt).getTime() : 0;
      const hoursSinceSync = (Date.now() - lastSync) / (1000 * 60 * 60);
      status = hoursSinceSync > 24 ? "degraded" : "healthy";
    } else if (c.lastSyncStatus === "error") {
      status = "down";
    }

    return {
      providerName: c.providerName,
      status,
      lastSyncAt: c.lastSyncAt,
      lastSyncStatus: c.lastSyncStatus,
    };
  });
}
