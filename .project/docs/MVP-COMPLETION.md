# MVP Completion Plan

## Goal

Ship a fully functional agent evaluation platform by completing the remaining frontend work and ensuring end-to-end functionality.

---

## Current MVP Status

### Completed (Phases 1-4)
- [x] FastAPI project structure
- [x] PostgreSQL schema + migrations
- [x] Pydantic models
- [x] MLflow integration
- [x] ToolSelectionScorer, ReasoningScorer, GroundingScorer
- [x] Eval runner with MLflow tracing
- [x] CLI: run, compare, suite commands
- [x] Full API with auth + rate limiting
- [x] TypeScript types + API client
- [x] React Query hooks
- [x] Base UI components

### In Progress (Phase 5 - Frontend)
- [x] Dashboard: Summary stats
- [x] Dashboard: Recent runs table
- [x] Dashboard: Score trend chart
- [ ] Dashboard: Pass/fail distribution (FE-013)
- [x] Suites: List page with search
- [x] Suites: Detail page with metadata
- [ ] Suites: Cases list within detail (FE-022)
- [ ] Suites: Create form/modal (FE-023)
- [ ] Runs: List page with filters (FE-030)
- [ ] Runs: Detail page (FE-031)
- [ ] Runs: Results table (FE-032)
- [x] Compare: Run selector
- [x] Compare: Results display
- [ ] Compare: Regression highlighting (FE-042)
- [ ] Compare: Improvements section (FE-043)

### Not Started (Phase 6 - CI/CD)
- [ ] GitHub Action
- [ ] Docker Compose refinement
- [ ] Documentation
- [ ] Demo suite

---

## Priority Stack Ranking

Based on user value and dependency chains:

### P0 - Critical Path (Must ship)

| Task | Title | Why Critical |
|------|-------|--------------|
| FE-030 | Runs list page with filters | Core functionality, entry point to results |
| FE-031 | Run detail page | Users need to see what happened |
| FE-032 | Results table with scores | The actual value - seeing scores |
| FE-042 | Regression highlighting | Core differentiator - catch regressions |

### P1 - Important (Should ship)

| Task | Title | Why Important |
|------|-------|---------------|
| FE-022 | Cases list within suite | Complete the suite experience |
| FE-023 | Create suite form | Users need to create suites |
| FE-013 | Pass/fail distribution | Dashboard completeness |
| FE-034 | Trigger run from suite | Core workflow |

### P2 - Nice to Have

| Task | Title | Notes |
|------|-------|-------|
| FE-043 | Improvements section | Polish for compare |
| FE-044 | Side-by-side chart | Visualization nice-to-have |
| FE-033 | Score breakdown per case | Detailed but not critical |

### P3 - Polish (Post-MVP)

| Task | Title | Notes |
|------|-------|-------|
| FE-050 | Loading skeletons | UX polish |
| FE-051 | Error boundaries | Resilience |
| FE-052 | Empty states | UX polish |
| FE-053 | Mobile responsive | Can wait |
| FE-054 | Keyboard navigation | Accessibility |
| FE-055 | Settings page | Can use env vars for now |
| FE-060 | Rebrand to Neon | Marketing |

---

## Execution Plan

### Sprint 1: Core Runs Experience

**Goal:** Users can view run results and understand what happened

Tasks:
1. **FE-030** - Runs list page with status filters
   - Table with run metadata
   - Filter by status (completed, running, failed)
   - Filter by suite
   - Pagination

2. **FE-031** - Run detail page with summary
   - Run metadata (suite, agent version, timestamp)
   - Summary stats (passed/failed/total, avg score)
   - Status indicator

3. **FE-032** - Results table with expandable scores
   - List all case results
   - Show pass/fail per case
   - Expandable to see individual scorer results
   - Score breakdown with values and reasoning

**Definition of Done:**
- User can navigate from dashboard → runs → run detail → case results
- All scores visible with reasoning

### Sprint 2: Suite Management

**Goal:** Users can create and manage eval suites

Tasks:
1. **FE-022** - Cases list within suite detail
   - Table of cases in suite
   - Show case name, expected tools, inputs
   - Link to case detail/edit

2. **FE-023** - Create suite form/modal
   - Suite name, description
   - Add cases inline or separately
   - Validation

3. **FE-034** - Trigger new run from suite
   - "Run" button on suite page
   - Select agent module path
   - Show progress/redirect to run

**Definition of Done:**
- User can create suite → add cases → trigger run → see results

### Sprint 3: Regression Detection

**Goal:** Users can compare runs and catch regressions

Tasks:
1. **FE-042** - Regression highlighting
   - Red highlight on score decreases
   - Show delta values
   - Filter to show only regressions

2. **FE-043** - Improvements section
   - Green highlight on improvements
   - Summary of what got better

3. **FE-013** - Dashboard pass/fail distribution
   - Pie or bar chart by scorer type
   - Click to filter

**Definition of Done:**
- User can compare two runs and immediately see what regressed

### Sprint 4: Polish & Ship

**Goal:** Production-ready MVP

Tasks:
1. **FE-050** - Loading skeletons
2. **FE-051** - Error boundaries
3. **FE-052** - Empty states
4. **Documentation** - README, quickstart
5. **GitHub Action** - CI integration

**Definition of Done:**
- End-to-end demo works
- README quickstart succeeds
- GitHub Action blocks PRs on regression

---

## Technical Debt to Address

### Before MVP Ship
- [ ] Remove mock data from new pages (traces, workflows, analytics)
- [ ] Either integrate or archive new pages
- [ ] Ensure all API calls have error handling
- [ ] Add loading states to all data fetches

### After MVP Ship (Phase B prep)
- [ ] Abstract data layer for future ClickHouse migration
- [ ] Design OTel ingestion API contract
- [ ] Evaluate Temporal complexity vs value

---

## Files to Archive

The following were created for the MooseStack/Temporal refactor but are not needed for MVP:

```
moose-app/                    # Archive - not wired up
temporal-workers/             # Archive - not wired up
packages/sdk/                 # Archive - future phase
packages/shared/              # Archive - future phase
packages/temporal-client/     # Archive - future phase

frontend/app/traces/          # Archive or convert to mock page
frontend/app/workflows/       # Archive or convert to mock page
frontend/app/analytics/       # Keep but mark as "coming soon"
frontend/server/trpc/         # Archive - not using tRPC currently
frontend/hooks/use-traces.ts  # Archive
frontend/hooks/use-workflows.ts  # Archive
frontend/components/traces/   # Archive
frontend/components/workflows/ # Archive
```

**Recommendation:** Move to `_archive/` directory rather than delete, so we can reference later.

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Scope creep | Strict P0/P1 focus, P2+ is post-MVP |
| Integration issues | Daily manual E2E testing |
| API changes | Frontend/backend in same repo |
| MLflow limitations | Document workarounds, plan Phase B |

---

## Success Criteria

MVP is complete when:

1. [ ] User can create a suite with cases
2. [ ] User can trigger a run against an agent
3. [ ] User can view run results with scores
4. [ ] User can compare two runs
5. [ ] Regressions are highlighted clearly
6. [ ] Dashboard shows summary metrics
7. [ ] GitHub Action works in CI
8. [ ] README quickstart works end-to-end
9. [ ] No critical bugs in core workflows
