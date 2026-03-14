# Maintenance Tickets

The Maintenance system tracks all repair requests, routes them to contractors, and monitors resolution.

Base path: `/v1/maintenance`

---

## Create Ticket

`POST /v1/maintenance`

Open a new maintenance ticket. The Maintenance Agent automatically triages it within seconds.

### Request Body

```json
{
  "contract_id": "ctr_01HX...",
  "title": "Torneira da cozinha com vazamento",
  "description": "A torneira da pia da cozinha está pingando constantemente. O problema iniciou há 3 dias.",
  "reported_by": "renter",
  "photos": ["upload_01HX...", "upload_02HX..."]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `contract_id` | string | Yes | Contract the property belongs to |
| `title` | string | Yes | Short description (max 200 chars) |
| `description` | string | No | Detailed description |
| `reported_by` | string | Yes | `renter`, `owner`, or `manager` |
| `photos` | string[] | No | Upload IDs from `/v1/uploads` |

### Response `201 Created`

```json
{
  "id": "mnt_01HX...",
  "tenant_id": "acme-corp",
  "contract_id": "ctr_01HX...",
  "title": "Torneira da cozinha com vazamento",
  "status": "open",
  "urgency": "medium",
  "category": "plumbing",
  "sla_deadline": "2024-02-17T00:00:00Z",
  "assigned_contractor": null,
  "reported_by": "renter",
  "created_at": "2024-02-14T09:00:00Z"
}
```

The `urgency` and `category` fields are automatically set by the Maintenance Agent based on the ticket description.

---

## List Tickets

`GET /v1/maintenance`

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `contract_id` | string | Filter by contract |
| `status` | string | `open`, `in_progress`, `resolved`, `closed` |
| `urgency` | string | `emergency`, `high`, `medium`, `low` |
| `category` | string | `plumbing`, `electrical`, `structural`, `appliance`, `other` |
| `page` | int | Page |
| `per_page` | int | Items per page |

---

## Update Ticket

`PATCH /v1/maintenance/{ticket_id}`

Update status, assign contractor, add notes.

```json
{
  "status": "in_progress",
  "assigned_contractor": "João Encanamentos - (11) 98888-0001",
  "notes": "Contractor scheduled for Feb 16 at 14h"
}
```

---

## Resolve Ticket

`POST /v1/maintenance/{ticket_id}/resolve`

Mark the ticket as resolved.

```json
{
  "resolution": "Replaced washer and O-ring on kitchen tap. No further issues.",
  "cost": 150.00,
  "resolved_at": "2024-02-16T15:30:00Z"
}
```

---

## Urgency Classification

The Maintenance Agent classifies tickets into urgency levels:

| Urgency | Examples | SLA |
|---------|----------|-----|
| `emergency` | Gas leak, flooding, power outage, fire | 4 hours |
| `high` | No hot water, AC failure in summer, broken lock | 24 hours |
| `medium` | Leaking tap, broken appliance, window issue | 5 business days |
| `low` | Paint, cosmetic damage, minor squeaks | 30 days |

---

## Maintenance Categories

| Category | Keywords (examples) |
|----------|-------------------|
| `plumbing` | torneira, cano, vazamento, entupimento, vaso |
| `electrical` | tomada, disjuntor, curto, lâmpada, fio |
| `structural` | rachadura, parede, teto, infiltração, goteira |
| `appliance` | geladeira, máquina de lavar, fogão, ar condicionado |
| `locksmith` | fechadura, chave, portão, porteiro |
| `other` | anything not matching above |
