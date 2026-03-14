# Real Estate OS — Enterprise ADK Fix Plan
# 30 iterations toward enterprise-grade multi-agent platform

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

- [ ] 29. Node.js API parity: complete `apps/api-node/` skeleton — implement all routers (onboarding, billing, payments, communications, maintenance) with full Drizzle ORM integration. Ensure 1:1 endpoint parity with FastAPI. Add JWT auth middleware. This is the migration target.

- [ ] 30. Integration tests + ADK evaluation: create `apps/api/tests/agents/test_agent_e2e.py` — end-to-end test of full monthly cycle: contract onboarding → billing generation → payment reconciliation → owner statement → communications. Use ADK evaluation framework to score agent outputs. Add to CI pipeline.

## Completed
- [x] Project initialization
- [x] Ralph setup on branch feat/enterprise-adk

## Notes
- Wave 1 builds the ADK foundation — everything depends on this
- Wave 2 makes it safe for multi-tenant production use
- Wave 3 makes it operable at scale
- Wave 4 adds the intelligence layer that differentiates the product
- Wave 5 closes the loop with frontend and migration
- Always check existing code before implementing — many stubs already exist
- The Paperclip souls in .agents/souls/ describe agent behavior — use them as LlmAgent instructions
