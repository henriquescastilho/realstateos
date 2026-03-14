# Agent Tasks

Agent tasks are the audit trail for all AI agent work. Every background operation — billing generation, payment reconciliation, maintenance triage, etc. — creates an `AgentTask` record.

Base path: `/v1/agent-tasks`

---

## List Agent Tasks

`GET /v1/agent-tasks`

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `agent` | string | Filter by agent name |
| `status` | string | `pending`, `running`, `completed`, `failed`, `escalated` |
| `task_type` | string | Filter by task type |
| `date_from` | datetime | Filter by creation date |
| `date_to` | datetime | Filter by creation date |
| `page` | int | Page |
| `per_page` | int | Items per page |

### Response `200 OK`

```json
{
  "items": [
    {
      "id": "task_01HX...",
      "tenant_id": "acme-corp",
      "agent": "billing_agent",
      "task_type": "generate_monthly_charges",
      "status": "completed",
      "confidence": 0.98,
      "human_review_required": false,
      "duration_ms": 141000,
      "started_at": "2024-02-01T00:00:00Z",
      "completed_at": "2024-02-01T00:02:21Z"
    }
  ],
  "total": 156,
  "page": 1,
  "per_page": 20,
  "pages": 8
}
```

---

## Get Agent Task

`GET /v1/agent-tasks/{task_id}`

Returns the full task record including input, output, and any error details.

```json
{
  "id": "task_01HX...",
  "tenant_id": "acme-corp",
  "agent": "billing_agent",
  "task_type": "generate_monthly_charges",
  "status": "completed",
  "input": {
    "reference_month": "2024-02",
    "contract_ids": ["ctr_01HX...", "ctr_02HX..."]
  },
  "output": {
    "charges_created": 47,
    "total_amount": "142350.00",
    "skipped": [],
    "errors": []
  },
  "confidence": 0.98,
  "human_review_required": false,
  "started_at": "2024-02-01T00:00:00Z",
  "completed_at": "2024-02-01T00:02:21Z",
  "duration_ms": 141000
}
```

---

## Stream Task Updates (SSE)

`GET /v1/agent-tasks/{task_id}/stream`

Returns a Server-Sent Events stream for real-time task progress.

```bash
curl -N /v1/agent-tasks/task_01HX.../stream \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: text/event-stream"
```

```
event: progress
data: {"step": "resolving_due_dates", "contracts_processed": 12, "total": 47}

event: progress
data: {"step": "applying_igpm", "contracts_processed": 23, "total": 47}

event: completed
data: {"charges_created": 47, "total_amount": "142350.00"}
```

---

## Approve Escalated Task

`POST /v1/agent-tasks/{task_id}/approve`

Approve an agent decision when `human_review_required` is true.

```json
{
  "decision": "approve",
  "note": "Confirmed: partial payment is acceptable for this renter"
}
```

### Response `200 OK`

```json
{
  "task_id": "task_01HX...",
  "status": "completed",
  "approved_by": "user_01HX...",
  "approved_at": "2024-02-15T11:00:00Z"
}
```

---

## Task Types

| Task Type | Agent | Description |
|-----------|-------|-------------|
| `generate_monthly_charges` | billing_agent | Monthly billing run |
| `apply_igpm_adjustment` | billing_agent | Annual rent adjustment |
| `reconcile_payments` | payments_agent | Bank statement reconciliation |
| `onboard_contract` | onboarding_agent | New contract setup |
| `triage_maintenance` | maintenance_agent | Classify and route maintenance ticket |
| `send_payment_reminder` | comms_agent | Send overdue payment notice |
| `generate_statement` | pipelines_agent | Monthly billing statement PDF |
| `process_lease_renewal` | onboarding_agent | Lease renewal workflow |
