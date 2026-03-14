import { eq, or } from "drizzle-orm";
import { db } from "../../db";
import { tenants, owners } from "../../db/schema";

export interface MatchResult {
  entityType: "tenant" | "owner";
  entityId: string;
  entityName: string;
}

/**
 * Match a phone number or email to a tenant or owner.
 */
export async function matchContact(
  orgId: string,
  identifier: string,
): Promise<MatchResult | null> {
  // Normalize phone: strip non-digits for comparison
  const normalizedPhone = identifier.replace(/\D/g, "");

  // Check tenants first
  const allTenants = await db
    .select()
    .from(tenants)
    .where(eq(tenants.orgId, orgId));

  for (const tenant of allTenants) {
    const tenantPhone = tenant.phone?.replace(/\D/g, "") ?? "";
    if (
      (tenantPhone && tenantPhone === normalizedPhone) ||
      (tenant.email && tenant.email.toLowerCase() === identifier.toLowerCase())
    ) {
      return {
        entityType: "tenant",
        entityId: tenant.id,
        entityName: tenant.fullName,
      };
    }
  }

  // Check owners
  const allOwners = await db
    .select()
    .from(owners)
    .where(eq(owners.orgId, orgId));

  for (const owner of allOwners) {
    const ownerPhone = owner.phone?.replace(/\D/g, "") ?? "";
    if (
      (ownerPhone && ownerPhone === normalizedPhone) ||
      (owner.email && owner.email.toLowerCase() === identifier.toLowerCase())
    ) {
      return {
        entityType: "owner",
        entityId: owner.id,
        entityName: owner.fullName,
      };
    }
  }

  return null;
}
