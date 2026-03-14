# Webhooks (Endpoint Reference)

Manage webhook registrations for your tenant.

Base path: `/v1/webhooks`
Auth: **Required** (no demo fallback)

---

## Register Webhook

`POST /v1/webhooks`

### Request Body

```json
{
  "url": "https://your-app.com/hooks/realstateos",
  "events": ["charge.created", "payment.reconciled"],
  "secret": "your-signing-secret-at-least-32-chars"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | HTTPS URL to receive events (must use HTTPS in production) |
| `events` | string[] | Yes | List of event types to subscribe to |
| `secret` | string | Yes | Signing secret (min 32 chars) for payload verification |

### Response `201 Created`

```json
{
  "id": "wh_01HX...",
  "tenant_id": "acme-corp",
  "url": "https://your-app.com/hooks/realstateos",
  "events": ["charge.created", "payment.reconciled"],
  "active": true,
  "created_at": "2024-01-15T10:00:00Z"
}
```

!!! warning
    The `secret` is write-only. It is never returned in API responses. Store it securely.

---

## List Webhooks

`GET /v1/webhooks`

Returns all registered webhooks for the tenant.

---

## Get Webhook

`GET /v1/webhooks/{webhook_id}`

Returns a single webhook registration.

---

## Update Webhook

`PUT /v1/webhooks/{webhook_id}`

Replace the webhook configuration (full update).

```json
{
  "url": "https://your-app.com/hooks/realstateos-v2",
  "events": ["charge.created", "payment.reconciled", "agent_task.completed"],
  "secret": "new-signing-secret-32-chars-min"
}
```

---

## Delete Webhook

`DELETE /v1/webhooks/{webhook_id}`

Deregisters the webhook. Returns `204 No Content`.

---

## For full webhook documentation including payload formats, signing, and retry behavior, see the [Webhooks Guide](../webhooks.md).
