# /roadmap-sync

**Stage 2 Skill: Research-to-Roadmap Synchronization**

## Purpose

Parse research documentation and generate/update the project roadmap with phases, objectives, and success criteria.

## When to Use

- After completing research phase (Stage 1)
- When research documents are updated
- To regenerate roadmap from source of truth

## Input Sources

The skill reads from:
- `docs/research/README.md` - Project overview and timeline
- `docs/research/02-concept/scope.md` - MVP scope and build plan
- `docs/research/02-concept/architecture-spec.md` - Technical specifications
- `docs/research/BUILD-READY.md` - Implementation summary

## Output

Updates `.project/roadmap.json` with:
- Phases extracted from scope document
- Objectives mapped to success criteria
- Dependencies between phases
- Research references for traceability

## Procedure

1. **Read Research Documents**
   ```
   Read: docs/research/02-concept/scope.md
   Read: docs/research/BUILD-READY.md
   Read: docs/research/02-concept/architecture-spec.md
   ```

2. **Extract Phases**
   - Parse "MVP Build Plan" section for day-by-day breakdown
   - Each day becomes a phase
   - Extract checklist items as objectives

3. **Map Success Criteria**
   - Parse "MVP Success Criteria" section
   - Match criteria to relevant phases
   - Add as `success_criteria` array

4. **Identify Dependencies**
   - Phases are sequential by default (Day N depends on Day N-1)
   - Look for explicit dependencies in architecture spec

5. **Generate Roadmap JSON**
   ```json
   {
     "project": "neon",
     "version": "mvp",
     "phases": [
       {
         "id": "phase-1-foundation",
         "name": "Foundation",
         "objectives": ["..."],
         "success_criteria": ["..."],
         "depends_on": [],
         "research_refs": ["docs/research/..."]
       }
     ]
   }
   ```

6. **Write Output**
   - Write to `.project/roadmap.json`
   - Update `.project/state.json` stage to "planning"
   - Log changes to `.project/changelog.md` (if exists)

## Validation

After generation, verify:
- [ ] All phases have unique IDs
- [ ] No circular dependencies
- [ ] All research refs point to existing files
- [ ] Phase count matches scope document

## Example Output

```json
{
  "project": "neon",
  "version": "mvp",
  "generated_at": "2026-01-19T00:00:00Z",
  "source_research": [
    "docs/research/02-concept/scope.md",
    "docs/research/BUILD-READY.md"
  ],
  "phases": [
    {
      "id": "phase-1-foundation",
      "name": "Foundation",
      "description": "Project setup, data models, database schema, MLflow integration spike",
      "status": "not_started",
      "objectives": [
        "Project setup (FastAPI, Postgres, Next.js scaffolding)",
        "Data models (Suite, Case, Run, Result)",
        "Database schema and migrations",
        "MLflow integration spike"
      ],
      "success_criteria": [
        "API server starts",
        "Database migrations run",
        "Can create eval suite"
      ],
      "depends_on": [],
      "research_refs": [
        "docs/research/02-concept/architecture-spec.md",
        "docs/research/BUILD-READY.md"
      ]
    }
  ]
}
```

## Integration with Other Skills

- **Output used by**: `/task-breakdown` to generate individual tasks
- **Triggers**: `/alignment-check` to validate roadmap-task consistency
