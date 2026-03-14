# Payments

The Payments system ingests bank statements, matches payments to open charges, and tracks reconciliation status.

Base path: `/v1/payments`

---

## Import Bank Statement

`POST /v1/payments/import`

Upload a bank statement file for automatic reconciliation.

### Request (multipart/form-data)

```bash
curl -X POST /v1/payments/import \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@statement-feb-2024.csv" \
  -F "format=csv" \
  -F "bank=itau"
```

| Field | Type | Description |
|-------|------|-------------|
| `file` | file | Statement file (CSV, OFX, or CNAB240) |
| `format` | string | `csv`, `ofx`, `cnab240` |
| `bank` | string | Bank identifier: `itau`, `bradesco`, `bb`, `caixa`, `santander` |

### Response `202 Accepted`

```json
{
  "task_id": "task_01HX...",
  "status": "pending",
  "message": "Statement queued for reconciliation. 43 transactions found."
}
```

---

## List Payments

`GET /v1/payments`

Returns all payment records for the tenant.

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `charge_id` | string | Filter by charge |
| `status` | string | `matched`, `unmatched`, `divergent` |
| `date_from` | date | Filter by payment date (start) |
| `date_to` | date | Filter by payment date (end) |
| `page` | int | Page |
| `per_page` | int | Items per page |

### Response `200 OK`

```json
{
  "items": [
    {
      "id": "pay_01HX...",
      "tenant_id": "acme-corp",
      "charge_id": "chg_01HX...",
      "amount": "2625.00",
      "payment_date": "2024-02-09",
      "method": "pix",
      "status": "matched",
      "reconciliation_status": "paid",
      "payer_name": "JOAO OLIVEIRA",
      "payer_document": "987.654.321-00",
      "bank_reference": "E0000000020240209..."
    }
  ],
  "total": 43,
  "page": 1,
  "per_page": 20,
  "pages": 3
}
```

---

## Manual Reconciliation

`POST /v1/payments/{payment_id}/reconcile`

Manually match a payment to a charge (used when automatic matching fails).

```json
{
  "charge_id": "chg_01HX...",
  "note": "Matched manually — payer used different CPF"
}
```

### Response `200 OK`

```json
{
  "payment_id": "pay_01HX...",
  "charge_id": "chg_01HX...",
  "status": "matched",
  "reconciliation_status": "paid",
  "reconciled_at": "2024-02-15T10:30:00Z",
  "reconciled_by": "user_01HX..."
}
```

---

## Reconciliation Status Values

| Status | Description |
|--------|-------------|
| `paid` | Amount matches expected (within R$0.05 tolerance) |
| `partial` | Amount paid is less than expected |
| `overpayment` | Amount paid exceeds expected |
| `unmatched` | Could not find a matching charge |
| `divergent` | Matches a charge but amount is significantly off |

---

## Payment Divergence Queue

`GET /v1/payments/divergences`

Returns all payments requiring human review.

```json
{
  "items": [
    {
      "payment_id": "pay_01HX...",
      "charge_id": "chg_01HX...",
      "amount_paid": "2500.00",
      "amount_expected": "2625.00",
      "difference": "-125.00",
      "difference_pct": "-4.76",
      "reason": "Possible partial payment — difference matches IGPM adjustment",
      "created_at": "2024-02-12T14:00:00Z"
    }
  ]
}
```
