# ADR-002: FastAPI + Node.js Dual Backend Architecture

**Date:** 2024-01-15
**Status:** Accepted
**Deciders:** Backend Team, Architecture

---

## Context

The platform needs to serve two distinct workload profiles:
1. **AI-heavy workflows** — agent orchestration, ML inference, vector search, billing computation with complex business rules
2. **Real-time communication** — WebSocket notifications, SSE streaming, high-frequency webhook delivery, socket.io fan-out

We needed to decide whether to use a single backend language/framework or a dual-stack approach.

---

## Decision

We use **two complementary backends**:
- **Python FastAPI** (`apps/api/`) — primary API, AI agents, ML models, billing engine
- **Node.js + TypeScript** (`apps/api-node/`) — real-time features, WebSocket server, webhook delivery, event streaming

Both expose the same REST API surface (1:1 route parity) and share the same PostgreSQL and Redis instances.

---

## Rationale

### Python FastAPI for AI/Billing

- The Python ML/AI ecosystem (scikit-learn, pgvector, Google ADK, hypothesis) is unmatched. No equivalent in Node for IGPM/IPCA calculations with property-based testing
- FastAPI's `async def` + dependency injection fits our service architecture well
- Pydantic V2 gives us schema validation and serialization in one library
- Existing Python billing logic (`billing_service.py`) has 80%+ test coverage — rewriting it would risk regressions

### Node.js for Real-Time

- `socket.io` + BullMQ is the standard production stack for WebSocket + job queues
- Node's event loop excels at connection-heavy workloads (thousands of concurrent WebSocket clients)
- TypeScript + Zod gives us schema-first validation on the real-time path
- `ioredis` integration with BullMQ is more mature than Python Redis queues for real-time fan-out

### Route Parity

Both backends expose the same `/v1/` routes. The API gateway (nginx) routes:
- `/v1/agent-tasks/*/stream` → Node.js (SSE)
- `/v1/ws` → Node.js (WebSocket)
- `/v1/webhooks/*/deliver` → Node.js (async delivery)
- All other `/v1/*` → Python FastAPI

---

## Consequences

**Positive:**
- Each backend does what it's best at
- Independent scaling: Python pods scale on billing job load; Node.js pods scale on connection count
- Failure isolation: a Python OOM crash doesn't take down WebSocket connections

**Negative:**
- Two codebases to maintain, two CI pipelines, two sets of dependencies
- Route parity requires discipline — a new endpoint must be considered in both backends
- Schema synchronization: if a Python model changes, the Node.js TypeScript type must be updated

**Mitigations:**
- Shared OpenAPI spec generated from Python FastAPI is the source of truth for schemas
- Integration tests validate route parity between both backends
- Zod schemas in Node.js are generated from the OpenAPI spec in CI

---

## Alternatives Considered

| Alternative | Rejection Reason |
|-------------|-----------------|
| Python only | Node.js is genuinely better at real-time; socket.io equivalent in Python is immature |
| Node.js only | Python AI/ML ecosystem is irreplaceable; rewriting billing logic in JS is risky |
| Go backend | High performance but no ML ecosystem; agent frameworks are immature |
| Elixir/OTP | Best concurrency model but no AI ecosystem and small team experience |
