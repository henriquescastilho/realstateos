# Contracts

Lease contracts are the central entity in RealState OS. Every billing, payment, maintenance ticket, and agent task is linked to a contract.

Base path: `/v1/contracts`
Auth: **Demo** (falls back to demo tenant when unauthenticated)

---

## Create Contract

`POST /v1/contracts`

Creates a new rental contract. Triggers the Onboarding Agent automatically.

### Request Body

```json
{
  "property_id": "prop_01HX...",
  "owner_id": "own_01HX...",
  "renter_id": "rnt_01HX...",
  "monthly_rent": 2500.00,
  "due_day": 10,
  "start_date": "2024-01-01",
  "end_date": "2025-01-01",
  "adjustment_index": "IGPM"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `property_id` | string | Yes | ID of the property being rented |
| `owner_id` | string | Yes | ID of the property owner |
| `renter_id` | string | Yes | ID of the renter |
| `monthly_rent` | decimal | Yes | Monthly rent in BRL (R$). Positive, max 2 decimal places |
| `due_day` | int | Yes | Day of month when rent is due (1–28) |
| `start_date` | date | Yes | Contract start date (`YYYY-MM-DD`) |
| `end_date` | date | No | Contract end date. Null for open-ended contracts |
| `adjustment_index` | string | No | Annual adjustment index: `IGPM`, `IPCA`, or `FIXED` |

### Response `201 Created`

```json
{
  "id": "ctr_01HX...",
  "tenant_id": "acme-corp",
  "property_id": "prop_01HX...",
  "owner_id": "own_01HX...",
  "renter_id": "rnt_01HX...",
  "monthly_rent": "2500.00",
  "due_day": 10,
  "start_date": "2024-01-01",
  "end_date": "2025-01-01",
  "status": "active",
  "adjustment_index": "IGPM",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

### Errors

| Status | Condition |
|--------|-----------|
| `404` | `property_id`, `owner_id`, or `renter_id` not found in tenant |
| `409` | A contract already exists for this property and renter combination |
| `422` | Validation error (e.g. `due_day` out of range, `end_date` before `start_date`) |

---

## List Contracts

`GET /v1/contracts`

Returns all contracts for the authenticated tenant. Supports pagination.

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | int | Page number (default: 1) |
| `per_page` | int | Items per page (default: 20, max: 100) |
| `status` | string | Filter by status: `active`, `suspended`, `terminated` |

### Response `200 OK`

```json
{
  "items": [
    {
      "id": "ctr_01HX...",
      "monthly_rent": "2500.00",
      "status": "active",
      ...
    }
  ],
  "total": 47,
  "page": 1,
  "per_page": 20,
  "pages": 3
}
```

---

## Contract Statuses

| Status | Description |
|--------|-------------|
| `active` | Contract is in force; billing runs monthly |
| `suspended` | Temporarily paused; billing is halted |
| `terminated` | Contract has ended; no further billing |

---

## Example: Full Contract Workflow

```bash
# 1. Create contract
CONTRACT_ID=$(curl -s -X POST /v1/contracts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"property_id":"...","owner_id":"...","renter_id":"...","monthly_rent":2500,"due_day":10,"start_date":"2024-01-01"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# 2. Generate first charge manually
curl -X POST /v1/billing/generate \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"contract_id\": \"$CONTRACT_ID\", \"reference_month\": \"2024-01\"}"

# 3. List charges for contract
curl "/v1/charges?contract_id=$CONTRACT_ID" \
  -H "Authorization: Bearer $TOKEN"
```
