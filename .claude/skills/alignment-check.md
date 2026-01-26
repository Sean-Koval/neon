# /alignment-check

**Stage 2 Skill: Roadmap-Task Consistency Validation**

## Purpose

Ensure bidirectional consistency between roadmap phases and generated tasks. Validate that all roadmap items have tasks, and all tasks trace back to roadmap objectives.

## When to Use

- After `/task-breakdown` generates tasks
- Before starting implementation (Stage 3)
- Periodically during development to check drift

## Output

Generates `.project/alignment-report.json` with:
- Coverage analysis
- Orphan detection
- Dependency validation
- Parallel execution groups

## Procedure

1. **Load Project Files**
   ```
   Read: .project/roadmap.json
   Read: .project/task-index.json
   Read: .project/tasks/*.json (all task files)
   ```

2. **Coverage Analysis**
   - For each phase, extract objectives
   - Match objectives to tasks by `phase_id`
   - Report: objectives without tasks (gaps)
   - Report: tasks without matching objective (orphans)

3. **Dependency Validation**
   - Build full dependency graph from task files
   - Check for cycles (error if found)
   - Verify all `blocked_by` references exist
   - Compute `blocks` from inverse relationships

4. **Parallel Group Analysis**
   - Identify tasks with no dependencies
   - Group tasks that can run simultaneously
   - Compute critical path

5. **Research Reference Validation**
   - Check all `research_refs` point to existing files
   - Check all `code_refs` reference valid symbols
   - Warn on stale references

6. **Generate Report**
   ```json
   {
     "generated_at": "2026-01-19T00:00:00Z",
     "summary": {
       "status": "valid",
       "issues_found": 2,
       "warnings": 3
     },
     "coverage": {
       "phases_total": 6,
       "phases_with_tasks": 6,
       "objectives_total": 24,
       "objectives_covered": 22,
       "uncovered_objectives": [
         {
           "phase_id": "phase-4-api-auth",
           "objective": "Rate limiting in place"
         }
       ],
       "orphan_tasks": []
     },
     "dependencies": {
       "cycles_detected": false,
       "missing_references": [],
       "parallel_groups": [
         {
           "group_id": 1,
           "tasks": ["SCR-001", "SCR-002", "SCR-003"],
           "reason": "No inter-dependencies, same phase"
         }
       ],
       "critical_path": [
         "FND-001", "FND-005", "SCR-001", "RUN-001", "API-001", "FRN-001", "CCD-001"
       ],
       "estimated_duration_sequential": "48 hours",
       "estimated_duration_parallel": "24 hours"
     },
     "references": {
       "valid_research_refs": 45,
       "invalid_research_refs": [],
       "valid_code_refs": 32,
       "invalid_code_refs": [
         {
           "task_id": "API-003",
           "ref": "api/src/services/mlflow_client.py:MLflowClient",
           "reason": "file_not_found"
         }
       ]
     },
     "recommendations": [
       {
         "type": "gap",
         "message": "Phase 4 objective 'Rate limiting in place' has no tasks",
         "suggestion": "Create task API-010 for rate limiting middleware"
       },
       {
         "type": "warning",
         "message": "Code reference in API-003 points to non-existent file",
         "suggestion": "Update to api/src/services/mlflow/client.py or create file"
       }
     ]
   }
   ```

7. **Output and Actions**
   - Write report to `.project/alignment-report.json`
   - If `issues_found > 0`: print summary and recommendations
   - If `cycles_detected`: ERROR and block Stage 3
   - If valid: update `.project/state.json` to mark planning complete

## Severity Levels

**Errors** (block Stage 3):
- Dependency cycles
- Phases with zero tasks
- Missing task files referenced in index

**Warnings** (proceed with caution):
- Uncovered objectives
- Invalid code references
- Orphan tasks

**Info**:
- Parallel optimization opportunities
- Critical path analysis

## Integration with Other Skills

- **Input from**: `/roadmap-sync`, `/task-breakdown`
- **Required before**: `/worktree`, `/task-start`
- **Triggers**: Marks planning complete, enables Stage 3
