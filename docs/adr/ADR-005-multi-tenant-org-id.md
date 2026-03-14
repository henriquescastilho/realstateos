# ADR-005: Multi-Tenancy via org_id Column Strategy

**Date:** 2024-01-25
**Status:** Accepted
**Deciders:** Backend Team, Security

---

## Context

RealState OS is a multi-tenant SaaS. Every organization (property management company) that uses the platform must have complete data isolation from all other organizations. We needed to choose a multi-tenancy strategy.

The three canonical approaches are:
1. **Separate databases** — One PostgreSQL database per tenant
2. **Separate schemas** — One schema per tenant in a shared database
3. **Shared schema with tenant_id column** — Single schema, every table has a `tenant_id` (or `org_id`) discriminator column

---

## Decision

Use **shared schema with `tenant_id` column** on every table.

---

## Rationale

### Why Shared Schema

**Scale economics at SaaS launch:**
- At launch, most tenants are small (< 100 contracts). Separate databases per tenant would waste 95% of allocated resources.
- Connection pooling (PgBouncer or built-in) is trivially applied to a single database; multiplexing across 100+ databases adds complexity.
- Schema migrations are applied once, not N times per tenant.

**Operational simplicity:**
- Single database backup/restore procedure
- Single Alembic migration history
- Single PostgreSQL monitoring target

**Query performance:**
- With proper indexing on `tenant_id` (combined with other filter columns), queries are fast. All tenant-scoped queries hit the index first, then the narrow result set.
- EXPLAIN ANALYZE on all critical queries shows index scans, not sequential scans.

### Why Not Separate Databases

- 100 tenants × minimum database resources = impractical at launch scale
- Schema migrations become an operational nightmare at > 50 tenants
- Cross-tenant analytics (platform-level aggregations) would require federated queries

### Why Not Separate Schemas

- Schema-per-tenant still requires N migration runs
- Row-level security (the usual alternative to separate schemas) adds query complexity
- Some PostgreSQL tooling doesn't handle multi-schema setups well

---

## Implementation

### Tenant Isolation Layer

All isolation is enforced in `app/middleware/tenant.py`:

```python
def get_current_org(current_user: CurrentUser, db: Session) -> OrgContext:
    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(403, "Tenant not found or access denied")
    return OrgContext(tenant_id=tenant.id, ...)
```

Every route depends on `get_current_org` or `get_demo_or_authed_org`. There is no mechanism to issue a JWT without a `tenant_id`.

### Column Convention

Every entity table has:
```sql
tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
```

All queries include `WHERE tenant_id = :tenant_id`. The `TenantScopedSession` utility class auto-applies this filter:

```python
with TenantScopedSession(db, org.tenant_id) as ts:
    contracts = ts.query(Contract).all()  # automatically filtered
```

### Indexing Strategy

All `tenant_id` columns have a composite index with the most common filter column:

```sql
CREATE INDEX ix_contracts_tenant_status ON contracts (tenant_id, status);
CREATE INDEX ix_charges_tenant_month ON charges (tenant_id, reference_month);
CREATE INDEX ix_payments_tenant_date ON payments (tenant_id, payment_date);
```

This ensures that even a query across 10M rows (10K contracts × 1K charges) hits the composite index for a single-tenant slice.

---

## Security Controls

1. **JWT validation**: `tenant_id` is extracted from the JWT and validated against the `tenants` table on every request
2. **Middleware enforcement**: Routes cannot bypass `tenant_id` injection — it's a FastAPI dependency
3. **No raw SQL**: All queries use SQLAlchemy ORM with explicit `tenant_id` filters
4. **Security tests**: `tests/security/test_penetration.py` includes cross-tenant access tests that verify tenant isolation holds under JWT manipulation

---

## Consequences

**Positive:**
- Simple deployment (single database)
- Easy migrations (apply once)
- Low resource waste at launch
- Cross-tenant platform analytics possible with careful queries

**Negative:**
- A bug bypassing `tenant_id` filtering would be a critical data breach
- "Noisy neighbor" problem: one tenant running heavy queries could impact others
- As database grows, table-level partitioning by `tenant_id` may be needed

**Mitigations:**
- `tenant_id` injection is enforced at the middleware layer — only a deliberate bypass could skip it
- Penetration tests verify tenant isolation on every CI run
- Query timeouts (`statement_timeout = 30s`) prevent runaway queries from impacting other tenants
- Future: PostgreSQL partitioning by `tenant_id` for the largest tables (charges, payments) when any single table exceeds 100M rows

---

## Future Migration Path

If a tenant grows to enterprise scale (> 100K contracts), we can migrate them to a dedicated database with minimal code changes:
1. Export tenant data to new database
2. Update connection router to point `tenant_id` → dedicated DB
3. The application code remains unchanged — only the DB connection changes

The `tenant_id` column strategy is compatible with this future graduation.

---

## Alternatives Considered

| Alternative | Rejection Reason |
|-------------|-----------------|
| Separate databases | Too expensive at launch; migration complexity grows linearly with tenant count |
| Separate schemas | Same migration problem as separate DBs; row-level security adds query complexity |
| Row-level security (RLS) | Implicit security feels riskier than explicit `WHERE tenant_id = :id`; harder to debug |
| NoSQL (MongoDB) | Loses ACID guarantees critical for financial data; billing logic requires relational queries |
