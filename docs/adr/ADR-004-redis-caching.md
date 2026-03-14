# ADR-004: Redis for Caching, Job Queues, and Rate Limiting

**Date:** 2024-01-22
**Status:** Accepted
**Deciders:** Backend Team

---

## Context

The platform requires:
1. **Response caching** — KPI dashboards, analytics aggregations that are expensive to compute
2. **Job queues** — Billing batch runs, statement generation, payment imports (BullMQ in Node.js)
3. **Rate limiting** — Per-tenant and per-IP rate limiting for API endpoints
4. **Session state** — Agent task status for SSE streaming
5. **Pub/Sub** — Real-time event broadcast to WebSocket clients

---

## Decision

Use **Redis 7** as the unified solution for all five use cases above.

---

## Rationale

### Single Tool, Five Use Cases

The main advantage of Redis is that it handles all five requirements with a single operational concern:
- Response caching: `SET key value EX ttl`
- Job queues: BullMQ (Node.js) and RQ (Python) both use Redis as the queue backend
- Rate limiting: `INCR` + `EXPIRE` pattern, or Redis Cell for token bucket
- SSE state: `HSET task:{id} status running`
- Pub/Sub: `PUBLISH` / `SUBSCRIBE` for fan-out

Running a separate service for each concern (Memcached for cache, SQS for queues, Redis just for rate limiting) would multiply infrastructure complexity with no meaningful benefit at our scale.

### Operational Simplicity

- Single Redis instance in Docker Compose for local dev
- Single Elasticache cluster in production
- One connection pool in Python (`redis-py` async), one in Node.js (`ioredis`)

### Data Loss Tolerance

For our use cases, Redis data loss on restart is acceptable:
- Cached analytics regenerate from Postgres on miss
- Job queues use AOF persistence (Redis Append-Only File) — job data survives restarts
- Rate limit counters reset harmlessly on restart
- SSE state is ephemeral by nature

---

## Caching Strategy

| Data | TTL | Invalidation |
|------|-----|-------------|
| Portfolio KPIs | 5 minutes | On any charge/payment write |
| Billing trend | 1 hour | On new billing run |
| IGPM/IPCA rates | 24 hours | On rate fetch |
| Tenant config | 15 minutes | On tenant update |

All cache keys are namespaced by `tenant_id` to prevent cross-tenant cache poisoning:
```
kpi:{tenant_id}:{date}
billing_trend:{tenant_id}:{months}
igpm_rate:{year}:{month}
```

---

## Job Queue Architecture

```
Python FastAPI          Redis              Node.js
─────────────         ───────           ───────────
billing_service ──→  BullMQ queue  ←── bull worker
                        │
                     BullMQ queue  ←── statement generator
                        │
                     BullMQ queue  ←── webhook delivery
```

Node.js workers consume from BullMQ queues for all async jobs. Python enqueues jobs directly to Redis.

---

## Consequences

**Positive:**
- One service to operate instead of 3–5
- Consistent key management across all use cases
- Strong ecosystem support (BullMQ, ioredis, redis-py)

**Negative:**
- Redis is in-memory — large caches require adequate RAM allocation
- Redis Cluster adds complexity if single-node capacity becomes a bottleneck

**Mitigations:**
- Monitor memory usage; set `maxmemory-policy allkeys-lru` to evict cache on pressure
- Job queue data is bounded (processed jobs are deleted); embedding cache is not stored in Redis

---

## Alternatives Considered

| Alternative | Rejection Reason |
|-------------|-----------------|
| Memcached | No pub/sub, no sorted sets for rate limiting, no persistence — would need a separate queue solution |
| AWS SQS | Vendor lock-in; adds latency vs. local Redis; BullMQ doesn't support SQS |
| RabbitMQ | Overkill; better message guarantees than needed; separate Redis still required for cache/rate-limit |
| Valkey | Drop-in Redis replacement; we may migrate when AWS Elasticache supports it fully |
