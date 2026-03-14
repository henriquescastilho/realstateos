# Changelog

All notable API changes are documented here. RealState OS follows [Semantic Versioning](https://semver.org/).

---

## v1.0.0 — 2024-03-14

**Initial production release.**

### Added

- `/v1/contracts` — Lease contract CRUD and lifecycle management
- `/v1/properties` — Property registry CRUD
- `/v1/owners` — Owner CRUD with CPF/CNPJ validation
- `/v1/renters` — Renter CRUD with guarantor support
- `/v1/billing/generate` — Billing Agent trigger
- `/v1/charges` — Charge listing with composition breakdown
- `/v1/payments` — Payment ingestion and reconciliation
- `/v1/payments/import` — Bank statement import (CSV, OFX, CNAB240)
- `/v1/payments/divergences` — Reconciliation divergence queue
- `/v1/maintenance` — Maintenance ticket lifecycle
- `/v1/agent-tasks` — Agent task audit trail with SSE streaming
- `/v1/webhooks` — Webhook registration and management
- `/v1/uploads` — Document and photo upload to MinIO
- `/v1/exports` — Async CSV/XLSX/PDF export
- `/v1/analytics/kpis` — Portfolio KPI snapshot
- `/v1/analytics/billing-trend` — Monthly billing trend
- `/v1/search` — Natural language semantic search (pgvector)
- `/auth/token` — JWT issuance
- `/health/live`, `/health/ready` — Infrastructure probes
- `/metrics` — Prometheus metrics
- GraphQL endpoint at `/graphql` with subscriptions

### Security

- Multi-tenant isolation enforced at middleware layer
- JWT HS256 with algorithm confusion attack prevention
- IDOR prevention via tenant-scoped queries
- Rate limiting: 60/min (free), 600/min (pro)
- Webhook payload signing with HMAC-SHA256

---

## Versioning Policy

- **Breaking changes** increment the major version (`/v2/`)
- **New endpoints and fields** are added without version bump
- **Deprecated endpoints** are announced 90 days before removal
- **Old versions** are supported for 12 months after a new major version ships
