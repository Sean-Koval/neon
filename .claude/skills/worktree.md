# /worktree

**Stage 3 Skill: Git Worktree Management**

## Purpose

Create, manage, and track git worktrees for parallel task implementation. Each task gets its own worktree for isolated development.

## Commands

```
/worktree create <task-id>   Create worktree for a task
/worktree list               List all active worktrees
/worktree status <task-id>   Show worktree status
/worktree sync <task-id>     Sync with main branch
/worktree finish <task-id>   Finish task and create PR
/worktree remove <task-id>   Remove completed worktree
```

## Worktree Naming Convention

```
Directory: {repo}-task-{task-id}
Branch:    task/{task-id}

Examples:
  neon-task-SCR-001/
  neon-task-FND-003/
```

## /worktree create <task-id>

### Prerequisites
- Task must exist in `.project/tasks/{task-id}.json`
- Task status must be `pending` or `ready`
- All `blocked_by` dependencies must be `completed`

### Procedure

1. **Validate Task**
   ```
   Read: .project/tasks/{task-id}.json
   Verify: status in [pending, ready]
   Verify: all blocked_by tasks are completed
   ```

2. **Create Worktree**
   ```bash
   cd /home/seanm/repos/neon
   git worktree add -b task/{task-id} ../neon-task-{task-id} main
   ```

3. **Update Task File**
   ```json
   {
     "status": "in_progress",
     "started_at": "2026-01-19T00:00:00Z",
     "worktree": {
       "branch": "task/{task-id}",
       "path": "/home/seanm/repos/neon-task-{task-id}",
       "created_at": "2026-01-19T00:00:00Z"
     }
   }
   ```

4. **Update Project State**
   ```json
   {
     "active_tasks": ["...", "{task-id}"],
     "active_worktrees": [
       {
         "task_id": "{task-id}",
         "branch": "task/{task-id}",
         "path": "/home/seanm/repos/neon-task-{task-id}"
       }
     ]
   }
   ```

5. **Create Session File**
   Create `neon-task-{task-id}/.task-session.json`:
   ```json
   {
     "task_id": "{task-id}",
     "started_at": "2026-01-19T00:00:00Z",
     "scope": {
       "primary_files": ["..."],
       "test_files": ["..."]
     },
     "acceptance_criteria": ["..."],
     "context": {
       "research_refs": ["..."],
       "code_refs": ["..."]
     }
   }
   ```

6. **Output Instructions**
   ```
   Worktree created for task {task-id}

   To start working:
     cd /home/seanm/repos/neon-task-{task-id}
     claude

   Task scope:
     Primary files: api/src/scorers/tool_selection.py
     Test files: api/tests/scorers/test_tool_selection.py

   Acceptance criteria:
     - Extends Scorer base class
     - score() method returns ScorerResult
     ...

   When finished:
     /worktree finish {task-id}
   ```

## /worktree list

Lists all active worktrees with status.

```
Active Worktrees:

  task/SCR-001  /home/seanm/repos/neon-task-SCR-001
    Status: in_progress
    Branch: 3 commits ahead of main
    Modified: 2 files

  task/SCR-002  /home/seanm/repos/neon-task-SCR-002
    Status: in_progress
    Branch: 1 commit ahead of main
    Modified: 0 files (clean)
```

## /worktree finish <task-id>

### Procedure

1. **Validate Completion**
   - Run acceptance criteria checks
   - Run `make lint && make typecheck`
   - Run relevant tests

2. **Commit Changes**
   ```bash
   cd /home/seanm/repos/neon-task-{task-id}
   git add .
   git commit -m "{task-id}: {task-title}"
   ```

3. **Push and Create PR**
   ```bash
   git push -u origin task/{task-id}
   gh pr create --title "{task-id}: {task-title}" --body "..."
   ```

4. **Update Task File**
   ```json
   {
     "status": "completed",
     "completed_at": "2026-01-19T00:00:00Z",
     "pr": {
       "number": 123,
       "url": "https://github.com/...",
       "status": "open"
     }
   }
   ```

5. **Notify Blocked Tasks**
   - For each task in `blocks`: check if now ready
   - Update `ready_tasks` in task-index.json

## /worktree sync <task-id>

Syncs worktree with latest main branch.

```bash
cd /home/seanm/repos/neon-task-{task-id}
git fetch origin main
git rebase origin/main
```

## /worktree remove <task-id>

Removes completed worktree after PR merge.

```bash
git worktree remove ../neon-task-{task-id}
git branch -d task/{task-id}
```

## Integration with Other Skills

- **Input from**: `/task-breakdown` (task definitions)
- **Used by**: `/task-start`, `/task-complete`
- **Triggers**: PR creation workflow
