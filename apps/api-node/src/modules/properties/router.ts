import { Router, Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { properties, owners, tenants, leaseContracts } from "../../db/schema";

export const propertiesRouter = Router();

// GET /properties — list all properties for the current org
propertiesRouter.get("/properties", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.org_id;

    const propertyRows = await db
      .select()
      .from(properties)
      .where(eq(properties.orgId, orgId))
      .orderBy(properties.address);

    // Get owner_id from lease contracts for each property
    const contracts = await db
      .select({
        propertyId: leaseContracts.propertyId,
        ownerId: leaseContracts.ownerId,
      })
      .from(leaseContracts)
      .where(eq(leaseContracts.orgId, orgId));

    const ownerByProperty = new Map<string, string>();
    for (const c of contracts) {
      ownerByProperty.set(c.propertyId, c.ownerId);
    }

    // Map to frontend-expected format
    const result = propertyRows.map((p) => ({
      id: p.id,
      tenant_id: p.orgId,
      address: p.address,
      city: p.city,
      state: p.state,
      zip: p.zip,
      owner_id: ownerByProperty.get(p.id) ?? null,
      iptu_registration_number: p.registryReference ?? null,
      type: p.type,
      area_sqm: p.areaSqm,
      bedrooms: p.bedrooms,
      status: p.status,
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /owners — list all owners for the current org
propertiesRouter.get("/owners", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.org_id;

    const ownerRows = await db
      .select()
      .from(owners)
      .where(eq(owners.orgId, orgId))
      .orderBy(owners.fullName);

    // Fetch contracts and properties to build contract summaries per owner
    const contractRows = await db
      .select()
      .from(leaseContracts)
      .where(eq(leaseContracts.orgId, orgId));

    const propertyRows2 = await db
      .select({ id: properties.id, address: properties.address, city: properties.city, state: properties.state })
      .from(properties)
      .where(eq(properties.orgId, orgId));

    const propertyMap2 = new Map(propertyRows2.map((p) => [p.id, p]));

    const contractsByOwner = new Map<string, typeof contractRows>();
    for (const c of contractRows) {
      const list = contractsByOwner.get(c.ownerId) ?? [];
      list.push(c);
      contractsByOwner.set(c.ownerId, list);
    }

    // Build stable contract codes
    const allContractsSorted = [...contractRows].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const contractCodeMap = new Map(
      allContractsSorted.map((c, i) => [c.id, `REOS-${String(i + 1).padStart(4, "0")}`]),
    );

    const result = ownerRows.map((o) => {
      const ownerContracts = contractsByOwner.get(o.id) ?? [];
      const payout = o.payoutPreferences as Record<string, string> | null;
      return {
        id: o.id,
        tenant_id: o.orgId,
        name: o.fullName,
        document: o.documentNumber,
        email: o.email ?? "",
        phone: o.phone ?? "",
        bank_account: payout ? {
          bank_code: payout.bankCode ?? "",
          agency: payout.branch ?? "",
          account: payout.account ?? "",
          account_type: payout.accountType ?? "corrente",
          pix_key: payout.pixKey ?? "",
        } : null,
        properties: [...new Map(ownerContracts.map((c) => {
          const prop = propertyMap2.get(c.propertyId);
          return [c.propertyId, {
            id: c.propertyId,
            address: prop?.address ?? c.propertyId,
            city: prop?.city ?? "",
            state: prop?.state ?? "",
            monthly_rent: c.rentAmount,
            active_contract_status: c.operationalStatus,
          }];
        })).values()],
        contracts: ownerContracts.map((c) => ({
          id: c.id,
          code: contractCodeMap.get(c.id) ?? c.id.slice(0, 8),
          property_address: propertyMap2.get(c.propertyId)?.address ?? c.propertyId,
          monthly_rent: c.rentAmount,
          start_date: c.startDate,
          end_date: c.endDate,
          status: c.operationalStatus,
        })),
      };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /renters — list all renters (inquilinos) for the current org
propertiesRouter.get("/renters", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.org_id;

    const tenantRows = await db
      .select()
      .from(tenants)
      .where(eq(tenants.orgId, orgId))
      .orderBy(tenants.fullName);

    // Fetch contracts and properties to build contract summaries per renter
    const contractRows = await db
      .select()
      .from(leaseContracts)
      .where(eq(leaseContracts.orgId, orgId));

    const propertyRows = await db
      .select({ id: properties.id, address: properties.address })
      .from(properties)
      .where(eq(properties.orgId, orgId));

    const propertyMap = new Map(propertyRows.map((p) => [p.id, p.address]));

    // Group contracts by tenantId
    const contractsByTenant = new Map<string, typeof contractRows>();
    for (const c of contractRows) {
      const list = contractsByTenant.get(c.tenantId) ?? [];
      list.push(c);
      contractsByTenant.set(c.tenantId, list);
    }

    // Build a stable index to generate contract codes (REOS-0001, etc.)
    const allContractsSorted = [...contractRows].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const contractCodeMap = new Map(
      allContractsSorted.map((c, i) => [c.id, `REOS-${String(i + 1).padStart(4, "0")}`]),
    );

    const result = tenantRows.map((t) => {
      const renterContracts = contractsByTenant.get(t.id) ?? [];
      return {
        id: t.id,
        tenant_id: t.orgId,
        name: t.fullName,
        document: t.documentNumber,
        email: t.email ?? "",
        phone: t.phone ?? "",
        contracts: renterContracts.map((c) => ({
          id: c.id,
          code: contractCodeMap.get(c.id) ?? c.id.slice(0, 8),
          property_address: propertyMap.get(c.propertyId) ?? c.propertyId,
          monthly_rent: c.rentAmount,
          start_date: c.startDate,
          end_date: c.endDate,
          status: c.operationalStatus,
        })),
      };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});
