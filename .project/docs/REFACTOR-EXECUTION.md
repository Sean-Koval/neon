# Refactor Execution Plan

**Decision:** Immediate refactor to MooseStack + Temporal
**Date:** 2026-01-25
**Estimated Duration:** 18-28 days

---

## Execution Strategy

### Principle: Vertical Slices

Instead of building all infrastructure, then all backend, then all frontend, we'll build **vertical slices** that deliver working functionality incrementally:

1. **Slice 1:** Traces (ingest → store → view)
2. **Slice 2:** Scores (create → store → display)
3. **Slice 3:** Evals (define → run via Temporal → results)
4. **Slice 4:** Analytics (aggregate → visualize)

This way we have something working at each stage.

---

## Phase 0: Infrastructure Foundation (Days 1-3)

### Goal
All services running locally, can connect and verify.

### Tasks

#### RF-001: Docker Compose for Full Stack
- ClickHouse server running
- Redpanda (Kafka) running
- Temporal server + UI running
- PostgreSQL (for Temporal + metadata)
- All services networked correctly
- Health checks passing

**Acceptance:** `docker compose up` starts all services, all healthy

#### RF-002: Verify ClickHouse Connection
- Can connect from Node.js
- Can run test queries
- Create initial database

**Acceptance:** Simple insert/select works from test script

#### RF-003: Verify Temporal Connection
- Worker can connect to Temporal
- Can start a simple "hello world" workflow
- Temporal UI shows workflow execution

**Acceptance:** Hello world workflow completes successfully

#### RF-004: Verify Redpanda Connection
- Can produce messages
- Can consume messages
- Topic creation works

**Acceptance:** Round-trip message test passes

---

## Phase 1: Trace Ingestion Slice (Days 4-8)

### Goal
External agents can send OTel traces, we store in ClickHouse, view in UI.

### Tasks

#### RF-010: ClickHouse Schema - Traces & Spans
- Create traces table
- Create spans table
- Verify schema with test inserts
- Add indexes for common queries

**Acceptance:** Can insert and query traces/spans via SQL

#### RF-011: OTel Ingest Endpoint
- POST /v1/traces accepts OTLP JSON
- Transform OTel format to internal format
- Write to ClickHouse (direct, no streaming yet)
- Return success/error response

**Acceptance:** curl with OTel payload succeeds, data in ClickHouse

#### RF-012: Trace Query API
- GET /api/traces - list with filters
- GET /api/traces/:id - single trace with spans
- Pagination support
- Project scoping

**Acceptance:** API returns data from ClickHouse

#### RF-013: Trace List Page
- Connect to new API
- Display traces with status, duration
- Filtering by status, date range
- Link to detail page

**Acceptance:** `/traces` shows real data from ClickHouse

#### RF-014: Trace Detail Page
- Fetch trace with all spans
- Render span tree/waterfall
- Show LLM inputs/outputs
- Token counts, timing

**Acceptance:** `/traces/:id` shows full trace detail

---

## Phase 2: Scoring Slice (Days 9-12)

### Goal
Can create scores on traces, view them in UI.

### Tasks

#### RF-020: ClickHouse Schema - Scores
- Create scores table
- Create score_configs table
- Indexes for trace lookup

**Acceptance:** Can insert and query scores

#### RF-021: Score API Endpoints
- POST /api/scores - create score
- GET /api/traces/:id/scores - get scores for trace
- POST /api/score-configs - create scorer config

**Acceptance:** CRUD operations work

#### RF-022: Score Display in Trace Detail
- Show scores on trace detail page
- Score breakdown by type
- Score trends (if multiple)

**Acceptance:** Scores visible on trace detail

#### RF-023: Manual Scoring UI
- Add score to trace from UI
- Select score type, enter value
- Optional comment

**Acceptance:** Can score a trace from the UI

---

## Phase 3: Temporal Eval Execution (Days 13-18)

### Goal
Eval runs execute via Temporal workflows with automatic retry.

### Tasks

#### RF-030: Temporal Worker Setup
- Worker connects to Temporal
- Registers workflows and activities
- Graceful shutdown

**Acceptance:** Worker starts and shows in Temporal UI

#### RF-031: LLM Call Activity
- Call Anthropic/OpenAI with retry
- Capture token usage
- Emit span to ClickHouse
- Handle rate limits gracefully

**Acceptance:** LLM call works with automatic retry on failure

#### RF-032: Scorer Activity
- Run scorer on trace
- Support rule-based and LLM judge
- Write score to ClickHouse

**Acceptance:** Scorer activity produces scores

#### RF-033: Eval Case Workflow
- Takes test case input
- Runs agent (LLM calls)
- Runs scorers
- Returns results

**Acceptance:** Single case workflow completes

#### RF-034: Eval Run Workflow
- Takes suite definition
- Runs cases (parallel or sequential)
- Aggregates results
- Stores run metadata

**Acceptance:** Full eval run workflow completes

#### RF-035: Start Eval from API
- POST /api/runs - starts Temporal workflow
- Returns workflow ID
- Can query status

**Acceptance:** API triggers eval, can track progress

#### RF-036: Eval Run Status in UI
- Show workflow status
- Progress indicator
- Link to results when complete

**Acceptance:** UI shows running/completed evals

---

## Phase 4: Migration & Polish (Days 19-24)

### Goal
Migrate remaining features, ensure production readiness.

### Tasks

#### RF-040: Migrate Suite/Case Management
- Suites stored in PostgreSQL (metadata)
- Cases stored in PostgreSQL
- Link to eval runs
- CRUD UI

**Acceptance:** Can create/edit/delete suites via UI

#### RF-041: Compare Runs Feature
- Select two runs
- Show regression/improvement
- Score diff visualization

**Acceptance:** Compare page works with new backend

#### RF-042: Dashboard with Real Data
- Summary stats from ClickHouse
- Recent runs from Temporal
- Score trends from ClickHouse

**Acceptance:** Dashboard shows live data

#### RF-043: Analytics Dashboard
- Usage over time
- Cost by model (from spans)
- Error rates

**Acceptance:** Analytics page shows real metrics

#### RF-044: Authentication & Multi-tenancy
- API key validation
- Project scoping on all queries
- Rate limiting

**Acceptance:** Auth works, projects isolated

#### RF-045: Error Handling & Polish
- Error boundaries in UI
- Loading states
- Empty states
- Error messages

**Acceptance:** App handles errors gracefully

---

## Phase 5: Documentation & Deploy (Days 25-28)

### Tasks

#### RF-050: README & Quickstart
- Getting started guide
- Docker compose instructions
- First eval tutorial

#### RF-051: SDK Documentation
- How to instrument agents
- OTel setup guide
- Scorer configuration

#### RF-052: Deployment Guide
- Production docker-compose
- Environment variables
- Scaling considerations

#### RF-053: Archive Old Code
- Move `api/` to `_archive/old-fastapi/`
- Remove MLflow dependencies
- Clean up unused frontend code

---

## Parallel Workstreams

If multiple engineers:

```
Engineer 1 (Backend):     RF-001 → RF-010/011/012 → RF-030-035 → RF-044
Engineer 2 (Frontend):    RF-002 → RF-013/014 → RF-022/023 → RF-040-043
Engineer 3 (Infra/Docs):  RF-003/004 → RF-020/021 → RF-050-053
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| ClickHouse unfamiliar | Use simple queries first, add MVs later |
| Temporal complexity | Start with simple workflow, add features |
| OTel transform bugs | Test with real agent traces early |
| Time overrun | Cut RF-043 (analytics) if needed |

---

## Definition of Done

Refactor is complete when:

1. [ ] OTel traces can be ingested from external agents
2. [ ] Traces visible in UI with full detail
3. [ ] Evals run via Temporal with automatic retry
4. [ ] Scores created and displayed
5. [ ] Dashboard shows real metrics
6. [ ] Compare feature works
7. [ ] Auth and project isolation work
8. [ ] Documentation exists
9. [ ] Old MLflow code archived

---

## Rollback Plan

If refactor stalls:
1. Old `api/` code is in `_archive/`, can restore
2. PostgreSQL schema unchanged for metadata
3. Can run old and new in parallel during transition
