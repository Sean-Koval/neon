# Neon: Product Vision & Strategy

## Executive Summary

**Decision: Phased Evolution, Not Big Bang Migration**

We will complete the MLflow-based MVP first, then evolve the architecture incrementally. This de-risks the migration while ensuring we ship a working product.

---

## Current State Assessment

### What We Have (Working)
- **Backend:** Python FastAPI + PostgreSQL + MLflow 3.7+ tracing
- **Frontend:** Next.js 16 with React 19, ~60% complete
- **Scorers:** ToolSelection, Reasoning, Grounding - all working
- **API:** Full CRUD for suites, cases, runs with auth
- **Progress:** 30/50 tasks completed, 17 ready to start

### What Was Created (Not Wired)
- `moose-app/` - MooseStack data layer (ClickHouse tables, streaming)
- `temporal-workers/` - Temporal workflows for durable execution
- `packages/sdk/` - TypeScript SDK for evals-as-code
- New frontend pages: `/traces`, `/workflows`, `/analytics` (mock data only)

### The Problem
We started a major refactor mid-stream. Now we have:
- Working but incomplete MLflow system
- Partially built MooseStack/Temporal system that doesn't function
- Mixed frontend with old pages (working) and new pages (mock data)

---

## Strategic Decision

### Why NOT Big Bang Migration

1. **Ship beats perfect** - A working product on MLflow > half-built product on fancy infra
2. **Operational complexity** - MooseStack adds ClickHouse + Redpanda + Temporal = 3 new services
3. **MLflow isn't broken** - It works, it's battle-tested, has community support
4. **Risk** - Big migrations fail more often than incremental ones
5. **Learning** - We need real users to know what features actually matter

### Why Phased Evolution

1. **Continuous delivery** - Ship value every phase
2. **De-risk** - Test new components in parallel with working system
3. **Reversible** - Can stop migration at any phase if priorities change
4. **Operational learning** - Learn to operate new infra before depending on it

---

## Product Vision: Three Horizons

### Horizon 1: Agent Eval Platform (NOW → Q1 2026)
> "The best way to test your AI agents"

**Target User:** ML engineers building tool-using agents
**Core Value:** Catch regressions before they hit production

Features:
- Define eval suites with test cases
- Run evaluations with custom scorers (tool selection, reasoning, grounding)
- Compare runs to detect regressions
- CI/CD integration (GitHub Action)
- Dashboard for viewing results

**Tech:** MLflow + PostgreSQL + FastAPI + Next.js

### Horizon 2: Agent Observability Platform (Q2-Q3 2026)
> "See what your agents are actually doing"

**Target User:** Teams running agents in production
**Core Value:** Understand agent behavior at scale

New Features:
- OTel trace ingestion from external agents (BYOA mode)
- Real-time trace visualization with span trees
- Token usage and cost tracking
- Performance analytics
- Alerting on anomalies

**Tech:** Add ClickHouse for trace storage, keep MLflow for evals

### Horizon 3: Agent Ops Platform (Q4 2026+)
> "The complete platform for agent lifecycle management"

**Target User:** Organizations with multiple agents in production
**Core Value:** Build, test, deploy, and monitor agents in one place

New Features:
- Managed agent execution with Temporal
- Human-in-the-loop approval workflows
- A/B testing for agent versions
- Automated optimization suggestions
- Multi-tenant with team workspaces

**Tech:** Full MooseStack + Temporal + ClickHouse

---

## Architecture Evolution

### Phase A: MVP on MLflow (Current)

```
┌─────────────────────────────────────────────────────────┐
│                     NEON MVP                             │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐  │
│  │   Next.js    │───▶│   FastAPI    │───▶│ PostgreSQL│  │
│  │   Frontend   │    │   Backend    │    │           │  │
│  └──────────────┘    └──────────────┘    └───────────┘  │
│                             │                            │
│                             ▼                            │
│                      ┌──────────────┐                   │
│                      │    MLflow    │                   │
│                      │   Tracing    │                   │
│                      └──────────────┘                   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Phase B: Add Observability Layer

```
┌─────────────────────────────────────────────────────────┐
│                  NEON + OBSERVABILITY                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐  │
│  │   Next.js    │───▶│   FastAPI    │───▶│ PostgreSQL│  │
│  │   Frontend   │    │   Backend    │    │  (evals)  │  │
│  └──────────────┘    └──────────────┘    └───────────┘  │
│         │                   │                            │
│         │                   ▼                            │
│         │            ┌──────────────┐                   │
│         │            │    MLflow    │                   │
│         │            └──────────────┘                   │
│         │                                                │
│         │   ┌────────────────────────────────────────┐  │
│         │   │         NEW: OTel Ingestion            │  │
│         │   │                                        │  │
│         └──▶│  External ──▶ OTel ──▶ ClickHouse     │  │
│             │  Agents       API       (traces)       │  │
│             │                                        │  │
│             └────────────────────────────────────────┘  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Phase C: Durable Evaluations

```
┌─────────────────────────────────────────────────────────┐
│              NEON + DURABLE EXECUTION                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐  │
│  │   Next.js    │───▶│   FastAPI    │───▶│ PostgreSQL│  │
│  │   Frontend   │    │   Backend    │    │           │  │
│  └──────────────┘    └──────────────┘    └───────────┘  │
│         │                   │                            │
│         │                   ▼                            │
│         │   ┌────────────────────────────────────────┐  │
│         │   │          NEW: Temporal                 │  │
│         │   │                                        │  │
│         └──▶│  Eval Runs ──▶ Temporal ──▶ Workers   │  │
│             │  (durable)     Server      (scorers)   │  │
│             │                                        │  │
│             └────────────────────────────────────────┘  │
│                        │                                 │
│                        ▼                                 │
│              ┌──────────────────┐                       │
│              │    ClickHouse    │                       │
│              │ (traces + scores)│                       │
│              └──────────────────┘                       │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Success Metrics

### Horizon 1 (MVP)
- [ ] 100% of frontend tasks complete
- [ ] End-to-end demo working
- [ ] GitHub Action blocks regressions
- [ ] 3 internal teams using it

### Horizon 2 (Observability)
- [ ] Accept OTel traces from external agents
- [ ] <100ms p99 trace ingestion latency
- [ ] Dashboard shows real production traces
- [ ] Cost tracking accurate within 5%

### Horizon 3 (Agent Ops)
- [ ] Temporal workflows running evals
- [ ] Human approval workflows functional
- [ ] A/B tests showing measurable improvements
- [ ] Multi-tenant isolation working

---

## Key Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Migration strategy | Phased evolution | Lower risk, continuous delivery |
| Keep MLflow | Yes, for now | Working, battle-tested |
| ClickHouse timing | Phase B | Need scale for observability |
| Temporal timing | Phase C | Complexity not justified for MVP |
| New frontend pages | Archive for now | Focus on completing MVP pages |

---

## Open Questions

1. **Pricing model** - Per trace? Per seat? Per agent?
2. **Self-hosted vs cloud** - Both? Cloud-first?
3. **SDK languages** - Python only? TypeScript? Both?
4. **MCP integration** - Priority for tool discovery?

---

## Next Steps

1. Archive uncommitted refactor code (moose-app, temporal-workers, packages/sdk)
2. Update `.project/task-index.json` to focus on MVP completion
3. Create Phase B planning when MVP is complete
4. Ship MVP to internal users for feedback
