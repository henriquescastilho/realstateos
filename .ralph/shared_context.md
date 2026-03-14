# Shared Context — Real Estate OS Enterprise Loop
# Auto-updated between iterations. Ralph reads this each loop.

## Architecture Decisions (do not re-implement)
- JWT auth: python-jose, HS256, extracted in `apps/api/app/middleware/auth.py`
- Multi-tenant: org_id from JWT, injected via `get_current_org()` dependency
- ADK agents: all in `apps/api/app/agents/`, always include non-ADK fallback
- Database: async SQLAlchemy + asyncpg, pool_size configured in `apps/api/app/database.py`
- Cache: Redis via `apps/api/app/cache/redis_cache.py` (if exists), else direct redis-py
- Queue: Redis-backed DLQ in `apps/api/app/workers/dlq_worker.py`
- Observability: structlog JSON, Prometheus `/metrics`, correlation_id middleware
- Node.js backend: `apps/api-node/` — Express 5 + Drizzle ORM, migration target
- Frontend: Next.js in `apps/web/`, Tailwind + shadcn/ui

## Completed Modules (verified in git log)
- Wave 1: All ADK agents (orchestrator, onboarding, payments, comms, maintenance, pipelines, callbacks)
- Wave 2: JWT auth, multi-tenant middleware, rate limiting, CORS hardening, input validation
- Wave 3: Structured logging, Prometheus metrics, health checks, circuit breaker, DLQ, agent tasks API
- Wave 4: Portfolio agent, analytics API, pgvector search, APScheduler, document intelligence
- Wave 5: Agent dashboard (Next.js), escalation inbox, maintenance UI, Node.js parity, e2e tests
- Wave 6 (partial): Alembic migrations, repository pattern, connection pool tuning, Redis cache, N+1 audit, full-text search, DB seeder, soft delete, database backup strategy
- Wave 7 COMPLETE: OpenAPI spec enhancement (task 41), API versioning (task 42), pagination standardization (task 43), error catalog (task 44), webhook system (task 45), bulk operations API (task 46), file upload API (task 47), export API (task 48), GraphQL layer (task 49), nginx API gateway (task 50)
- Wave 8 COMPLETE: Design system (51), auth flow (52), dashboard KPIs (53), contract UI (54), property registry (55), renter & owner management (56), billing calendar (57), payments reconciliation (58), communications center (59), reports & analytics SVG charts (60), settings UI (61), real-time notifications WebSocket (62), mobile-responsive layout with hamburger nav (63), onboarding wizard (64), Playwright E2E tests (65)
- Wave 9 COMPLETE (74-80): analytics router, agent-tasks router, WebSocket notifications server, StorageService (MinIO S3 wrapper with fallback), BullMQ background workers (billing/reminders/DLQ/reports/embeddings), Vitest test suite (145 tests), Node.js Docker service + parity-check.sh script
- Wave 10 (81-83 done): k8s/ manifests (18 files: namespace, configmap, secret, ingress+TLS, RBAC, PDB, Deployment/Service/HPA per service), helm/realstateos/ chart (23 files: values.yaml + dev/staging/prod overlays, bitnami deps, all service templates), GitHub Actions CI/CD (ci.yml matrix build, cd-staging.yml auto-deploy on main, cd-prod.yml manual+approval gate)

## Known Patterns (use these, don't reinvent)
- All FastAPI routes use: `Depends(get_current_user)` + `Depends(get_current_org)`
- Repository functions always accept `org_id: UUID` as first param for tenant isolation
- Agent tools use try/except around google-adk imports for fallback
- Pydantic schemas use `model_config = ConfigDict(from_attributes=True)`
- Commits use conventional format: `feat(scope): description`
- OpenAPI error responses: import from `app.openapi` — `AUTH_RESPONSES`, `CRUD_RESPONSES`, `RESPONSES_404`, etc.
- OpenAPI examples: set via `model_config = {"json_schema_extra": {"examples": [...]}}` in Pydantic schemas
- API versioning: canonical prefix `/v1/`, legacy shims `/api/` and `/` via `include_versioned_routes()`. Version negotiation via `Accept: application/vnd.realstateos.v1+json` handled by `VersionNegotiationMiddleware`.
- Pagination: all GET list endpoints return `PaginatedResponse[T]` from `app.schemas.pagination`. Use `PaginationParams` dependency (`page` + `per_page`). Pattern: `base = select(Model).where(...)`, count subquery, `PaginatedResponse.build(items, total, params)`.
- Error catalog: `app.errors` — typed `AppError` subclasses with `code`, `message`, `http_status`, `documentation_url`. Handler registered in `main.py` returns `{"error": {"code": ..., "message": ..., "documentation_url": ...}}`. Use typed errors instead of bare `HTTPException` for all domain errors.
- Bulk operations: `app.routes.bulk` — all endpoints under `/bulk/`. Pattern: create parent Task (RUNNING), process items, update Task with results, return `BulkJobResponse`. Max 100 items. Returns `job_id` + `status` (DONE/PARTIAL/FAILED) + `processed`/`failed` counts + per-item `results`/`errors`.
- File uploads: `app.routes.uploads` — POST /uploads (multipart/form-data). Max 50MB, allowed MIME: PDF/JPEG/PNG/WebP/HEIC. Key: `{tenant_id}/{folder}/{uuid}-{filename}`. Returns presigned URL (1h TTL). StorageService in `app.services.storage`.
- Webhook delivery: `app.services.webhook_service.dispatch_webhook_event(db, tenant_id, event, data)` — finds matching active endpoints for tenant, signs body with HMAC-SHA256, delivers via urllib POST. Returns count of endpoints notified. Never raises.
- Storage service: `app.services.storage.StorageService` — boto3 S3 wrapper for MinIO. Configured via settings.s3_*. Methods: upload, presigned_url, delete, copy. Falls back if boto3 missing.
- GraphQL layer: `app.graphql` — strawberry-graphql alongside REST. Schema: `Query` (contracts, charges, agent_tasks with N+1-safe dataloaders), `Subscription` (agentTaskUpdates — 2s polling). Mounted at `/graphql` via `get_graphql_router()` in `app.graphql.schema`. GraphiQL IDE enabled. Graceful fallback if strawberry missing. Context: `GraphQLContext(tenant_id, db)` via `app.graphql.context`.
- Design system: `apps/web/src/components/ui/` — 9 components: Button (primary/ghost/danger, sm/md/lg), Input (label/error/hint), Select (options array, placeholder), Modal (native dialog, backdrop-dismiss), Table (generic Column<T>, clickable rows), Badge (statusVariant() helper), Card (title/description/actions), Spinner + PageSpinner, Toast (ToastProvider + useToast hook, 4 variants). Barrel: `@/components/ui`. Dark mode via prefers-color-scheme in globals.css.
- Auth flow: `apps/web/src/lib/auth.ts` — module-level store (`useSyncExternalStore`), JWT tokens in localStorage/sessionStorage, remember-me toggle, auto-refresh on 401. Pages: `/login`, `/register`, `/forgot-password` in `(auth)` route group (no sidebar layout). Org switcher: `OrgSwitcher.tsx` with dropdown for multi-tenant switch + logout. Middleware: `src/middleware.ts` — Edge middleware checks `ro_auth` cookie, redirects unauthenticated to /login, redirects authenticated away from auth pages.

## BUGS — DO NOT REINTRODUCE (being fixed in fix/critical-bugs-wave6 branch)
- **scheduler.py 74-88**: charge commit and audit commit are NOT atomic — wrap create_task_record in try/except
- **payments_agent/tools.py 376-391**: `_match_by_amount_and_payer` ignores payer_document param — BUG
- **api-node payments/service.ts 68**: never use `"00000000-0000-0000-0000-000000000000"` as chargeId — use null
- **reconciliation_pipeline.py 120-157**: never share one DB session across multiple commits in a batch loop
- **agent_tasks.py 99**: `resolution: dict` must be a Pydantic model with `Literal["approved","rejected"]`
- **comms_agent/tools.py 297**: apply recipient_id filter in the DB query, not after .limit()
- **Charge.status comparisons**: always use `.lower()` — no canonical enum enforced at DB level
- **DLQ worker**: `push()` is never called — wire up retry count tracking in mark_task_failed
- **_format_amount(None)**: add `if value is None: return "0.00"` guard
- **func.coalesce(..., 0)**: use `Decimal("0")` not integer `0` for Numeric columns

## Known Issues (check before implementing)
- `apps/api/app/integrations/bank_mock.py` exists — do not duplicate
- `apps/api/app/services/santander.py` exists — integration already done
- Some Wave 5 Node.js routes may be stubs — verify before implementing

## Self-Recursive Instruction
After completing each task:
1. READ this file before starting the next task
2. UPDATE the "Completed Modules" section with what you just implemented
3. ADD any new patterns or decisions to "Known Patterns"
4. ADD any discovered issues to "Known Issues"
5. COMMIT this file along with your implementation

This creates a compounding knowledge loop — each iteration is smarter than the last.

- Nginx API gateway: `nginx/api-gateway.conf` — rate limiting zones (per_token by Authorization header at 100r/m, per_ip_auth for /auth/ at 10r/m, per_token_agents for /agents+bulk at 20r/m). HTTP→HTTPS redirect. HTTPS with TLS 1.2/1.3, HSTS, X-Frame-Options DENY, X-Content-Type-Options. Structured JSON log_format. Gzip for JSON/JS/CSS/XLSX. Opt-in via `docker compose --profile gateway up`. Dev certs via `bash nginx/gen-dev-certs.sh`.

- WebSocket notifications: `apps/web/src/lib/ws.ts` — module-level store, `startWs(token)`, `stopWs()`, `onNotification(handler)`. `NotificationBell` in header triggers toasts via `showToast()` (imperative export from `Toast.tsx`). `app-shell.tsx` renders bell in sticky header.
- Mobile layout: hamburger `.hamburger-btn` (hidden on desktop, visible < 960px), `.sidebar-open` class, `.sidebar-overlay.visible` backdrop. `.filter-grid` CSS class replaces inline gridTemplateColumns. `.table-scroll` wrapper for horizontal scroll. Breakpoints: 959px (tablet), 599px (mobile).
- Onboarding wizard: `apps/web/src/app/(onboarding)/onboarding/page.tsx` — 5-step: company→property→contract→bank→go-live. localStorage draft key `ro_onboarding_draft`. No AppShell (own route group layout).
- E2E tests: `apps/web/tests/e2e/` — `critical-path.spec.ts` (login→contract→billing→payment→reports), `auth.spec.ts`, `mobile.spec.ts`. `playwright.config.ts` at `apps/web/`. `@playwright/test` in devDependencies.
- Imperative toast: `showToast(message, variant)` exported from `Toast.tsx` — can be called outside React components.

- Node.js StorageService: `apps/api-node/src/services/storage.ts` — `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` with graceful fallback. `StorageService.buildKey(orgId, folder, filename)` for canonical key format. `storageService` singleton exported.
- Node.js workers: `apps/api-node/src/workers/` — billing.ts, reminders.ts, dlq.ts, reports.ts, embeddings.ts + index.ts. All use BullMQ with graceful fallback. `startAllWorkers()` from index. `enqueueBillingGeneration()`, `enqueueToDeadLetter()`, `enqueueReportGeneration()`, `enqueueEmbedding()` as public API.
- Node.js tests: `apps/api-node/src/tests/` + `vitest.config.ts`. 145 tests passing. Covers: auth middleware, error classes, response helpers, StorageService fallback.
- Node.js Docker: `api-node` service added to docker-compose.yml under `node` profile. Port 8082. Run with `docker compose --profile node up`.
- Parity check: `scripts/parity-check.sh` — compares HTTP status codes and response keys between Python (8000) and Node (8082) APIs. Set `AUTH_TOKEN` for authenticated endpoint checks.

- k8s manifests: `k8s/` — 18 files, kustomize base. Namespace `realstateos`. All containers: runAsNonRoot, readOnlyRootFilesystem, emptyDir /tmp. TopologySpreadConstraints for zone-aware spreading. PDB minAvailable:1. HPA autoscaling/v2 CPU 70% + memory 80%.
- Helm chart: `helm/realstateos/` — `secrets.existingSecret` to point at pre-created k8s secret. `api.autoscaling.enabled: false` prevents Helm fighting HPA. `global.imageRegistry` overrides all image registries.
- GitHub Actions: `ci.yml` has ci-gate summary job. `cd-staging.yml` runs migration pod before Helm upgrade, auto-rollbacks on failure. `cd-prod.yml` has approval gate environment `production-approval`, pre-deploys DB backup, smoke tests all 3 endpoints.

## Last Updated
Loop: 67 | Timestamp: 2026-03-14
