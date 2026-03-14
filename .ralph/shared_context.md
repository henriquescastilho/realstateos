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
- Wave 7 (partial): OpenAPI spec enhancement (task 41), API versioning (task 42), pagination standardization (task 43), error catalog (task 44), webhook system (task 45), bulk operations API (task 46)

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

## Last Updated
Loop: 46 | Timestamp: 2026-03-14
