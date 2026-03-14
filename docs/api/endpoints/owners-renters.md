# Owners & Renters

Owners (property owners) and renters (tenants) are the two party types in a lease contract.

Base paths: `/v1/owners`, `/v1/renters`
Auth: **Demo**

---

## Owners

### Create Owner

`POST /v1/owners`

```json
{
  "name": "Maria Santos",
  "email": "maria@example.com",
  "cpf": "123.456.789-00",
  "phone": "+55 11 99999-0001",
  "address": "Rua das Flores, 500 — São Paulo, SP"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Full legal name |
| `email` | string | Yes | Contact email |
| `cpf` | string | Yes | Brazilian CPF or CNPJ (validated format) |
| `phone` | string | No | Phone number in E.164 format |
| `address` | string | No | Correspondence address |

### Response `201 Created`

```json
{
  "id": "own_01HX...",
  "tenant_id": "acme-corp",
  "name": "Maria Santos",
  "email": "maria@example.com",
  "cpf": "123.456.789-00",
  "phone": "+55 11 99999-0001",
  "active_contracts": 0,
  "created_at": "2024-01-01T00:00:00Z"
}
```

### List Owners

`GET /v1/owners`

Returns all owners for the tenant. Supports pagination and search by name or CPF.

---

## Renters

### Create Renter

`POST /v1/renters`

Same fields as Owner, with an optional `guarantor` block:

```json
{
  "name": "João Oliveira",
  "email": "joao@example.com",
  "cpf": "987.654.321-00",
  "phone": "+55 11 99999-0002",
  "guarantor": {
    "name": "Ana Oliveira",
    "cpf": "111.222.333-44",
    "phone": "+55 11 99999-0003",
    "relationship": "spouse"
  }
}
```

### Response `201 Created`

```json
{
  "id": "rnt_01HX...",
  "tenant_id": "acme-corp",
  "name": "João Oliveira",
  "email": "joao@example.com",
  "cpf": "987.654.321-00",
  "active_contracts": 0,
  "has_guarantor": true,
  "created_at": "2024-01-01T00:00:00Z"
}
```

### List Renters

`GET /v1/renters`

Supports filter by name, CPF, or `has_active_contract`.

---

## CPF/CNPJ Validation

Both `cpf` fields are validated using the official Brazilian CPF/CNPJ check-digit algorithm. Invalid documents return `422 Unprocessable Entity`:

```json
{
  "detail": [
    {
      "loc": ["body", "cpf"],
      "msg": "Invalid CPF — check digit verification failed",
      "type": "value_error"
    }
  ]
}
```
