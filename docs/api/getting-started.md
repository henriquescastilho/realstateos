# Getting Started

This guide walks you from zero to your first API call in under 5 minutes.

---

## Prerequisites

- An organization account (or use the **demo tenant** for evaluation)
- `curl` or any HTTP client

---

## Step 1 — Get Your Credentials

For the demo environment, use the pre-provisioned tenant:

```bash
TENANT_ID="demo"
EMAIL="demo@realstateos.io"
```

For a real organization, retrieve your `tenant_id` from the Settings page in the web UI.

---

## Step 2 — Issue a JWT

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/auth/token \
  -H "Content-Type: application/json" \
  -d "{\"tenant_id\": \"$TENANT_ID\", \"email\": \"$EMAIL\"}" \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")

echo "Token: $TOKEN"
```

The token is valid for 60 minutes by default. Store it and refresh as needed.

---

## Step 3 — Create a Property

Before creating a contract, you need a property, an owner, and a renter.

```bash
PROPERTY_ID=$(curl -s -X POST http://localhost:8000/v1/properties \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "address": "Av. Paulista, 1000 — Apto 42",
    "city": "São Paulo",
    "state": "SP",
    "zip_code": "01310-100",
    "area_m2": 65.0,
    "bedrooms": 2,
    "bathrooms": 1,
    "type": "apartment"
  }' | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")

echo "Property: $PROPERTY_ID"
```

---

## Step 4 — Register Owner and Renter

```bash
# Owner
OWNER_ID=$(curl -s -X POST http://localhost:8000/v1/owners \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Maria Santos",
    "email": "maria@example.com",
    "cpf": "123.456.789-00",
    "phone": "+55 11 99999-0001"
  }' | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")

# Renter
RENTER_ID=$(curl -s -X POST http://localhost:8000/v1/renters \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "João Oliveira",
    "email": "joao@example.com",
    "cpf": "987.654.321-00",
    "phone": "+55 11 99999-0002"
  }' | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")
```

---

## Step 5 — Create a Contract

```bash
CONTRACT=$(curl -s -X POST http://localhost:8000/v1/contracts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"property_id\": \"$PROPERTY_ID\",
    \"owner_id\": \"$OWNER_ID\",
    \"renter_id\": \"$RENTER_ID\",
    \"monthly_rent\": 2500.00,
    \"due_day\": 10,
    \"start_date\": \"2024-01-01\",
    \"end_date\": \"2025-01-01\",
    \"adjustment_index\": \"IGPM\"
  }")

echo $CONTRACT | python3 -m json.tool
```

Example response:

```json
{
  "id": "ctr_01HX...",
  "tenant_id": "demo",
  "property_id": "prop_01HX...",
  "owner_id": "own_01HX...",
  "renter_id": "rnt_01HX...",
  "monthly_rent": "2500.00",
  "due_day": 10,
  "start_date": "2024-01-01",
  "end_date": "2025-01-01",
  "status": "active",
  "adjustment_index": "IGPM",
  "created_at": "2024-01-01T00:00:00Z"
}
```

---

## Step 6 — Generate Monthly Charges

Once a contract is active, trigger the billing pipeline:

```bash
curl -s -X POST http://localhost:8000/v1/billing/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"contract_id\": \"$CONTRACT_ID\",
    \"reference_month\": \"2024-02\"
  }"
```

The billing agent will create a `Charge` for the contract, apply any pending IGPM/IPCA adjustment, and schedule the due date respecting weekends and holidays.

---

## Step 7 — List Charges

```bash
curl -s "http://localhost:8000/v1/charges?status=pending" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -m json.tool
```

---

## Next Steps

- [Authentication Guide](authentication.md) — token lifecycle, scopes, refresh
- [Webhook Integration](webhooks.md) — react to billing events in real time
- [AI Agents](agents.md) — understand what agents do and how to monitor them
- [Endpoint Reference](endpoints/index.md) — full endpoint documentation
