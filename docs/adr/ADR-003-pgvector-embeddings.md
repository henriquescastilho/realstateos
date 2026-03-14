# ADR-003: pgvector for Semantic Search and Embeddings

**Date:** 2024-01-20
**Status:** Accepted
**Deciders:** Backend Team

---

## Context

RealState OS needs semantic search capabilities for:
1. **Contract Q&A** — Answer natural language questions about specific contract terms
2. **Maintenance similarity** — Find historical tickets similar to a new one (for cost estimation)
3. **Payment anomaly context** — Find contracts with similar payment patterns
4. **NL Query** — Convert Portuguese questions to SQL with schema context

We needed to choose a vector storage solution.

---

## Decision

Use **pgvector** — PostgreSQL extension for vector similarity search — as our embedding store.

---

## Rationale

### Why pgvector

- **Zero infrastructure addition**: We already run PostgreSQL for all entity data. pgvector is a Postgres extension — no new service to deploy, monitor, or secure
- **ACID consistency**: Embeddings and their source documents live in the same transaction. If a contract is deleted, its embeddings are deleted atomically via foreign key cascade
- **Familiar query interface**: `SELECT ... ORDER BY embedding <=> $1 LIMIT 10` is standard SQL — no new query language
- **Sufficient performance**: At our scale (tens of thousands of contracts), pgvector with `IVFFlat` index handles sub-100ms similarity queries — well within our SLA
- **Hybrid search**: We can combine semantic search with traditional WHERE filters in a single query (e.g. `WHERE tenant_id = $1 AND embedding <=> $2 < 0.3`)

### Scale Assessment

| Metric | Our Need | pgvector Limit |
|--------|----------|----------------|
| Vector dimensions | 1536 (OpenAI ada-002) | 16,000 |
| Vectors per table | ~500K (10 chunks × 50K contracts) | Tens of millions with IVFFlat |
| Query latency | < 100ms | < 50ms with IVFFlat at our scale |

We are well below the threshold where a dedicated vector database (Pinecone, Weaviate, Qdrant) would be necessary.

---

## Consequences

**Positive:**
- No new infrastructure to operate
- Transactional consistency between entity data and embeddings
- Hybrid SQL + vector queries in a single round trip

**Negative:**
- pgvector is not as feature-rich as dedicated vector DBs (no built-in multi-tenancy, no metadata filtering as a first-class concept)
- If the embedding corpus grows to millions of vectors per tenant, we may need to migrate to a dedicated vector DB

**Mitigations:**
- Tenant isolation via `tenant_id` column on all embedding tables (same pattern as entity tables)
- The embedding layer is isolated in `app/services/embeddings.py` — migration to Pinecone/Qdrant would only require changing this service

---

## Embedding Model

We use **text-embedding-3-small** (OpenAI, 1536 dimensions) for all embeddings:
- Cost: ~$0.02 per 1M tokens — negligible for our document corpus
- Quality: Sufficient for contract Q&A and maintenance similarity tasks
- Latency: < 200ms for single document embedding

Contract documents are chunked at 512 tokens with 64-token overlap before embedding.

---

## Alternatives Considered

| Alternative | Rejection Reason |
|-------------|-----------------|
| Pinecone | Additional SaaS cost and dependency; migration risk; no ACID guarantees |
| Weaviate | New infrastructure to deploy; overkill at current scale |
| Qdrant | Same as Weaviate |
| ElasticSearch kNN | Already have Postgres; adding ES would double storage costs |
| In-memory FAISS | Not persistent; would need separate storage for metadata |
