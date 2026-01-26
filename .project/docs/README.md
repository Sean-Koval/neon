# Neon Project Documentation

## Strategic Decision

**We are pursuing a phased evolution strategy**, completing the MLflow-based MVP first, then incrementally adding observability (ClickHouse) and durable execution (Temporal).

This decision was made on 2026-01-25 after assessing the hybrid state of the codebase.

---

## Document Index

| Document | Purpose |
|----------|---------|
| [VISION.md](./VISION.md) | Product vision, three horizons, architecture evolution |
| [MVP-COMPLETION.md](./MVP-COMPLETION.md) | Priority-ranked tasks to complete Horizon 1 |
| [PHASE-B-OBSERVABILITY.md](./PHASE-B-OBSERVABILITY.md) | Technical plan for adding ClickHouse + OTel |
| [PHASE-C-DURABLE-EXECUTION.md](./PHASE-C-DURABLE-EXECUTION.md) | Technical plan for adding Temporal |
| [CLEANUP-PLAN.md](./CLEANUP-PLAN.md) | How to archive premature refactor code |
| [frontend-design-spec.md](./frontend-design-spec.md) | UI/UX design specifications |
| [ui-design-system.md](./ui-design-system.md) | Component design system |

---

## Three Horizons

```
              NOW                    Q2-Q3 2026              Q4 2026+
               │                         │                       │
               ▼                         ▼                       ▼
┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│   HORIZON 1: EVAL    │   │ HORIZON 2: OBSERVE   │   │ HORIZON 3: OPS       │
│                      │   │                      │   │                      │
│  • Test suites       │   │  • OTel ingestion    │   │  • Temporal workflows│
│  • Scorers           │──▶│  • ClickHouse        │──▶│  • Human-in-loop     │
│  • Regression detect │   │  • Trace explorer    │   │  • A/B testing       │
│  • CI/CD gates       │   │  • Cost tracking     │   │  • Managed execution │
│                      │   │                      │   │                      │
│  Tech: MLflow        │   │  Tech: +ClickHouse   │   │  Tech: +Temporal     │
└──────────────────────┘   └──────────────────────┘   └──────────────────────┘
```

---

## Current Status

### Completed
- ✅ Phase 1: Foundation (FastAPI, PostgreSQL, models)
- ✅ Phase 2: Scorers (ToolSelection, Reasoning, Grounding)
- ✅ Phase 3: Eval Runner & CLI
- ✅ Phase 4: API & Authentication

### In Progress
- 🔄 Phase 5: Frontend Dashboard (60% complete)
  - Dashboard, suites list, compare done
  - Runs pages, regression highlighting needed

### Blocked/Archived
- ⏸️ MooseStack/Temporal code (created but not wired - archive)

### Future
- ⬜ Phase 6: CI/CD & Deployment
- ⬜ Phase 7: Cleanup & Archive
- ⬜ Phase B: Observability (ClickHouse, OTel)
- ⬜ Phase C: Durable Execution (Temporal)

---

## Immediate Next Steps

1. **Archive premature refactor code** (see [CLEANUP-PLAN.md](./CLEANUP-PLAN.md))
2. **Complete MVP frontend tasks** (see [MVP-COMPLETION.md](./MVP-COMPLETION.md))
   - FE-030: Runs list page
   - FE-031: Run detail page
   - FE-032: Results table
   - FE-042: Regression highlighting
3. **Ship MVP to internal users**
4. **Gather feedback, plan Phase B**

---

## Key Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Phased evolution, not big bang | Lower risk, continuous delivery |
| 2 | Keep MLflow for Horizon 1 | Working, battle-tested |
| 3 | Archive refactor code to `_archive/` | Focus codebase, preserve for later |
| 4 | ClickHouse for Phase B | Scale for production traces |
| 5 | Temporal for Phase C | Durable execution, human-in-loop |

---

## File Locations

```
.project/
├── docs/
│   ├── README.md              # This file
│   ├── VISION.md              # Product vision
│   ├── MVP-COMPLETION.md      # MVP task priorities
│   ├── PHASE-B-OBSERVABILITY.md
│   ├── PHASE-C-DURABLE-EXECUTION.md
│   ├── CLEANUP-PLAN.md
│   ├── frontend-design-spec.md
│   └── ui-design-system.md
├── tasks/                     # Individual task definitions
├── task-index.json            # Task registry with dependencies
├── roadmap.json               # Phase definitions and timeline
├── state.json                 # Current project state
└── LIFECYCLE.md               # Task workflow documentation
```
