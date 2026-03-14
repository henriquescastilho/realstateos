# ADR-001: Google ADK Over LangGraph for Agent Orchestration

**Date:** 2024-01-10
**Status:** Accepted
**Deciders:** Backend Team

---

## Context

RealState OS requires a multi-agent system to automate billing, payment reconciliation, maintenance triage, and renter communications. We needed to choose an orchestration framework for building and running these agents.

Candidates evaluated:
1. **Google ADK (Agent Development Kit)** — Structured agent framework with first-class tool definitions, built-in tracing, and a sequential/parallel execution model
2. **LangGraph** — Graph-based orchestration with explicit state machines and conditional edge routing
3. **Raw LLM calls** — Direct API calls to Claude/GPT without an orchestration layer
4. **CrewAI** — Role-based multi-agent collaboration framework

---

## Decision

We chose **Google ADK** as the primary agent orchestration framework.

---

## Rationale

### Why ADK

- **Structured tool definitions**: ADK's `FunctionTool` pattern produces clean, type-safe tool interfaces that align with our FastAPI-first approach
- **Built-in tracing**: Every agent invocation produces an `AgentTask` record with input/output/confidence — matching our auditability requirements
- **Sequential + parallel execution**: ADK supports both in-sequence workflows (onboarding) and parallel fan-out (bulk billing)
- **Deterministic routing**: Unlike graph-based approaches, ADK's `SequentialAgent` and `ParallelAgent` make execution order predictable and debuggable
- **Production maturity**: Used in Google Cloud Vertex AI Agent Builder — battle-tested at scale

### Why Not LangGraph

- Graph-based state machines add significant complexity for workflows that are fundamentally sequential (create contract → generate schedule → create charges)
- Debugging cyclic graphs is harder than debugging a sequential trace
- LangGraph's conditional edges require more boilerplate for simple business rules
- No built-in concept of agent tasks/audit trail — we'd need to build it ourselves

### Why Not CrewAI

- Role-based metaphor doesn't map cleanly to our domain (billing is not a "role" — it's a pipeline)
- Less control over tool execution and retry behavior
- Fewer options for hybrid human-in-the-loop patterns

---

## Consequences

**Positive:**
- Agents are easy to test in isolation (tool functions are plain Python callables)
- Tracing is automatic via `AgentTask` records
- Parallel billing runs use `ParallelAgent` without custom scheduling logic

**Negative:**
- ADK is a Google product — if it's deprecated or changes API, migration cost is high
- Tighter coupling to Google's ecosystem

**Mitigations:**
- Agent business logic lives in `app/services/` and `app/repositories/` — not in ADK-specific code. Agents are thin wrappers around service functions, making them portable.
- All agent outputs are tested via the `AgentTask` interface, not ADK internals.

---

## Alternatives Considered But Rejected

| Alternative | Rejection Reason |
|-------------|-----------------|
| LangGraph | Complexity overhead for sequential workflows |
| CrewAI | Role metaphor doesn't fit domain; less control |
| Raw LLM calls | No orchestration, retry, or tracing — would require building this ourselves |
| Temporal.io | Infrastructure overhead too high for current scale |
