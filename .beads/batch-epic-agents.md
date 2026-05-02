# Agents List Page Redesign

- type: epic
- priority: 1
- labels: frontend, ux, redesign


Enhance the Agents list page (`/agents`) with registry stat cards, tag filtering, table/grid view toggle with bulk actions, a Register Agent modal, sort controls, and real API data wiring. These changes make the agent registry a fully functional management hub.

**Wireframe references:**
- `frontend/branding/wireframes/agents/index.txt`
- `frontend/branding/wireframes/agents/modal.txt`

**Current state:** Basic agent list page exists with card grid layout. Missing stat cards, tag filtering, table view, bulk actions, register modal, and sort controls. Some data may still be mocked.

**Key files:**
- `frontend/app/agents/page.tsx`
- `frontend/components/agents/agent-card.tsx`
- `frontend/components/agents/agent-header.tsx`

---
## Add registry summary stat cards to agents list

- type: task
- priority: 1
- labels: frontend, ux, redesign
- estimate: 180

### Description


Add 5 summary stat cards above the filter bar on the Agents list page showing aggregate registry health at a glance.

**Wireframe:** `frontend/branding/wireframes/agents/index.txt`

**Requirements**

1. **5 stat cards** rendered in a horizontal row above the existing filter bar:
   - **Total Agents**: Count of all registered agents
   - **Healthy**: Count of agents with pass rate >= 90%, status dot `bg-emerald-400`
   - **Degraded**: Count of agents with pass rate 70-89%, status dot `bg-amber-400`
   - **Failing**: Count of agents with pass rate < 70%, status dot `bg-rose-400`
   - **Stale**: Count of agents with no traces in the last 24 hours, status dot `bg-zinc-400`
2. Each card is clickable — clicking filters the agent list below to show only agents matching that status
3. Active filter card gets a highlighted border (`ring-2 ring-primary`)
4. Clicking the same card again clears the filter
5. Cards should use the same styling pattern as KPI cards on the Command Center (`bg-surface-default rounded-lg border border-border-default p-4`)

**Implementation**

- Create a new component `frontend/components/agents/agent-stat-cards.tsx`
- Derive counts from the agent list data already fetched by the page
- Use URL search param `?status=healthy` for filter state (shallow routing)
- Modify `frontend/app/agents/page.tsx` to mount the stat cards component and apply filtering

### Acceptance Criteria
- All 5 stat cards render with correct counts derived from agent data
- Clicking "Failing" card filters list to only failing agents
- Clicking the active card again clears the filter and shows all agents
- Color-coded status dots match thresholds: healthy (emerald), degraded (amber), failing (rose), stale (zinc)
- URL updates with `?status=X` on filter, preserving other params
---
## Add tag filtering UI to agents list

- type: task
- priority: 2
- labels: frontend, ux, redesign
- estimate: 180

### Description


Add a tag filter dropdown with multi-select to the agents list page, allowing users to filter agents by their assigned tags.

**Wireframe:** `frontend/branding/wireframes/agents/index.txt`

**Requirements**

1. **Tag filter dropdown** positioned in the filter bar area:
   - Multi-select dropdown listing all unique tags across registered agents
   - Search/typeahead within the dropdown to find tags quickly
   - Checkboxes next to each tag option
   - "Clear all" button when any tags are selected
2. **Active tag pills** rendered below the filter bar:
   - Each selected tag shown as a removable pill/badge (`bg-primary/10 text-primary rounded-full px-3 py-1`)
   - Click the `x` on a pill to remove that tag filter
3. **URL-synced** via shallow routing: `?tags=billing,safety` (comma-separated)
4. Agent list filters to show only agents that have ALL selected tags (AND logic)

**Implementation**

- Create a new component `frontend/components/agents/tag-filter.tsx`
- Extract unique tags from the agent list data
- Modify `frontend/app/agents/page.tsx` to mount the tag filter and apply filtering logic
- Use `useSearchParams` and `useRouter` for URL sync

### Acceptance Criteria
- Dropdown shows all unique tags from registered agents
- Selecting tags filters the agent list immediately
- Active tags appear as removable pills below the filter bar
- URL updates to `?tags=billing,safety` without full page reload
- Refreshing the page preserves tag filters from URL
- Clearing all tags shows all agents
---
## Add table view toggle with bulk actions to agents list

- type: task
- priority: 2
- labels: frontend, ux, redesign
- estimate: 360

### Description


Add a Grid/Table view toggle and implement a compact table view with checkboxes and bulk action support for the agents list page.

**Wireframe:** `frontend/branding/wireframes/agents/index.txt`

**Requirements**

1. **View toggle button** in the filter bar area:
   - Two-segment toggle: Grid (cards) | Table (rows)
   - Icons: `LayoutGrid` for grid, `List` for table
   - Persist preference in `localStorage` key `agents-view-mode`
   - Default: Grid (current behavior)
2. **Table view** when "Table" is selected:
   - Compact rows with columns: Checkbox, Agent Name, Status (dot + label), Environment, Score (pass rate %), Errors (24h), P50 Latency, Last Seen (relative time)
   - Sortable column headers (click to toggle asc/desc)
   - Row hover state: `hover:bg-surface-hover`
   - Row click navigates to `/agents/{id}`
3. **Bulk actions bar** appears when 1+ checkboxes are selected:
   - Sticky bar at bottom of table: "N selected" + action buttons
   - **Compare Selected** button (enabled when 2+ selected): navigates to `/compare?agents=id1,id2`
   - **Add Tags** button: opens a popover to add tags to all selected agents
   - "Select All" checkbox in header row
4. Grid view remains unchanged (existing card layout)

**Implementation**

- Create `frontend/components/agents/agent-table-view.tsx` for the table layout
- Create `frontend/components/agents/view-toggle.tsx` for the toggle button
- Create `frontend/components/agents/bulk-actions-bar.tsx` for the sticky actions bar
- Modify `frontend/app/agents/page.tsx` to conditionally render grid or table based on view mode

### Acceptance Criteria
- Toggle switches between grid and table views
- Table view shows all required columns with correct data
- Selecting checkboxes shows the bulk actions bar
- "Compare Selected" navigates to compare page with selected agent IDs
- View preference persists across page refreshes via localStorage
- Both views respond to existing filters (status, tags, search)
---
## Build Register Agent modal

- type: task
- priority: 1
- labels: frontend, ux, redesign
- estimate: 360

### Description


Build a multi-section modal form for registering a new agent in the platform. The modal is opened from a "Register Agent" button on the agents list page.

**Wireframe:** `frontend/branding/wireframes/agents/modal.txt`

**Requirements**

1. **Trigger**: "Register Agent" primary button in the agents list page header
2. **Modal** with the following form sections:

   **Identity Section:**
   - Agent ID: text input, required, slug format (lowercase, hyphens), unique validation
   - Display Name: text input, required
   - Description: textarea, optional, max 500 chars

   **Organization Section:**
   - Team: combobox (searchable dropdown) with existing teams + ability to create new
   - Tags: multi-select tag input (existing tags + create new)
   - Environments: checkbox group (Production, Staging, Development)

   **Connections Section:**
   - Eval Suites: multi-select dropdown of existing suites from `trpc.suites.list`
   - MCP Servers: multi-select dropdown of existing servers from `trpc.mcp.list`

   **SLA Targets Section:**
   - Minimum Pass Rate: number input, 0-100, default 90
   - Maximum Error Rate: number input, 0-100, default 5
   - Maximum Latency (ms): number input, default 2000
   - Maximum Cost per Call ($): number input, default 1.00

3. **Form validation**: Required fields validated on blur and on submit
4. **Submit**: Calls `trpc.agents.upsert` mutation
5. **Success**: Close modal, show success toast, refetch agent list
6. **Error**: Show inline error message, keep modal open

**Implementation**

- Create `frontend/components/agents/register-agent-modal.tsx`
- Use React Hook Form or native form handling with useState
- Import existing UI components: Dialog, Input, Textarea, Select, Combobox, Checkbox, Button
- Add "Register Agent" button to `frontend/app/agents/page.tsx` header area

### Acceptance Criteria
- "Register Agent" button opens the modal
- All 4 form sections render with correct field types
- Agent ID validates as slug format (no spaces, lowercase)
- Team combobox allows searching and creating new teams
- Tags input allows selecting existing and creating new tags
- Submitting with valid data creates the agent and closes modal
- Submitting with invalid data shows validation errors inline
- Success toast appears after successful registration
---
## Add sort dropdown to agents list

- type: task
- priority: 2
- labels: frontend, ux, redesign
- estimate: 60

### Description


Add a sort dropdown to the agents list page allowing users to change the ordering of agents.

**Wireframe:** `frontend/branding/wireframes/agents/index.txt`

**Requirements**

1. **Sort dropdown** in the filter bar area (right side, next to view toggle):
   - Options: Newest, Oldest, Name A-Z, Worst Score, Most Errors
   - Default: Worst Score (surface problems first)
   - Styled as compact select element
2. **URL-synced**: `?sort=worst-score` (shallow routing)
3. Sort applies to both grid and table views

**Implementation**

- Create `frontend/components/agents/sort-dropdown.tsx` or add to existing filter bar
- Sorting logic applied client-side on the fetched agent list
- Modify `frontend/app/agents/page.tsx` to mount dropdown and apply sort

### Acceptance Criteria
- Dropdown renders with all 5 sort options
- Changing sort immediately reorders the agent list
- Default sort is "Worst Score"
- URL updates to `?sort=worst-score` without full page reload
- Refreshing the page preserves the sort from URL
- Sort works in both grid and table views
---
## Wire agent list to real API data

- type: task
- priority: 1
- labels: frontend, api, redesign
- estimate: 180

### Description


Replace any remaining mock or placeholder data on the agents list page with real data from the `trpc.agents.list` API endpoint. Ensure health status computation matches wireframe thresholds.

**Wireframe:** `frontend/branding/wireframes/agents/index.txt`

**Requirements**

1. **Data source**: Use `trpc.agents.list` query as the single source of truth for the agents list page
2. **Health computation** must match wireframe thresholds:
   - **Healthy**: pass rate >= 90% AND error rate < 5% AND latency P50 < 2000ms
   - **Degraded**: pass rate 70-89% OR error rate 5-15% OR latency P50 2000-5000ms
   - **Failing**: pass rate < 70% OR error rate > 15% OR latency P50 > 5000ms
   - **Stale**: no trace data within 24 hours
3. **Loading state**: Show skeleton cards/rows while data loads
4. **Empty state**: Show "No agents registered" message with a "Register your first agent" CTA button
5. **Error state**: Show error fallback with retry button
6. **Auto-refresh**: `refetchInterval: 30000` (30 seconds)

**Implementation**

- Audit `frontend/app/agents/page.tsx` and all agent list components for any mock/hardcoded data
- Replace with `trpc.agents.list` query via `@tanstack/react-query`
- Ensure the `useAgentHealth` hook (from Command Center epic) is reused or extended
- Add loading skeletons matching the card/table layouts

### Acceptance Criteria
- No mock data remains on the agents list page
- Agent health statuses computed from real ClickHouse metrics
- Loading skeleton appears while data fetches
- Empty state renders when no agents exist
- Error state renders with retry on API failure
- Data refreshes every 30 seconds
---
## Agents Detail Page Redesign

- type: epic
- priority: 1
- labels: frontend, ux, redesign

### Description


Redesign the Agent Detail page (`/agents/[id]`) with a comprehensive tabbed interface covering Overview, Skills, Tools, Traces, and Versions. Add quick stat cards, agent context metadata, and rich interactive content to each tab.

**Wireframe references:**
- `frontend/branding/wireframes/agents/detail.txt`
- `frontend/branding/wireframes/agents/detail-skills.txt`
- `frontend/branding/wireframes/agents/detail-tools.txt`
- `frontend/branding/wireframes/agents/detail-traces.txt`
- `frontend/branding/wireframes/agents/detail-versions.txt`
- `frontend/branding/wireframes/agents/modal.txt`

**Current state:** Basic agent detail page exists with header and some overview content. Tabs structure may be partially implemented. Most tab content uses placeholder or minimal UI.

**Key files:**
- `frontend/app/agents/[id]/page.tsx`
- `frontend/components/agents/agent-header.tsx`
- `frontend/components/agents/agent-overview.tsx`
- `frontend/components/agents/` (directory for all agent components)
---
## Add quick stats cards to agent detail header

- type: task
- priority: 1
- labels: frontend, ux, redesign
- estimate: 180

### Description


Add 4 quick stat cards to the agent detail page header area, providing at-a-glance metrics for the agent.

**Wireframe:** `frontend/branding/wireframes/agents/detail.txt`

**Requirements**

1. **4 stat cards** in a horizontal row below the agent name/description header:
   - **Traces (7d)**: Total trace count for this agent in the last 7 days
   - **Avg Score**: Average pass rate / evaluation score across recent traces
   - **Error Rate**: Percentage of traces with errors in the last 7 days
   - **P50 Latency**: Median trace duration in the last 7 days
2. **Color coding** by threshold:
   - Avg Score: >= 90% → `text-emerald-500`, >= 70% → `text-amber-500`, < 70% → `text-rose-500`
   - Error Rate: < 5% → `text-emerald-500`, < 15% → `text-amber-500`, >= 15% → `text-rose-500`
   - P50 Latency: < 500ms → `text-emerald-500`, < 2000ms → `text-amber-500`, >= 2000ms → `text-rose-500`
   - Traces: no color coding, plain count
3. Cards styled: `bg-surface-default rounded-lg border border-border-default p-4`

**Implementation**

- Create `frontend/components/agents/agent-quick-stats.tsx`
- Data fetched from `trpc.agents.get` or a dedicated metrics endpoint
- Mount in `frontend/app/agents/[id]/page.tsx` between the header and tabs
- Modify `frontend/components/agents/agent-header.tsx` if needed for layout

### Acceptance Criteria
- All 4 stat cards render with correct values from real data
- Colors change based on threshold values
- Loading skeleton shows while data is fetching
- Cards are responsive (2x2 grid on mobile, 4-column on desktop)
---
## Add agent context row to agent detail

- type: task
- priority: 2
- labels: frontend, ux, redesign
- estimate: 180

### Description


Add a context metadata row below the quick stats cards showing key agent context information.

**Wireframe:** `frontend/branding/wireframes/agents/detail.txt`

**Requirements**

1. **Context row** displayed as a horizontal bar with the following items:
   - **Environment badges**: Colored badges for each environment the agent is registered in (e.g., `Production`, `Staging`)
   - **Model name**: The LLM model used by the agent (extracted from recent traces)
   - **Team**: The team this agent belongs to
   - **Tags**: Editable inline — shown as pills with an "add tag" button. Clicking a tag pill removes it. Add button opens a small popover to type a new tag.
   - **Last seen**: Relative timestamp (e.g., "2 minutes ago") of the most recent trace
2. Tags are editable inline — changes saved immediately via `trpc.agents.upsert` mutation
3. Items separated by subtle dividers (`border-r border-border-default`)

**Implementation**

- Create `frontend/components/agents/agent-context-row.tsx`
- Tags editing: inline popover with text input and "Add" button, calls mutation on add/remove
- Mount in `frontend/app/agents/[id]/page.tsx` below quick stats, above tabs

### Acceptance Criteria
- All context items render with correct data
- Environment badges are color-coded (production = emerald, staging = amber, development = zinc)
- Tags can be added and removed inline without page reload
- Last seen shows relative time that updates periodically
- Layout is responsive and wraps gracefully on smaller screens
---
## Build Overview tab — Agent Info section

- type: task
- priority: 1
- labels: frontend, ux, redesign
- estimate: 180

### Description


Build the Agent Info section of the Overview tab on the agent detail page, showing agent details and system prompt preview.

**Wireframe:** `frontend/branding/wireframes/agents/detail.txt`

**Requirements**

1. **2-column grid layout** within the Overview tab:

   **Left column — Details card:**
   - Agent ID: monospaced text with copy button
   - Created: formatted date
   - Description: full text (from agent metadata)
   - SLA Targets: list showing min pass rate, max error rate, max latency, max cost (from agent config)
   - Associated Suites: linked list of eval suite names → click navigates to `/suites/{id}`

   **Right column — System Prompt Preview card:**
   - Extracts the system prompt from the most recent trace for this agent
   - Shows first 10 lines truncated with a "View Full Prompt" expand/collapse toggle
   - Monospaced font in a `bg-surface-inset rounded p-4` container
   - If no system prompt found, show "No system prompt detected" placeholder

2. Both cards: `bg-surface-default rounded-lg border border-border-default`

**Implementation**

- Create `frontend/components/agents/agent-info-section.tsx`
- System prompt extraction: query the most recent trace, look for the system message in the LLM span
- Mount within the Overview tab content area in `frontend/components/agents/agent-overview.tsx` or equivalent

### Acceptance Criteria
- Details card shows all required fields with correct data
- Associated Suites are clickable links to suite detail pages
- System prompt preview shows truncated text with working expand/collapse
- Copy button on Agent ID copies to clipboard
- Layout is 2-column on desktop, stacked on mobile
---
## Build Overview tab — Cost Breakdown

- type: task
- priority: 2
- labels: frontend, api, redesign
- estimate: 360

### Description


Build the Cost Breakdown section of the Overview tab, showing cost attribution and cost trend data for the agent.

**Wireframe:** `frontend/branding/wireframes/agents/detail.txt`

**Requirements**

1. **2-column grid layout** within the Overview tab (below Agent Info):

   **Left column — Cost Attribution card:**
   - Title: "Cost Attribution (7d)"
   - Total daily cost prominently displayed (e.g., "$4.52/day")
   - Breakdown bars showing proportion of cost from:
     - Model Inference (token costs)
     - Tool Execution (tool call costs)
     - Retries (cost from retried operations)
   - Each bar labeled with percentage and absolute cost
   - Styled as horizontal stacked or grouped bars

   **Right column — Cost Trend Chart:**
   - 7-day area chart using recharts
   - X-axis: dates, Y-axis: daily cost in dollars
   - Fill color: `var(--color-accent)` with low opacity
   - Stroke color: `var(--color-accent)`
   - Tooltip on hover showing exact date and cost

2. **ClickHouse query** needed:
   - Aggregate `token_cost` + `tool_cost` from traces for this agent, grouped by day
   - Separate retry costs by filtering traces with `retry_count > 0`
   - 7-day window

**Implementation**

- Create `frontend/components/agents/cost-breakdown.tsx`
- New or extended tRPC endpoint: `trpc.agents.getCostBreakdown` returning daily costs and attribution
- Use recharts `<AreaChart>` for the trend chart (reuse patterns from dashboard charts)
- Mount within the Overview tab, below the Agent Info section

### Acceptance Criteria
- Cost attribution card shows total daily cost with breakdown bars
- Breakdown percentages sum to 100%
- Cost trend chart renders 7 days of data with correct area fill
- Tooltip shows exact date and dollar amount on hover
- Empty state if agent has no cost data: "No cost data available"
---
## Build Overview tab — Health Trends charts

- type: task
- priority: 2
- labels: frontend, ux, redesign
- estimate: 180

### Description


Build the Health Trends section of the Overview tab, showing score and latency trend charts for the agent.

**Wireframe:** `frontend/branding/wireframes/agents/detail.txt`

**Requirements**

1. **2-column grid layout** within the Overview tab (below Cost Breakdown):

   **Left column — Score Trend chart:**
   - 7-day line chart showing daily average evaluation score
   - Horizontal dashed line at the SLA target score (from agent config, e.g., 90%)
   - Line color: `var(--color-primary)`
   - SLA target line color: `var(--color-status-warning)` dashed
   - Y-axis: 0-100%, X-axis: dates

   **Right column — Latency Trend chart:**
   - 7-day line chart showing daily P50 latency
   - Horizontal dashed line at the SLA target latency (from agent config, e.g., 2000ms)
   - Line color: `var(--color-accent)`
   - SLA target line color: `var(--color-status-warning)` dashed
   - Y-axis: milliseconds, X-axis: dates

2. Both charts: recharts `<LineChart>` with `<ReferenceLine>` for SLA target
3. Tooltip on hover showing exact value and date

**Implementation**

- Create `frontend/components/agents/health-trends.tsx`
- Reuse recharts patterns from `frontend/components/charts/score-trend.tsx` and `frontend/components/charts/trend-chart.tsx`
- Data source: extend agent detail query or add `trpc.agents.getHealthTrends` endpoint
- Mount within the Overview tab

### Acceptance Criteria
- Both charts render with 7 days of data
- SLA target reference lines display at correct values
- Tooltips show exact values on hover
- Charts handle missing data gracefully (gaps in line)
- Responsive: side-by-side on desktop, stacked on mobile
---
## Build Overview tab — Recent Activity feed

- type: task
- priority: 2
- labels: frontend, ux, redesign
- estimate: 180

### Description


Build the Recent Activity feed section of the Overview tab, showing a chronological list of events specific to this agent.

**Wireframe:** `frontend/branding/wireframes/agents/detail.txt`

**Requirements**

1. **Activity feed** as a vertical list within the Overview tab (below Health Trends):
   - Chronologically sorted, most recent first
   - Maximum 10 items displayed
   - Each item shows: icon, description text, relative timestamp (e.g., "3 hours ago")
2. **Event types** with distinct icons:
   - Eval run completed: `CheckCircle` icon, emerald color
   - Eval run failed: `XCircle` icon, rose color
   - Deployment/version change: `Rocket` icon, primary color
   - Alert triggered: `AlertTriangle` icon, amber color
   - Config change: `Settings` icon, zinc color
3. Each row is clickable → navigates to the relevant detail page (eval run, alert, etc.)
4. "View all activity" link at the bottom

**Implementation**

- Create `frontend/components/agents/agent-activity-feed.tsx`
- Reuse or extend the `useActivityFeed` hook from the Command Center epic with an `agentId` filter parameter
- Mount within the Overview tab at the bottom

### Acceptance Criteria
- Activity feed shows real events for the specific agent only
- Events display correct icons and colors by type
- Relative timestamps update periodically
- Each row is clickable and navigates to the relevant page
- Maximum 10 items shown
- Empty state: "No recent activity" message
---
## Enhance Skills tab — add search/filter and Run Skill Eval

- type: task
- priority: 2
- labels: frontend, ux, redesign
- estimate: 180

### Description


Enhance the existing Skills tab on the agent detail page by adding search/filter functionality and a "Run Skill Eval" action button.

**Wireframe:** `frontend/branding/wireframes/agents/detail-skills.txt`

**Requirements**

1. **Search bar** at the top of the Skills tab:
   - Text input with search icon, placeholder "Search skills..."
   - Filters skill cards in real-time as user types (by skill name or description)
2. **Filter dropdowns**:
   - Status filter: All, Passing, Failing, Not Tested
   - Category filter: All, plus dynamically populated categories from skill metadata
3. **"Run Skill Eval" button**:
   - Primary button in the Skills tab header area
   - Opens the existing `StartEvalRunDialog` component pre-filtered to:
     - Agent: current agent (pre-selected, read-only)
     - Suite: filtered to suites associated with this agent
   - Import `StartEvalRunDialog` from `frontend/components/eval-runs/start-eval-run-dialog.tsx`
4. Skills grid maintains existing card layout, now filtered by search and filter controls

**Implementation**

- Modify existing skills tab component in `frontend/components/agents/` directory
- Add search input and filter dropdowns above the skills grid
- Wire "Run Skill Eval" button to open `StartEvalRunDialog` with pre-populated props
- Client-side filtering on the existing skills data

### Acceptance Criteria
- Search input filters skills by name in real-time
- Status and category dropdowns filter the skills grid
- "Run Skill Eval" opens the eval run dialog pre-configured for this agent
- Filters can be combined (search + status + category)
- Clear indication when no skills match the filters
---
## Enhance Tools tab — add All Tools flat table

- type: task
- priority: 2
- labels: frontend, ux, redesign
- estimate: 180

### Description


Add an aggregated flat table of all tools across all MCP servers below the existing server cards on the Tools tab.

**Wireframe:** `frontend/branding/wireframes/agents/detail-tools.txt`

**Requirements**

1. **All Tools table** rendered below the existing MCP server cards:
   - Columns: Tool Name, Server (which MCP server it belongs to), Calls (total invocations), Success % (successful / total), Avg Latency (ms), Errors (count)
   - Default sort: Errors descending (surface problems first)
   - Sortable column headers (click to toggle sort)
   - Row hover state: `hover:bg-surface-hover`
2. **"Export JSON" button** above the table:
   - Exports the full tool metrics data as a JSON file download
   - Filename: `{agent-id}-tools-{date}.json`
3. Table data aggregated from tool usage metrics across all MCP servers for this agent

**Implementation**

- Create `frontend/components/agents/all-tools-table.tsx`
- Aggregate data from `trpc.mcp.getToolUsage` or similar endpoint filtered by agent ID
- Add export functionality using `Blob` + `URL.createObjectURL` pattern
- Mount below existing server cards in the Tools tab component

### Acceptance Criteria
- Table shows all tools across all servers with correct metrics
- Default sort is by error count descending
- Clicking column headers changes sort order
- "Export JSON" downloads a correctly formatted JSON file
- Empty state if no tool usage data exists
---
## Build Tools tab — Topology modal

- type: task
- priority: 3
- labels: frontend, ux, redesign
- estimate: 360

### Description


Build a graph visualization modal showing the topology of the agent's MCP server and tool connections.

**Wireframe:** `frontend/branding/wireframes/agents/detail-tools.txt`

**Requirements**

1. **"View Topology" button** on the Tools tab that opens a full-screen modal
2. **Graph visualization** showing a hierarchical layout:
   - **Root node**: Agent (center)
   - **Second level**: MCP Server nodes (connected to agent)
   - **Third level**: Tool nodes (connected to their server)
3. **Node styling**:
   - Colored by health: healthy (emerald border), degraded (amber border), failing (rose border)
   - Sized by call volume: more calls → larger node
   - Agent node: largest, primary color accent
   - Server nodes: medium, with server name label
   - Tool nodes: smallest, with tool name label
4. **Interaction**:
   - Click a node to show a metrics tooltip/popover: name, status, call count, success rate, avg latency
   - Pan and zoom controls
   - Auto-layout (dagre or force-directed)
5. **Modal**: Full-screen overlay with close button, dark background for contrast

**Implementation**

- Create `frontend/components/agents/topology-modal.tsx`
- Use `@xyflow/react` (React Flow) for the graph rendering, or D3 force layout
- Layout algorithm: dagre (hierarchical top-down) for clean Agent → Server → Tool visualization
- Data sourced from MCP server and tool usage endpoints
- Add "View Topology" button to the Tools tab

### Acceptance Criteria
- "View Topology" button opens full-screen modal
- Graph renders with correct Agent → Server → Tool hierarchy
- Nodes are color-coded by health status
- Nodes are sized proportionally to call volume
- Clicking a node shows metrics tooltip
- Pan and zoom work smoothly
- Modal closes via Escape key or close button
---
## Build Traces tab

- type: task
- priority: 1
- labels: frontend, ux, redesign
- estimate: 480

### Description


Build the full Traces tab for the agent detail page, providing filtered trace browsing with quality summary stats, comparison tools, and loop detection.

**Wireframe:** `frontend/branding/wireframes/agents/detail-traces.txt`

**Requirements**

1. **Trace filters bar** at the top:
   - Search input: full-text search on trace names/content
   - Status dropdown: All, Success, Error, Timeout
   - Time range selector: Last 1h, 6h, 24h, 7d, 30d, Custom
   - Filters URL-synced via shallow routing

2. **Quality summary stats** — 4 stat cards below filters:
   - **Traces (7d)**: Total trace count
   - **Avg Score**: Average evaluation score
   - **Low-Score Traces**: Count of traces with score < 70%
   - **Loop Detections**: Count of traces flagged with loop detection
   - Color-coded by threshold (same scheme as quick stats)

3. **Trace list table**:
   - Columns: Checkbox, Trace Name, Status (badge), Score, Duration, Tokens, Cost, Timestamp
   - Pagination: 20 items per page with page navigation
   - Row click navigates to `/traces/{traceId}`
   - Checkbox column for multi-select
   - Loop detection badge: `🔄 Loop` badge on traces with detected loops

4. **"Compare Selected" button**: Enabled when 2+ traces are checked, navigates to `/traces/diff?a={id1}&b={id2}`

5. **"View All Traces" link**: Navigates to `/traces?agent_id={agentId}` (full traces page pre-filtered)

**Implementation**

- Create `frontend/components/agents/agent-traces-tab.tsx` as a new tab component
- Create `frontend/components/agents/trace-quality-stats.tsx` for the summary cards
- Create `frontend/components/agents/agent-trace-list.tsx` for the table with pagination
- Data source: `trpc.traces.list` query with `agentId` filter
- Register the new tab in the agent detail page tab navigation
- Use existing trace-related components/patterns where possible

### Acceptance Criteria
- Filters narrow down the trace list in real-time
- Quality summary stats reflect the filtered data
- Trace table shows 20 items per page with working pagination
- Clicking a row navigates to the trace detail page
- "Compare Selected" works with 2+ selected traces
- "View All Traces" navigates to the traces page with agent filter
- Loop detection badge appears on flagged traces
- URL params preserve filter state across page refreshes
---
## Build Versions tab

- type: task
- priority: 2
- labels: frontend, api, redesign
- estimate: 720

### Description


Build the Versions tab for the agent detail page, showing deployment management across environments, version comparison, and version history. Versions are auto-discovered from the `agent_version` field in ClickHouse traces.

**Wireframe:** `frontend/branding/wireframes/agents/detail-versions.txt`

**Requirements**

1. **Current Deployments section** — one card per environment (production, staging, development):
   - Each card shows: environment name, currently deployed version, deployment timestamp, status indicator
   - **Promote button**: Moves a version from staging → production (with confirmation dialog)
   - **Rollback button**: Reverts to the previous version in that environment (with confirmation dialog)
   - Cards styled with environment-specific accent colors

2. **Version Score Comparison** — horizontal bar chart:
   - Each bar represents a version, length proportional to average score
   - Color coded: above SLA target (emerald), below (rose)
   - Labels: version name, score percentage, trace count
   - Top 5 most recent versions shown

3. **Version History table**:
   - Columns: Version, Label (stable/canary/deprecated), Environments, Avg Score, Traces, First Seen, Last Seen
   - Label badges editable inline (dropdown to change label)
   - Sortable by any column
   - Pagination for agents with many versions

4. **Promotion Confirmation dialog**:
   - Modal confirming: "Promote version X from staging to production?"
   - Shows score comparison between current production version and promoted version
   - Requires explicit confirmation button click

5. **New tRPC endpoint** `trpc.agents.getVersions`:
   - Query ClickHouse for distinct `agent_version` values grouped by agent ID
   - Return: version name, first seen, last seen, trace count, average score, environment(s)
   - Versions auto-discovered — no manual registration needed

**Implementation**

- Create `frontend/components/agents/versions-tab.tsx` as the main tab component
- Create `frontend/components/agents/deployment-card.tsx` for per-environment cards
- Create `frontend/components/agents/version-comparison-chart.tsx` for the bar chart
- Create `frontend/components/agents/version-history-table.tsx` for the history table
- Create `frontend/components/agents/promote-dialog.tsx` for the confirmation modal
- Add new tRPC router procedure `getVersions` in `frontend/server/trpc/routers/agents.ts`
- Register the Versions tab in the agent detail page tab navigation

### Acceptance Criteria
- Current Deployments shows one card per environment with correct versions
- Promote and Rollback buttons work with confirmation dialogs
- Version Score Comparison chart renders with correct proportions and colors
- Version History table shows all discovered versions with correct metadata
- Labels can be changed inline (stable/canary/deprecated)
- New versions auto-discovered when new `agent_version` values appear in traces
- Empty state when agent has no version data: "No versions detected yet"
---
## Build Edit Metadata modal

- type: task
- priority: 2
- labels: frontend, ux, redesign
- estimate: 180

### Description


Build an Edit Metadata modal that reuses the Register Agent modal in "edit" mode, allowing users to update agent configuration from the agent detail page.

**Wireframe:** `frontend/branding/wireframes/agents/modal.txt`

**Requirements**

1. **Trigger**: "Edit" button in the agent detail page header (next to agent name)
2. **Modal**: Reuses `RegisterAgentModal` component in edit mode:
   - **Agent ID**: displayed but **read-only** (non-editable, greyed out input)
   - **All other fields**: editable, pre-populated with current agent data from `trpc.agents.get`
   - Same 4 sections as Register modal: Identity, Organization, Connections, SLA Targets
3. **Pre-population**: On modal open, fetch current agent data and populate all form fields
4. **Submit**: Calls `trpc.agents.upsert` mutation with the agent ID (update, not create)
5. **Success**: Close modal, show success toast, refetch agent detail data
6. **Diff indicator**: Fields that have been changed show a subtle left-border highlight (`border-l-2 border-primary`)

**Implementation**

- Modify `frontend/components/agents/register-agent-modal.tsx` to accept a `mode: 'create' | 'edit'` prop and an optional `agentData` prop for pre-population
- When `mode === 'edit'`: Agent ID field is read-only, form fields pre-filled, submit button text changes to "Save Changes"
- Add "Edit" button to `frontend/components/agents/agent-header.tsx`
- Track dirty fields to show diff indicators

### Acceptance Criteria
- "Edit" button on agent detail page opens the modal in edit mode
- Agent ID field is visible but not editable
- All other fields are pre-populated with current values
- Modified fields show visual diff indicator
- Submitting saves changes and refreshes the page data
- Cancel closes modal without saving
- Validation rules same as create mode