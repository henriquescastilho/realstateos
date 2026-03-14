# Runbook: Redis Recovery

**RTO contribution:** ~15 min (Redis is stateless cache — data regenerates automatically)
**RPO:** N/A (Redis stores ephemeral cache and rate-limit counters, not source of truth)

---

## When to Use This Runbook

- Redis OOM (out of memory) — pods restarted or evicted
- Cache corruption (stale or incorrect cached values)
- Redis pod crash / unresponsive (`redis_up` Grafana alert)
- Accidental `FLUSHALL` or `FLUSHDB` in production
- Rate-limit counters reset needed after a DDoS incident
- Redis data volume failure

---

## Architecture Notes

Redis in Real Estate OS serves these roles:

| Role | TTL | Impact of loss |
|------|-----|----------------|
| Session/JWT cache | 24h | Users re-authenticate on next request |
| Rate-limit counters | 1–15 min | Counters reset — brief over-allowance of requests |
| BullMQ job queues | persistent | In-flight jobs may be lost (see [BullMQ recovery](#bullmq-queue-recovery)) |
| Loki Promtail position cache | on-disk | Logs may be re-ingested briefly |
| Miscellaneous short-lived cache | varies | Miss penalty — DB hit regenerates |

**Redis is not the source of truth for any business data.** A full `FLUSHALL` is safe from a data-correctness standpoint but will cause a brief performance hit while caches warm up.

---

## Step 1 — Check Redis Status

```bash
# Grafana: Real Estate OS — Infrastructure → Redis Up stat
# CLI:
redis-cli -u "$REDIS_URL" PING   # expect: PONG

# In Kubernetes:
kubectl -n realstateos exec -it deploy/redis -- redis-cli PING

# Check memory usage
redis-cli -u "$REDIS_URL" INFO memory | grep used_memory_human
redis-cli -u "$REDIS_URL" INFO memory | grep maxmemory_human

# Check connected clients
redis-cli -u "$REDIS_URL" CLIENT LIST | wc -l
```

---

## Step 2 — Identify the Failure Mode

### Scenario A: Redis pod not running

```bash
# Kubernetes
kubectl -n realstateos get pod -l app=redis
kubectl -n realstateos describe pod -l app=redis
kubectl -n realstateos logs -l app=redis --previous

# Docker Compose
docker compose ps redis
docker compose logs redis --tail=50
```

Restart if crashed:

```bash
# Kubernetes
kubectl -n realstateos rollout restart deployment/redis

# Docker Compose
docker compose restart redis
```

### Scenario B: OOM / eviction policy issue

Redis hit `maxmemory` and started evicting keys. Check:

```bash
redis-cli -u "$REDIS_URL" INFO stats | grep evicted_keys
redis-cli -u "$REDIS_URL" CONFIG GET maxmemory
redis-cli -u "$REDIS_URL" CONFIG GET maxmemory-policy
```

If eviction is happening unexpectedly, the eviction policy may need tuning:

```bash
# Recommended for cache-only use: allkeys-lru
redis-cli -u "$REDIS_URL" CONFIG SET maxmemory-policy allkeys-lru

# Recommended for BullMQ queues: noeviction (queues must not lose jobs)
# If both uses coexist, use a separate Redis instance per use case.
```

### Scenario C: Stale or incorrect cached data

Targeted key flush (preferred over FLUSHALL):

```bash
# Find keys by pattern (use SCAN, never KEYS in production)
redis-cli -u "$REDIS_URL" --scan --pattern "ratelimit:*" | head -20
redis-cli -u "$REDIS_URL" --scan --pattern "org:*:contracts" | head -20

# Delete a specific key
redis-cli -u "$REDIS_URL" DEL "org:abc123:contracts"

# Delete all keys matching a pattern (use with caution)
redis-cli -u "$REDIS_URL" --scan --pattern "ratelimit:*" | \
  xargs redis-cli -u "$REDIS_URL" DEL
```

### Scenario D: Full cache flush required

Only do this if cache corruption is widespread and targeted fixes are not feasible:

```bash
# CAUTION: This flushes ALL keys including BullMQ queues
redis-cli -u "$REDIS_URL" FLUSHDB   # current DB only (default DB 0)
# or
redis-cli -u "$REDIS_URL" FLUSHALL  # all DBs — only if Redis is single-use
```

After flushing, expect:
- 2–5 min of elevated DB load while caches warm up
- All users will need to re-authenticate if session tokens were cached
- Rate-limit counters reset to zero

---

## BullMQ Queue Recovery

BullMQ jobs persisted in Redis (`bull:*` keys) may be lost if Redis was flushed or crashed without persistence.

```bash
# Check queue depths after restart
redis-cli -u "$REDIS_URL" --scan --pattern "bull:*:waiting" | \
  xargs -I{} redis-cli -u "$REDIS_URL" LLEN {}

# Re-enqueue scheduled jobs manually if needed
# (billing, reminder, report workers check queue on startup)
```

The workers at `apps/api-node/src/workers/` have graceful fallback — if a job was lost mid-flight, it will not auto-retry unless it was in the `active` state. Stalled jobs are requeued on worker restart if `stalledInterval` is configured.

```bash
# Restart workers to trigger stalled job recovery
kubectl -n realstateos rollout restart deployment/worker
```

---

## Step 3 — Cache Warm-Up

After a full flush, critical caches warm automatically on first access. To accelerate:

```bash
# Trigger contract list (populates org-level caches)
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API_URL/v1/contracts?per_page=100" > /dev/null

# Trigger properties list
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API_URL/v1/properties?per_page=100" > /dev/null
```

---

## Step 4 — Verify in Grafana

1. Open **Real Estate OS — Infrastructure** dashboard
2. `Redis Up` = 1 (green)
3. `Cache Hit Rate` > 80% after warm-up period (~5 min)
4. `Redis Memory Usage` < 70%
5. No `RedisDown` or `RedisLowHitRate` alerts firing in AlertManager

---

## Preventive Measures

- **Persistence**: Enable Redis AOF persistence (`appendonly yes`) in production to survive pod restarts without data loss for BullMQ queues.
- **Separate Redis instances**: Use Redis DB 0 for cache (evictable) and DB 1 for BullMQ (noeviction).
- **Memory alerts**: `RedisHighMemoryUsage` alert fires at 90% in `monitoring/prometheus/rules/slo_alerts.yml`.
- **Replica**: Enable Redis replication (`replica-of`) in production for HA.
