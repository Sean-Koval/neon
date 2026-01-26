# /task-complete

**Stage 3 Skill: Complete Task and Create PR**

## Purpose

Finish a task by validating acceptance criteria, committing changes, creating a pull request, and updating project state.

## Usage

```
/task-complete [task-id]
/task-complete --skip-checks   # Skip validation (not recommended)
```

If `task-id` not provided, uses current worktree's task.

## Procedure

### 1. Identify Task

If in worktree:
```
Read: .task-session.json
Extract: task_id
```

Otherwise: use provided `task-id`

### 2. Validate Acceptance Criteria

For each criterion in task file:

**Automated checks:**
```bash
# Code quality
make lint
make typecheck

# Tests pass
make test-api  # or relevant test command

# Files exist
ls api/src/scorers/tool_selection.py
ls api/tests/scorers/test_tool_selection.py
```

**Manual verification prompts:**
```
Acceptance Criteria Checklist:

[x] Extends Scorer base class
    Verified: class ToolSelectionScorer(Scorer) found

[x] score() method returns ScorerResult
    Verified: return type annotation present

[x] Handles expected_tools matching
    Verified: _match_expected_tools() implemented

[x] Handles expected_tool_sequence matching
    Verified: _match_tool_sequence() implemented

[x] Unit tests cover scenarios
    Verified: 8 test cases found

[x] make lint && make typecheck passes
    Verified: exit code 0
```

If checks fail:
```
Task completion blocked:

Failed checks:
  - make typecheck: 2 errors in tool_selection.py
  - Missing test for partial match scenario

Fix issues and run /task-complete again.
```

### 3. Commit Changes

```bash
cd /home/seanm/repos/neon-task-{task-id}

# Stage all changes
git add .

# Create commit with conventional format
git commit -m "feat(scorers): implement ToolSelectionScorer

- Add ToolSelectionScorer class extending base Scorer
- Implement expected_tools and expected_tool_sequence matching
- Add 8 unit tests covering match scenarios
- Integrate with scorer registry

Task: SCR-001
"
```

### 4. Push and Create PR

```bash
git push -u origin task/{task-id}

gh pr create \
  --title "SCR-001: Implement ToolSelectionScorer" \
  --body "$(cat <<'EOF'
## Summary

Implements the ToolSelectionScorer for evaluating agent tool selection quality.

## Changes

- `api/src/scorers/tool_selection.py`: New scorer implementation
- `api/tests/scorers/test_tool_selection.py`: Unit tests

## Task Reference

Task: SCR-001
Phase: phase-2-scorers

## Acceptance Criteria

- [x] Extends Scorer base class
- [x] score() method returns ScorerResult
- [x] Handles expected_tools matching
- [x] Handles expected_tool_sequence matching
- [x] Unit tests pass
- [x] Lint and type checks pass

## Testing

```bash
make test-api
make lint
make typecheck
```
EOF
)"
```

### 5. Update Task State

Update `.project/tasks/{task-id}.json`:
```json
{
  "status": "completed",
  "completed_at": "2026-01-19T00:00:00Z",
  "pr": {
    "number": 123,
    "url": "https://github.com/user/neon/pull/123",
    "status": "open"
  }
}
```

### 6. Update Dependency Graph

For each task in `blocks`:
- Check if all `blocked_by` are now completed
- If yes, add to `ready_tasks` in task-index.json

```
Task SCR-001 completed!

Unblocked tasks:
  - RUN-001: Implement eval runner (now ready)
  - RUN-002: CLI run command (still blocked by RUN-001)

PR created: https://github.com/user/neon/pull/123

Next ready tasks:
  - SCR-002: ReasoningScorer (parallel with SCR-001)
  - SCR-003: GroundingScorer (parallel with SCR-001)
  - RUN-001: Eval runner (unblocked by SCR-001)
```

### 7. Cleanup Option

```
Keep worktree for PR review? [Y/n]
```

If no:
```bash
git worktree remove ../neon-task-{task-id}
```

## Integration

- **Input from**: `/task-start`
- **Invokes**: `/worktree finish` (internally)
- **Triggers**: Dependency graph update, next task suggestions
