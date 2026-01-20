# Neon Development Lifecycle

This project uses a **3-stage AI development lifecycle** for structured, traceable development.

## Stage Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│ STAGE 1: RESEARCH                                                   │
│                                                                     │
│ docs/research/                                                      │
│ ├── 00-discovery/     Problem definition, assumptions              │
│ ├── 01-research/      Market, competitors, technical feasibility   │
│ ├── 02-concept/       Architecture, scope, technical decisions     │
│ └── BUILD-READY.md    Implementation summary                       │
│                                                                     │
│ Output: Research documentation                                      │
│ Status: COMPLETE ✓                                                  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STAGE 2: PLANNING                                                   │
│                                                                     │
│ Skills:                                                             │
│   /roadmap-sync     Parse research → generate roadmap.json         │
│   /task-breakdown   Break phases → individual task files           │
│   /alignment-check  Validate roadmap ↔ task consistency            │
│                                                                     │
│ Output:                                                             │
│   .project/roadmap.json       Phases with objectives               │
│   .project/tasks/*.json       Individual task definitions          │
│   .project/task-index.json    Dependency graph                     │
│   .project/concepts/*.json    Data model definitions               │
│                                                                     │
│ Status: IN PROGRESS                                                 │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STAGE 3: IMPLEMENTATION                                             │
│                                                                     │
│ Skills:                                                             │
│   /dispatch         Show/execute parallel task dispatch             │
│   /task-start       Create worktree and begin task                 │
│   /task-complete    Validate, commit, create PR                    │
│   /worktree         Manage git worktrees                           │
│                                                                     │
│ Workflow:                                                           │
│   1. /dispatch --execute    Create worktrees for ready tasks       │
│   2. cd ../neon-task-XXX    Enter worktree                         │
│   3. claude                 Start agent session                    │
│   4. /task-complete         Finish and create PR                   │
│                                                                     │
│ Status: NOT STARTED                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### View Current State
```bash
cat .project/state.json
cat .project/task-index.json | jq '.ready_tasks'
```

### Start First Task
```bash
./scripts/worktree/wt.sh create FND-001
cd ../neon-task-FND-001
claude
```

### Check Progress
```bash
./scripts/worktree/wt.sh list
./scripts/worktree/wt.sh ready
```

### Complete Task
```bash
./scripts/worktree/wt.sh finish FND-001
```

## Directory Structure

```
neon/
├── .project/                   # Project management (Stage 2-3)
│   ├── schema.json             # JSON Schema definitions
│   ├── state.json              # Current project state
│   ├── roadmap.json            # Phases from research
│   ├── task-index.json         # Task registry + dependencies
│   ├── tasks/                  # Individual task files
│   │   ├── FND-001.json
│   │   ├── SCR-001.json
│   │   └── ...
│   ├── concepts/               # Data model definitions
│   │   ├── eval-suite.json
│   │   └── scorer.json
│   └── LIFECYCLE.md            # This file
│
├── .claude/
│   └── skills/                 # Skill definitions
│       ├── roadmap-sync.md     # Stage 2
│       ├── task-breakdown.md   # Stage 2
│       ├── alignment-check.md  # Stage 2
│       ├── dispatch.md         # Stage 3
│       ├── task-start.md       # Stage 3
│       ├── task-complete.md    # Stage 3
│       └── worktree.md         # Stage 3
│
├── scripts/worktree/           # Worktree management scripts
│   ├── config.sh
│   └── wt.sh
│
└── docs/research/              # Stage 1 (complete)
```

## Task Lifecycle

```
pending → ready → in_progress → completed
   │                   │
   │                   └──→ blocked (if deps change)
   │
   └──→ cancelled
```

### Task States

| State | Description |
|-------|-------------|
| `pending` | Task created, may have unmet dependencies |
| `ready` | All dependencies met, can start |
| `in_progress` | Worktree created, actively working |
| `blocked` | Was ready but dependency changed |
| `completed` | PR created/merged |
| `cancelled` | Removed from scope |

## Parallel Execution

Tasks are designed for parallel execution where dependencies allow:

```
Phase 1: Foundation
├─ FND-001 (start)
│   ├─ FND-002 ──→ FND-003 ──→ FND-004
│   └─ FND-005 (parallel with FND-002/003/004)
│
Phase 2: Scorers (all parallel after FND-005)
├─ SCR-001 ─┐
├─ SCR-002 ─┼──→ RUN-001
└─ SCR-003 ─┘
```

## Git Workflow

Each task gets its own:
- **Branch**: `task/{TASK-ID}` (e.g., `task/SCR-001`)
- **Worktree**: `../neon-task-{TASK-ID}`
- **PR**: Created on completion

This enables:
- Isolated development per task
- Parallel work in multiple terminals
- Clean git history with task references
- Easy rollback per feature
