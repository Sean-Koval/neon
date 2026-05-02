# Command Center Redesign

- type: epic
- priority: 1
- labels: frontend, ux, redesign


Redesign the home page (`/`) as an agent-centric Command Center that answers "is everything okay?" in 3 seconds. Replace mock data with real API integrations, add environment selector, sparklines, and real-time running work tracking.

**Wireframe:** `frontend/branding/wireframes/command-center/index.txt` (154 lines)

**Current state:** ~60% implemented. Page structure matches wireframe layout. Alerts section uses real API. Agent Health table and Recent Activity use hardcoded mock data. Missing environment selector, sparklines, running work real-time tracking.

**Key files:**
- `frontend/app/page.tsx` — main page (rewritten as Command Center)
- `frontend/components/dashboard/` — stat-cards, score-trends, filters, etc.
- `frontend/hooks/use-dashboard.ts` — existing dashboard data hook

---
## Create useAgentHealth hook and API endpoint

- type: task
- priority: 1
- labels: frontend, api, redesign
- estimate: 360

### Description


Build the data layer for the Agent Health table on the Command Center. Currently uses `MOCK_AGENTS` array.

**Wireframe:** `frontend/branding/wireframes/command-center/index.txt` — "Agent Health Table" section

**Requirements**

1. **New hook** `frontend/hooks/use-agent-health.ts`:
   - Exports `useAgentHealth()` returning `{ agents: AgentHealthRow[], isLoading, error }`
   - `AgentHealthRow`: `{ id, name, version, status: 'healthy'|'degraded'|'failing', passRate, latencyP50, costPerCall, lastSeen }`
   - Uses `trpc.agents.list` query (existing router)
   - StaleTime: 30s, refetchInterval: 30s

2. **Enhance agents tRPC router** (`frontend/server/trpc/routers/agents.ts`):
   - The `list` procedure should compute health metrics from ClickHouse:
     - Pass rate: `COUNT(CASE WHEN score >= min_score) / COUNT(*)` from recent eval results
     - Latency P50: `quantile(0.5)(duration)` from traces in last 24h
     - Cost per call: `AVG(total_cost)` from traces
     - Last seen: `MAX(timestamp)` from traces
   - Status computed: `passRate >= 0.9` → healthy, `>= 0.7` → degraded, else failing

3. **Update `frontend/app/page.tsx`**:
   - Replace `MOCK_AGENTS` with `useAgentHealth()` hook
   - Maintain existing table UI structure

### Acceptance Criteria
- Agent Health table shows real data from ClickHouse
- Empty state renders if no agents have traces
- Status dots colored correctly: healthy (emerald), degraded (amber), failing (rose)
- Table auto-refreshes every 30s
---
## Create useRunningWork composite hook

- type: task
- priority: 1
- labels: frontend, api, redesign
- estimate: 180

### Description


Build a composite hook that fetches all currently running work items (eval runs, experiments, training loops) for the Command Center's "Running Work" panel.

**Wireframe:** `frontend/branding/wireframes/command-center/index.txt` — "Running Work" section

**Requirements**

1. **New hook** `frontend/hooks/use-running-work.ts`:
   - Exports `useRunningWork()` returning `{ items: RunningWorkItem[], isLoading }`
   - `RunningWorkItem`: `{ id, type: 'eval'|'experiment'|'training', name, progress: number, detail: string, href: string }`
   - Combines data from:
     - `useWorkflowRuns({ status: 'RUNNING' })` → eval runs (existing)
     - Experiments query (when available, stub initially)
     - Training loop query (when available, stub initially)
   - Polling: 5s for evals, 15s for experiments, 30s for training

2. **Update `frontend/app/page.tsx`**:
   - Replace static "No active work" panel with `useRunningWork()` data
   - Show progress bars for each item: `▶ Eval: booking-suite 45% • 45/100 · 2m elapsed`
   - Each item links to its detail page
   - Empty state: "No active work" with "Start eval run" button

### Acceptance Criteria
- Running eval runs appear with live progress bars
- Panel updates every 5 seconds
- Empty state shows when nothing is running
- Each item is clickable to its detail page
---
## Create useActivityFeed hook and API endpoint

- type: task
- priority: 1
- labels: frontend, api, redesign
- estimate: 360

### Description


Build the data layer for the Recent Activity timeline on the Command Center. Currently uses `MOCK_ACTIVITY`.

**Wireframe:** `frontend/branding/wireframes/command-center/index.txt` — "Recent Activity" section

**Requirements**

1. **New API route** `frontend/app/api/activity/route.ts`:
   - GET endpoint returning last 10 events across all event types
   - Event sources:
     - Eval run completions: query `eval_runs` table, join with suites for names
     - Prompt deployments: query `prompts` table for recent `is_production` changes
     - Alert triggers: query existing alerts API
     - Optimization completions: query training loop workflow status
   - Response: `{ events: ActivityEvent[] }` where each event has `{ id, type, description, timestamp, href }`

2. **New hook** `frontend/hooks/use-activity-feed.ts`:
   - Exports `useActivityFeed()` with staleTime 30s
   - Calls the new API route

3. **Update `frontend/app/page.tsx`**:
   - Replace `MOCK_ACTIVITY` with `useActivityFeed()` data
   - Event type → icon mapping: eval-complete → CheckCircle (emerald), deploy → Rocket (primary), optimization → Zap (accent), alert → AlertTriangle (amber)
   - Each row clickable → navigates to relevant detail page
   - Add "View all activity →" link at bottom

### Acceptance Criteria
- Real events appear in timeline sorted by most recent
- Each event type has correct icon and color
- Clicking a row navigates to the relevant page
- Max 10 items displayed
---
## Add environment selector to Command Center

- type: task
- priority: 2
- labels: frontend, ux, redesign
- estimate: 180

### Description


Add a global environment selector dropdown (staging/prod) to the Command Center header. This filters all data on the page.

**Wireframe:** `frontend/branding/wireframes/command-center/index.txt` — header area shows `[env: prod ▾]`

**Requirements**

1. **New component** `frontend/components/environment-selector.tsx`:
   - Dropdown with options: All, Production, Staging, Development
   - Styled as compact select with environment icon
   - Value persisted in URL as `?env=prod` (shallow routing)
   - Default: "All" (no filter)

2. **Mount in `frontend/app/page.tsx`** header area, right-aligned next to refresh button

3. **Pass `env` filter** to all data hooks on the page:
   - `useDashboard({ env })`
   - `useAgentHealth({ env })`
   - `useRunningWork({ env })`
   - `useActivityFeed({ env })`

4. This component should be reusable — other pages may use it later

### Acceptance Criteria
- Dropdown visible in header
- Selecting "Production" filters all page data to production traces only
- URL updates to `?env=prod` without full page reload
- Refreshing page preserves the filter
---
## Add sparklines to KPI cards

- type: task
- priority: 2
- labels: frontend, ux, redesign
- estimate: 180

### Description


Add inline sparkline visualizations to the KPI stat cards on the Command Center.

**Wireframe:** `frontend/branding/wireframes/command-center/index.txt` — KPI Cards section shows sparklines for Errors and Cost

**Requirements**

1. **Agents Active card**: Replace plain count with status dots: `● ● ● ○ ○ ○` showing healthy (emerald) vs total agents
2. **Errors (24h) card**: Add 7-bar sparkline showing daily error counts
3. **Daily Cost card**: Add 7-bar sparkline showing daily cost trend (descending = good, green)
4. **Pass Rate card**: Add trend arrow with delta: `↑ 2.1% vs 7d`

**Implementation**
- Use recharts `<ResponsiveContainer>` with `<BarChart>` for sparklines (height ~24px, no axes, no grid)
- Or use inline SVG for simpler rendering (no recharts dependency for sparklines)
- Data source: `useDashboard()` already returns some trend data; may need 7-day breakdowns from ClickHouse

### Acceptance Criteria
- All 4 KPI cards show additional visual context (dots, sparklines, or trends)
- Sparklines are proportionally sized (not dominating the card)
- Colors match design tokens (emerald for good trends, rose for bad)
---
## Add gradient top bar to KPI cards

- type: task
- priority: 3
- labels: frontend, ux, redesign
- estimate: 30

### Description


Add a 1px gradient bar at the top of each KPI stat card for visual polish.

**Wireframe:** `frontend/branding/wireframes/command-center/index.txt` — Design Notes reference gradient-primary-accent

**Requirements**
1. In the KpiCard component (or via CSS class), add `before:` pseudo-element:
   - Height: 1px
   - Background: `linear-gradient(to right, var(--color-primary), var(--color-accent))`
   - Full width, positioned at top of card
2. Apply to all 4 KPI cards

### Acceptance Criteria
- Subtle gradient line visible at top of each stat card
- Works in both light and dark themes
---
## Make Recent Activity rows clickable with navigation

- type: task
- priority: 2
- labels: frontend, ux, redesign
- estimate: 60

### Description


Make each item in the Recent Activity timeline clickable, navigating to its detail page. Add a "View all activity" link.

**Wireframe:** `frontend/branding/wireframes/command-center/index.txt` — Recent Activity section

**Requirements**
1. Each activity row wraps in a `<Link>` or has `onClick` handler:
   - eval-complete → `/eval-runs/{runId}`
   - deploy → `/prompts/{promptId}`
   - optimization → `/training?tab=auto-improve`
   - alert → `/agents/{agentId}` (the affected agent)
2. Add hover state: `hover:bg-surface-hover` with cursor-pointer
3. Add "View all activity →" link at bottom of the section, linking to a future activity page or just showing all items

### Acceptance Criteria
- Clicking an activity row navigates to the relevant page
- Hover state provides visual feedback
- "View all activity →" link is visible and functional
---
## Wire Agent Health table colors to computed thresholds

- type: task
- priority: 1
- labels: frontend, ux, redesign
- estimate: 120

### Description


Update the Agent Health table to use computed status from real data instead of hardcoded values, and apply correct color coding to all metrics.

**Wireframe:** `frontend/branding/wireframes/command-center/index.txt` — Agent Health Table

**Requirements**
1. **Status dot logic**:
   - ● healthy (emerald-400): pass rate >= 90%
   - ◐ degraded (amber-400): pass rate 70-89%
   - ○ failing (rose-400): pass rate < 70% or no data
2. **Pass rate cell color**:
   - >= 90%: `text-status-success`
   - >= 70%: `text-status-warning`
   - < 70%: `text-status-error`
3. **Latency cell color**:
   - < 500ms: `text-status-success`
   - < 2000ms: `text-status-warning`
   - >= 2000ms: `text-status-error`
4. **Cost cell**: No color coding, just formatted as `$0.12`
5. Each row links to `/agents/{agentId}`

### Acceptance Criteria
- Status dots reflect actual pass rate thresholds
- All cells use correct color tokens
- Clicking row navigates to agent detail page