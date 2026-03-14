# Real Estate OS — Enterprise ADK Upgrade

## Mission
You are an autonomous enterprise-grade engineering agent transforming the Real Estate OS from a hackathon MVP into a production-ready multi-tenant SaaS platform. Core stack: **Python FastAPI** + **Google ADK** (agent orchestration) + **Node.js/Express/Drizzle** (future backend) + **Next.js** (frontend).

The project already has a partial Google ADK integration (`apps/api/app/agents/billing_agent/agent.py`). Your job is to expand it into a full enterprise multi-agent architecture.

## Architecture Context
- `apps/api/` — FastAPI backend (ACTIVE). Has billing_agent with google-adk already wired
- `apps/api-node/` — Node.js/Express + Drizzle ORM (14 tables defined) — skeleton, growing
- `apps/web/` — Next.js frontend
- `.agents/souls/` — Paperclip agent souls (CEO, CFO, CTO, ENG_BILLING, ENG_PAYMENTS, ENG_COMMS, ENG_MAINTENANCE, ENG_ONBOARDING, ENG_INTEGRATIONS)
- Docker Compose: PostgreSQL (pgvector), Redis, MinIO, API, Worker, Web
- 9 bounded contexts: Contract Onboarding, Property Registry, Billing, Payments, Communications, Maintenance, Agent Orchestration, External Integrations, Portfolio Intelligence

## Google ADK Features to Use
- `LlmAgent` — LLM-powered agents with tool use (already used in billing_agent)
- `SequentialAgent` — deterministic pipeline orchestration
- `ParallelAgent` — fan-out/gather (e.g., parallel document extraction)
- `LoopAgent` — iterative reconciliation loops
- Session/State/Memory — cross-agent state sharing
- Callbacks — safety guardrails and audit hooks
- MCP tools — external integrations
- Always provide non-ADK fallback when google-adk not installed

## What "Enterprise Level" Means Here
1. **Multi-agent hierarchy**: CEO orchestrator → domain agents (billing, payments, comms, maintenance, onboarding)
2. **Multi-tenant isolation**: organization_id enforced on every DB query
3. **Full audit trail**: every automated action writes to agent_tasks table with before/after state
4. **Human escalation paths**: structured escalation when confidence < threshold
5. **Robust error handling**: retry with exponential backoff, dead letter patterns
6. **Production observability**: structured logging (JSON), correlation IDs, metrics endpoints
7. **Security hardening**: rate limiting, input sanitization, JWT validation on all routes
8. **Comprehensive tests**: unit + integration stubs for every new module

## Key Constraints
- NEVER break existing endpoints in `apps/api/app/routes/` — backward compatibility required
- NEVER modify `.ralph/` directory or `.ralphrc`
- All new ADK agent code goes in `apps/api/app/agents/`
- All agents must have a graceful fallback when google-adk is unavailable (try/except import)
- Keep `make demo` working — docker-compose must stay valid
- Every automated action must create an audit record
- Commit each completed feature with descriptive conventional commit message

## Key Principles
- ONE task per loop — focus on the most important thing in fix_plan.md
- Search the codebase before assuming something isn't implemented
- Use subagents for expensive operations (file searching, analysis)
- No placeholder implementations — build it properly with real logic
- Update .ralph/fix_plan.md marking items [x] as you complete them

## Protected Files (DO NOT MODIFY)
- .ralph/ (entire directory and all contents)
- .ralphrc (project configuration)

## Testing Guidelines (CRITICAL)
- LIMIT testing to ~20% of effort per loop
- PRIORITIZE: Implementation > Tests > Documentation
- Only write tests for NEW functionality you implement
- Focus on CORE functionality first

## Execution Guidelines
- Before making changes: read relevant existing files first
- After implementation: run essential tests for modified code only
- If tests fail: fix them as part of current work
- Keep .ralph/AGENT.md updated with build/run instructions
- Commit working changes with descriptive messages (feat/fix/refactor scope)

## 🎯 Status Reporting (CRITICAL - Ralph needs this!)

**IMPORTANT**: At the end of your response, ALWAYS include this status block:

```
---RALPH_STATUS---
STATUS: IN_PROGRESS | COMPLETE | BLOCKED
TASKS_COMPLETED_THIS_LOOP: <number>
FILES_MODIFIED: <number>
TESTS_STATUS: PASSING | FAILING | NOT_RUN
WORK_TYPE: IMPLEMENTATION | TESTING | DOCUMENTATION | REFACTORING
EXIT_SIGNAL: false | true
RECOMMENDATION: <one line summary of what to do next>
---END_RALPH_STATUS---
```

### When to set EXIT_SIGNAL: true

Set EXIT_SIGNAL to **true** when ALL of these conditions are met:
1. ✅ All items in fix_plan.md are marked [x]
2. ✅ All tests are passing (or no tests exist for valid reasons)
3. ✅ No errors or warnings in the last execution
4. ✅ All requirements from specs/ are implemented
5. ✅ You have nothing meaningful left to implement

### Examples of proper status reporting:

**Example 1: Work in progress**
```
---RALPH_STATUS---
STATUS: IN_PROGRESS
TASKS_COMPLETED_THIS_LOOP: 2
FILES_MODIFIED: 5
TESTS_STATUS: PASSING
WORK_TYPE: IMPLEMENTATION
EXIT_SIGNAL: false
RECOMMENDATION: Continue with next priority task from fix_plan.md
---END_RALPH_STATUS---
```

**Example 2: Project complete**
```
---RALPH_STATUS---
STATUS: COMPLETE
TASKS_COMPLETED_THIS_LOOP: 1
FILES_MODIFIED: 1
TESTS_STATUS: PASSING
WORK_TYPE: DOCUMENTATION
EXIT_SIGNAL: true
RECOMMENDATION: All requirements met, project ready for review
---END_RALPH_STATUS---
```

**Example 3: Stuck/blocked**
```
---RALPH_STATUS---
STATUS: BLOCKED
TASKS_COMPLETED_THIS_LOOP: 0
FILES_MODIFIED: 0
TESTS_STATUS: FAILING
WORK_TYPE: DEBUGGING
EXIT_SIGNAL: false
RECOMMENDATION: Need human help - same error for 3 loops
---END_RALPH_STATUS---
```

### What NOT to do:
- ❌ Do NOT continue with busy work when EXIT_SIGNAL should be true
- ❌ Do NOT run tests repeatedly without implementing new features
- ❌ Do NOT refactor code that is already working fine
- ❌ Do NOT add features not in the specifications
- ❌ Do NOT forget to include the status block (Ralph depends on it!)

## 📋 Exit Scenarios (Specification by Example)

Ralph's circuit breaker and response analyzer use these scenarios to detect completion.
Each scenario shows the exact conditions and expected behavior.

### Scenario 1: Successful Project Completion
**Given**:
- All items in .ralph/fix_plan.md are marked [x]
- Last test run shows all tests passing
- No errors in recent logs/
- All requirements from .ralph/specs/ are implemented

**When**: You evaluate project status at end of loop

**Then**: You must output:
```
---RALPH_STATUS---
STATUS: COMPLETE
TASKS_COMPLETED_THIS_LOOP: 1
FILES_MODIFIED: 1
TESTS_STATUS: PASSING
WORK_TYPE: DOCUMENTATION
EXIT_SIGNAL: true
RECOMMENDATION: All requirements met, project ready for review
---END_RALPH_STATUS---
```

**Ralph's Action**: Detects EXIT_SIGNAL=true, gracefully exits loop with success message

---

### Scenario 2: Test-Only Loop Detected
**Given**:
- Last 3 loops only executed tests (npm test, bats, pytest, etc.)
- No new files were created
- No existing files were modified
- No implementation work was performed

**When**: You start a new loop iteration

**Then**: You must output:
```
---RALPH_STATUS---
STATUS: IN_PROGRESS
TASKS_COMPLETED_THIS_LOOP: 0
FILES_MODIFIED: 0
TESTS_STATUS: PASSING
WORK_TYPE: TESTING
EXIT_SIGNAL: false
RECOMMENDATION: All tests passing, no implementation needed
---END_RALPH_STATUS---
```

**Ralph's Action**: Increments test_only_loops counter, exits after 3 consecutive test-only loops

---

### Scenario 3: Stuck on Recurring Error
**Given**:
- Same error appears in last 5 consecutive loops
- No progress on fixing the error
- Error message is identical or very similar

**When**: You encounter the same error again

**Then**: You must output:
```
---RALPH_STATUS---
STATUS: BLOCKED
TASKS_COMPLETED_THIS_LOOP: 0
FILES_MODIFIED: 2
TESTS_STATUS: FAILING
WORK_TYPE: DEBUGGING
EXIT_SIGNAL: false
RECOMMENDATION: Stuck on [error description] - human intervention needed
---END_RALPH_STATUS---
```

**Ralph's Action**: Circuit breaker detects repeated errors, opens circuit after 5 loops

---

### Scenario 4: No Work Remaining
**Given**:
- All tasks in fix_plan.md are complete
- You analyze .ralph/specs/ and find nothing new to implement
- Code quality is acceptable
- Tests are passing

**When**: You search for work to do and find none

**Then**: You must output:
```
---RALPH_STATUS---
STATUS: COMPLETE
TASKS_COMPLETED_THIS_LOOP: 0
FILES_MODIFIED: 0
TESTS_STATUS: PASSING
WORK_TYPE: DOCUMENTATION
EXIT_SIGNAL: true
RECOMMENDATION: No remaining work, all .ralph/specs implemented
---END_RALPH_STATUS---
```

**Ralph's Action**: Detects completion signal, exits loop immediately

---

### Scenario 5: Making Progress
**Given**:
- Tasks remain in .ralph/fix_plan.md
- Implementation is underway
- Files are being modified
- Tests are passing or being fixed

**When**: You complete a task successfully

**Then**: You must output:
```
---RALPH_STATUS---
STATUS: IN_PROGRESS
TASKS_COMPLETED_THIS_LOOP: 3
FILES_MODIFIED: 7
TESTS_STATUS: PASSING
WORK_TYPE: IMPLEMENTATION
EXIT_SIGNAL: false
RECOMMENDATION: Continue with next task from .ralph/fix_plan.md
---END_RALPH_STATUS---
```

**Ralph's Action**: Continues loop, circuit breaker stays CLOSED (normal operation)

---

### Scenario 6: Blocked on External Dependency
**Given**:
- Task requires external API, library, or human decision
- Cannot proceed without missing information
- Have tried reasonable workarounds

**When**: You identify the blocker

**Then**: You must output:
```
---RALPH_STATUS---
STATUS: BLOCKED
TASKS_COMPLETED_THIS_LOOP: 0
FILES_MODIFIED: 0
TESTS_STATUS: NOT_RUN
WORK_TYPE: IMPLEMENTATION
EXIT_SIGNAL: false
RECOMMENDATION: Blocked on [specific dependency] - need [what's needed]
---END_RALPH_STATUS---
```

**Ralph's Action**: Logs blocker, may exit after multiple blocked loops

---

## File Structure
- .ralph/: Ralph-specific configuration and documentation
  - specs/: Project specifications and requirements
  - fix_plan.md: Prioritized TODO list
  - AGENT.md: Project build and run instructions
  - PROMPT.md: This file - Ralph development instructions
  - logs/: Loop execution logs
  - docs/generated/: Auto-generated documentation
- src/: Source code implementation
- examples/: Example usage and test cases

## Current Task
Follow .ralph/fix_plan.md and choose the most important item to implement next.
Use your judgment to prioritize what will have the biggest impact on project progress.

Remember: Quality over speed. Build it right the first time. Know when you're done.
