# Traces List Page Enhancements

- type: epic
- priority: 1
- labels: frontend, ux, traces


Enhance the traces list page (`/traces`) with summary stat cards, advanced filtering, bulk actions, badges, cost visibility, and trace-to-test-case conversion. These changes transform the page from a basic table into a full observability hub.

**Wireframe:** `frontend/branding/wireframes/traces/index.txt` (452 lines)

**Current state:** Basic trace table with simple search. Missing stat cards, advanced filters, bulk actions, badges, cost column, and test case creation.

**Key files:**
- `frontend/app/traces/page.tsx` — main traces list page
- `frontend/app/traces/loading.tsx` — loading skeleton
- `frontend/components/traces/` — trace-related components

---
## Add trace summary stat cards

- type: task
- priority: 1
- labels: frontend, ux, traces
- estimate: 180

### Description


Add 4 summary stat cards above the filters on the traces list page: Total Traces, Error Rate, Avg Duration, and Avg Cost. Each card includes a 7-day sparkline for trend context.

**Wireframe:** `frontend/branding/wireframes/traces/index.txt` — stat cards section at top of page

**Requirements**

1. **4 stat cards** rendered in a responsive grid above the existing filters:
   - **Total Traces**: Count of traces in current filter window, 7-day sparkline showing daily counts
   - **Error Rate**: Percentage of traces with error status, 7-day sparkline showing daily error rates
   - **Avg Duration**: Mean trace duration formatted as human-readable (e.g., "1.2s"), 7-day sparkline showing daily averages
   - **Avg Cost**: Mean cost per trace formatted as currency (e.g., "$0.08"), 7-day sparkline showing daily averages

2. **Sparklines**: Use inline SVG or recharts `<ResponsiveContainer>` with `<AreaChart>` at ~24px height, no axes, no grid, no labels. Colors: primary-400 fill at 20% opacity, primary-500 stroke.

3. **Data source**: Create a new tRPC procedure `trpc.traces.stats` or extend the existing traces query to return aggregated stats. Query ClickHouse for:
   - `COUNT(*)` for total
   - `countIf(status = 'error') / COUNT(*)` for error rate
   - `AVG(duration)` for avg duration
   - `AVG(total_cost)` for avg cost
   - 7-day daily breakdowns for sparkline data

4. **Key file**: `frontend/app/traces/page.tsx`

### Acceptance Criteria
- 4 stat cards render above filters in a 4-column grid (2 columns on mobile)
- Each card shows a numeric value and a 7-day sparkline
- Error Rate card uses rose text when rate > 5%
- Cards respect active filters (if user filters by agent, stats update)
- Loading skeleton shown while data fetches
---
## Add advanced filter dropdowns

- type: task
- priority: 1
- labels: frontend, ux, traces
- estimate: 180

### Description


Add advanced filter dropdowns to the traces list page: Agent selector, Duration presets, and Time Range selector. Include active filter pills with remove buttons, all synced to URL search params.

**Wireframe:** `frontend/branding/wireframes/traces/index.txt` — filter bar section

**Requirements**

1. **Agent dropdown**:
   - Combobox/select populated from `trpc.agents.list`
   - Placeholder: "All agents"
   - Syncs to URL as `?agent=<agentId>`

2. **Duration dropdown** with presets:
   - Options: "Any duration", "<1s", "1-5s", "5-30s", ">30s"
   - Syncs to URL as `?duration=lt1s` / `?duration=1s-5s` / `?duration=5s-30s` / `?duration=gt30s`

3. **Time Range dropdown**:
   - Options: "Last 1h", "Last 6h", "Last 24h", "Last 7d", "Last 30d", "Custom range..."
   - Custom opens a date-range picker (use existing date picker component or add one)
   - Syncs to URL as `?timeRange=1h` / `?timeRange=6h` etc., or `?from=ISO&to=ISO` for custom

4. **Active filter pills**: Below the dropdowns, show a pill for each active filter (e.g., "Agent: booking-agent x", "Duration: 1-5s x"). Clicking "x" removes that filter and updates URL.

5. **URL sync**: All filter state is read from and written to `URLSearchParams` using `useSearchParams()`. Changing a filter uses `router.replace()` with shallow routing to avoid full page reload.

6. **Key file**: `frontend/app/traces/page.tsx`

### Acceptance Criteria
- All 3 dropdowns render in the filter bar
- Selecting a filter updates the URL and re-fetches the trace list
- Active filter pills appear below dropdowns with remove buttons
- Refreshing the page restores filters from URL
- "Custom range" opens a date picker
- Clearing all filters resets to default state
---
## Add multi-select checkboxes and bulk action bar

- type: task
- priority: 1
- labels: frontend, ux, traces
- estimate: 360

### Description


Add checkbox selection to the trace table with a sticky bulk action bar. Enables comparing two traces side-by-side and creating test cases from selected traces.

**Wireframe:** `frontend/branding/wireframes/traces/index.txt` — checkbox column and bulk action bar

**Requirements**

1. **Checkbox column**:
   - New first column in trace table with checkboxes
   - Header checkbox: select all / deselect all on current page
   - Each row checkbox toggles selection state
   - Selection state managed in React state (Set of traceIds)

2. **Sticky bulk action bar**:
   - Fixed to bottom of viewport when 1+ traces selected
   - Background: `bg-surface-raised` with border-t and shadow
   - Content:
     - Left: "{count} selected"
     - Center: Action buttons:
       - **"Compare Selected"**: Enabled only when exactly 2 traces are selected. Navigates to `/traces/diff?baseline={id1}&candidate={id2}`
       - **"Create Test Cases"**: Enabled when 1+ selected. Opens the Create Test Cases modal (see separate issue)
     - Right: **"Deselect All"** text button
   - Bar animates in/out with a slide-up transition

3. **Keyboard support**: Shift+click to select a range of traces

4. **Key file**: `frontend/app/traces/page.tsx`

### Acceptance Criteria
- Checkbox column renders as first column in trace table
- Header checkbox toggles all visible rows
- Selecting 1+ traces shows sticky bottom action bar
- "Compare Selected" enabled only with exactly 2 selected, navigates to diff page
- "Create Test Cases" enabled with 1+ selected, opens modal
- "Deselect All" clears all selections and hides bar
- Bar slides up smoothly on first selection, slides down on deselect all
- Selections persist across pagination (if applicable)
---
## Add loop and multi-agent badges

- type: task
- priority: 2
- labels: frontend, ux, traces
- estimate: 60

### Description


Add visual badges to trace rows that indicate loop behavior or multi-agent participation, making it easy to spot complex traces at a glance.

**Wireframe:** `frontend/branding/wireframes/traces/index.txt` — badge indicators on trace rows

**Requirements**

1. **"loop!" badge** (rose):
   - Displayed on traces where the span count exceeds 2x the median span count for that agent
   - Style: `bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300` with `text-xs font-medium px-1.5 py-0.5 rounded-full`
   - Tooltip: "This trace has significantly more spans than typical, indicating a potential loop"
   - Computation: Compare trace's `spanCount` against agent's median (can be returned from the traces list query or computed client-side from the current page data)

2. **"multi-agent" badge** (blue):
   - Displayed on traces that involve 2 or more distinct `agentId` values across their spans
   - Style: `bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300` with same sizing as loop badge
   - Tooltip: "This trace involves multiple agents"
   - Data: Requires a `distinctAgentCount` or `agentIds` array field on the trace list response

3. **Badge placement**: Render inline after the trace name/ID in the Name column, with `gap-1.5`

4. **Key file**: `frontend/app/traces/page.tsx`, `frontend/components/traces/span-type-badge.tsx`

### Acceptance Criteria
- "loop!" badge appears in rose on traces with span count > 2x agent median
- "multi-agent" badge appears in blue on traces with 2+ distinct agents
- Both badges can appear on the same trace
- Tooltips provide explanatory text on hover
- Badges render correctly in both light and dark themes
---
## Add cost column to trace table

- type: task
- priority: 2
- labels: frontend, ux, traces
- estimate: 60

### Description


Add a Cost column to the trace table showing the sum of all token costs for each trace, with color-coded thresholds for quick identification of expensive traces.

**Wireframe:** `frontend/branding/wireframes/traces/index.txt` — cost column in trace table

**Requirements**

1. **New "Cost" column** in the trace table:
   - Position: After the existing Duration column
   - Value: Sum of all span costs within the trace, formatted as `$X.XX`
   - If cost is null or zero, display "---" in muted text

2. **Color thresholds**:
   - < $0.10: `text-emerald-600 dark:text-emerald-400` (cheap, good)
   - $0.10 - $0.50: `text-amber-600 dark:text-amber-400` (moderate)
   - > $0.50: `text-rose-600 dark:text-rose-400` (expensive, attention)

3. **Column header**: "Cost" with a sort toggle (sort by cost ascending/descending)

4. **Data source**: Ensure `trpc.traces.list` returns a `totalCost` field per trace. If not already present, add it by summing span-level costs in the ClickHouse query.

5. **Key file**: `frontend/app/traces/page.tsx`

### Acceptance Criteria
- Cost column renders with correct formatting ($X.XX)
- Null costs show "---" in muted text
- Color thresholds applied correctly: emerald < $0.10, amber $0.10-$0.50, rose > $0.50
- Column is sortable
- Column is responsive (hidden on very small screens if needed)
---
## Build Create Test Cases modal

- type: task
- priority: 1
- labels: frontend, ux, traces
- estimate: 360

### Description


Build a modal dialog for converting selected traces into eval test cases. This is triggered from the bulk action bar's "Create Test Cases" button and from the trace detail page's "Create Test Case" button.

**Wireframe:** `frontend/branding/wireframes/traces/index.txt` — Create Test Cases modal

**Requirements**

1. **New component** `frontend/components/traces/create-test-cases-modal.tsx`:
   - Props: `{ traceIds: string[], open: boolean, onClose: () => void }`
   - Fetches full trace data for each selected trace ID

2. **Modal content**:
   - **Suite selector**: Combobox populated from `trpc.suites.list`. Required field. Option to create a new suite inline.
   - **Test cases list**: One row per selected trace, each showing:
     - **Case name**: Auto-generated from trace name + timestamp, editable text input
     - **Input**: Pre-filled from trace's root span input, shown in a collapsible JSON viewer, editable
     - **Expected output**: Pre-filled from trace's root span output, shown in collapsible JSON viewer, editable
     - **Tools**: Pre-filled list of tools used in the trace, displayed as chips, removable
   - **Submit button**: "Create {count} Test Case(s)"
   - **Cancel button**: Closes modal without action

3. **Submit behavior**:
   - Calls `trpc.suites.createCase` for each test case (or a batch endpoint if available)
   - Shows progress indicator during creation
   - On success: toast notification "Created {count} test case(s) in {suiteName}", close modal, deselect all traces
   - On error: show error inline, keep modal open

4. **Reusability**: This component is also used from the trace detail page (single trace mode). When `traceIds` has length 1, hide the list view and show a single form.

5. **Key file**: New `frontend/components/traces/create-test-cases-modal.tsx`, invoked from `frontend/app/traces/page.tsx` and `frontend/app/traces/[id]/page.tsx`

### Acceptance Criteria
- Modal opens when "Create Test Cases" clicked in bulk action bar
- Suite selector shows real suites from API
- Each trace is pre-populated with input/output/tools from trace data
- Case names are editable
- Submit creates cases and shows success toast
- Errors are handled gracefully with inline error messages
- Works in both multi-trace (from list) and single-trace (from detail) modes
---
## Trace Detail Page Enhancements

- type: epic
- priority: 1
- labels: frontend, ux, traces

### Description


Enhance the trace detail page (`/traces/[id]`) with an Agent Graph view for visualizing multi-agent flows, a cost stat card, related traces section, test case creation, and deep linking to specific spans.

**Wireframe:** `frontend/branding/wireframes/traces/detail.txt` (510 lines)

**Current state:** Page shows header stats, tab-based view with Timeline and Tree views, and span detail panel. Missing graph visualization, cost stat, related traces, test case creation button, and deep linking.

**Key files:**
- `frontend/app/traces/[id]/page.tsx` — main trace detail page
- `frontend/app/traces/[id]/loading.tsx` — loading skeleton
- `frontend/components/traces/` — trace components (trace-timeline, span-detail, etc.)
---
## Build Agent Graph view

- type: task
- priority: 1
- labels: frontend, ux, traces
- estimate: 720

### Description


Build a new "Graph" tab view on the trace detail page using `@xyflow/react` (React Flow) to visualize agent decision flows, LLM calls, and tool invocations as an interactive directed graph.

**Wireframe:** `frontend/branding/wireframes/traces/detail.txt` — Agent Graph view section

**Requirements**

1. **New component** `frontend/components/traces/agent-graph.tsx`:
   - Uses `@xyflow/react` for the graph canvas
   - Auto-layout using the `dagre` algorithm (via `@dagrejs/dagre` package)
   - Graph direction: top-to-bottom (TB)

2. **Node types** (custom React Flow nodes):
   - **Agent decision** (blue): Represents agent reasoning/planning spans. Style: `bg-blue-50 border-blue-300 dark:bg-blue-900/20 dark:border-blue-700`, icon: Brain
   - **LLM call** (purple): Represents LLM inference spans. Style: `bg-purple-50 border-purple-300 dark:bg-purple-900/20 dark:border-purple-700`, icon: Sparkles
   - **Tool call** (amber): Represents tool/function invocations. Style: `bg-amber-50 border-amber-300 dark:bg-amber-900/20 dark:border-amber-700`, icon: Wrench
   - Each node shows: span name (truncated), duration, and a status indicator dot

3. **Edges**: Show data flow between parent and child spans. Animated edges for currently-running spans. Edge labels show data size if available.

4. **Color by status**:
   - Success: green border/dot (`border-emerald-400`)
   - Error: red border/dot (`border-rose-400`)
   - Slow (>P95 duration): amber border/dot (`border-amber-400`)

5. **Interaction**:
   - Click a node to open the span detail panel (same panel used by timeline/tree views)
   - Zoom and pan controls (React Flow built-in)
   - Minimap in bottom-right corner
   - Fit-to-view button

6. **Tab integration**:
   - Add "Graph" as a third tab alongside existing "Timeline" and "Tree" tabs
   - Auto-select Graph tab when trace has 2+ distinct agent IDs
   - Otherwise default to Timeline tab as current behavior

7. **Key files**: New `frontend/components/traces/agent-graph.tsx`, modified `frontend/app/traces/[id]/page.tsx`

### Acceptance Criteria
- Graph tab renders an interactive directed graph of trace spans
- 3 distinct node types with correct colors and icons
- Nodes color-coded by status (green/red/amber)
- Clicking a node opens span detail panel
- Auto-layout produces readable graph without overlapping nodes
- Graph auto-selected for multi-agent traces
- Zoom, pan, minimap, and fit-to-view work correctly
- Performance is acceptable for traces with up to 200 spans
---
## Add cost stat card

- type: task
- priority: 2
- labels: frontend, ux, traces
- estimate: 30

### Description


Add a 5th stat card to the trace detail header showing the total cost of the trace. Currently the page shows 4 stat cards: LLM Calls, Tool Calls, Tokens, and Score.

**Wireframe:** `frontend/branding/wireframes/traces/detail.txt` — stat cards row

**Requirements**

1. **New stat card**: "Cost" as the 5th card in the existing stat card row
   - Value: Sum of all span costs in the trace, formatted as `$X.XX`
   - Icon: DollarSign or Coins from lucide-react
   - If no cost data available, show "---"

2. **Position**: After the existing Score card (rightmost position)

3. **Responsive**: 5-column grid on desktop, wraps to 2-3 columns on smaller screens

4. **Key file**: `frontend/app/traces/[id]/page.tsx`

### Acceptance Criteria
- Cost card renders as 5th stat card in the header row
- Shows correct total cost summed from all spans
- Displays "---" when no cost data is available
- Grid layout adjusts responsively without breaking
---
## Build Related Traces section

- type: task
- priority: 2
- labels: frontend, ux, traces
- estimate: 180

### Description


Add a "Related Traces" section below the main trace content showing the 5 most recent traces from the same agent. Provides quick navigation between an agent's traces without leaving the detail view.

**Wireframe:** `frontend/branding/wireframes/traces/detail.txt` — Related Traces section

**Requirements**

1. **Section placement**: Below the main tab content (timeline/tree/graph), above the page footer

2. **Section header**: "Related Traces" with subtitle "Recent traces from the same agent"

3. **Mini-table** with columns:
   - **Trace ID**: Truncated to first 8 characters, monospace font
   - **Status**: Badge (success/error/running) using existing span-type-badge styles
   - **Duration**: Formatted as human-readable (e.g., "1.2s", "340ms")
   - **Time**: Relative timestamp (e.g., "2 hours ago") using a date formatting utility

4. **Data source**: Query `trpc.traces.list` with parameters:
   - `agentId`: Current trace's agent ID
   - `limit: 5`
   - `excludeId`: Current trace ID (so it doesn't appear in its own related list)
   - Sorted by timestamp descending

5. **Interaction**: Clicking a row navigates to `/traces/{traceId}` for that trace

6. **Empty state**: If agent has no other traces, show "No other traces from this agent"

7. **Key file**: `frontend/app/traces/[id]/page.tsx`

### Acceptance Criteria
- Related Traces section renders below main content
- Shows up to 5 recent traces from the same agent
- Current trace is excluded from the list
- Clicking a row navigates to that trace's detail page
- Empty state shown when no related traces exist
- Section has a clear visual separation from the main content above
---
## Add Create Test Case button and modal

- type: task
- priority: 2
- labels: frontend, ux, traces
- estimate: 180

### Description


Add a "Create Test Case" button to the trace detail page header that opens the Create Test Cases modal pre-filled with the current trace's data.

**Wireframe:** `frontend/branding/wireframes/traces/detail.txt` — header actions area

**Requirements**

1. **Button placement**: In the trace detail header actions area, alongside existing buttons (e.g., "Open Debugger", "View JSON")
   - Label: "Create Test Case"
   - Icon: FlaskConical or TestTube from lucide-react
   - Style: Secondary/outline button variant

2. **Modal integration**: Reuse the `CreateTestCasesModal` component (built in the traces list epic)
   - Pass `traceIds: [currentTraceId]` to invoke single-trace mode
   - Modal pre-fills input, output, and tools from the current trace

3. **Key file**: `frontend/app/traces/[id]/page.tsx`, reuses `frontend/components/traces/create-test-cases-modal.tsx`

### Acceptance Criteria
- "Create Test Case" button visible in header actions
- Clicking opens the modal pre-filled with current trace data
- Modal works in single-trace mode (simplified form, no trace list)
- Successful creation shows toast and closes modal
- Button is not shown if trace data is still loading
---
## Add deep link support for ?span=[spanId]

- type: task
- priority: 2
- labels: frontend, ux, traces
- estimate: 180

### Description


Support deep linking to a specific span on the trace detail page via the `?span=[spanId]` URL parameter. When present, the page auto-selects that span in the timeline/tree view and opens the span detail panel.

**Wireframe:** `frontend/branding/wireframes/traces/detail.txt` — deep link behavior

**Requirements**

1. **URL parameter**: Read `span` from `useSearchParams()` on page load

2. **Auto-selection behavior**:
   - If `?span=X` is present and a span with that ID exists in the trace:
     - In Timeline view: Scroll to and highlight the span bar
     - In Tree view: Expand all ancestor nodes and highlight the target span
     - In Graph view: Center the graph on the target node and highlight it
     - Open the span detail panel with the selected span's data
   - If span ID not found in trace, ignore silently (no error)

3. **URL update on manual selection**: When user clicks a different span, update URL to `?span=Y` using shallow routing so the URL is always shareable

4. **Use cases**:
   - Linking from the agent traces tab to a specific span
   - Linking from eval run case results to the relevant span
   - Copy-pasting URLs between team members

5. **Key file**: `frontend/app/traces/[id]/page.tsx`, `frontend/components/traces/trace-timeline.tsx`, `frontend/components/traces/debugger/span-tree.tsx`

### Acceptance Criteria
- Navigating to `/traces/abc?span=xyz` auto-selects span `xyz`
- Span detail panel opens automatically for the linked span
- Timeline scrolls to the span, tree expands to reveal it
- Clicking a different span updates the URL parameter
- Invalid or missing span IDs are handled gracefully (no crash, no error)
- Works correctly with all three view tabs (Timeline, Tree, Graph)
---
## Trace Debug and Diff Enhancements

- type: epic
- priority: 2
- labels: frontend, ux, traces

### Description


Enhance the trace debugger (`/traces/[id]/debug`) and trace diff (`/traces/diff`) pages with RCA analysis integration, export capabilities, search filtering, deep linking, and improved diff UX.

**Wireframe (debug):** `frontend/branding/wireframes/traces/debug.txt` (311 lines)
**Wireframe (diff):** `frontend/branding/wireframes/traces/diff.txt` (303 lines)

**Current state:** Debugger has span timeline, span tree, and span detail panel. Diff page has baseline/candidate selectors, stats comparison, and timeline overlay. Missing RCA trigger, export, search, deep linking, swap button, and color verification.

**Key files:**
- `frontend/app/traces/[id]/debug/page.tsx` — trace debugger page
- `frontend/app/traces/diff/page.tsx` — trace diff page
- `frontend/components/traces/debugger/` — debugger components
- `frontend/components/traces/diff/` — diff components
- `frontend/components/traces/rca-overlay.tsx` — existing RCA overlay component
---
## Add RCA Analysis button and overlay

- type: task
- priority: 1
- labels: frontend, ux, traces
- estimate: 180

### Description


Add a "Root Cause Analysis" button to the trace debugger header that triggers the existing `rca-overlay` component. The button highlights root cause spans in the timeline with a rose background overlay.

**Wireframe:** `frontend/branding/wireframes/traces/debug.txt` — RCA button in debugger header

**Requirements**

1. **Button in debugger header**:
   - Label: "Analyze Root Cause" (or "RCA" for compact)
   - Icon: SearchCode or Microscope from lucide-react
   - Style: Secondary button, with rose accent when active
   - **Only enabled** when the trace has error status. Disabled with tooltip "Only available for error traces" otherwise.

2. **Toggle behavior**:
   - Clicking toggles the RCA overlay on/off
   - When active, button shows active state (rose background, "RCA Active" label)

3. **RCA overlay integration**:
   - Use existing `frontend/components/traces/rca-overlay.tsx` component
   - When active, the overlay highlights root cause spans in the span timeline with `bg-rose-100/50 dark:bg-rose-900/20` background
   - Root cause spans are identified by error propagation: the deepest span(s) with error status that caused parent errors

4. **Timeline highlighting**:
   - Root cause spans get a rose background wash in the timeline
   - A small label "Root Cause" appears next to the identified spans
   - Non-root-cause error spans get a lighter rose indicator

5. **Key file**: `frontend/app/traces/[id]/debug/page.tsx`, `frontend/components/traces/rca-overlay.tsx`, `frontend/components/traces/debugger/span-timeline.tsx`

### Acceptance Criteria
- "Analyze Root Cause" button appears in debugger header
- Button is disabled for non-error traces with explanatory tooltip
- Clicking enables RCA overlay, highlighting root cause spans in rose
- Clicking again disables the overlay
- Root cause spans are correctly identified as deepest error spans
- Overlay visuals work in both light and dark themes
---
## Add Export dropdown to debugger

- type: task
- priority: 2
- labels: frontend, ux, traces
- estimate: 180

### Description


Add an "Export" dropdown button to the trace debugger header with 3 format options: JSON, OTLP, and CSV. Downloads are triggered immediately as file downloads via Blob URLs.

**Wireframe:** `frontend/branding/wireframes/traces/debug.txt` — Export dropdown in debugger header

**Requirements**

1. **Dropdown button** in debugger header:
   - Label: "Export" with ChevronDown icon
   - Style: Secondary button with dropdown menu
   - Position: Right side of header actions

2. **Export formats**:
   - **JSON**: Full trace data as-is from the API response. Filename: `trace-{traceId}.json`
   - **OTLP**: Standard OpenTelemetry Protocol format. Transform trace data into OTLP JSON structure with `resourceSpans` → `scopeSpans` → `spans` hierarchy. Filename: `trace-{traceId}.otlp.json`
   - **CSV**: Flat table of spans with columns: spanId, parentSpanId, name, kind, status, startTime, endTime, duration, attributes. Filename: `trace-{traceId}-spans.csv`

3. **Download mechanism**:
   - Create Blob from formatted data
   - Generate `URL.createObjectURL(blob)`
   - Trigger download via temporary `<a>` element with `download` attribute
   - Revoke object URL after download starts

4. **Loading state**: Show spinner in dropdown item while preparing export (relevant for large traces)

5. **Key file**: `frontend/app/traces/[id]/debug/page.tsx`

### Acceptance Criteria
- Export dropdown renders in debugger header
- Clicking "JSON" downloads full trace as `.json` file
- Clicking "OTLP" downloads trace in OpenTelemetry format as `.otlp.json` file
- Clicking "CSV" downloads span table as `.csv` file
- Downloads work in all major browsers
- Large traces (200+ spans) export without freezing the UI
---
## Add span tree search filter

- type: task
- priority: 2
- labels: frontend, ux, traces
- estimate: 60

### Description


Add a search input at the top of the span tree panel in the debugger that filters tree nodes by span name or type, highlighting matching nodes.

**Wireframe:** `frontend/branding/wireframes/traces/debug.txt` — span tree search input

**Requirements**

1. **Search input**:
   - Positioned at the top of the span tree panel, above the tree nodes
   - Placeholder: "Search spans..."
   - Icon: Search (lucide-react) on the left
   - Clear button (X) on the right when input has value
   - Debounced: 200ms delay before filtering

2. **Filter behavior**:
   - Filter matches against span name (case-insensitive substring match) and span type/kind
   - Matching nodes remain visible; non-matching nodes are hidden
   - Parent nodes of matching children remain visible (to maintain tree structure) but rendered with reduced opacity
   - When filter is cleared, full tree is restored

3. **Highlight behavior**:
   - Matching text in span names is highlighted with `bg-accent-200 dark:bg-accent-800` background
   - Match count shown below input: "{N} spans found"

4. **Key file**: `frontend/components/traces/debugger/span-tree.tsx`

### Acceptance Criteria
- Search input renders at top of span tree panel
- Typing filters tree nodes by name or type
- Parent nodes of matches remain visible for tree structure
- Matching text is highlighted in span names
- Match count displayed below input
- Clear button resets filter and restores full tree
- Debounced input prevents excessive re-renders
---
## Add deep link ?span=[spanId] to debugger

- type: task
- priority: 2
- labels: frontend, ux, traces
- estimate: 60

### Description


Support the `?span=[spanId]` URL parameter in the trace debugger page. On page load, auto-expand the span tree to the target span, highlight it in the timeline, and open the span detail panel.

**Wireframe:** `frontend/branding/wireframes/traces/debug.txt` — deep link behavior

**Requirements**

1. **URL parameter**: Read `span` from `useSearchParams()` on debugger page load

2. **Auto-expand behavior**:
   - In span tree: Expand all ancestor nodes of the target span, scroll to it, highlight with `ring-2 ring-primary-400`
   - In span timeline: Scroll horizontally and vertically to bring the span bar into view, highlight with pulsing border

3. **Span detail panel**: Auto-open with the linked span's data

4. **URL update**: When user clicks a different span, update `?span=Y` using shallow routing

5. **Key file**: `frontend/app/traces/[id]/debug/page.tsx`, `frontend/components/traces/debugger/span-tree.tsx`, `frontend/components/traces/debugger/span-timeline.tsx`

### Acceptance Criteria
- Navigating to `/traces/abc/debug?span=xyz` auto-expands tree to span `xyz`
- Span is highlighted in both tree and timeline
- Span detail panel opens automatically
- Clicking another span updates the URL
- Invalid span IDs are handled gracefully
---
## Add swap A-B button to trace diff

- type: task
- priority: 2
- labels: frontend, ux, traces
- estimate: 30

### Description


Add a swap button between the baseline and candidate trace selectors on the trace diff page that swaps the two trace IDs.

**Wireframe:** `frontend/branding/wireframes/traces/diff.txt` — swap button between selectors

**Requirements**

1. **Swap button**:
   - Position: Between the baseline and candidate trace selector dropdowns
   - Icon: ArrowLeftRight from lucide-react
   - Style: Ghost/icon button, `w-8 h-8` square
   - Tooltip: "Swap baseline and candidate"

2. **Swap behavior**:
   - On click, swap the `baseline` and `candidate` URL parameters
   - `router.replace(`/traces/diff?baseline=${candidate}&candidate=${baseline}`)` using shallow routing
   - Both selectors update to reflect the swap
   - Diff view re-renders with swapped comparison

3. **Key file**: `frontend/app/traces/diff/page.tsx`, `frontend/components/traces/diff/trace-selector.tsx`

### Acceptance Criteria
- Swap button renders between the two trace selectors
- Clicking swaps baseline and candidate trace IDs
- URL updates to reflect the swap
- Diff stats and timeline update correctly after swap
- Button has hover state and tooltip
---
## Verify diff stats color coding

- type: task
- priority: 3
- labels: frontend, ux, traces
- estimate: 30

### Description


Audit and verify that the trace diff stats and timeline overlay use correct color coding: emerald for improvements, rose for regressions, and correct accent colors for the A/B overlay.

**Wireframe:** `frontend/branding/wireframes/traces/diff.txt` — diff stats and timeline overlay colors

**Requirements**

1. **Diff stat deltas**:
   - Duration delta: Negative (faster) → `text-emerald-600` with down arrow, Positive (slower) → `text-rose-600` with up arrow
   - Cost delta: Negative (cheaper) → `text-emerald-600` with down arrow, Positive (more expensive) → `text-rose-600` with up arrow
   - Score delta: Positive (better) → `text-emerald-600` with up arrow, Negative (worse) → `text-rose-600` with down arrow
   - Span count delta: Neutral coloring (neither good nor bad inherently)

2. **Timeline overlay colors**:
   - Baseline (A) spans: `accent-500` at 50% opacity (`bg-accent-500/50`)
   - Candidate (B) spans: `emerald-500` at 50% opacity (`bg-emerald-500/50`)
   - Overlapping regions show both colors blended

3. **Audit scope**: Check the following components:
   - `frontend/components/traces/diff/diff-summary.tsx` — stat delta colors
   - `frontend/components/traces/diff/timeline-overlay.tsx` — A/B overlay colors
   - `frontend/components/traces/diff/span-diff-detail.tsx` — inline delta colors
   - `frontend/components/traces/diff/span-diff-list.tsx` — row-level indicators

4. **Key file**: `frontend/app/traces/diff/page.tsx` and all components in `frontend/components/traces/diff/`

### Acceptance Criteria
- Duration improvements (faster) show in emerald, regressions (slower) in rose
- Cost improvements (cheaper) show in emerald, regressions in rose
- Score improvements (higher) show in emerald, regressions in rose
- Timeline overlay uses accent-500/50 for A and emerald-500/50 for B
- All colors work correctly in both light and dark themes
- No hardcoded colors — all use design token classes