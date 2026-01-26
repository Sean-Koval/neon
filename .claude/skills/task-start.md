# /task-start

**Stage 3 Skill: Begin Task Implementation**

## Purpose

Start working on a task by creating a worktree (if needed) and loading the task context into the session. This is the primary entry point for implementation work.

## Usage

```
/task-start <task-id>
/task-start next              # Start next ready task
/task-start --list-ready      # Show ready tasks
```

## Procedure

### 1. Select Task

If `next`:
- Read `.project/task-index.json`
- Get first task from `ready_tasks`
- Prefer tasks in current phase

If `--list-ready`:
- Show all ready tasks grouped by phase
- Include estimated hours and dependencies

### 2. Validate Prerequisites

```
Read: .project/tasks/{task-id}.json
Verify: status == "pending" or "ready"
Verify: all blocked_by are "completed"
```

If blocked:
```
Task {task-id} is blocked by:
  - SCR-001 (in_progress)
  - SCR-002 (pending)

Run /task-start next to start an available task.
```

### 3. Create or Enter Worktree

If worktree doesn't exist:
```
/worktree create {task-id}
```

If worktree exists:
```
cd /home/seanm/repos/neon-task-{task-id}
```

### 4. Load Task Context

Read and display:
- Task description and acceptance criteria
- Primary files to create/modify
- Related files for reference
- Research references
- Code references

```
Starting task: SCR-001 - Implement ToolSelectionScorer

Phase: phase-2-scorers
Estimated: 4 hours

Description:
  Create scorer that evaluates tool selection quality against expected tools.

Files to create/modify:
  api/src/scorers/tool_selection.py (primary)
  api/tests/scorers/test_tool_selection.py (test)

Reference files (read-only context):
  api/src/scorers/base.py - Base Scorer class
  api/src/models/eval.py - EvalCase model with expected_tools

Research context:
  docs/research/02-concept/architecture-spec.md (lines 19-42)

Acceptance criteria:
  [ ] Extends Scorer base class
  [ ] score() method returns ScorerResult
  [ ] Handles expected_tools matching
  [ ] Handles expected_tool_sequence matching
  [ ] Unit tests cover: exact match, partial match, sequence validation
  [ ] make lint && make typecheck passes

When finished: /task-complete
```

### 5. Update State

Update `.project/tasks/{task-id}.json`:
```json
{
  "status": "in_progress",
  "started_at": "2026-01-19T00:00:00Z"
}
```

Update `.project/state.json`:
```json
{
  "active_tasks": ["{task-id}"]
}
```

## Parallel Task Start

For tasks in `parallel_with`, can start multiple:

```
/task-start SCR-001 SCR-002 SCR-003
```

Creates separate worktrees for each:
```
neon-task-SCR-001/
neon-task-SCR-002/
neon-task-SCR-003/
```

## Integration

- **Invokes**: `/worktree create`
- **Output used by**: Claude agent working on task
- **Followed by**: `/task-complete`
