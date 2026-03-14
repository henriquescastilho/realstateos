# Real Estate OS — Enterprise ADK Fix Plan
# 120 iterations toward production-ready SaaS platform

## WAVE 1 — ADK Multi-Agent Foundation (loops 1-8)

- [x] 1. ADK OrchestratorAgent: create `apps/api/app/agents/orchestrator/agent.py` — top-level LlmAgent that routes tasks to sub-agents (billing, payments, comms, maintenance, onboarding) based on task_type. Use SequentialAgent for chained workflows. Include non-ADK fallback.

- [x] 2. ADK OnboardingAgent: create `apps/api/app/agents/onboarding_agent/` — LlmAgent with tools: `extract_contract_data(pdf_path)`, `validate_cpf(cpf)`, `normalize_address(address)`, `create_contract_record(data)`, `escalate_to_human(reason, context)`. Handles contract PDF ingestion with Gemini multimodal.

- [x] 3. ADK PaymentsAgent: create `apps/api/app/agents/payments_agent/` — LlmAgent with tools: `ingest_bank_webhook(payload)`, `match_payment_to_charge(payment)`, `classify_reconciliation(received, expected)`, `handle_divergence(payment_id, context)`, `generate_owner_statement(contract_id, month)`. Replace keyword-matching with LLM-powered reconciliation.

- [x] 4. ADK CommunicationsAgent: create `apps/api/app/agents/comms_agent/` — LlmAgent with tools: `send_charge_notice(renter_id, charge_id)`, `send_payment_confirmation(renter_id, payment_id)`, `send_owner_statement(owner_id, statement_id)`, `send_maintenance_update(renter_id, ticket_id)`, `get_message_history(entity_id)`. Multi-channel (email + WhatsApp).

- [x] 5. ADK MaintenanceAgent: create `apps/api/app/agents/maintenance_agent/` — LlmAgent with tools: `classify_ticket(description)`, `set_priority(ticket_id, priority)`, `assign_next_action(ticket_id)`, `check_cost_threshold(ticket_id, estimated_cost)`, `request_owner_approval(ticket_id, cost)`, `close_ticket(ticket_id, resolution)`. LLM classification replaces keyword rules.

- [x] 6. ADK ParallelAgent pipeline: create `apps/api/app/agents/pipelines/monthly_billing_pipeline.py` — ParallelAgent that fans out billing generation across all active contracts simultaneously. Gather results, consolidate charges, trigger comms agent for notifications.

- [x] 7. ADK LoopAgent for reconciliation: create `apps/api/app/agents/pipelines/reconciliation_pipeline.py` — LoopAgent that continuously polls bank webhooks, processes payments, escalates divergences until queue empty. Uses session state to track batch progress.

- [x] 8. ADK Callbacks + Audit: create `apps/api/app/agents/callbacks.py` — `before_tool_callback` that writes audit record to DB before every tool call. `after_tool_callback` that logs result, duration, and agent_id. Universal safety guardrail for all agents.

## WAVE 2 — Multi-Tenant & Security (loops 9-14)

- [x] 9. Multi-tenant middleware: add `apps/api/app/middleware/tenant.py` — FastAPI dependency that extracts organization_id from JWT, injects into request state. Add `get_current_org()` dependency. Apply to all existing routes via DI.

- [x] 10. Organization-scoped DB queries: audit ALL SQLAlchemy queries in `apps/api/app/repositories/` and `apps/api/app/services/` — add `filter_by(tenant_id=org_id)` where missing. Create `TenantScopedSession` context manager that auto-applies tenant filter.

- [x] 11. JWT Authentication: implement `apps/api/app/middleware/auth.py` — JWT validation using python-jose, extract user_id + org_id + role from token. Add `get_current_user()` dependency. Apply auth to all non-demo routes. Keep /demo/* routes open for hackathon.

- [x] 12. Rate limiting: add `apps/api/app/middleware/rate_limiter.py` using slowapi (FastAPI rate limiter). Apply: 100 req/min per IP globally, 10 req/min on /auth/* routes, 20 req/min on /agents/* routes. Redis-backed counters for distributed deployment.

- [x] 13. Input sanitization + validation: audit all Pydantic schemas in `apps/api/app/schemas/` — add field validators for CPF/CNPJ, phone (BR format), CEP, email. Add request size limits. Sanitize string fields to prevent injection.

- [x] 14. Security headers + CORS hardening: update `apps/api/app/main.py` — replace wildcard CORS with configurable allow-list from settings. Add security headers middleware (X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security). Remove stack traces from error responses in production.

## WAVE 3 — Observability & Reliability (loops 15-20)

- [x] 15. Structured logging: replace all print/basic logging in `apps/api/` with structlog JSON logging. Add correlation_id (UUID) to every request via middleware. Log: request start/end, agent tool calls, DB query counts, external API calls. Mask sensitive fields (CPF, amounts).

- [x] 16. Metrics endpoint: create `apps/api/app/routes/metrics.py` — Prometheus-compatible `/metrics` endpoint. Track: active_contracts_total, charges_generated_total, payments_reconciled_total, agent_tasks_by_status, agent_task_duration_seconds histogram, escalations_total.

- [x] 17. Health check enhancements: expand `GET /health` — check DB connection, Redis connection, MinIO connection, agent worker status. Return structured JSON with each component status. Add `/health/ready` (k8s readiness) and `/health/live` (liveness).

- [x] 18. Retry + circuit breaker: create `apps/api/app/utils/resilience.py` — `@retry_with_backoff(max_attempts=3, base_delay=1.0)` decorator for external API calls. `CircuitBreaker` class with open/half-open/closed states. Apply to: Santander bank calls, WhatsApp API, email sending, OCR calls.

- [x] 19. Dead letter queue: add `apps/api/app/workers/dlq_worker.py` — Redis-backed dead letter queue for failed agent tasks. On 3rd failure: move to DLQ, create human escalation task, send alert. Worker processes DLQ items with human review required flag.

- [x] 20. Agent task status API: create `apps/api/app/routes/agent_tasks.py` — `GET /agent-tasks` (list with filters), `GET /agent-tasks/{id}` (detail with full audit log), `POST /agent-tasks/{id}/retry` (human-triggered retry), `POST /agent-tasks/{id}/resolve` (human resolution). Essential for operations dashboard.

## WAVE 4 — Portfolio Intelligence & Analytics (loops 21-25)

- [x] 21. Portfolio Intelligence Agent: create `apps/api/app/agents/portfolio_agent/` — LlmAgent with tools: `get_portfolio_summary(org_id)`, `calculate_default_rate(org_id, period)`, `get_expiring_contracts(days_ahead)`, `calculate_avg_resolution_time(org_id)`, `generate_portfolio_report(org_id, month)`. Uses pgvector for similarity search on historical data.

- [x] 22. Analytics routes: create `apps/api/app/routes/analytics.py` — `GET /analytics/portfolio` (KPIs: default rate, avg billing cycle, escalation rate), `GET /analytics/billing` (monthly totals, payment rates), `GET /analytics/maintenance` (avg resolution time, category breakdown), `GET /analytics/agents` (automation rate, escalation rate by agent).

- [x] 23. pgvector semantic search: create `apps/api/app/services/vector_search.py` — use pgvector extension already in docker-compose. Embed contract text, maintenance descriptions, communications using Gemini embeddings. Enable: "find similar maintenance tickets", "search contracts by description", semantic duplicate detection.

- [x] 24. Scheduled tasks: create `apps/api/app/workers/scheduler.py` — APScheduler integration. Jobs: monthly billing generation (1st of month, 6am), payment reminder D-3 (charge due date - 3 days), overdue escalation (daily at 9am for charges past due > 5 days), portfolio report generation (monthly). All jobs create agent_tasks records.

- [x] 25. Document intelligence: expand `apps/api/app/services/document_ingestion.py` — use Gemini multimodal to extract structured data from contract PDFs. Fields: parties (names, CPF, addresses), property description, rent amount, due day, duration, special clauses. Confidence score per field. Low confidence → escalation task.

## WAVE 5 — Frontend & Integration Polish (loops 26-30)

- [x] 26. Agent activity dashboard (Next.js): create `apps/web/src/app/agents/page.tsx` — real-time dashboard showing: active agent tasks, recent completions, escalations requiring human action, agent performance metrics. Poll `/agent-tasks` API every 10 seconds.

- [x] 27. Escalation inbox (Next.js): create `apps/web/src/app/escalations/page.tsx` — inbox for human operators to review and resolve escalated agent tasks. Show: context, what agent tried, why it escalated, action buttons (approve/reject/retry). Connect to `POST /agent-tasks/{id}/resolve`.

- [x] 28. Maintenance workflow UI (Next.js): create `apps/web/src/app/maintenance/page.tsx` — full maintenance ticket management. List with status/priority filters, detail view with history, create ticket form, update status. Connects to maintenance API routes.

- [x] 29. Node.js API parity: complete `apps/api-node/` skeleton — implement all routers (onboarding, billing, payments, communications, maintenance) with full Drizzle ORM integration. Ensure 1:1 endpoint parity with FastAPI. Add JWT auth middleware. This is the migration target.

- [x] 30. Integration tests + ADK evaluation: create `apps/api/tests/agents/test_agent_e2e.py` — end-to-end test of full monthly cycle: contract onboarding → billing generation → payment reconciliation → owner statement → communications. Use ADK evaluation framework to score agent outputs. Add to CI pipeline.

## WAVE 6 — Database & Persistence Layer (loops 31-40)

- [x] 31. Alembic migrations for all new tables: create migration files for agent_tasks, audit_log, dlq_items, vector_embeddings, scheduled_jobs tables. Ensure idempotent UP/DOWN migrations. Add migration runner to startup.

- [x] 32. Repository pattern for agent_tasks: create `apps/api/app/repositories/agent_tasks.py` — full CRUD with filters (status, agent_type, org_id, date range), pagination, bulk status updates. Replace any raw SQL with SQLAlchemy ORM.

- [x] 33. Repository pattern for audit_log: create `apps/api/app/repositories/audit_log.py` — append-only audit trail. Query by entity_id, agent_id, action_type, time range. Support export to CSV/JSON for compliance.

- [x] 34. Connection pool tuning: configure `apps/api/app/database.py` — pool_size=20, max_overflow=10, pool_timeout=30, pool_recycle=3600. Add pool event listeners for monitoring. Async SQLAlchemy with asyncpg driver.

- [x] 35. Redis cache layer: create `apps/api/app/cache/redis_cache.py` — decorator `@cache(ttl=300, key_fn=...)` for expensive queries. Cache: portfolio KPIs (5min), contract lists (1min), analytics aggregates (10min). Invalidate on mutations.

- [x] 36. Query optimization — N+1 audit: scan all repositories for N+1 patterns. Add `selectinload`/`joinedload` for relationships. Add EXPLAIN ANALYZE comments on slow queries. Target: <50ms p95 for all list endpoints.

- [x] 37. Full-text search: add PostgreSQL `tsvector` columns to contracts, maintenance_tickets, communications tables. Create `GIN` indexes. Expose `GET /search?q=` endpoint that searches across all entities with ranking.

- [x] 38. Database seeder: create `apps/api/scripts/seed.py` — generates realistic Brazilian real estate data: 5 orgs, 50 properties, 200 contracts, 2 years of billing history, payments, maintenance tickets. Used for demo and load testing.

- [x] 39. Soft delete pattern: add `deleted_at` column to contracts, properties, renters, owners tables. Update all repositories to filter `deleted_at IS NULL` by default. Add `DELETE /resource/{id}` that soft-deletes, `POST /resource/{id}/restore` to restore.

- [x] 40. Database backup strategy: create `apps/api/scripts/backup.py` — pg_dump to MinIO with timestamp. Retention: daily 7 days, weekly 4 weeks, monthly 12 months. Backup verification: restore to temp DB and run smoke test.

## WAVE 7 — API Hardening & Documentation (loops 41-50)

- [x] 41. OpenAPI spec enhancement: update all route decorators with full `response_model`, `responses`, `tags`, `summary`, `description`. Add example request/response bodies. Ensure `/docs` is production-ready.

- [x] 42. API versioning: add `/v1/` prefix to all existing routes. Create `apps/api/app/versioning.py` — version negotiation via header `Accept: application/vnd.realstateos.v1+json`. Maintain backwards compat shim for unversioned routes.

- [x] 43. Pagination standardization: create `apps/api/app/schemas/pagination.py` — `PaginatedResponse[T]` generic with `items`, `total`, `page`, `per_page`, `pages`. Apply to ALL list endpoints consistently.

- [x] 44. Error catalog: create `apps/api/app/errors.py` — typed error classes (ContractNotFound, PaymentDivergence, AgentTimeout, TenantQuotaExceeded). Each has code, message template, HTTP status, documentation link. Replace bare HTTPException throughout.

- [x] 45. Webhook system: create `apps/api/app/routes/webhooks.py` — `POST /webhooks` (register endpoint), `GET /webhooks` (list), `DELETE /webhooks/{id}`. Deliver events: contract.created, payment.reconciled, maintenance.escalated, agent.completed. HMAC signature validation.

- [x] 46. Bulk operations API: add bulk endpoints — `POST /contracts/bulk` (create many), `PATCH /charges/bulk-status` (update many), `POST /agents/bulk-trigger` (trigger agent for list of contracts). All return job_id for async tracking.

- [x] 47. File upload API: create `apps/api/app/routes/uploads.py` — `POST /uploads` streams to MinIO. Support: contract PDFs, maintenance photos, owner statements. Return presigned URL. Virus scan stub (pluggable). Max 50MB.

- [x] 48. Export API: create `apps/api/app/routes/exports.py` — `POST /exports` triggers async export job. Formats: CSV, XLSX, PDF. Entities: contracts, billing_history, payment_history, maintenance_report. Download via presigned MinIO URL when ready.

- [x] 49. GraphQL layer: add `strawberry-graphql` alongside REST. Schema covers: contracts, charges, payments, maintenance_tickets, agent_tasks. Supports N+1-safe dataloaders. Subscription for real-time agent task updates via WebSocket.

- [x] 50. API gateway config: create `nginx/api-gateway.conf` — rate limiting by org_id (not just IP), request/response logging, SSL termination, upstream health checks, gzip compression. Docker Compose update to include nginx service.

## WAVE 8 — Frontend Complete (loops 51-65)

- [x] 51. Design system: create `apps/web/src/components/ui/` — Button, Input, Select, Modal, Table, Badge, Card, Spinner, Toast components. Use Tailwind CSS + shadcn/ui. Dark mode support. Storybook stories for each.

- [x] 52. Authentication flow (Next.js): create `apps/web/src/app/(auth)/login/page.tsx` and `register/page.tsx` — JWT-based login with refresh token rotation. Protected route middleware. Org switcher for multi-tenant. Remember me. Forgot password flow.

- [x] 53. Dashboard home: create `apps/web/src/app/dashboard/page.tsx` — KPI cards (active contracts, monthly revenue, default rate, open tickets), charts (billing trend 12mo, payment rate by month), recent activity feed, quick action buttons.

- [x] 54. Contract management UI: create `apps/web/src/app/contracts/` — list with search/filter (status, owner, renter, property), detail view with full history timeline, create/edit form with PDF upload, status workflow buttons (activate/suspend/terminate).

- [x] 55. Property registry UI: create `apps/web/src/app/properties/` — property list with map view (Google Maps embed), property detail with photo gallery, linked contracts history, maintenance history, financial summary.

- [x] 56. Renter & owner management: create `apps/web/src/app/renters/` and `apps/web/src/app/owners/` — CRUD forms with CPF/CNPJ validation, contact info, linked contracts, payment history, document uploads.

- [x] 57. Billing management UI: create `apps/web/src/app/billing/` — charge list with status (pending/paid/overdue/partial), monthly calendar view, bulk charge generation trigger, charge detail with composition breakdown (rent + fees + adjustments).

- [x] 58. Payments UI: create `apps/web/src/app/payments/` — payment list with reconciliation status, manual reconciliation interface (match payment to charge), divergence review queue, bank statement import (CSV upload).

- [x] 59. Communications center: create `apps/web/src/app/communications/` — message history per renter/owner, compose interface (email/WhatsApp), template library, delivery status tracking, bulk send for payment reminders.

- [x] 60. Reports & analytics UI: create `apps/web/src/app/reports/` — portfolio KPI dashboard with date range picker, billing performance charts (Chart.js), default rate trend, maintenance cost analysis, export to PDF/XLSX buttons.

- [x] 61. Settings UI: create `apps/web/src/app/settings/` — org profile, team members management (invite/remove/roles), notification preferences, webhook configuration, API key management, billing plan (placeholder).

- [x] 62. Real-time notifications: add WebSocket client `apps/web/src/lib/ws.ts` — connect to `/ws/notifications`. Display toast notifications for: new escalation, payment received, agent task completed. Notification bell with unread count.

- [x] 63. Mobile-responsive layout: audit ALL pages for mobile breakpoints (sm/md/lg). Add hamburger nav, collapsible sidebars, touch-friendly tables (horizontal scroll + column priority). Target: fully usable on 375px viewport.

- [x] 64. Onboarding wizard: create `apps/web/src/app/onboarding/` — multi-step wizard for new orgs: company info → first property → first contract → bank account → go live. Progress saved server-side. Skip/resume anytime.

- [x] 65. E2E tests (Playwright): create `apps/web/tests/` — critical path tests: login → create contract → generate billing → mark payment → check owner statement. Run in CI against docker-compose test environment.

## WAVE 9 — Node.js Backend (Migration Target) (loops 66-80)

- [x] 66. Node.js project setup: configure `apps/api-node/` — Express 5 + TypeScript strict + Drizzle ORM + Zod validation. ESM modules. Vitest for tests. Add tsconfig, eslint, prettier. Match FastAPI folder structure exactly.

- [x] 67. Drizzle schema completion: define all 14 tables in `apps/api-node/src/db/schema.ts` — with proper TypeScript types, relations, indexes. Generate migration files. Add seed script matching Python seeder data.

- [x] 68. Auth middleware (Node.js): implement `apps/api-node/src/middleware/auth.ts` — JWT validation with jose library. Extract user_id, org_id, role. Tenant isolation via middleware. Rate limiting with express-rate-limit + Redis.

- [x] 69. Contracts router (Node.js): implement `apps/api-node/src/routes/contracts.ts` — full CRUD, 1:1 parity with FastAPI. Zod input validation. Drizzle queries with proper joins. Soft delete. Pagination.

- [x] 70. Billing router (Node.js): implement `apps/api-node/src/routes/billing.ts` — charge CRUD, monthly generation trigger, composition calculation (rent + IGPM adjustment + fees). Match FastAPI business logic exactly.

- [x] 71. Payments router (Node.js): implement `apps/api-node/src/routes/payments.ts` — payment CRUD, reconciliation logic (exact/partial/excess/unmatched), divergence creation, owner statement generation.

- [x] 72. Maintenance router (Node.js): implement `apps/api-node/src/routes/maintenance.ts` — ticket CRUD, status workflow, cost tracking, owner approval flow, photo attachments via MinIO presigned URLs.

- [x] 73. Communications router (Node.js): implement `apps/api-node/src/routes/communications.ts` — message CRUD, template rendering, multi-channel dispatch (email via Nodemailer, WhatsApp via Twilio stub).

- [x] 74. Analytics router (Node.js): implement `apps/api-node/src/routes/analytics.ts` — same KPI endpoints as Python. Use Drizzle aggregate queries. Redis caching with ioredis.

- [x] 75. Agent tasks router (Node.js): implement `apps/api-node/src/routes/agentTasks.ts` — agent task CRUD, audit log, retry/resolve endpoints. BullMQ for job queue (replaces Python DLQ worker).

- [x] 76. WebSocket server (Node.js): implement `apps/api-node/src/ws/notifications.ts` — Socket.io server for real-time events. Rooms by org_id. Emit: agent.completed, payment.received, escalation.created. Auth via JWT handshake.

- [x] 77. File upload service (Node.js): implement `apps/api-node/src/services/storage.ts` — MinIO client wrapper. Multipart upload, presigned URLs, delete, copy. Used by contracts, maintenance, communications routes.

- [x] 78. Background jobs (Node.js): implement `apps/api-node/src/workers/` — BullMQ workers for: billing generation, payment reminders, DLQ processing, report generation, vector embedding. Redis-backed queues.

- [x] 79. Node.js test suite: create `apps/api-node/src/tests/` — Vitest unit tests for all services and repositories. Integration tests against real PostgreSQL (testcontainers). Target 80% coverage.

- [x] 80. Node.js Docker + parity validation: add Node.js service to docker-compose. Script `scripts/parity-check.sh` — runs same HTTP requests against both APIs and diffs responses. Must pass 100% before Node replaces Python.

## WAVE 10 — DevOps & Production Readiness (loops 81-90)

- [x] 81. Kubernetes manifests: create `k8s/` — Deployment, Service, HPA for api, api-node, worker, web. ConfigMap for env vars, Secret for credentials. Ingress with TLS. Namespace isolation per environment.

- [x] 82. Helm chart: create `helm/realstateos/` — parameterized chart for all services. Values files for dev/staging/prod. Include PostgreSQL (bitnami), Redis (bitnami), MinIO charts as dependencies.

- [x] 83. GitHub Actions CI/CD: create `.github/workflows/` — ci.yml (lint + test + build on PR), cd-staging.yml (deploy to staging on main merge), cd-prod.yml (manual trigger, with approval gate). Matrix build for Python + Node.js.

- [x] 84. Docker image optimization: multi-stage Dockerfiles for all services. Python: use uv for deps, non-root user, security scanning with trivy. Node.js: pnpm, standalone output, distroless base. Target: <200MB images.

- [x] 85. Environment configuration: create `apps/api/app/config/settings.py` — pydantic-settings with full validation. Separate configs for dev/staging/prod. Secret management via environment + optional Vault integration stub.

- [x] 86. Database migration CI: add migration safety checks to CI — detect destructive migrations (DROP, ALTER without DEFAULT), require manual approval. Run migrations in staging before prod. Rollback test on every migration.

- [x] 87. Load testing: create `tests/load/` — Locust scenarios for: 100 concurrent users browsing, 50 concurrent billing generations, 200 req/s on payment webhook endpoint. SLO targets: <200ms p95, <1% error rate under load.

- [x] 88. Monitoring stack: add to docker-compose — Prometheus (scrapes /metrics), Grafana (dashboards: API latency, agent throughput, DB pool, Redis hit rate, error rate), AlertManager (PagerDuty webhook stub for SLO breaches).

- [x] 89. Log aggregation: add Loki to docker-compose. Configure structlog JSON output to stdout, Promtail to ship to Loki. Grafana dashboards for log exploration. Log retention: 30 days.

- [x] 90. Disaster recovery runbook: create `docs/runbook/` — DR procedures: DB restore from backup, Redis flush recovery, MinIO bucket restore, full cluster rebuild from IaC. RTO target: <4h, RPO target: <1h.

## WAVE 11 — Integrations & External Services (loops 91-100)

- [x] 91. Santander bank integration: implement `apps/api/app/integrations/santander.py` — real webhook parser for Santander payment notifications. Map to internal payment schema. HMAC validation. Replay protection via idempotency keys.

- [x] 92. Itaú bank integration: implement `apps/api/app/integrations/itau.py` — Itaú Open Finance webhook parser. OAuth2 token management. Account statement polling as fallback. Circuit breaker + retry.

- [x] 93. WhatsApp Business API: implement `apps/api/app/integrations/whatsapp.py` — Meta WhatsApp Business API client. Template message sending, media messages, delivery receipts. Rate limiting (1000 msg/day on free tier). Sandbox mode for dev.

- [x] 94. Email provider: implement `apps/api/app/integrations/email.py` — SendGrid client wrapper. Transactional emails: charge notice, payment confirmation, owner statement, maintenance update. HTML templates with Jinja2. Bounce handling webhook.

- [x] 95. ViaCEP integration: implement `apps/api/app/integrations/viacep.py` — CEP lookup for address normalization. Cache results in Redis (TTL 24h). Fallback to manual entry on API failure. Validate state/city consistency.

- [x] 96. ReceitaWS / CPF validation: implement `apps/api/app/integrations/receita.py` — CPF/CNPJ validation via ReceitaWS API. Cache valid CPFs (24h). Checksum validation as fallback. LGPD-compliant: no storing full CPF in logs.

- [x] 97. Google Calendar integration: implement `apps/api/app/integrations/google_calendar.py` — create calendar events for: contract renewals (60 days prior), inspection dates, maintenance appointments. OAuth2 per org. Sync bidirectionally.

- [x] 98. DocuSign / Clicksign stub: create `apps/api/app/integrations/esign.py` — interface for digital contract signing. Clicksign implementation (BR market). Create envelope, send to signers, webhook on completion, download signed PDF to MinIO.

- [x] 99. IGPM/IPCA index integration: implement `apps/api/app/integrations/indices.py` — fetch monthly IGPM/IPCA from FGV/IBGE public APIs. Cache in DB table. Used by billing engine for annual rent adjustments. Alert when index unavailable.

- [x] 100. Notification orchestrator: create `apps/api/app/services/notification_orchestrator.py` — unified service that decides channel (email/WhatsApp/push) per renter preference, time of day, message type. Deduplication: no duplicate notifications within 24h for same event.

## WAVE 12 — AI/ML Enhancements (loops 101-110)

- [x] 101. RAG for contract Q&A: create `apps/api/app/agents/contract_qa_agent/` — LlmAgent that answers natural language questions about a specific contract using RAG over pgvector embeddings. Tool: `search_contract_chunks(contract_id, query)`.

- [x] 102. Predictive default scoring: create `apps/api/app/ml/default_predictor.py` — feature engineering from payment history (days late, partial payment frequency, maintenance correlation). Train with scikit-learn LogisticRegression. Score per renter monthly. Store in DB.

- [x] 103. Anomaly detection for payments: create `apps/api/app/ml/anomaly_detector.py` — detect unusual payment patterns (sudden large payment, payment from new account, timing anomaly). Flag for human review. Use Isolation Forest on payment features.

- [x] 104. Smart charge composition: enhance billing agent — LlmAgent analyzes contract terms + applicable indices + late fees + discounts to compute charge composition. Explains each line item in plain Portuguese for owner statement.

- [x] 105. Maintenance cost estimator: create `apps/api/app/agents/maintenance_agent/cost_estimator.py` — LlmAgent that estimates repair cost from ticket description + historical similar tickets via pgvector. Returns range (min/expected/max) with confidence.

- [x] 106. Contract renewal recommender: create `apps/api/app/agents/portfolio_agent/renewal_recommender.py` — LlmAgent that analyzes expiring contracts and recommends: renew (good payer), renegotiate (late payer with reason), terminate (chronic default). Sends draft email to owner.

- [x] 107. Natural language query API: create `apps/api/app/routes/nl_query.py` — `POST /query` accepts plain Portuguese question, converts to SQL via LlmAgent (text-to-SQL with schema context), executes read-only, returns structured results + explanation.

- [x] 108. Document comparison agent: create `apps/api/app/agents/document_agent/` — LlmAgent that compares two contract versions and highlights changes in plain Portuguese. Tool: `extract_contract_clauses(pdf_path)`, `diff_clauses(v1, v2)`, `summarize_changes(diff)`.

- [ ] 109. Gemini multimodal for maintenance: enhance maintenance agent — accept photo uploads, use Gemini Vision to classify damage type, estimate severity, suggest repair category. Auto-populate ticket fields from photo analysis.

- [ ] 110. ADK evaluation framework: create `apps/api/tests/agents/eval/` — golden dataset of 50 agent scenarios with expected outputs. Use ADK `evaluate()` to score: tool selection accuracy, output quality, escalation precision. Run in CI, alert if score drops >5%.

## WAVE 13 — Quality, Testing & Documentation (loops 111-120)

- [ ] 111. Unit test suite — Python: achieve 80% coverage on `apps/api/app/services/` and `apps/api/app/repositories/`. Use pytest + pytest-asyncio. Mock external integrations. Test all error paths.

- [ ] 112. Unit test suite — Node.js: achieve 80% coverage on `apps/api-node/src/services/` and `apps/api-node/src/repositories/`. Vitest + vi.mock. Test all Zod validation schemas.

- [ ] 113. Integration tests — Python: create `apps/api/tests/integration/` — tests against real PostgreSQL + Redis (testcontainers). Test: full billing cycle, payment reconciliation, agent task lifecycle. No mocks for DB/cache.

- [ ] 114. Contract property-based tests: add hypothesis tests for billing calculation — `@given(rent=st.decimals(), days=st.integers())` — verify: no negative charges, IGPM adjustment bounds, partial payment calculations are always consistent.

- [ ] 115. Security penetration tests: create `tests/security/` — automated security tests using OWASP ZAP Python API. Test: SQL injection on all filter params, JWT algorithm confusion, tenant isolation (cross-org data access attempts), rate limit bypass.

- [ ] 116. API documentation site: create `docs/api/` — mkdocs-material site with: getting started guide, authentication tutorial, webhook integration guide, ADK agent architecture diagram, all endpoint references with examples.

- [ ] 117. Architecture decision records: create `docs/adr/` — ADR-001 (ADK over Langgraph), ADR-002 (FastAPI + Node.js dual backend), ADR-003 (pgvector for embeddings), ADR-004 (Redis for caching), ADR-005 (multi-tenant via org_id column).

- [ ] 118. Developer onboarding guide: create `docs/DEVELOPMENT.md` — complete setup from scratch: prerequisites, env vars, docker-compose up, seed data, first API call, running tests, common issues. Target: working in <15 minutes.

- [ ] 119. Performance benchmarks: create `tests/benchmarks/` — measure and document: billing generation for 1000 contracts, payment reconciliation throughput, vector search latency, agent task end-to-end time. Set regression thresholds in CI.

- [ ] 120. Production launch checklist: create `docs/LAUNCH_CHECKLIST.md` — pre-launch: security audit sign-off, load test results, backup verified, monitoring alerts configured, runbook reviewed. Go/no-go criteria. Post-launch: 24h monitoring plan, rollback procedure.

## Completed
- [x] Project initialization
- [x] Ralph setup on branch feat/enterprise-adk

## Notes
- Always check existing code before implementing — many stubs already exist
- The Paperclip souls in .agents/souls/ describe agent behavior — use them as LlmAgent instructions
- Never break existing endpoints — backwards compat required
- Commit each completed feature with conventional commit message
- Update this fix_plan marking items [x] as completed
