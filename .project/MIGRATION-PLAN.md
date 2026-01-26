# Neon Migration Plan: MLflow → Temporal + ClickHouse

## Vision
Durable agent evaluation with real-time observability.

## Principles
1. **Kill complexity** - One backend (Next.js), one database (ClickHouse), one orchestrator (Temporal)
2. **SDK-first** - Developers can run evals without deploying anything
3. **Real-time by default** - Streaming results, live dashboards
4. **Durable execution** - Evals never fail, they checkpoint and resume

---

## Phase 1: Cleanup (Day 1-2)
**Goal:** Remove dead code, consolidate to single architecture

### Tasks
- [ ] **CLEAN-001**: Archive `api/` directory (Python FastAPI)
- [ ] **CLEAN-002**: Archive `moose-app/` directory (over-engineered)
- [ ] **CLEAN-003**: Remove MLflow references from frontend
- [ ] **CLEAN-004**: Clean up `.project/tasks/` - archive completed, remove stale
- [ ] **CLEAN-005**: Clean up `.beads/` - consolidate or remove
- [ ] **CLEAN-006**: Update `docker-compose.yml` - remove unused services
- [ ] **CLEAN-007**: Update root `package.json` / `turbo.json` for monorepo

**Deliverable:** Clean repo with only: `frontend/`, `temporal-workers/`, `packages/sdk/`, `scripts/`

---

## Phase 2: Core Backend (Day 3-5)
**Goal:** Working ClickHouse + Temporal integration

### Tasks
- [ ] **CORE-001**: Install missing deps (`@clickhouse/client`, `@temporalio/client`)
- [ ] **CORE-002**: Create `frontend/lib/db.ts` - ClickHouse client singleton
- [ ] **CORE-003**: Create ClickHouse schema migration script
- [ ] **CORE-004**: Implement `/api/traces` - list, get, insert
- [ ] **CORE-005**: Implement `/api/scores` - list, get, insert
- [ ] **CORE-006**: Implement `/api/evals` - start, status, cancel (Temporal)
- [ ] **CORE-007**: Create Temporal worker with eval workflows
- [ ] **CORE-008**: Test: Insert trace → Query trace → Display in UI

**Deliverable:** Can start eval via API, see results in ClickHouse

---

## Phase 3: SDK (Day 6-7)
**Goal:** Evals-as-code that works locally

### Tasks
- [ ] **SDK-001**: Simplify `packages/sdk/` - remove bloat
- [ ] **SDK-002**: Core API: `defineTest()`, `defineSuite()`, `run()`
- [ ] **SDK-003**: Built-in scorers: `exactMatch`, `contains`, `llmJudge`
- [ ] **SDK-004**: CLI: `npx neon eval` runs tests locally
- [ ] **SDK-005**: CI mode: JSON output, exit codes, threshold checks
- [ ] **SDK-006**: Optional: Send results to Neon cloud/self-hosted

**Deliverable:** `npx neon eval` works in any repo

---

## Phase 4: Frontend Polish (Day 8-10)
**Goal:** Clean, fast, agent-native UX

### Tasks
- [ ] **UI-001**: Dashboard - recent evals, pass/fail rates, trends
- [ ] **UI-002**: Eval detail - real-time progress, case results
- [ ] **UI-003**: Trace viewer - agent-native (tool calls, reasoning, not generic spans)
- [ ] **UI-004**: Score trends - regression detection visualization
- [ ] **UI-005**: Start eval dialog - configure and launch
- [ ] **UI-006**: WebSocket for real-time updates (or polling fallback)
- [ ] **UI-007**: Remove/hide old pages (suites, old runs)

**Deliverable:** Beautiful, fast dashboard for eval results

---

## Phase 5: Performance & Polish (Day 11-12)
**Goal:** Production-ready performance

### Tasks
- [ ] **PERF-001**: ClickHouse batch inserts (buffer traces, flush periodically)
- [ ] **PERF-002**: Materialized views for dashboard aggregations
- [ ] **PERF-003**: Add indexes to ClickHouse tables
- [ ] **PERF-004**: Lazy load trace details (don't fetch all spans upfront)
- [ ] **PERF-005**: Optimize bundle size (code splitting)
- [ ] **PERF-006**: Add loading states, error boundaries

**Deliverable:** Sub-100ms dashboard loads, sub-ms trace inserts

---

## Phase 6: Documentation & Launch (Day 13-14)
**Goal:** Ready for users

### Tasks
- [ ] **DOC-001**: README with quick start
- [ ] **DOC-002**: SDK documentation
- [ ] **DOC-003**: Self-hosting guide (Docker Compose)
- [ ] **DOC-004**: Example eval suite
- [ ] **DOC-005**: Update CLAUDE.md for new architecture

**Deliverable:** Someone can clone, run, and understand in 10 minutes

---

## Files to DELETE (Phase 1)

```
# Python backend (replaced by Next.js API routes)
api/                          # Entire directory

# Over-engineered data layer (replaced by direct ClickHouse)
moose-app/                    # Entire directory

# Old task files (will create new ones)
.project/tasks/*.json         # Archive, don't delete yet

# Possibly remove
packages/shared/              # Merge into sdk or frontend
packages/temporal-client/     # Merge into frontend/lib
```

## Files to KEEP

```
frontend/                     # Main app
temporal-workers/             # Durable execution
packages/sdk/                 # Evals-as-code
scripts/                      # DB init scripts
docker-compose.yml            # Simplified
```

## New File Structure

```
neon/
├── frontend/                 # Next.js app (UI + API)
│   ├── app/
│   │   ├── api/              # API routes
│   │   │   ├── traces/
│   │   │   ├── scores/
│   │   │   └── evals/
│   │   ├── dashboard/
│   │   ├── evals/
│   │   └── traces/
│   ├── components/
│   ├── hooks/
│   └── lib/
│       ├── clickhouse.ts     # DB client
│       ├── temporal.ts       # Workflow client
│       └── types.ts
│
├── temporal-workers/         # Temporal workflows
│   ├── src/
│   │   ├── workflows/
│   │   ├── activities/
│   │   └── worker.ts
│   └── Dockerfile
│
├── packages/
│   └── sdk/                  # @neon/sdk
│       ├── src/
│       │   ├── index.ts
│       │   ├── test.ts
│       │   ├── scorers/
│       │   └── cli.ts
│       └── package.json
│
├── scripts/
│   └── init-clickhouse.sql
│
├── docker-compose.yml        # ClickHouse + Temporal + Postgres
└── README.md
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Trace insert latency | < 5ms |
| Dashboard load time | < 200ms |
| Eval startup time | < 1s |
| SDK install size | < 5MB |
| Time to first eval (new user) | < 5 minutes |

---

## Dependencies to Add

```json
// frontend/package.json
{
  "dependencies": {
    "@clickhouse/client": "^1.0.0",
    "@temporalio/client": "^1.9.0",
    "uuid": "^9.0.0",
    "zod": "^3.22.0"
  }
}
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| ClickHouse learning curve | Use simple schema, avoid complex features initially |
| Temporal complexity | Start with basic workflows, add signals/queries later |
| Breaking existing users | There are no users yet - clean slate |
| Scope creep | Strict 2-week timebox, ship MVP then iterate |
