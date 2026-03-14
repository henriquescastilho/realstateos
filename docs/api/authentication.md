# Authentication

RealState OS uses **JWT Bearer tokens** for all API authentication. Tokens are issued by the `/auth/token` endpoint and must be passed in the `Authorization` header.

---

## Issuing a Token

```bash
curl -X POST /auth/token \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "your-org-id",
    "email": "you@company.com"
  }'
```

Response:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

---

## Using the Token

Pass the token in every request via the `Authorization` header:

```bash
curl /v1/contracts \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## JWT Payload Structure

The token encodes the following claims:

| Claim | Type | Description |
|-------|------|-------------|
| `sub` | string | User ID |
| `tenant_id` | string | Organization ID — all data is scoped to this |
| `role` | string | User role (`admin`, `manager`, `viewer`) |
| `email` | string | User email address |
| `exp` | int | Expiration timestamp (Unix epoch) |

---

## Token Expiry

Tokens expire after **60 minutes** by default. After expiry, all API calls return `401 Unauthorized`:

```json
{
  "detail": "Invalid or expired token"
}
```

Re-issue a new token by calling `/auth/token` again.

!!! tip "Production recommendation"
    Store the token in memory (not localStorage). Implement a refresh routine that re-issues a token when 5 minutes remain before expiry.

---

## Security Requirements

### Algorithm

Tokens are signed with **HS256** (HMAC-SHA256). The server rejects:

- Tokens with `alg: none` (algorithm confusion attack)
- Tokens signed with an incorrect secret
- Tokens with a different algorithm (RS256, ES256, etc.)

### Tenant Isolation

The `tenant_id` claim is validated on every request:

1. JWT is decoded and `tenant_id` is extracted
2. The tenant is looked up in the database
3. If the tenant does not exist, the request is rejected with `403 Forbidden`
4. All database queries are automatically scoped to `tenant_id` — cross-tenant data access is impossible

### IDOR Prevention

All resource endpoints validate that the requested resource belongs to the authenticated tenant. Requesting a resource from another tenant returns `404 Not Found` (not `403`) to avoid information leakage.

---

## Roles and Permissions

| Role | Permissions |
|------|-------------|
| `admin` | Full read/write access to all resources |
| `manager` | Read/write contracts, billing, maintenance; read-only analytics |
| `viewer` | Read-only access to all resources |

!!! note
    Role-based permission enforcement is in active development. Currently all authenticated users have admin-level access within their tenant.

---

## Demo Tenant

Routes that accept unauthenticated access (marked with `Demo` in the endpoint reference) fall back to the **demo tenant** when no valid JWT is provided. This allows hackathon evaluation and UI previews without credentials.

To explicitly use the demo tenant, omit the `Authorization` header entirely.

!!! warning
    Demo tenant data is shared across all unauthenticated users and is reset periodically. Do not store production data in the demo tenant.

---

## Error Responses

| Status | Cause |
|--------|-------|
| `401 Unauthorized` | Missing, expired, or malformed token |
| `403 Forbidden` | Valid token but tenant not found in DB (token forgery) |

```json
// 401 — missing token
{
  "detail": "Not authenticated"
}

// 401 — expired token
{
  "detail": "Invalid or expired token"
}

// 401 — malformed claims
{
  "detail": "Malformed token"
}

// 403 — tenant not found
{
  "detail": "Tenant not found or access denied"
}
```
