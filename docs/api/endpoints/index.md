# Endpoint Reference

All versioned endpoints are under the `/v1/` prefix. Authentication is required unless marked **Demo** (falls back to demo tenant when unauthenticated).

---

## Endpoint Groups

| Group | Base Path | Description |
|-------|-----------|-------------|
| [Contracts](contracts.md) | `/v1/contracts` | Lease contract lifecycle |
| [Properties](properties.md) | `/v1/properties` | Property registry |
| [Owners & Renters](owners-renters.md) | `/v1/owners`, `/v1/renters` | Party management |
| [Billing & Charges](billing.md) | `/v1/billing`, `/v1/charges` | Charge generation and management |
| [Payments](payments.md) | `/v1/payments` | Payment ingestion and reconciliation |
| [Maintenance Tickets](maintenance.md) | `/v1/maintenance` | Maintenance request lifecycle |
| [Agent Tasks](agent-tasks.md) | `/v1/agent-tasks` | Background AI agent work |
| [Webhooks](webhooks.md) | `/v1/webhooks` | Webhook registration |
| [Uploads & Exports](uploads-exports.md) | `/v1/uploads`, `/v1/exports` | Document management |
| [Analytics & Search](analytics-search.md) | `/v1/analytics`, `/v1/search` | Reporting and NL search |

---

## Common Parameters

### Pagination

All list endpoints accept:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | int | 1 | Page number (1-indexed) |
| `per_page` | int | 20 | Items per page (max 100) |

### Filtering

Most list endpoints accept resource-specific filter parameters as query strings.

### Sorting

Endpoints that support sorting accept `sort` (field name) and `order` (`asc` or `desc`).

---

## Response Envelope

### List Response

```json
{
  "items": [...],
  "total": 142,
  "page": 1,
  "per_page": 20,
  "pages": 8
}
```

### Single Resource

Resources are returned directly without an envelope:

```json
{
  "id": "ctr_01HX...",
  "tenant_id": "acme-corp",
  ...
}
```

---

## Health Endpoints

These endpoints are unauthenticated and used for infrastructure probes:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health/live` | Liveness probe — returns 200 if process is alive |
| `GET` | `/health/ready` | Readiness probe — checks DB and Redis connectivity |
| `GET` | `/metrics` | Prometheus metrics |
