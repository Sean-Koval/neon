# /wt - Worktree Management

Execute git worktree operations for task-based development.

## Usage

```
/wt create <task-id>    Create worktree for task
/wt list                List active worktrees
/wt status <task-id>    Show worktree status
/wt finish <task-id>    Complete task and create PR
/wt remove <task-id>    Remove worktree
/wt ready               Show tasks ready to start
```

## Execution

When this skill is invoked, execute the corresponding shell command:

### /wt create <task-id>

```bash
./scripts/worktree/wt.sh create <task-id>
```

After execution:
1. Read the created `.project/tasks/<task-id>.json` to show task context
2. Display the acceptance criteria
3. Show the command to enter the worktree

### /wt list

```bash
./scripts/worktree/wt.sh list
```

### /wt status <task-id>

```bash
./scripts/worktree/wt.sh status <task-id>
```

### /wt finish <task-id>

```bash
./scripts/worktree/wt.sh finish <task-id>
```

After execution, update the task-index.json to reflect:
- Task status changed to `completed`
- Any newly unblocked tasks added to `ready_tasks`

### /wt remove <task-id>

```bash
./scripts/worktree/wt.sh remove <task-id>
```

### /wt ready

```bash
./scripts/worktree/wt.sh ready
```

Also show from task-index.json:
- Which tasks can run in parallel
- Estimated hours for ready tasks

## Example Session

User: `/wt create SCR-001`

Agent executes:
```bash
./scripts/worktree/wt.sh create SCR-001
```

Then reads task file and responds:
```
Worktree created for SCR-001: Implement ToolSelectionScorer

Path: /home/seanm/repos/neon-task-SCR-001
Branch: task/SCR-001

To start working:
  cd /home/seanm/repos/neon-task-SCR-001

Acceptance Criteria:
  - Extends Scorer base class
  - score() method returns ScorerResult with score 0-1
  - Evaluates expected_tools against actual tools_called
  - Unit tests pass
  - make lint && make typecheck passes

Key files to create/modify:
  - api/src/scorers/tool_selection.py (primary)
  - api/tests/scorers/test_tool_selection.py (tests)

Reference:
  - api/src/scorers/base.py (Scorer base class)
  - docs/research/02-concept/architecture-spec.md

When done: /wt finish SCR-001
```
