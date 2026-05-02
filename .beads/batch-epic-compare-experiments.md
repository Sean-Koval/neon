# Compare Page Enhancement

- type: epic
- priority: 1
- labels: frontend, ux, compare


Enhance the Compare page (`/compare`) to a fully interactive A/B comparison experience. Selection form, statistical guidance, and results table exist today. Missing auto-fire on selection, swap button, agent filter, dumbbell chart, scorer grouping, trace drill-down links, export, and dismissable guidance.

**Wireframe:** `frontend/branding/wireframes/compare/index.txt` (610 lines)

**Current state:** ~60% implemented. Run selectors, statistical guidance panel, and comparison results table render. Manual "Compare Runs" button still required. No swap, no chart visualization, no scorer grouping, no export.

**Key files:**
- `frontend/app/compare/page.tsx` — main page
- `frontend/components/compare/run-selector.tsx` — baseline/candidate selectors
- `frontend/components/compare/compare-results.tsx` — results table
- `frontend/components/compare/statistical-guidance.tsx` — guidance panel
- `frontend/components/compare/comparison-header.tsx` — page header
- `frontend/components/compare/confidence-interval.tsx` — CI display

---
## Auto-fire comparison on run selection

- type: task
- priority: 1
- labels: frontend, ux, compare
- estimate: 180

### Description


Remove the manual "Compare Runs" button and automatically trigger the comparison query when both baseline and candidate run IDs are selected (non-null).

**Wireframe:** `frontend/branding/wireframes/compare/index.txt` — run selector area

**Requirements**

1. **Remove "Compare Runs" button** from `frontend/app/compare/page.tsx`:
   - Delete the manual submit button entirely
   - Comparison should fire reactively, not on explicit click

2. **Auto-trigger comparison query**:
   - Watch `baseline` and `candidate` URL params (from run selectors)
   - When both are non-null and different, automatically call the comparison tRPC query
   - Use `enabled: !!baseline && !!candidate && baseline !== candidate` on the query
   - Debounce 300ms to avoid double-fire during rapid selection changes

3. **Loading state**:
   - Show skeleton loader in the results area while comparison is fetching
   - Display "Select two runs to compare" placeholder when one or both selectors are empty
   - Show inline error if comparison query fails

4. **Key file:** `frontend/app/compare/page.tsx`

### Acceptance Criteria
- No "Compare Runs" button visible on the page
- Selecting both runs immediately triggers comparison
- Results appear within typical query latency (no extra user click)
- Changing either run re-triggers comparison automatically
- Empty state shown when fewer than two runs are selected
---
## Add swap A/B button

- type: task
- priority: 2
- labels: frontend, ux, compare
- estimate: 60

### Description


Add a button between the baseline and candidate run selectors that swaps the two selected runs.

**Wireframe:** `frontend/branding/wireframes/compare/index.txt` — between run selectors

**Requirements**

1. **Swap button component**:
   - Positioned between the baseline (left) and candidate (right) run selectors
   - Icon: `ArrowLeftRight` from `lucide-react`
   - Tooltip: "Swap baseline and candidate"
   - Styled as ghost button: `variant="ghost" size="icon"`

2. **Swap logic** in `frontend/app/compare/page.tsx`:
   - On click, swap the `baseline` and `candidate` URL search params
   - Use `router.replace` with shallow routing to update `?baseline=X&candidate=Y` → `?baseline=Y&candidate=X`
   - If either value is null, button should be disabled

3. **Key file:** `frontend/app/compare/page.tsx`, `frontend/components/compare/run-selector.tsx`

### Acceptance Criteria
- Swap button visible between the two run selectors
- Clicking swaps baseline and candidate IDs in the URL
- Comparison re-fires automatically after swap (relies on auto-fire issue)
- Button disabled when fewer than two runs are selected
---
## Add agent filter to compare page

- type: task
- priority: 2
- labels: frontend, ux, compare
- estimate: 60

### Description


Add an agent name dropdown filter above the run selectors to narrow the list of available runs by agent.

**Wireframe:** `frontend/branding/wireframes/compare/index.txt` — filter area above run selectors

**Requirements**

1. **Agent dropdown** above or beside the existing suite filter:
   - Label: "Agent"
   - Options populated from `trpc.agents.list` query
   - Default: "All agents" (no filter)
   - Synced to URL param `?agent=<agentId>` via shallow routing

2. **Filter run selectors**:
   - When an agent is selected, both baseline and candidate run selector dropdowns should only show runs belonging to that agent
   - Pass `agentId` filter to the runs query used by `RunSelector` components

3. **Key files:** `frontend/app/compare/page.tsx`, `frontend/components/compare/run-selector.tsx`

### Acceptance Criteria
- Agent dropdown appears alongside existing suite filter
- Selecting an agent filters the available runs in both selectors
- "All agents" option removes the filter
- Agent filter persists in URL across page refreshes
---
## Build dumbbell/score delta chart

- type: task
- priority: 1
- labels: frontend, ux, compare, chart
- estimate: 360

### Description


Build a visual dumbbell chart (also called a connected dot plot) showing baseline vs candidate scores for each test case as connected dots on a horizontal axis.

**Wireframe:** `frontend/branding/wireframes/compare/index.txt` — chart section below results header

**Requirements**

1. **Chart layout**:
   - Each test case is a horizontal row
   - Score axis runs from 0.0 to 1.0 (horizontal)
   - Baseline score shown as a dot in `accent-500` color
   - Candidate score shown as a dot in `emerald-500` color
   - A horizontal line connects the two dots per test case

2. **Line coloring**:
   - If candidate > baseline (improvement): line is `emerald-500` (green)
   - If candidate < baseline (regression): line is `rose-500` (red)
   - If candidate == baseline (unchanged): line is `muted` (gray)

3. **Interactivity**:
   - Hover on a row highlights it and shows tooltip: `Case: "test name" | Baseline: 0.82 | Candidate: 0.91 | Delta: +0.09`
   - Click a row to scroll to that test case in the results table below

4. **Implementation options**:
   - Preferred: recharts custom `<ScatterChart>` or `<ComposedChart>` with custom shapes
   - Alternative: D3.js with SVG rendering for more control
   - Chart should be wrapped in `<ResponsiveContainer>` for fluid width

5. **New component:** `frontend/components/compare/dumbbell-chart.tsx`
6. **Mount in:** `frontend/app/compare/page.tsx` — between header and results table
7. **Data source:** Same comparison result data used by the results table

### Acceptance Criteria
- Chart renders one row per test case with connected baseline/candidate dots
- Green lines for improvements, red for regressions, gray for unchanged
- Tooltip on hover shows case name and both scores
- Chart responsive to container width
- Handles edge cases: single test case, all same score, missing scores
---
## Add scorer grouping to results

- type: task
- priority: 1
- labels: frontend, ux, compare
- estimate: 180

### Description


Group comparison results by scorer name instead of a flat list. Within each scorer group, show affected test cases with their score deltas.

**Wireframe:** `frontend/branding/wireframes/compare/index.txt` — results section

**Requirements**

1. **Group by scorer**:
   - Parse comparison results and group test cases by scorer name
   - Each group header: scorer name, count of regressions/improvements, average delta
   - Within each group: individual test case rows with baseline score, candidate score, delta, and direction arrow

2. **Section ordering**:
   - Regressions first (sorted by largest negative delta)
   - Improvements second (sorted by largest positive delta)
   - Unchanged last, collapsed by default

3. **Collapsed unchanged section**:
   - "Unchanged (N cases)" header with expand/collapse chevron
   - Collapsed by default to reduce noise
   - Click to expand and show all unchanged test cases

4. **Visual treatment**:
   - Regression rows: left border `border-l-2 border-rose-500`
   - Improvement rows: left border `border-l-2 border-emerald-500`
   - Unchanged rows: no left border accent

5. **Key file:** `frontend/components/compare/compare-results.tsx`

### Acceptance Criteria
- Results grouped by scorer name with clear section headers
- Regressions appear first, improvements second, unchanged last
- Unchanged section is collapsed by default and expandable
- Each group header shows summary stats (count, avg delta)
- Maintains current row detail (scores, delta, direction)
---
## Add drill-down links to traces

- type: task
- priority: 2
- labels: frontend, ux, compare
- estimate: 60

### Description


Make each test case name in the comparison results clickable, linking to its corresponding trace detail page.

**Wireframe:** `frontend/branding/wireframes/compare/index.txt` — results table rows

**Requirements**

1. **Test case name as link**:
   - Wrap test case name text in a `<Link>` to `/traces/[traceId]`
   - Show `ExternalLink` icon (from lucide-react, 14px) next to the case name on hover
   - Both baseline trace and candidate trace should be linkable

2. **Two trace links per row**:
   - Baseline trace link: small icon button or "View" link in the baseline score column
   - Candidate trace link: small icon button or "View" link in the candidate score column
   - Tooltip on each: "View baseline trace" / "View candidate trace"

3. **Handle missing trace IDs**:
   - If a trace ID is not available in the comparison data, show the score without a link
   - Do not render broken links

4. **Key file:** `frontend/components/compare/compare-results.tsx`

### Acceptance Criteria
- Test case names link to their trace detail pages
- Both baseline and candidate traces are independently linkable
- External link icon appears on hover for visual affordance
- Missing trace IDs gracefully degrade to plain text
---
## Add export functionality

- type: task
- priority: 2
- labels: frontend, ux, compare
- estimate: 180

### Description


Add an export dropdown and copy-link button to the compare page, allowing users to download comparison results in multiple formats and share comparison URLs.

**Wireframe:** `frontend/branding/wireframes/compare/index.txt` — header action area

**Requirements**

1. **Export dropdown button** in the comparison header area:
   - Label: "Export" with `Download` icon from lucide-react
   - Three format options:
     - **JSON**: Raw comparison data object as `.json` file
     - **CSV**: Test case rows with columns: Case Name, Scorer, Baseline Score, Candidate Score, Delta, Direction
     - **Markdown**: Formatted report with header, summary stats, and results table

2. **Download implementation**:
   - Generate file content client-side from the comparison result data
   - Create Blob URL and trigger download via temporary `<a>` element
   - Filename pattern: `comparison-{baselineId}-vs-{candidateId}.{ext}`

3. **Copy link button**:
   - Separate button next to Export dropdown
   - Icon: `Link` from lucide-react
   - Copies `window.location.href` to clipboard
   - Shows toast: "Comparison link copied to clipboard"

4. **New component:** `frontend/components/compare/export-dropdown.tsx`
5. **Mount in:** `frontend/app/compare/page.tsx` or `frontend/components/compare/comparison-header.tsx`

### Acceptance Criteria
- Export dropdown shows JSON, CSV, and Markdown options
- Each format downloads correctly with appropriate content
- Copy link button copies current URL to clipboard
- Toast notification confirms clipboard copy
- Export buttons disabled when no comparison results are loaded
---
## Make statistical guidance dismissable

- type: task
- priority: 3
- labels: frontend, ux, compare
- estimate: 60

### Description


Allow users to dismiss the statistical guidance panel and persist that preference, with an option to restore it.

**Wireframe:** `frontend/branding/wireframes/compare/index.txt` — guidance panel

**Requirements**

1. **Close button on guidance panel**:
   - Add an `X` button (lucide-react `X` icon) to the top-right corner of `StatisticalGuidance` component
   - Clicking it hides the panel

2. **Persist dismissed state**:
   - Store in `localStorage` with key `neon:compare:guidance-dismissed`
   - On page load, check this key; if `"true"`, hide the guidance panel
   - Use `useState` initialized from `localStorage` (with SSR guard: check `typeof window !== 'undefined'`)

3. **Restore link**:
   - When guidance is dismissed, show a small text link below the results area: "Show statistical guidance"
   - Clicking it removes the `localStorage` key and shows the panel again

4. **Key file:** `frontend/components/compare/statistical-guidance.tsx`, `frontend/app/compare/page.tsx`

### Acceptance Criteria
- X button visible on the guidance panel
- Clicking X hides the panel immediately
- Refreshing the page keeps the panel hidden
- "Show statistical guidance" link appears when panel is hidden
- Clicking the restore link brings the panel back
---
## Experiments Pages

- type: epic
- priority: 1
- labels: frontend, ux, experiments

### Description


Build the Experiments feature (`/experiments` and `/experiments/[id]`) for running, monitoring, and analyzing A/B tests and progressive rollouts. Replace mock data with real Temporal workflow integration, add create dialog, type-specific card layouts, live polling, and full detail pages.

**Wireframes:**
- `frontend/branding/wireframes/experiments/index.txt` (682 lines) — list page
- `frontend/branding/wireframes/experiments/detail.txt` (855 lines) — detail page

**Current state:** ~40% implemented with mock data. Page shell and basic card grid exist. No real data integration, no create dialog, no type-specific layouts, no live polling, no detail pages.

**Key files:**
- `frontend/app/experiments/page.tsx` — list page
- `frontend/app/experiments/[id]/page.tsx` — detail page (to be created)
- `temporal-workers/src/workflows/optimization.ts` — existing Temporal workflows (`abTestWorkflow`, `progressiveRolloutWorkflow`)
---
## Add experiments summary stat cards

- type: task
- priority: 1
- labels: frontend, ux, experiments
- estimate: 180

### Description


Add four summary stat cards to the top of the experiments list page showing key aggregate metrics.

**Wireframe:** `frontend/branding/wireframes/experiments/index.txt` — stat cards section

**Requirements**

1. **Four stat cards** in a responsive 4-column grid:
   - **Total Experiments**: Count of all experiments (all statuses)
   - **Running**: Count of experiments with status `RUNNING`, with a pulsing green dot animation (`animate-pulse` on a small emerald circle)
   - **Success Rate**: Percentage of completed experiments that reached statistical significance or passed gate thresholds, formatted as `XX%`
   - **Avg Improvement**: Average score delta across all completed experiments with a winning variant, formatted as `+X.X%`

2. **Data source**:
   - Query experiments from Temporal workflow list or a new tRPC procedure
   - Compute aggregates client-side from the full experiment list, or server-side in the tRPC router

3. **Loading state**: Show skeleton cards while data loads

4. **Key file:** `frontend/app/experiments/page.tsx`

### Acceptance Criteria
- Four stat cards render at top of experiments page
- Running card shows pulsing green dot when experiments are active
- Values update when experiment data changes
- Skeleton state shows during initial load
---
## Add type, agent, and sort filters

- type: task
- priority: 1
- labels: frontend, ux, experiments
- estimate: 180

### Description


Add filter dropdowns to the experiments list page for experiment type, agent, and sort order.

**Wireframe:** `frontend/branding/wireframes/experiments/index.txt` — filter bar

**Requirements**

1. **Type filter dropdown**:
   - Options: All, A/B Test, Progressive Rollout
   - Filters the experiment card grid by experiment type
   - URL param: `?type=ab_test` or `?type=rollout`

2. **Agent filter dropdown**:
   - Options populated from `trpc.agents.list`
   - Default: "All Agents"
   - Filters experiments by the agent being tested
   - URL param: `?agent=<agentId>`

3. **Sort dropdown**:
   - Options: Newest (default), Oldest, Best Improvement, Most Samples
   - URL param: `?sort=newest|oldest|best_improvement|most_samples`

4. **URL sync**:
   - All filter values synced to URL search params via `useSearchParams` and shallow routing
   - Page refresh preserves filter state

5. **Key file:** `frontend/app/experiments/page.tsx`

### Acceptance Criteria
- Three dropdown filters visible in the filter bar
- Type filter correctly shows only matching experiment types
- Agent filter narrows experiments to selected agent
- Sort dropdown reorders the card grid
- All filters persist in URL across page refreshes
---
## Build Create Experiment dialog

- type: task
- priority: 1
- labels: frontend, ux, experiments, temporal
- estimate: 720

### Description


Build a multi-step dialog for creating new experiments (A/B tests or progressive rollouts) that starts a Temporal workflow on submission.

**Wireframe:** `frontend/branding/wireframes/experiments/index.txt` — "New Experiment" button and dialog

**Requirements**

1. **Trigger**: "+ New Experiment" button in the page header opens a dialog/modal

2. **Step 1 — Type Selection**:
   - Two large selection cards side by side:
     - **A/B Test**: icon, title, description ("Compare two variants head-to-head with statistical significance testing")
     - **Progressive Rollout**: icon, title, description ("Gradually increase traffic through gated stages with automatic rollback")
   - Clicking a card advances to Step 2

3. **Step 2 — Variant Configuration**:
   - Experiment name text input
   - For A/B Test:
     - Baseline: Agent selector + version dropdown
     - Candidate: Agent selector + version dropdown (or prompt variant selector)
   - For Progressive Rollout:
     - Agent selector + version for the rollout candidate
     - Baseline version for comparison

4. **Step 3 — Evaluation Configuration**:
   - Dataset/suite selector (from `trpc.suites.list`)
   - Scorers multi-select (from suite's configured scorers)
   - For A/B Test: Sample size input (numeric, default 100), significance level selector (0.01, 0.05, 0.10)
   - For Progressive Rollout: Stage configuration — number of stages (default 5), traffic percentages per stage (e.g., 1%, 5%, 25%, 50%, 100%), gate threshold per stage (minimum score to advance)

5. **Step 4 — Review & Start**:
   - Summary of all configuration
   - "Start Experiment" button
   - On submit: call tRPC mutation that starts Temporal workflow (`abTestWorkflow` or `progressiveRolloutWorkflow`)
   - Show success toast and redirect to experiment detail page

6. **Navigation**: Back/Next buttons, step indicator (1/4, 2/4, etc.), ESC to close

7. **New component:** `frontend/components/experiments/create-experiment-dialog.tsx`
8. **Key files:** `frontend/app/experiments/page.tsx`, `temporal-workers/src/workflows/optimization.ts`

### Acceptance Criteria
- Dialog opens from "+ New Experiment" button
- All four steps render correctly for both experiment types
- Form validation prevents advancing with missing required fields
- Submission starts a real Temporal workflow
- Success redirects to the new experiment's detail page
- Dialog can be dismissed with ESC or X button
---
## Differentiate A/B test vs rollout card layouts

- type: task
- priority: 1
- labels: frontend, ux, experiments
- estimate: 360

### Description


Render different card layouts for A/B test experiments vs progressive rollout experiments in the experiments list grid.

**Wireframe:** `frontend/branding/wireframes/experiments/index.txt` — experiment cards section

**Requirements**

1. **A/B Test card (running)**:
   - Progress bar showing completion percentage (samples collected / total samples)
   - Live score comparison: "A: 0.91 vs B: 0.94"
   - Significance badge: shows p-value with color coding (green if p < alpha, amber if borderline, gray if not yet significant)
   - Effect size delta: "+3.2%" in emerald if positive, rose if negative

2. **A/B Test card (completed)**:
   - Winner badge: "Variant B wins" in emerald, or "No significant difference" in amber
   - Improvement percentage: "+3.2% improvement"
   - Final sample count

3. **Progressive Rollout card (running)**:
   - Stage pipeline visualization: 5 connected circles (dots) in a horizontal line
   - Active stage highlighted with primary color and pulse animation
   - Completed stages filled, upcoming stages outlined
   - Gate threshold display: "Gate: score >= 0.85"
   - Current stage score

4. **Progressive Rollout card (completed)**:
   - "Rolled out" badge in emerald, or "Rolled back" badge in rose
   - Final score and stage reached
   - Total duration

5. **Shared card elements** (both types):
   - Experiment name, agent name, created timestamp
   - Status badge: Running (blue), Completed (emerald), Failed (rose), Paused (amber)
   - Overflow menu (see separate issue)

6. **New components:**
   - `frontend/components/experiments/ab-test-card.tsx`
   - `frontend/components/experiments/rollout-card.tsx`
   - `frontend/components/experiments/stage-pipeline.tsx` (reusable stage visualization)

7. **Key file:** `frontend/app/experiments/page.tsx`

### Acceptance Criteria
- A/B test cards show progress bar, score comparison, and significance
- Rollout cards show stage pipeline visualization
- Completed experiments show appropriate winner/rollout badges
- Card layouts are visually distinct and immediately identifiable by type
- Stage pipeline shows correct number of stages with active stage highlighted
---
## Add live polling for running experiments

- type: task
- priority: 1
- labels: frontend, ux, experiments, temporal
- estimate: 180

### Description


Add automatic polling for running experiments so card metrics update in real-time without manual refresh.

**Wireframe:** `frontend/branding/wireframes/experiments/index.txt` — running experiment cards

**Requirements**

1. **Polling configuration**:
   - Poll every 3 seconds when any experiments have status `RUNNING`
   - Disable polling when all experiments are completed/failed/paused
   - Use `refetchInterval` on the experiments list query, conditionally enabled

2. **Temporal queries**:
   - A/B tests: query `abTestProgressQuery` to get current sample count, scores per variant, p-value
   - Progressive rollouts: query `rolloutProgressQuery` to get current stage, stage scores, gate results
   - These queries are defined in `temporal-workers/src/workflows/optimization.ts`

3. **Smooth updates**:
   - Update card metrics in-place without full card re-render (avoid layout shift)
   - Use React transitions or optimistic updates for smoother UX
   - Progress bars should animate smoothly between poll updates

4. **Key files:** `frontend/app/experiments/page.tsx`, `temporal-workers/src/workflows/optimization.ts`

### Acceptance Criteria
- Running experiment cards update every 3 seconds
- Progress bars advance smoothly
- Scores and metrics update in-place without flickering
- Polling stops when no experiments are running
- Page does not degrade with many concurrent running experiments
---
## Add overflow menu on experiment cards

- type: task
- priority: 2
- labels: frontend, ux, experiments
- estimate: 60

### Description


Add a three-dot overflow menu to each experiment card with context-aware action items.

**Wireframe:** `frontend/branding/wireframes/experiments/index.txt` — card overflow menu

**Requirements**

1. **Overflow trigger**:
   - Three-dot icon (`MoreVertical` from lucide-react) in top-right corner of each card
   - Opens a dropdown menu on click

2. **Menu items (context-aware)**:
   - **Pause** — shown when status is `RUNNING`; sends pause signal to Temporal workflow
   - **Resume** — shown when status is `PAUSED`; sends resume signal
   - **Abort** — shown when status is `RUNNING` or `PAUSED`; opens confirmation dialog, then sends cancel signal
   - **View Details** — always shown; navigates to `/experiments/[id]`

3. **Confirmation dialog for Abort**:
   - Title: "Abort Experiment?"
   - Body: "This will cancel the running experiment. Partial results will be preserved."
   - Buttons: "Cancel" (secondary) and "Abort" (destructive)

4. **New component:** `frontend/components/experiments/experiment-card-menu.tsx`

### Acceptance Criteria
- Three-dot menu appears on every experiment card
- Only applicable actions shown based on current experiment status
- Pause/Resume sends correct Temporal signal
- Abort shows confirmation dialog before proceeding
- View Details navigates to detail page
---
## Wire experiments to real Temporal workflows

- type: task
- priority: 1
- labels: frontend, api, experiments, temporal
- estimate: 360

### Description


Replace all mock experiment data with real Temporal workflow integration for creating, listing, querying, and controlling experiments.

**Wireframe:** `frontend/branding/wireframes/experiments/index.txt`

**Requirements**

1. **tRPC router** — new or extended `experiments` router:
   - `experiments.list`: List experiment workflows from Temporal (filter by type, status, agent)
   - `experiments.get`: Get single experiment by workflow ID
   - `experiments.create`: Start a new `abTestWorkflow` or `progressiveRolloutWorkflow` via Temporal client
   - `experiments.pause`: Send pause signal to workflow
   - `experiments.resume`: Send resume signal to workflow
   - `experiments.abort`: Cancel workflow execution
   - `experiments.progress`: Query workflow for current progress (uses Temporal queries)

2. **Workflow mapping**:
   - Use existing workflows from `temporal-workers/src/workflows/optimization.ts`
   - `abTestWorkflow` — accepts config: variants, sample size, scorers, significance level
   - `progressiveRolloutWorkflow` — accepts config: stages, gate thresholds, scorers
   - Workflow ID pattern: `experiment-{type}-{uuid}`

3. **Data transformation**:
   - Map Temporal workflow execution data to `Experiment` type used by frontend components
   - Extract metadata from workflow input (stored when workflow is started)
   - Extract progress from Temporal queries

4. **Key files:**
   - `frontend/server/trpc/routers/` — new experiments router
   - `frontend/app/experiments/page.tsx` — replace mock data with tRPC calls
   - `temporal-workers/src/workflows/optimization.ts` — existing workflows

### Acceptance Criteria
- Experiments list page shows real experiments from Temporal
- Creating an experiment starts a real Temporal workflow
- Pause/Resume/Abort send correct signals to running workflows
- Progress queries return real-time metrics from running workflows
- Empty state shown when no experiments exist
---
## Add Load More pagination

- type: task
- priority: 2
- labels: frontend, ux, experiments
- estimate: 60

### Description


Add cursor-based pagination to the experiments list with a "Load More" button.

**Wireframe:** `frontend/branding/wireframes/experiments/index.txt` — bottom of card grid

**Requirements**

1. **Pagination model**:
   - Cursor-based pagination using Temporal's `nextPageToken`
   - Page size: 20 experiments per batch
   - Initial load fetches first 20

2. **Load More button**:
   - Centered button below the card grid: "Load More"
   - Shows loading spinner while fetching next page
   - Hidden when all experiments have been loaded (no more pages)
   - Use `useInfiniteQuery` from TanStack Query for cursor management

3. **No infinite scroll**: Explicit button click required (not scroll-triggered)

4. **Key file:** `frontend/app/experiments/page.tsx`

### Acceptance Criteria
- First 20 experiments load on page visit
- "Load More" button appears when more experiments exist
- Clicking loads next batch and appends to grid
- Button disappears when all experiments are loaded
- Loading spinner shown during fetch
---
## Build experiment detail page — A/B Test layout

- type: task
- priority: 1
- labels: frontend, ux, experiments
- estimate: 720

### Description


Build the experiment detail page for A/B test experiments with phase-specific layouts for running, completed, and failed states.

**Wireframe:** `frontend/branding/wireframes/experiments/detail.txt` (855 lines)

**Requirements**

1. **RUNNING phase UI**:
   - **Progress hero card**: Large progress bar (samples collected / total), elapsed time, estimated time remaining
   - **Variant comparison cards**: Side-by-side cards for Variant A and Variant B, each showing 3 metrics: Score (primary), Latency (secondary), Cost (secondary)
   - **Live score chart**: Recharts line chart with two lines (Variant A in accent-500, Variant B in emerald-500) showing scores over sample count (x-axis). Auto-updates with polling data
   - **Statistical summary**: Current p-value, effect size, confidence interval (updating live)

2. **COMPLETED phase UI**:
   - **Verdict banner**: Green banner "Variant B wins with +X.X% improvement" or amber "No significant difference detected"
   - **Variant comparison cards**: Same as running but with final values
   - **Per-scorer aggregate table**: Table with rows per scorer, columns: Scorer Name, Baseline Mean, Candidate Mean, Delta, p-value, Significant?
   - **Score curves chart**: Final version of the live chart with all data points
   - **Statistical results section**: Full breakdown — effect size with interpretation (small/medium/large), p-value, confidence interval, power analysis
   - **Per-case breakdown table**: Expandable table showing every test case with baseline score, candidate score, delta. Sortable by delta. Expand row to see full case details

3. **FAILED/ABORTED phase UI**:
   - **Error card**: Red-bordered card with failure reason/error message
   - **Partial results**: If any samples were collected before failure, show whatever comparison data is available with a warning banner "Results are partial and may not be statistically valid"

4. **Action buttons** (in page header):
   - Pause, Abort, Deploy Winner — see separate action buttons issue

5. **New files:**
   - `frontend/app/experiments/[id]/page.tsx` — detail page
   - `frontend/components/experiments/ab-test-detail.tsx` — A/B test layout
   - `frontend/components/experiments/variant-comparison.tsx` — variant cards
   - `frontend/components/experiments/score-curves-chart.tsx` — line chart

### Acceptance Criteria
- Running experiments show live progress with updating chart
- Completed experiments show verdict banner and full statistical breakdown
- Failed experiments show error with partial results where available
- Phase transitions render correct layout automatically
- Chart updates smoothly during polling
---
## Build experiment detail page — Progressive Rollout layout

- type: task
- priority: 1
- labels: frontend, ux, experiments
- estimate: 720

### Description


Build the experiment detail page for progressive rollout experiments with phase-specific layouts for running, completed, and failed states.

**Wireframe:** `frontend/branding/wireframes/experiments/detail.txt` (855 lines)

**Requirements**

1. **RUNNING phase UI**:
   - **Rollout overview card**: Current stage number, total stages, overall elapsed time, current traffic percentage
   - **Stage pipeline visualization**: Horizontal connected nodes (circles) representing each stage. Completed stages filled (emerald), active stage pulsing (primary with `animate-pulse`), upcoming stages outlined (muted). Each node labeled with traffic percentage
   - **Score history chart**: Recharts line chart showing score over time, with vertical dashed lines marking stage transitions. Current gate threshold shown as horizontal reference line
   - **Current stage detail card**: Stage number, traffic %, samples collected, current score, gate threshold, time in stage

2. **COMPLETED phase UI**:
   - **Verdict banner**: Green "Successfully rolled out" or red "Rolled back at Stage X"
   - **Baseline vs final comparison**: Side-by-side cards comparing baseline metrics with final rollout metrics
   - **Stage detail table**: Table with columns: Stage #, Traffic %, Score, Duration, Gate Result (Pass/Fail), showing all stages
   - **Score history chart**: Complete chart with all stage data

3. **FAILED phase UI**:
   - **Error card**: Red-bordered card showing which stage failed and why (gate threshold not met, timeout, error)
   - **Partial results**: Stages completed before failure shown in stage detail table
   - **Rollback indicator**: "Automatically rolled back to baseline" message

4. **Action buttons** (in page header):
   - Pause, Abort, Advance Stage — see separate action buttons issue

5. **New files:**
   - `frontend/components/experiments/rollout-detail.tsx` — rollout layout
   - `frontend/components/experiments/stage-pipeline-detail.tsx` — detailed stage visualization
   - `frontend/components/experiments/stage-score-chart.tsx` — score history chart

### Acceptance Criteria
- Running rollouts show stage pipeline with active stage pulsing
- Score chart shows stage transitions as vertical markers
- Completed rollouts show all stage results in detail table
- Failed rollouts clearly indicate failure point and rollback
- Stage pipeline visualization accurately reflects current progress
---
## Add experiment detail action buttons

- type: task
- priority: 1
- labels: frontend, ux, experiments, temporal
- estimate: 180

### Description


Add context-aware action buttons to the experiment detail page header for controlling experiment execution.

**Wireframe:** `frontend/branding/wireframes/experiments/detail.txt` — header action area

**Requirements**

1. **Pause button**:
   - Visible when experiment status is `RUNNING`
   - Sends `pauseSignal` to the Temporal workflow
   - Icon: `Pause` from lucide-react
   - Transitions to "Resume" button after pausing

2. **Abort button**:
   - Visible when experiment status is `RUNNING` or `PAUSED`
   - Opens confirmation dialog: "Abort this experiment? Partial results will be preserved but the experiment cannot be resumed."
   - On confirm: sends `cancelSignal` to Temporal workflow
   - Styled as destructive variant

3. **Deploy Winner button (A/B Test only)**:
   - Visible when experiment is `COMPLETED` and has a statistically significant winner
   - Label: "Deploy Winner" with `Rocket` icon
   - On click: marks the winning variant configuration for deployment (implementation depends on deployment pipeline — may just update a flag or trigger another workflow)
   - Disabled when no significant winner

4. **Advance Stage button (Progressive Rollout only)**:
   - Visible when experiment is `RUNNING`
   - Label: "Advance Stage" with `SkipForward` icon
   - Sends signal to Temporal workflow to manually advance to the next stage (bypassing automatic gate check)
   - Opens confirmation: "Manually advance to the next stage? This bypasses the automatic gate check."

5. **Button states**: All buttons show loading spinner while the Temporal signal is being sent. Disabled during loading.

6. **New component:** `frontend/components/experiments/experiment-actions.tsx`
7. **Mount in:** `frontend/app/experiments/[id]/page.tsx` header area

### Acceptance Criteria
- Correct buttons shown based on experiment type and status
- Pause/Resume toggles correctly
- Abort requires confirmation before executing
- Deploy Winner only enabled for significant results
- Advance Stage only visible for rollout experiments
- Loading states prevent double-clicks
---
## Add experiment detail export

- type: task
- priority: 2
- labels: frontend, ux, experiments
- estimate: 60

### Description


Add export functionality to the experiment detail page for downloading experiment results.

**Wireframe:** `frontend/branding/wireframes/experiments/detail.txt` — header action area

**Requirements**

1. **Export dropdown** in the detail page header:
   - Label: "Export" with `Download` icon
   - Two format options:
     - **JSON**: Full experiment data including configuration, all per-case results, statistical analysis, and metadata
     - **CSV**: Per-case results with columns: Case Name, Variant, Score, Latency, Cost (one row per case per variant)

2. **Download implementation**:
   - Generate file content client-side from the experiment detail data
   - Create Blob URL and trigger download via temporary `<a>` element
   - Filename pattern: `experiment-{name}-{id}.{ext}`

3. **Availability**: Export button enabled for `COMPLETED` and `FAILED` experiments (any experiment with results data). Disabled for `RUNNING` experiments (partial data could be misleading).

4. **Key file:** `frontend/app/experiments/[id]/page.tsx`

### Acceptance Criteria
- Export dropdown visible in detail page header
- JSON export includes complete experiment data
- CSV export has correct columns and one row per case per variant
- Export disabled for running experiments
- Downloaded files have descriptive filenames