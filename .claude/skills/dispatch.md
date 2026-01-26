# /dispatch

**Stage 3 Skill: Parallel Task Distribution**

## Purpose

Analyze the task graph and dispatch multiple tasks for parallel execution. Optimizes for maximum parallelism while respecting dependencies.

## Usage

```
/dispatch                     # Show dispatch plan
/dispatch --execute           # Create worktrees for all ready tasks
/dispatch --workers 3         # Limit parallel workers
```

## Procedure

### 1. Analyze Task Graph

```
Read: .project/task-index.json
Read: .project/state.json
```

Compute:
- Ready tasks (no pending dependencies)
- Currently active tasks
- Available parallelism

### 2. Generate Dispatch Plan

```
Dispatch Plan
=============

Current state:
  Phase: phase-2-scorers
  Active tasks: 0
  Completed: 12 / 48

Ready for parallel execution:
  Group 1 (Scorers - no dependencies between them):
    - SCR-001: ToolSelectionScorer (4h)
    - SCR-002: ReasoningScorer (4h)
    - SCR-003: GroundingScorer (3h)

  Estimated parallel time: 4 hours
  Estimated sequential time: 11 hours
  Parallelism benefit: 2.75x

Blocked tasks (waiting on ready tasks):
  - RUN-001: blocked by [SCR-001, SCR-002, SCR-003]
  - RUN-002: blocked by [RUN-001]

Recommendation:
  Start all 3 scorer tasks in parallel using separate worktrees.

  Commands:
    /worktree create SCR-001
    /worktree create SCR-002
    /worktree create SCR-003
```

### 3. Execute Dispatch (--execute)

Create all worktrees:
```bash
git worktree add -b task/SCR-001 ../neon-task-SCR-001 main
git worktree add -b task/SCR-002 ../neon-task-SCR-002 main
git worktree add -b task/SCR-003 ../neon-task-SCR-003 main
```

Update all task statuses to `in_progress`.

Output session launch commands:
```
Worktrees created:

  Terminal 1:
    cd /home/seanm/repos/neon-task-SCR-001
    claude --task SCR-001

  Terminal 2:
    cd /home/seanm/repos/neon-task-SCR-002
    claude --task SCR-002

  Terminal 3:
    cd /home/seanm/repos/neon-task-SCR-003
    claude --task SCR-003

Or use tmux:
    ./scripts/dispatch-sessions.sh SCR-001 SCR-002 SCR-003
```

### 4. Worker Limit (--workers N)

If `--workers 3` and 5 tasks ready:
```
Ready tasks: 5
Worker limit: 3
Selected for dispatch: SCR-001, SCR-002, SCR-003

Queued (will dispatch when workers free):
  - FND-010, FND-011
```

Selection priority:
1. Critical path tasks
2. Most blocking tasks (unblock others)
3. Same phase preference
4. Estimated hours (shorter first)

### 5. Progress Tracking

Update `.project/state.json`:
```json
{
  "active_tasks": ["SCR-001", "SCR-002", "SCR-003"],
  "dispatch_batch": {
    "id": "batch-001",
    "started_at": "2026-01-19T00:00:00Z",
    "tasks": ["SCR-001", "SCR-002", "SCR-003"],
    "status": "in_progress"
  }
}
```

### 6. Completion Monitoring

```
/dispatch --status

Batch batch-001 status:

  SCR-001: completed (PR #123)
  SCR-002: in_progress (2 commits)
  SCR-003: in_progress (clean)

  Progress: 1/3 (33%)

  When all complete, these tasks unblock:
    - RUN-001: Eval runner
    - RUN-002: CLI run command
```

## Integration

- **Input from**: `/task-breakdown`, `/alignment-check`
- **Invokes**: `/worktree create` (multiple)
- **Used with**: tmux/terminal multiplexer for parallel sessions
