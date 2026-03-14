# Billing & Charges

The billing system generates monthly rent charges for all active contracts, applying IGPM/IPCA adjustments, late fees, and early-payment discounts.

Base paths: `/v1/billing`, `/v1/charges`

---

## Generate Monthly Charges

`POST /v1/billing/generate`

Triggers the Billing Agent to generate charges for one or more contracts for a given reference month.

### Request Body

```json
{
  "reference_month": "2024-02",
  "contract_id": "ctr_01HX..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reference_month` | string | Yes | Month in `YYYY-MM` format |
| `contract_id` | string | No | If omitted, generates for ALL active contracts in the tenant |

### Response `202 Accepted`

```json
{
  "task_id": "task_01HX...",
  "status": "pending",
  "message": "Billing generation queued for 47 contracts"
}
```

The operation is asynchronous. Poll `/v1/agent-tasks/{task_id}` for completion, or listen to the `charge.created` webhook event.

---

## List Charges

`GET /v1/charges`

Returns charges for the authenticated tenant.

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `contract_id` | string | Filter by contract |
| `status` | string | `pending`, `paid`, `partial`, `overdue`, `cancelled` |
| `reference_month` | string | Filter by billing month (`YYYY-MM`) |
| `page` | int | Page number |
| `per_page` | int | Items per page |

### Response `200 OK`

```json
{
  "items": [
    {
      "id": "chg_01HX...",
      "tenant_id": "acme-corp",
      "contract_id": "ctr_01HX...",
      "reference_month": "2024-02",
      "amount": "2625.00",
      "due_date": "2024-02-12",
      "status": "pending",
      "composition": {
        "base_rent": "2500.00",
        "igpm_adjustment": "125.00",
        "late_fee": "0.00",
        "discount": "0.00"
      },
      "created_at": "2024-02-01T00:00:00Z"
    }
  ],
  "total": 94,
  "page": 1,
  "per_page": 20,
  "pages": 5
}
```

---

## Get Charge

`GET /v1/charges/{charge_id}`

Returns a single charge with full composition detail.

---

## Charge Composition

Every charge is broken down into components:

| Component | Description |
|-----------|-------------|
| `base_rent` | The contract's `monthly_rent` value |
| `igpm_adjustment` | Annual IGPM/IPCA adjustment applied this month (can be negative in deflation) |
| `late_fee` | Penalty applied after the due date (2% + 0.033%/day) |
| `discount` | Early payment discount (if paid N days before due date) |
| `total` | `base_rent + igpm_adjustment + late_fee - discount` |

### IGPM/IPCA Adjustment

Brazilian law allows annual rent adjustment based on published economic indices. The Billing Agent queries the official IBGE/FGV APIs for the accumulated index over the contract's 12-month window and applies it as a one-time annual adjustment on the contract's anniversary month.

```
adjusted_rent = base_rent × (1 + accumulated_rate / 100)
monthly_adjustment = adjusted_rent - base_rent
```

---

## Due Date Resolution

The due date is the contract's `due_day` in the billing month, adjusted forward to the next business day if it falls on a weekend or Brazilian public holiday.

```
contract.due_day = 10
February 10, 2024 = Saturday
→ due_date = February 12, 2024 (Monday)
```

---

## Charge Statuses

| Status | Description |
|--------|-------------|
| `pending` | Charge created, awaiting payment |
| `paid` | Full payment received (within R$0.05 tolerance) |
| `partial` | Payment received but less than expected |
| `overdue` | Due date has passed, no payment received |
| `cancelled` | Charge was voided |

---

## Example: Monthly Billing Run

```bash
# Trigger billing for all active contracts in February 2024
curl -X POST /v1/billing/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reference_month": "2024-02"}'

# Response includes a task_id to track progress
# {"task_id": "task_01HX...", "status": "pending", ...}

# Poll until completed
curl /v1/agent-tasks/task_01HX... \
  -H "Authorization: Bearer $TOKEN"

# List all pending charges for February
curl "/v1/charges?status=pending&reference_month=2024-02" \
  -H "Authorization: Bearer $TOKEN"
```
