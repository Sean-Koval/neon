# Eval Runs Enhancement

- type: epic
- priority: 1
- labels: frontend, ux, eval-runs


Enhance the Eval Runs pages (`/eval-runs` list and `/eval-runs/[id]` detail) from ~35% to full implementation. The list page needs richer table columns, search/filters, summary stats, bulk compare flow, and a redesigned Start Run dialog. The detail page needs scorer breakdowns, stat cards, action buttons, test case filtering, CSV export, hidden Temporal internals, and a progress hero card for running state.

**Wireframes:**
- `frontend/branding/wireframes/eval-runs/index.txt` (466 lines) — list page
- `frontend/branding/wireframes/eval-runs/detail.txt` (554 lines) — detail page

**Current state:** ~35% implemented. Basic list with status filter. Detail page has real-time WebSocket support but basic UI.

**Key files:**
- `frontend/app/eval-runs/page.tsx` — list page
- `frontend/app/eval-runs/[id]/page.tsx` — detail page
- `frontend/components/eval-runs/start-eval-run-dialog.tsx` — start run dialog
- `frontend/components/eval-runs/eval-run-results.tsx` — results display
- `frontend/components/eval-runs/eval-run-progress.tsx` — progress display

---
## Add score, suite, and agent columns to eval runs table

- type: task
- priority: 1
- labels: frontend, ux, eval-runs
- estimate: 180

### Description


Enrich the eval runs list table with new columns for Agent, Suite, and Score so users can immediately assess run context and outcomes without clicking into detail.

**Wireframe:** `frontend/branding/wireframes/eval-runs/index.txt` — "Runs Table" section

**Requirements**

1. **Agent column**:
   - Display agent name + version badge (e.g. `booking-agent` `v1.2`)
   - Agent name links to `/agents/[agentId]`
   - Fall back to agent ID if name is not available

2. **Suite column**:
   - Display suite name linking to `/suites/[suiteId]`
   - Show test case count as secondary text (e.g. `50 cases`)

3. **Score column**:
   - Show pass rate as percentage with color coding: emerald >= 90%, amber >= 70%, rose < 70%
   - Show average score below pass rate in smaller text
   - Show `—` for runs still in RUNNING or PENDING state

4. **Run ID column** (replaces Workflow ID):
   - Remove exposed Temporal Workflow ID
   - Replace with formatted Run ID (e.g. `#142` or short hash)
   - Keep Workflow ID accessible only in debug/detail views

5. **Sort running runs to top** of the table regardless of other sort criteria

**Key Files**
- `frontend/app/eval-runs/page.tsx` — main table rendering
- tRPC router providing runs data (check `frontend/server/trpc/routers/`)

### Acceptance Criteria
- Table shows Agent (name + version), Suite (linked name + case count), and Score (pass rate % + avg score) columns
- Workflow ID is no longer displayed in the table
- Running runs always appear at the top of results
- Agent name links to agent detail page, suite name links to suite detail page
- Score cells are colored by threshold
---
## Add search and advanced filters to eval runs list

- type: task
- priority: 1
- labels: frontend, ux, eval-runs
- estimate: 180

### Description


Add search input and filter dropdowns to the eval runs list page so users can quickly locate specific runs by name, suite, agent, or time range.

**Wireframe:** `frontend/branding/wireframes/eval-runs/index.txt` — "Filters" section

**Requirements**

1. **Search input**:
   - Text input with search icon placeholder "Search by run ID or name..."
   - Debounced at 300ms before triggering filter
   - Filters client-side on current results or passes query param to API

2. **Suite dropdown**:
   - Populated from `trpc.suites.list` query
   - Shows suite names, filters runs to selected suite
   - Default: "All Suites"

3. **Agent dropdown**:
   - Populated from `trpc.agents.list` query
   - Shows agent names, filters runs to selected agent
   - Default: "All Agents"

4. **Time Range dropdown**:
   - Options: Last hour, Last 24h, Last 7d, Last 30d, All time
   - Default: "Last 7d"

5. **Active filter pills**:
   - Show pills below the filter bar for each active filter
   - Each pill has an X button to remove that filter
   - "Clear all" link when multiple filters are active

6. **URL sync**:
   - All filter values synced to URL via shallow routing (`?suite=X&agent=Y&range=7d&q=search`)
   - Page load restores filters from URL params

**Key Files**
- `frontend/app/eval-runs/page.tsx` — add filter bar above table

### Acceptance Criteria
- Search input filters runs with 300ms debounce
- Suite and Agent dropdowns populate from real data
- Time Range dropdown filters by creation timestamp
- Active filters show as removable pills
- URL reflects current filter state and survives page refresh
---
## Add summary stats strip to eval runs list

- type: task
- priority: 1
- labels: frontend, ux, eval-runs
- estimate: 180

### Description


Add a 4-card summary stats strip at the top of the eval runs list page to give users an instant overview of eval activity.

**Wireframe:** `frontend/branding/wireframes/eval-runs/index.txt` — "Summary Stats" section

**Requirements**

1. **Total Runs card**:
   - Count of all runs matching current filters
   - Subtitle: "last 7d" or matching the active time range filter

2. **Currently Running card**:
   - Count of runs with status RUNNING
   - Include animated pulse dot (CSS `animate-pulse` on a small emerald circle) next to the count when > 0
   - Show "0" with no animation when nothing is running

3. **Avg Pass Rate card**:
   - Average pass rate across all completed runs in the current filter
   - Color coded: emerald >= 90%, amber >= 70%, rose < 70%

4. **Total Cost card**:
   - Sum of `total_cost` across all runs in current filter
   - Formatted as `$12.34`

5. **Layout**: 4 cards in a responsive grid (`grid-cols-2 md:grid-cols-4`), consistent with existing dashboard stat card patterns

**Key Files**
- `frontend/app/eval-runs/page.tsx` — add stats strip above filters
- `frontend/components/dashboard/stat-cards.tsx` — reuse or adapt existing stat card component

### Acceptance Criteria
- 4 stat cards display at top of page
- Currently Running card has pulse animation when runs are active
- Stats respect active filters (suite, agent, time range)
- Cards are responsive (2 columns on mobile, 4 on desktop)
---
## Add bulk selection and compare flow to eval runs list

- type: task
- priority: 2
- labels: frontend, ux, eval-runs
- estimate: 180

### Description


Add row selection checkboxes to the eval runs table and a sticky action bar that enables comparing two selected runs side by side.

**Wireframe:** `frontend/branding/wireframes/eval-runs/index.txt` — "Bulk Actions" section

**Requirements**

1. **Row checkboxes**:
   - Add checkbox column as first column in the table
   - Select/deselect individual rows
   - Header checkbox for select all on current page (if paginated)
   - Store selected run IDs in component state

2. **Sticky bottom action bar**:
   - Appears when exactly 2 rows are selected
   - Fixed to bottom of viewport with backdrop blur: `fixed bottom-0 inset-x-0 bg-surface/80 backdrop-blur`
   - Content: "2 runs selected" label + "Compare Selected" primary button
   - Animates in from bottom (slide up transition)

3. **Compare navigation**:
   - "Compare Selected" button navigates to `/compare?baseline={firstId}&candidate={secondId}`
   - First selected run becomes baseline, second becomes candidate
   - If more than 2 selected, button is disabled with tooltip "Select exactly 2 runs to compare"

4. **Selection UX**:
   - Selected rows have subtle highlight: `bg-primary/5`
   - Clicking anywhere on the row (except links) toggles selection
   - Escape key clears selection

**Key Files**
- `frontend/app/eval-runs/page.tsx` — table with selection state
- `frontend/app/compare/page.tsx` — existing compare page (receives query params)

### Acceptance Criteria
- Checkboxes appear on each table row
- Sticky bar appears when exactly 2 runs are selected
- "Compare Selected" navigates to compare page with correct run IDs
- Bar slides away when selection is cleared
- Selection state clears on navigation
---
## Redesign Start Eval Run dialog as suite-first flow

- type: task
- priority: 1
- labels: frontend, ux, eval-runs
- estimate: 360

### Description


Redesign the Start Eval Run dialog from its current basic form into a suite-first flow where users select a suite first, then the agent and execution options auto-populate from the suite configuration.

**Wireframe:** `frontend/branding/wireframes/eval-runs/index.txt` — "Start Eval Run Dialog" section

**Requirements**

1. **Suite-first tab (default)**:
   - Suite selector dropdown populated from `trpc.suites.list`
   - On suite selection, show suite preview card:
     - Suite name, description
     - Test case count (e.g. "50 test cases")
     - Scorer count and names (e.g. "3 scorers: accuracy, latency, tool-use")
     - Min score threshold
   - Agent field auto-fills from suite's configured agent
   - Version input defaults to "latest" with option to override

2. **Execution options section**:
   - Parallel execution toggle (default: on)
   - Worker count slider (1-10, default from suite config or 5)
   - Timeout override input (optional, defaults to suite config)

3. **Custom run tab (secondary)**:
   - Manual agent + suite selection for ad-hoc runs
   - Same execution options

4. **Validation**:
   - Suite must be selected
   - Agent must have at least one version available
   - Submit calls `trpc.evals.triggerRun` with suite ID, agent ID, version, and execution options

5. **Dialog UX**:
   - Uses existing dialog/modal pattern from the codebase
   - Submit button: "Start Run" with loading state
   - Cancel button to close

**Key Files**
- `frontend/components/eval-runs/start-eval-run-dialog.tsx` — rewrite dialog content
- `frontend/app/eval-runs/page.tsx` — dialog trigger button

### Acceptance Criteria
- Default tab shows suite-first flow with suite preview card
- Selecting a suite auto-fills agent and shows suite details
- Execution options (parallel, workers, timeout) are configurable
- Submit triggers eval run via tRPC and closes dialog
- Form validates required fields before submission
---
## Build scorer breakdown section on eval run detail page

- type: task
- priority: 1
- labels: frontend, ux, eval-runs
- estimate: 360

### Description


Add a scorer breakdown section to the eval run detail page that shows per-scorer pass rates and score distributions, helping users identify which specific scorers are dragging down overall performance.

**Wireframe:** `frontend/branding/wireframes/eval-runs/detail.txt` — "Scorer Breakdown" section

**Requirements**

1. **Per-scorer pass rate bars**:
   - Horizontal bar chart showing pass rate for each scorer
   - Sorted worst-first (lowest pass rate at top) to surface problems immediately
   - Bar color: emerald >= 90%, amber >= 70%, rose < 70%
   - Label: scorer name on left, percentage on right
   - Each bar shows `passed / total` count as secondary text

2. **Score distribution histogram**:
   - Recharts `<BarChart>` showing score distribution across all test cases
   - X-axis: score buckets (0.0-0.1, 0.1-0.2, ..., 0.9-1.0)
   - Y-axis: count of test cases in each bucket
   - Highlight bimodal patterns (common in pass/fail scorers)
   - Color bars by threshold: emerald for buckets above min score, rose for below

3. **Data source**:
   - Derive from the test case results already fetched on the detail page
   - Group results by scorer name, compute per-scorer pass rate and score arrays
   - No additional API calls needed if results include per-scorer breakdowns

4. **Layout**: Section appears below the results summary cards, above the test cases table

**Key Files**
- `frontend/app/eval-runs/[id]/page.tsx` — add scorer breakdown section
- `frontend/components/eval-runs/eval-run-results.tsx` — may contain relevant data structures

### Acceptance Criteria
- Per-scorer horizontal bars display sorted worst-first
- Score distribution histogram renders with correct bucket counts
- Colors reflect pass/fail thresholds
- Section handles edge cases: single scorer, all passing, all failing, no results yet
---
## Add results summary stat cards to eval run detail

- type: task
- priority: 1
- labels: frontend, ux, eval-runs
- estimate: 180

### Description


Add a 4-card results summary strip to the eval run detail page header area that provides at-a-glance performance metrics.

**Wireframe:** `frontend/branding/wireframes/eval-runs/detail.txt` — "Results Summary" section

**Requirements**

1. **Pass Rate card** (large/hero variant):
   - Large percentage display (e.g. `87%`)
   - Subtitle: "X of Y passed"
   - Background tint based on threshold: emerald >= 90%, amber >= 70%, rose < 70%

2. **Avg Score card**:
   - Average numerical score across all test cases (e.g. `0.84`)
   - Colored by same threshold logic as pass rate

3. **Avg Latency card**:
   - Average execution time per test case
   - Formatted as human-readable: `1.2s`, `450ms`
   - Color: emerald < 500ms, amber < 2000ms, rose >= 2000ms

4. **Total Cost card**:
   - Sum of costs across all test cases in the run
   - Formatted as `$12.34`
   - No color coding (neutral)

5. **Layout**: 4 cards in grid, first card (Pass Rate) may be wider or visually emphasized

**Key Files**
- `frontend/app/eval-runs/[id]/page.tsx` — add stat cards below header, above results

### Acceptance Criteria
- 4 stat cards display with correct values from run data
- Pass Rate, Avg Score, and Avg Latency are color coded by thresholds
- Cards show placeholder/skeleton while data loads
- Cards show `—` for metrics not yet available (run still in progress)
---
## Add Rerun and Compare buttons to eval run detail header

- type: task
- priority: 2
- labels: frontend, ux, eval-runs
- estimate: 180

### Description


Add action buttons to the eval run detail page header for re-running the same configuration and comparing with the previous run of the same suite and agent.

**Wireframe:** `frontend/branding/wireframes/eval-runs/detail.txt` — "Header Actions" section

**Requirements**

1. **Rerun button**:
   - Secondary button with refresh icon: "Rerun"
   - On click: calls `trpc.evals.triggerRun` with same suite ID, agent ID, and version as the current run
   - Shows loading spinner during API call
   - On success: navigates to the new run's detail page (`/eval-runs/[newId]`)
   - On failure: shows toast error

2. **Compare with Previous button**:
   - Secondary button with git-compare icon: "Compare with Previous"
   - Logic: query `trpc.evals.listRuns` filtered by same suite + agent, ordered by creation time desc, take the run immediately before the current one
   - On click: navigates to `/compare?baseline={previousRunId}&candidate={currentRunId}`
   - Disabled with tooltip "No previous run found" if this is the first run for that suite+agent combination

3. **Button placement**: Right side of the detail page header, alongside any existing actions

**Key Files**
- `frontend/app/eval-runs/[id]/page.tsx` — add buttons to header area

### Acceptance Criteria
- "Rerun" creates a new run with same configuration and navigates to it
- "Compare with Previous" finds the prior run and opens comparison view
- "Compare with Previous" is disabled when no prior run exists
- Loading states and error handling are properly implemented
---
## Add test case filter tabs on eval run detail

- type: task
- priority: 1
- labels: frontend, ux, eval-runs
- estimate: 180

### Description


Add filter tabs and expandable rows to the test case results table on the eval run detail page, allowing users to focus on passed or failed cases and drill into per-scorer details.

**Wireframe:** `frontend/branding/wireframes/eval-runs/detail.txt` — "Test Cases" section

**Requirements**

1. **Filter tabs**:
   - Three tabs above the results table: All / Passed / Failed
   - Show count in each tab: `All (50)`, `Passed (42)`, `Failed (8)`
   - Active tab styled with primary underline
   - Filter is client-side on already-fetched results

2. **Expandable rows**:
   - Each test case row has a chevron icon on the left
   - Click chevron to expand/collapse the row detail
   - Expanded view shows per-scorer cards:
     - Scorer name, individual score, pass/fail status
     - Scorer reason/explanation text if available
   - Multiple rows can be expanded simultaneously

3. **Trace link**:
   - Each test case row shows a link icon or "View Trace" button
   - Links to `/traces/[traceId]` for the test case's execution trace
   - Only shown if `traceId` is present on the result

**Key Files**
- `frontend/app/eval-runs/[id]/page.tsx` — results table with tabs and expandable rows

### Acceptance Criteria
- All/Passed/Failed tabs filter the results table correctly
- Tab counts reflect actual data
- Clicking chevron expands row to show per-scorer breakdown
- Each expanded scorer card shows name, score, and reason
- Trace link navigates to the correct trace detail page
---
## Add CSV export to eval run detail page

- type: task
- priority: 3
- labels: frontend, ux, eval-runs
- estimate: 60

### Description


Add CSV export capability alongside the existing JSON export on the eval run detail page.

**Wireframe:** `frontend/branding/wireframes/eval-runs/detail.txt` — "Export" section

**Requirements**

1. **Export dropdown**:
   - Replace single export button with a dropdown: "Export JSON" / "Export CSV"
   - Or add "CSV" option alongside existing JSON export

2. **CSV format**:
   - One row per test case
   - Columns: `test_case_id`, `test_case_name`, `status` (passed/failed), `overall_score`, then one column per scorer (e.g. `scorer_accuracy`, `scorer_latency`)
   - Include run metadata in header comment or first rows: run ID, suite name, agent, timestamp
   - Handle edge cases: missing scorer values as empty cells, special characters escaped

3. **Download**:
   - Generate CSV client-side from already-fetched results data
   - Trigger browser download with filename: `eval-run-{runId}-{date}.csv`

**Key Files**
- `frontend/app/eval-runs/[id]/page.tsx` — add export option

### Acceptance Criteria
- CSV export option available alongside JSON export
- Downloaded CSV has one row per test case with correct columns
- Scorer columns are dynamically generated based on the run's scorers
- File downloads with descriptive filename
---
## Hide Temporal internals from eval run detail page

- type: task
- priority: 2
- labels: frontend, ux, eval-runs
- estimate: 60

### Description


Remove Temporal Workflow ID and Temporal UI link from the main detail page view, replacing them with a user-friendly Run ID. Keep Temporal metadata accessible in a collapsed debug section for power users.

**Wireframe:** `frontend/branding/wireframes/eval-runs/detail.txt` — "Header" section

**Requirements**

1. **Remove from main view**:
   - Remove Temporal Workflow ID display from the header/metadata area
   - Remove direct link to Temporal UI

2. **Show Run ID**:
   - Display formatted Run ID (e.g. `Run #142` or the short ID) as the primary identifier
   - Show creation timestamp, duration, and status as secondary metadata

3. **Debug Info section** (collapsed by default):
   - Collapsible section at the bottom of the page or in a "Debug" tab
   - Contains: Workflow ID, Temporal namespace, Temporal UI link, worker info
   - Uses `<details>` / `<summary>` or a collapsible card component
   - Label: "Debug Info" or "Temporal Details"

**Key Files**
- `frontend/app/eval-runs/[id]/page.tsx` — modify header and add debug section

### Acceptance Criteria
- Workflow ID and Temporal UI link are not visible in the main page view
- Run ID is prominently displayed as the primary identifier
- "Debug Info" section is collapsed by default and expandable
- Temporal metadata is still accessible for debugging when expanded
---
## Build progress hero card for running eval state

- type: task
- priority: 1
- labels: frontend, ux, eval-runs
- estimate: 180

### Description


Build a prominent progress hero card that replaces the summary stat cards when an eval run is in RUNNING state, providing real-time progress tracking and control actions.

**Wireframe:** `frontend/branding/wireframes/eval-runs/detail.txt` — "Progress Hero" section

**Requirements**

1. **Progress hero card** (replaces summary stats when status is RUNNING):
   - Large progress bar showing completion percentage (e.g. `45/100 test cases`)
   - Real-time stats row: Completed, Passed, Failed, Elapsed time
   - Progress bar color: primary gradient fill, animated stripe pattern for activity
   - Updates via existing WebSocket/real-time connection

2. **Control buttons**:
   - "Pause" button: pauses the eval run (calls relevant tRPC mutation or Temporal signal)
   - "Cancel" button: cancels the run with confirmation dialog
   - Buttons disabled with appropriate states during transitions

3. **Live results streaming**:
   - Results stream in as they complete, newest-first ordering
   - Each result appears with a subtle slide-in animation
   - Results table below the progress card shows completed cases so far

4. **Scorer breakdown preview**:
   - After >= 10 test cases have completed, show a preliminary scorer breakdown
   - Same horizontal bar format as the full scorer breakdown section
   - Label: "Preliminary Results (X of Y completed)"

5. **State transition**: When run completes, hero card animates out and summary stat cards animate in

**Key Files**
- `frontend/app/eval-runs/[id]/page.tsx` — conditional rendering based on run status
- `frontend/components/eval-runs/eval-run-progress.tsx` — existing progress component to enhance

### Acceptance Criteria
- Progress hero card displays when run status is RUNNING
- Progress bar and stats update in real-time
- Pause and Cancel buttons function correctly
- Results stream in as they complete
- Preliminary scorer breakdown appears after 10+ completions
- Hero card transitions to summary cards when run completes
---
## Suites Enhancement

- type: epic
- priority: 1
- labels: frontend, ux, suites

### Description


Enhance the Suites pages (`/suites` list and `/suites/[id]` detail) from ~30% to full implementation. The list page needs summary stats, search/filters, enriched suite cards with last run data and action buttons. The detail page needs action buttons, stat cards, expandable test case cards, score trend chart, run history table, and an add case form.

**Wireframes:**
- `frontend/branding/wireframes/suites/index.txt` (253 lines) — list page
- `frontend/branding/wireframes/suites/detail.txt` (460 lines) — detail page

**Current state:** ~30% implemented. Basic card grid. No filters, no run history, no action buttons.

**Key files:**
- `frontend/app/suites/page.tsx` — list page
- `frontend/app/suites/[id]/page.tsx` — detail page
- `frontend/components/` — suite-related components (to be created)
---
## Add summary stats strip to suites list

- type: task
- priority: 1
- labels: frontend, ux, suites
- estimate: 180

### Description


Add a 4-card summary stats strip at the top of the suites list page to provide an overview of the test suite landscape.

**Wireframe:** `frontend/branding/wireframes/suites/index.txt` — "Summary Stats" section

**Requirements**

1. **Suites card**:
   - Total count of suites
   - Subtitle: "active" or filter context

2. **Total Cases card**:
   - Sum of test case counts across all suites
   - Derived from `suites.map(s => s.testCases.length).reduce(sum)`

3. **Avg Pass Rate card**:
   - Average pass rate from the most recent run of each suite
   - Query: for each suite, get latest run from `trpc.evals.listRuns`, average their pass rates
   - Color coded: emerald >= 90%, amber >= 70%, rose < 70%
   - Show `—` if no suites have been run

4. **Last Run card**:
   - Timestamp of the most recent run across all suites
   - Formatted as relative time: "2 hours ago", "yesterday"
   - Show "Never" if no runs exist

5. **Layout**: 4 cards in responsive grid (`grid-cols-2 md:grid-cols-4`)

**Key Files**
- `frontend/app/suites/page.tsx` — add stats strip above search/filter bar

### Acceptance Criteria
- 4 stat cards display at top of suites page
- Total Cases sums across all suites
- Avg Pass Rate derives from most recent run per suite
- Last Run shows relative timestamp
- Cards are responsive
---
## Add search and filter dropdowns to suites list

- type: task
- priority: 1
- labels: frontend, ux, suites
- estimate: 180

### Description


Add search input and filter/sort dropdowns to the suites list page so users can quickly find and organize their test suites.

**Wireframe:** `frontend/branding/wireframes/suites/index.txt` — "Filters" section

**Requirements**

1. **Search input**:
   - Text input with search icon: "Search suites..."
   - Filters suite cards by name (client-side, debounced 300ms)

2. **Agent dropdown**:
   - Populated from unique agent IDs/names across all suites
   - Filters to suites configured for the selected agent
   - Default: "All Agents"

3. **Scorer dropdown**:
   - Populated from unique scorer names across all suites
   - Filters to suites that include the selected scorer
   - Default: "All Scorers"

4. **Sort dropdown**:
   - Options: Newest First, Oldest First, Name (A-Z), Worst Score First
   - "Worst Score First" sorts by last run pass rate ascending (failing suites first)
   - Default: "Newest First"

5. **URL sync**:
   - All filter values synced to URL via shallow routing (`?q=search&agent=X&scorer=Y&sort=newest`)
   - Page load restores filters from URL params

**Key Files**
- `frontend/app/suites/page.tsx` — add filter bar above card grid

### Acceptance Criteria
- Search filters cards by suite name with 300ms debounce
- Agent and Scorer dropdowns filter correctly
- Sort dropdown reorders cards
- URL reflects filter state and survives refresh
---
## Add last run stats to suite cards

- type: task
- priority: 1
- labels: frontend, ux, suites
- estimate: 180

### Description


Enrich each suite card on the list page with data from its most recent eval run, so users can see suite health at a glance without clicking into detail.

**Wireframe:** `frontend/branding/wireframes/suites/index.txt` — "Suite Card" section

**Requirements**

1. **Data fetching**:
   - For each suite, query `trpc.evals.listRuns` with `suiteId` filter, `limit: 1`, sorted by creation time desc
   - Cache aggressively (staleTime: 60s) since this is an N+1 query pattern
   - Consider a batch endpoint or aggregate query if performance is a concern

2. **Card additions**:
   - **Last run timestamp**: Relative time (e.g. "3h ago") in card footer
   - **Pass rate**: Displayed as percentage with color coding (emerald >= 90%, amber >= 70%, rose < 70%)
   - **Avg score**: Displayed as decimal (e.g. `0.87`) with same color coding

3. **No runs state**:
   - Show "Never run" in muted text where pass rate / timestamp would be
   - Optionally show a subtle call-to-action: "Run now" link

**Key Files**
- `frontend/app/suites/page.tsx` — suite card rendering
- Suite card component (may be inline or a separate component)

### Acceptance Criteria
- Each suite card shows last run timestamp, pass rate, and avg score
- Colors reflect pass/fail thresholds
- Suites with no runs show "Never run" state
- Data loads without blocking the card grid render (skeleton/placeholder)
---
## Add Run Suite button to suite cards

- type: task
- priority: 2
- labels: frontend, ux, suites
- estimate: 60

### Description


Add a "Run" action button to each suite card on the list page that opens the Start Eval Run dialog pre-filled with the suite's configuration.

**Wireframe:** `frontend/branding/wireframes/suites/index.txt` — "Suite Card" actions area

**Requirements**

1. **Button placement**:
   - Secondary/ghost button with play icon on each suite card
   - Positioned in the card's action area (top-right corner or footer)
   - Label: "Run" or just the play icon with tooltip "Run Suite"

2. **Pre-fill behavior**:
   - On click, opens the `StartEvalRunDialog` component
   - Dialog opens with suite pre-selected (suite dropdown set to this suite's ID)
   - Agent field auto-fills from the suite's configured agent
   - Version defaults to "latest"

3. **Integration**:
   - Reuses the existing `StartEvalRunDialog` component
   - Pass `defaultSuiteId` prop to the dialog

**Key Files**
- `frontend/app/suites/page.tsx` — add button to card rendering
- `frontend/components/eval-runs/start-eval-run-dialog.tsx` — accept `defaultSuiteId` prop

### Acceptance Criteria
- Each suite card has a "Run" button
- Clicking opens StartEvalRunDialog with suite pre-selected
- Agent auto-fills from suite configuration
- Dialog submit triggers eval run correctly
---
## Fix New Suite button destination

- type: task
- priority: 1
- labels: frontend, bug, suites
- estimate: 30

### Description


Fix the "New Suite" button on the suites list page which currently incorrectly navigates to `/eval-runs` instead of initiating suite creation.

**Wireframe:** `frontend/branding/wireframes/suites/index.txt` — "Header" section

**Requirements**

1. **Current behavior** (broken): "New Suite" button links to `/eval-runs`
2. **Expected behavior**: Button should either:
   - Open a "Create Suite" dialog/modal, or
   - Navigate to `/suites/new` (suite creation page)
3. **Implementation**: If no create suite dialog exists yet, navigate to a placeholder `/suites/new` page with a "Coming soon" message, or wire up to `trpc.suites.create` if the mutation exists

**Key Files**
- `frontend/app/suites/page.tsx` — fix the button's onClick/href

### Acceptance Criteria
- "New Suite" button does NOT navigate to `/eval-runs`
- Button initiates suite creation flow (dialog or new page)
- No broken navigation
---
## Add agent name and scorer badges to suite cards

- type: task
- priority: 2
- labels: frontend, ux, suites
- estimate: 60

### Description


Enhance suite cards to display the linked agent's name instead of just the ID, and show individual scorer name badges instead of just a count.

**Wireframe:** `frontend/branding/wireframes/suites/index.txt` — "Suite Card" content area

**Requirements**

1. **Agent name display**:
   - Resolve agent ID to agent name via `trpc.agents.list` or a lookup map
   - Display as: agent icon + agent name (e.g. `booking-agent`)
   - If name resolution fails, fall back to showing the ID
   - Link agent name to `/agents/[agentId]`

2. **Scorer badges**:
   - Replace "3 scorers" text with individual badge components
   - Each badge shows the scorer name (e.g. `accuracy`, `latency`, `tool-use`)
   - Use existing `<Badge>` component with `variant="outline"` or similar
   - If > 4 scorers, show first 3 badges + `+2 more` overflow badge

**Key Files**
- `frontend/app/suites/page.tsx` — card content rendering
- `frontend/components/ui/badge.tsx` — existing badge component

### Acceptance Criteria
- Agent name (not ID) displayed on each card, linked to agent page
- Individual scorer badges replace generic count
- Overflow handled gracefully for suites with many scorers
---
## Build suite detail action buttons

- type: task
- priority: 1
- labels: frontend, ux, suites
- estimate: 180

### Description


Add action buttons to the suite detail page header for running the suite, editing its configuration, and deleting it.

**Wireframe:** `frontend/branding/wireframes/suites/detail.txt` — "Header Actions" section

**Requirements**

1. **Run Suite button** (primary CTA):
   - Primary styled button with play icon
   - Opens `StartEvalRunDialog` pre-filled with this suite's ID and agent
   - Positioned right side of the header

2. **Edit Suite button**:
   - Secondary/outline button with pencil icon
   - Navigates to edit view or opens edit modal
   - If edit flow doesn't exist yet, navigate to placeholder or show toast "Edit coming soon"

3. **Delete button** (danger variant):
   - Danger/destructive styled button with trash icon
   - Opens confirmation dialog before deletion:
     - Shows suite name and test case count
     - Warning text: "This will delete the suite definition. Existing eval runs will be preserved."
     - Confirm button: "Delete Suite" (red)
     - Cancel button
   - On confirm: calls `trpc.suites.delete` (or equivalent mutation)
   - On success: navigates to `/suites` with success toast
   - On failure: shows error toast

**Key Files**
- `frontend/app/suites/[id]/page.tsx` — add buttons to header
- `frontend/components/eval-runs/start-eval-run-dialog.tsx` — reuse for Run Suite

### Acceptance Criteria
- Three action buttons visible in suite detail header
- "Run Suite" opens pre-filled dialog
- "Delete" shows confirmation with suite details and case count warning
- Deletion navigates back to suites list with confirmation
---
## Add summary stat cards to suite detail

- type: task
- priority: 1
- labels: frontend, ux, suites
- estimate: 180

### Description


Add a 4-card summary strip to the suite detail page showing key metrics about the suite and its run history.

**Wireframe:** `frontend/branding/wireframes/suites/detail.txt` — "Summary Stats" section

**Requirements**

1. **Test Cases card**:
   - Count of test cases in the suite
   - Derived from `suite.testCases.length`

2. **Last Pass Rate card**:
   - Pass rate from the most recent completed run
   - Query: `trpc.evals.listRuns` with `suiteId` filter, `status: COMPLETED`, `limit: 1`
   - Color coded: emerald >= 90%, amber >= 70%, rose < 70%
   - Show `—` if no completed runs

3. **Avg Score card**:
   - Average score from the most recent completed run
   - Same data source as Last Pass Rate
   - Color coded by same thresholds

4. **Total Runs card**:
   - Total count of runs for this suite (all statuses)
   - Query: `trpc.evals.listRuns` with `suiteId` filter, count total

5. **Layout**: 4 cards in responsive grid below header, above test cases section

**Key Files**
- `frontend/app/suites/[id]/page.tsx` — add stat cards section

### Acceptance Criteria
- 4 stat cards display correct values
- Pass rate and avg score are color coded by thresholds
- "—" shown for metrics when no runs exist
- Cards load with skeleton state
---
## Build expandable test case cards

- type: task
- priority: 1
- labels: frontend, ux, suites
- estimate: 360

### Description


Replace the current flat test case display on the suite detail page with rich expandable cards that show input data, expectations, and configuration per case.

**Wireframe:** `frontend/branding/wireframes/suites/detail.txt` — "Test Cases" section

**Requirements**

1. **Collapsed state** (default):
   - Chevron icon (right-pointing, rotates on expand)
   - Case number (e.g. `#1`)
   - Case name or input preview (truncated to ~60 chars)
   - Min score badge (e.g. `min: 0.8`)
   - Tags as small badges if present

2. **Expanded state** (on click):
   - Chevron rotates to point down
   - Three sub-sections with clear labels:

   **Input** section:
   - JSON syntax highlighted display using `<pre>` with code styling
   - Shows the full input object for the test case
   - Scrollable if large (max-height with overflow)

   **Expectations** section:
   - Expected tools: sequence of tool name badges (e.g. `search` -> `book` -> `confirm`)
   - Expected output pattern: displayed as text or regex pattern
   - Only show sub-items that exist (some cases may not have tool expectations)

   **Configuration** section:
   - Scorer overrides: if the case overrides suite-level scorer config
   - Timeout: if case has custom timeout
   - Tags: displayed as badges
   - Only show if any config overrides exist

3. **Interaction**:
   - Click anywhere on collapsed card to toggle
   - Multiple cards can be expanded simultaneously
   - Smooth expand/collapse animation (height transition)

**Key Files**
- `frontend/app/suites/[id]/page.tsx` — replace test case rendering with expandable cards

### Acceptance Criteria
- Test cases display as collapsible cards with number, name, and min score
- Expanding shows Input JSON (syntax highlighted), Expectations, and Configuration
- Multiple cards can be expanded at once
- Animation is smooth on expand/collapse
- Edge cases handled: empty input, no expectations, no config overrides
---
## Build score trend chart on suite detail

- type: task
- priority: 2
- labels: frontend, ux, suites
- estimate: 180

### Description


Add a line chart to the suite detail page showing the score trend across the last 10 runs, helping users visualize whether the suite's performance is improving or degrading.

**Wireframe:** `frontend/branding/wireframes/suites/detail.txt` — "Score Trend" section

**Requirements**

1. **Chart type**: Recharts `<LineChart>` with `<ResponsiveContainer>`

2. **Data**:
   - Query last 10 completed runs for this suite from `trpc.evals.listRuns`
   - X-axis: run number or date (e.g. `Run #138`, `Run #139`, ...)
   - Y-axis: score scale 0.0 to 1.0
   - Data points: average score per run

3. **Min score threshold line**:
   - Dashed horizontal `<ReferenceLine>` at the suite's `minScore` value
   - Label: "min score" on the right side
   - Color: amber or muted

4. **Clickable data points**:
   - Custom dot component that responds to click
   - Click navigates to `/eval-runs/[runId]`
   - Hover tooltip shows: run ID, date, score, pass rate

5. **Styling**:
   - Line color: primary
   - Fill area below line with gradient (primary -> transparent)
   - Grid lines: subtle, horizontal only
   - No chart if fewer than 2 data points; show "Not enough data" message

**Key Files**
- `frontend/app/suites/[id]/page.tsx` — add chart section
- `frontend/components/charts/` — existing chart components for reference

### Acceptance Criteria
- Line chart shows scores from last 10 runs
- Dashed min score threshold line is visible
- Clicking a data point navigates to that run's detail page
- Tooltip shows run details on hover
- "Not enough data" message when fewer than 2 runs
---
## Build run history table on suite detail

- type: task
- priority: 1
- labels: frontend, ux, suites
- estimate: 180

### Description


Add a run history table to the suite detail page showing the last 10 runs with key metrics and navigation to individual run details.

**Wireframe:** `frontend/branding/wireframes/suites/detail.txt` — "Run History" section

**Requirements**

1. **Table columns**:
   - **Run #**: Formatted run number or short ID
   - **Version**: Agent version used for the run
   - **Status**: Badge showing COMPLETED (emerald), RUNNING (blue with pulse), FAILED (rose), CANCELLED (gray)
   - **Pass %**: Pass rate percentage, color coded by threshold
   - **Score**: Average score, color coded by threshold
   - **Time**: Duration of the run (e.g. `2m 34s`)
   - **Trigger**: How the run was started — manual, scheduled, CI (badge or icon)

2. **Data source**:
   - Query `trpc.evals.listRuns` with `suiteId` filter, `limit: 10`, sorted by creation time desc
   - Include all statuses (completed, running, failed, cancelled)

3. **Row interaction**:
   - Click row navigates to `/eval-runs/[runId]`
   - Hover state: `hover:bg-surface-hover`
   - Running rows may have subtle pulsing background

4. **Empty state**:
   - Message: "No runs yet"
   - CTA button: "Run Suite" that opens the StartEvalRunDialog pre-filled with this suite

**Key Files**
- `frontend/app/suites/[id]/page.tsx` — add run history table section

### Acceptance Criteria
- Table shows last 10 runs with all specified columns
- Status badges are correctly colored
- Pass % and Score cells are color coded by thresholds
- Clicking a row navigates to eval run detail page
- Empty state shows "No runs yet" with "Run Suite" CTA
- Running runs show visual activity indicator
---
## Add "Add Case" button and inline form to suite detail

- type: task
- priority: 2
- labels: frontend, ux, suites
- estimate: 60

### Description


Add the ability to create new test cases directly from the suite detail page via an "Add Case" button that opens an inline form or modal.

**Wireframe:** `frontend/branding/wireframes/suites/detail.txt` — "Test Cases" section header

**Requirements**

1. **Button placement**:
   - "Add Case" button in the test cases section header, right-aligned
   - Icon: plus icon
   - Style: secondary/outline button

2. **Form fields** (inline form or modal):
   - **Input JSON**: Code editor textarea for the test case input (JSON format)
   - **Expected Output**: Text input or textarea for expected output pattern
   - **Expected Tools**: Comma-separated input or tag input for expected tool sequence
   - **Scorer Overrides**: Optional JSON textarea for scorer-specific configuration
   - **Tags**: Tag input for categorizing the test case
   - **Min Score**: Number input (0.0 - 1.0) with default from suite config

3. **Validation**:
   - Input JSON must be valid JSON (validate on blur or submit)
   - Min score must be between 0.0 and 1.0
   - At least Input JSON is required

4. **Submission**:
   - Submit calls `trpc.suites.createCase` (or `trpc.suites.addTestCase`) with suite ID and case data
   - On success: new case appears in the list, form resets, success toast
   - On failure: error toast with details

5. **UX**:
   - Form appears inline above the test case list or as a modal
   - Cancel button to dismiss without saving
   - Form fields have helpful placeholder text

**Key Files**
- `frontend/app/suites/[id]/page.tsx` — add button and form to test cases section

### Acceptance Criteria
- "Add Case" button visible in test cases section header
- Form opens with all required fields
- JSON input is validated
- Successful submission adds case to the list without page reload
- Error states handled with toast notifications