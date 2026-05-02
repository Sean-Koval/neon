# Test

- type: epic
- priority: 2

Test preamble.

---

## Test Issue With Full Body

- type: task
- priority: 2
- labels: frontend, redesign
- estimate: 360

Build the Agent Graph view as a new tab on the trace detail page using @xyflow/react.

**Wireframe:** `frontend/branding/wireframes/traces/detail.txt` (510 lines)

**Key files:**
- Create: `frontend/components/traces/agent-graph.tsx`
- Modify: `frontend/app/traces/[id]/page.tsx`

**Requirements:**

1. New tab view using `@xyflow/react` library
2. Node types: agent decisions (blue), LLM calls (purple), tool calls (amber)
3. Edges show data flow between spans
4. Color by status: green (success), red (error), amber (slow)
5. Click node → open span detail panel
6. Auto-layout using dagre algorithm
7. Auto-select this view when trace has 2+ agents

### Acceptance Criteria
- Graph tab renders an interactive directed graph
- 3 distinct node types with correct colors
- Clicking a node opens span detail panel
