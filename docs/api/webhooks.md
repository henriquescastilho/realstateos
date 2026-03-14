# Webhook Integration

Webhooks allow your system to react to RealState OS events in real time — without polling. When an event occurs (charge created, payment reconciled, agent task completed, etc.), the platform POSTs a signed JSON payload to your registered URL.

---

## Registration

Register a webhook endpoint via the API:

```bash
curl -X POST /v1/webhooks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/hooks/realstateos",
    "events": ["charge.created", "payment.reconciled", "agent_task.completed"],
    "secret": "your-signing-secret-32-chars-min"
  }'
```

Response:

```json
{
  "id": "wh_01HX...",
  "tenant_id": "your-org-id",
  "url": "https://your-app.com/hooks/realstateos",
  "events": ["charge.created", "payment.reconciled", "agent_task.completed"],
  "active": true,
  "created_at": "2024-01-15T10:00:00Z"
}
```

---

## Available Events

| Event | Trigger |
|-------|---------|
| `charge.created` | A new monthly charge is generated for a contract |
| `charge.updated` | Charge status changes (pending → paid, partial, overdue) |
| `payment.received` | A raw payment is ingested via bank statement |
| `payment.reconciled` | A payment is successfully matched to a charge |
| `payment.divergence` | Payment amount doesn't match the expected charge |
| `contract.activated` | A contract moves to `active` status |
| `contract.suspended` | A contract is suspended (e.g. payment overdue) |
| `contract.terminated` | A contract reaches its end date or is terminated early |
| `maintenance.created` | A new maintenance ticket is opened |
| `maintenance.resolved` | A maintenance ticket is closed |
| `agent_task.completed` | An AI agent finishes a background task |
| `agent_task.failed` | An AI agent task fails after retries |

---

## Payload Structure

All webhook payloads share a common envelope:

```json
{
  "id": "evt_01HX...",
  "type": "charge.created",
  "tenant_id": "your-org-id",
  "created_at": "2024-02-01T00:00:00Z",
  "data": {
    // Event-specific payload
  }
}
```

### Example: `charge.created`

```json
{
  "id": "evt_01HX...",
  "type": "charge.created",
  "tenant_id": "acme-corp",
  "created_at": "2024-02-01T00:00:00Z",
  "data": {
    "charge_id": "chg_01HX...",
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
    }
  }
}
```

### Example: `payment.reconciled`

```json
{
  "id": "evt_01HX...",
  "type": "payment.reconciled",
  "tenant_id": "acme-corp",
  "created_at": "2024-02-12T14:23:00Z",
  "data": {
    "payment_id": "pay_01HX...",
    "charge_id": "chg_01HX...",
    "amount_paid": "2625.00",
    "amount_expected": "2625.00",
    "status": "paid",
    "method": "pix",
    "reconciled_at": "2024-02-12T14:23:00Z"
  }
}
```

---

## Payload Signing

Every webhook request includes an `X-RealStateOS-Signature` header containing an HMAC-SHA256 signature of the raw request body, computed with your webhook secret.

### Verification (Python)

```python
import hashlib
import hmac

def verify_webhook(payload_bytes: bytes, signature_header: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode(),
        payload_bytes,
        hashlib.sha256
    ).hexdigest()
    received = signature_header.removeprefix("sha256=")
    return hmac.compare_digest(expected, received)
```

### Verification (Node.js)

```javascript
const crypto = require("crypto");

function verifyWebhook(rawBody, signatureHeader, secret) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const received = signatureHeader.replace("sha256=", "");
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(received)
  );
}
```

!!! warning "Always verify signatures"
    Never process webhook payloads without verifying the signature. Attackers can POST forged payloads to your endpoint if you skip this step.

---

## Delivery and Retries

- Webhooks time out after **10 seconds**. Return a `2xx` response quickly.
- Failed deliveries (non-2xx or timeout) are retried up to **5 times** with exponential backoff:
  - Attempt 1: immediate
  - Attempt 2: 1 minute
  - Attempt 3: 5 minutes
  - Attempt 4: 30 minutes
  - Attempt 5: 2 hours
- After 5 failures, the webhook is marked `inactive` and requires manual reactivation.

### Idempotency

Each event has a unique `id`. Your handler should be idempotent — store processed event IDs and skip duplicates:

```python
processed_events = set()  # use Redis in production

def handle_webhook(payload):
    if payload["id"] in processed_events:
        return  # already processed
    processed_events.add(payload["id"])
    # ... handle event
```

---

## Webhook Management

```bash
# List all webhooks
GET /v1/webhooks

# Get one webhook
GET /v1/webhooks/{webhook_id}

# Update (change URL or events)
PUT /v1/webhooks/{webhook_id}

# Delete (deregister)
DELETE /v1/webhooks/{webhook_id}
```

---

## Testing Webhooks Locally

Use [ngrok](https://ngrok.com) or [localtunnel](https://localtunnel.me) to expose your local server:

```bash
ngrok http 3000

# Register the ngrok URL
curl -X POST /v1/webhooks \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"url": "https://abc123.ngrok.io/hooks", "events": ["charge.created"]}'
```
