# /task-breakdown

**Stage 2 Skill: Roadmap-to-Tasks Decomposition**

## Purpose

Break down roadmap phases into atomic, agent-executable tasks with clear scope, dependencies, and acceptance criteria.

## When to Use

- After `/roadmap-sync` generates the roadmap
- When a new phase is added
- To regenerate tasks for a specific phase

## Arguments

```
/task-breakdown [phase-id]
```

- `phase-id` (optional): Generate tasks for specific phase only
- Without argument: Generate tasks for all phases

## Input Sources

- `.project/roadmap.json` - Phase definitions
- `docs/research/02-concept/architecture-spec.md` - Implementation details
- `docs/research/02-concept/scope.md` - Day-by-day breakdown

## Output

Creates individual task files in `.project/tasks/`:
- `{TASK_ID}.json` - One file per task

Updates `.project/task-index.json`:
- Task registry with status
- Dependency graph
- Parallel execution groups

## Task ID Convention

```
{PREFIX}-{NNN}

Prefixes by phase:
- FND-xxx : Foundation (phase-1)
- SCR-xxx : Scorers (phase-2)
- RUN-xxx : Runner/CLI (phase-3)
- API-xxx : API/Auth (phase-4)
- FRN-xxx : Frontend (phase-5)
- CCD-xxx : CI/CD/Deploy (phase-6)
```

## Procedure

1. **Read Roadmap**
   ```
   Read: .project/roadmap.json
   ```

2. **For Each Phase Objective**
   - Parse into atomic tasks (1-4 hours each)
   - Identify file scope
   - Determine dependencies within phase
   - Map acceptance criteria

3. **Parse Architecture Spec for Details**
   - Match objectives to code specifications
   - Extract schema definitions
   - Identify API endpoints
   - Note test requirements

4. **Generate Task Files**
   For each task, create `.project/tasks/{ID}.json`:
   ```json
   {
     "id": "SCR-001",
     "title": "Implement ToolSelectionScorer",
     "description": "Create scorer that evaluates tool selection quality",
     "phase_id": "phase-2-scorers",
     "type": "implementation",
     "status": "pending",
     "scope": {
       "primary_files": ["api/src/scorers/tool_selection.py"],
       "test_files": ["api/tests/scorers/test_tool_selection.py"],
       "related_files": ["api/src/scorers/base.py", "api/src/models/eval.py"]
     },
     "dependencies": {
       "blocked_by": ["FND-005"],
       "blocks": ["RUN-001"],
       "parallel_with": ["SCR-002", "SCR-003"]
     },
     "acceptance_criteria": [
       "Extends Scorer base class",
       "score() method returns ScorerResult",
       "Handles expected_tools matching",
       "Handles expected_tool_sequence matching",
       "Unit tests cover: exact match, partial match, sequence validation",
       "make lint && make typecheck passes"
     ],
     "context": {
       "research_refs": [
         "docs/research/02-concept/architecture-spec.md#scorers"
       ],
       "code_refs": [
         "api/src/scorers/base.py:Scorer",
         "api/src/models/eval.py:ScorerType"
       ]
     },
     "estimated_hours": 4,
     "created_at": "2026-01-19T00:00:00Z"
   }
   ```

5. **Build Dependency Graph**
   - Analyze blocked_by relationships
   - Compute transitive dependencies
   - Identify parallel execution groups

6. **Update Task Index**
   ```json
   {
     "tasks": {
       "SCR-001": {
         "file": "tasks/SCR-001.json",
         "status": "pending",
         "phase_id": "phase-2-scorers"
       }
     },
     "dependency_graph": {
       "SCR-001": ["FND-005"],
       "RUN-001": ["SCR-001", "SCR-002", "SCR-003"]
     },
     "parallel_groups": [
       ["SCR-001", "SCR-002", "SCR-003"],
       ["API-001", "API-002"]
     ],
     "ready_tasks": ["FND-001", "FND-002"]
   }
   ```

## Task Granularity Guidelines

Good task:
- Single responsibility
- 1-4 hours of work
- Clear file scope (1-3 primary files)
- Testable acceptance criteria

Split if:
- More than 5 primary files
- Multiple unrelated concerns
- Estimated > 4 hours

Merge if:
- < 30 minutes
- Tightly coupled with another task
- Same file, same concern

## Validation

After generation, verify:
- [ ] All phase objectives covered by tasks
- [ ] No orphan tasks (missing phase_id)
- [ ] Dependencies form a DAG (no cycles)
- [ ] All blocked_by references exist
- [ ] Ready tasks have no pending dependencies

## Integration with Other Skills

- **Input from**: `/roadmap-sync`
- **Output used by**: `/alignment-check`, `/worktree`, `/task-start`
