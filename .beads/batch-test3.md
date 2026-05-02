# Test

- type: epic
- priority: 2

Test preamble.

---

## Test Issue Direct Description

- type: task
- priority: 2
- labels: frontend
- estimate: 360

### Description

Build the Agent Graph view as a new tab on the trace detail page using @xyflow/react.

**Wireframe:** `frontend/branding/wireframes/traces/detail.txt`

**Key files:** Create `frontend/components/traces/agent-graph.tsx`, modify `frontend/app/traces/[id]/page.tsx`

**Requirements:** (1) New tab view using @xyflow/react. (2) Node types: agent decisions blue, LLM calls purple, tool calls amber. (3) Auto-layout using dagre. (4) Auto-select for multi-agent traces.

### Acceptance Criteria
- Graph renders interactive DAG
- Clicking node opens span detail
