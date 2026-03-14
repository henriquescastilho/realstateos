# Analytics & Search

## Analytics

Portfolio-level KPIs and time-series data for reporting dashboards.

Base path: `/v1/analytics`

---

### Portfolio KPIs

`GET /v1/analytics/kpis`

Returns current snapshot metrics for the tenant's portfolio.

```bash
curl /v1/analytics/kpis \
  -H "Authorization: Bearer $TOKEN"
```

### Response `200 OK`

```json
{
  "active_contracts": 47,
  "monthly_revenue": "142350.00",
  "default_rate": 0.042,
  "open_maintenance_tickets": 8,
  "avg_charge_collection_days": 4.2,
  "payment_rate_mtd": 0.93,
  "occupancy_rate": 0.89,
  "as_of": "2024-02-14T00:00:00Z"
}
```

---

### Billing Trend

`GET /v1/analytics/billing-trend`

Monthly billing vs. collection data for the past N months.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `months` | int | 12 | Number of months to return |

### Response `200 OK`

```json
{
  "series": [
    {
      "month": "2024-02",
      "billed": "142350.00",
      "collected": "132350.00",
      "collection_rate": 0.93,
      "overdue": "10000.00"
    },
    ...
  ]
}
```

---

### Default Rate Trend

`GET /v1/analytics/default-rate`

Monthly default rate over time.

---

### Maintenance Cost Analysis

`GET /v1/analytics/maintenance-costs`

```bash
GET /v1/analytics/maintenance-costs?date_from=2024-01-01&date_to=2024-12-31
```

```json
{
  "total_cost": "18500.00",
  "by_category": {
    "plumbing": "7200.00",
    "electrical": "4800.00",
    "appliance": "3500.00",
    "structural": "3000.00"
  },
  "avg_resolution_days": 3.4,
  "tickets_resolved": 42
}
```

---

## Natural Language Search

The NL Search endpoint allows querying portfolio data using plain Portuguese or English text, backed by semantic vector search (pgvector).

Base path: `/v1/search`

### Search

`POST /v1/search`

```json
{
  "query": "contratos com pagamento em atraso em São Paulo",
  "entities": ["contracts", "charges"],
  "limit": 10
}
```

| Field | Type | Description |
|-------|------|-------------|
| `query` | string | Natural language query in Portuguese or English |
| `entities` | string[] | Entity types to search: `contracts`, `charges`, `payments`, `maintenance`, `properties` |
| `limit` | int | Max results (default: 10, max: 50) |

### Response `200 OK`

```json
{
  "results": [
    {
      "entity": "contracts",
      "id": "ctr_01HX...",
      "relevance_score": 0.94,
      "summary": "Contract for Av. Paulista apt — R$2,500/mo — 62 days overdue",
      "data": { ... }
    }
  ],
  "query_interpretation": "Contracts with overdue payments in São Paulo",
  "search_ms": 45
}
```
