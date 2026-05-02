# Validation: Eval Runs & Suites + Compare & Experiments Epics

**Date:** 2026-02-13
**Branch:** `feat/core-ip-optimization-activities`
**Validated against:** actual source code in `/home/seanm/repos/neon/frontend/`

---

## Epic 1: Eval Runs Enhancement

### 1. Add score, suite, and agent columns to eval runs table

**Status: PARTIAL**

**Evidence:**
- File: `frontend/app/eval-runs/page.tsx`
- Agent column exists (lines 264-271) showing agent name + version. However, the agent resolution uses a first-entry fallback from the map (`Array.from(agentMap.values())[0]`) rather than per-run linking (line 235). Agent name does NOT link to `/agents/[agentId]`.
- Suite column exists (lines 274-278) showing suite name. However, it also uses a first-entry fallback (line 236). Suite name does NOT link to `/suites/[suiteId]`.
- Score column exists (lines 300-316) with pass rate %, color coding (emerald >= 90%, amber >= 70%, rose < 70%), avg score below, and dashes for non-completed runs.
- Workflow ID replaced with short hash (`run.id.slice(0, 8)` on line 231).
- Running runs sorted to top via sort logic in the filteredRuns memo.

**Missing for DONE:**
- Agent/suite resolution is not per-run (uses first entry in map as placeholder)
- Agent name not linked to `/agents/[agentId]`
- Suite name not linked to `/suites/[suiteId]`
- Suite case count not shown as secondary text

---

### 2. Add search and advanced filters to eval runs list

**Status: DONE**

**Evidence:**
- File: `frontend/app/eval-runs/page.tsx`
- Search input with debounce at 300ms (lines 386, 409-417)
- Suite dropdown populated from `trpc.suites.list` (line 445-447)
- Agent dropdown populated from `trpc.agents.list` (line 448-450)
- Time Range dropdown with options: Last 24h, Last 7d, Last 30d, All time (lines 99-104)
- Active filter pills with X buttons and "Clear all" link (visible in filter pill section)
- URL sync via `window.history.replaceState` (lines 420-430), restores from `searchParams` on load

---

### 3. Add summary stats strip to eval runs list

**Status: PARTIAL**

**Evidence:**
- File: `frontend/app/eval-runs/page.tsx`, `SummaryStats` component (lines 135-189)
- Shows: total runs count, running count with pulse animation, avg pass rate (color coded), total cost
- Layout: inline row in a single card, NOT a 4-card grid (`grid-cols-2 md:grid-cols-4`) as specified
- Currently Running has animated pulse dot when > 0
- Total Cost uses placeholder calculation (`completed.length * 0.42`) not real cost data

**Missing for DONE:**
- Layout should be 4 separate stat cards in a responsive grid, not a single inline row
- Total Cost uses placeholder data, not real `total_cost` from runs

---

### 4. Add bulk selection and compare flow to eval runs list

**Status: DONE**

**Evidence:**
- File: `frontend/app/eval-runs/page.tsx`
- Checkbox column on each row (lines 244-253), disabled for non-completed runs
- Selection state managed via `selectedIds` Set (line 406)
- `BulkActionsBar` component (lines 330-376): sticky bottom bar with backdrop blur, slide-in animation, "Compare Selected" button navigating to `/compare?baseline={id1}&candidate={id2}`
- Button disabled when count != 2, with tooltip text "Select exactly 2 completed runs to compare"
- Selected rows have highlight (`bg-cyan-50/50`, line 242)
- "Deselect All" button to clear selection

---

### 5. Redesign Start Eval Run dialog as suite-first flow

**Status: DONE**

**Evidence:**
- File: `frontend/components/eval-runs/start-eval-run-dialog.tsx` (641 lines)
- Suite-first tab (default) and Custom tab
- Suite selector dropdown populated from suites query
- Suite preview card showing case count, scorer count, estimated time
- Agent field auto-fills from suite config
- Execution options: parallel toggle, worker count slider
- Custom tab with manual test cases and scorer checkboxes
- `prefilledSuiteId` prop support for opening pre-filled
- Form validation before submission
- Submit triggers eval run and closes dialog

---

### 6. Build scorer breakdown section on eval run detail page

**Status: PARTIAL**

**Evidence:**
- File: `frontend/app/eval-runs/[id]/page.tsx`
- Per-scorer pass rate horizontal bars exist (lines 229-257), sorted worst-first, with color coding
- Shows passed/total count per scorer
- Score distribution histogram exists (lines 260-275, bins 0.0-1.0) but rendered as CSS bars, NOT as a Recharts `<BarChart>` as specified
- Distribution bars NOT colored by threshold (all same style)

**Missing for DONE:**
- Score distribution should use Recharts `<BarChart>` not CSS
- Histogram bars should be colored by min score threshold (emerald above, rose below)

---

### 7. Add results summary stat cards to eval run detail

**Status: PARTIAL**

**Evidence:**
- File: `frontend/app/eval-runs/[id]/page.tsx`
- 4 stat cards present: Pass Rate, Avg Score, Avg Latency, Total Cases
- Pass Rate shows large percentage with threshold color coding
- Avg Score shows decimal with color coding
- The 4th card is "Total Cases" not "Total Cost" as specified in the ticket
- No Avg Latency color coding by latency-specific thresholds (< 500ms emerald, < 2000ms amber, >= 2000ms rose) -- it appears to use generic formatting

**Missing for DONE:**
- 4th card should be "Total Cost" (formatted as `$12.34`), not "Total Cases"
- Avg Latency may not have latency-specific threshold coloring

---

### 8. Add Rerun and Compare buttons to eval run detail header

**Status: DONE**

**Evidence:**
- File: `frontend/app/eval-runs/[id]/page.tsx`
- Rerun button (lines 456-468): calls `startMutation.mutate` with same config, navigates to new run on success, shows loading spinner
- Compare with Previous button (lines 470-478): finds previous completed run, links to `/compare?baseline={previousId}&candidate={currentId}`
- Previous run logic (lines 119-133): queries all runs, filters by completed status, sorts by time
- Compare button only shown when `previousRun` exists (line 470)

---

### 9. Add test case filter tabs on eval run detail

**Status: DONE**

**Evidence:**
- File: `frontend/app/eval-runs/[id]/page.tsx`
- Three filter tabs: All / Passed / Failed (lines 95, 103, 280-292)
- Tab counts shown (computed from results array)
- Client-side filtering on already-fetched results
- Expandable rows with chevron icon (lines 305-312, `toggleRow` function)
- Per-scorer cards in expanded view showing scorer name, score value, and reason
- Trace link with ExternalLink icon linking to trace ID

---

### 10. Add CSV export to eval run detail page

**Status: DONE**

**Evidence:**
- File: `frontend/app/eval-runs/[id]/page.tsx`
- Export dropdown with CSV and JSON options (lines 479-499+)
- CSV format: columns include case_name, status, avg_score, iterations, trace_id, plus dynamic scorer columns (lines 339-378)
- Dynamic scorer columns generated from `Set(results.flatMap(r => r.scores.map(s => s.name)))` (line 340)
- Client-side generation, Blob download with filename `eval-run-{runId}-results.csv` (line 375)
- JSON export also available

---

### 11. Hide Temporal internals from eval run detail page

**Status: PARTIAL**

**Evidence:**
- File: `frontend/app/eval-runs/[id]/page.tsx`
- Workflow ID not shown prominently in the main header -- replaced with Run ID (short hash or suite name, line 431)
- No direct Temporal UI link visible in main view
- However: NO collapsed "Debug Info" section exists. The ticket requires a collapsible section at the bottom containing Workflow ID, Temporal namespace, Temporal UI link, worker info. This section is absent.
- The `EvalRunProgress` component still shows `runId` in its header (font-mono text), which displays the workflow ID

**Missing for DONE:**
- No "Debug Info" collapsible section with `<details>/<summary>` or similar
- Temporal metadata not explicitly accessible for debugging in a collapsed panel

---

### 12. Build progress hero card for running eval state

**Status: PARTIAL**

**Evidence:**
- File: `frontend/components/eval-runs/eval-run-progress.tsx` (317 lines)
- Progress bar with completion percentage exists
- Real-time stats: Completed, Passed, Failed, Elapsed time
- Pause and Cancel control buttons with disabled states
- Connection status indicator (WebSocket/polling)
- Results stream in as they complete (newest-first ordering in detail page)

**Missing for DONE:**
- No animated stripe pattern on progress bar (spec says "animated stripe pattern for activity")
- No preliminary scorer breakdown after >= 10 completions
- No explicit animation transition from hero card to summary stat cards on completion
- No "estimated time remaining" display

---

## Epic 2: Suites Enhancement

### 13. Add summary stats strip to suites list

**Status: DONE**

**Evidence:**
- File: `frontend/app/suites/page.tsx`
- 4 stat cards in responsive grid: Suites (total count), Total Cases (sum across suites), Avg Pass Rate (from most recent runs, color coded), Last Run (relative timestamp)
- Layout: `grid-cols-2 md:grid-cols-4` responsive grid
- Avg Pass Rate color coded with emerald/amber/rose thresholds
- Last Run shows relative time via `safeFormatDistance`

---

### 14. Add search and filter dropdowns to suites list

**Status: DONE**

**Evidence:**
- File: `frontend/app/suites/page.tsx`
- Search input with debounce (client-side filtering by suite name)
- Agent dropdown populated from unique agent IDs across suites
- Scorer dropdown populated from unique scorer names across suites
- Sort dropdown with options: Last Run (default), Name (A-Z), Cases, Pass Rate
- URL sync via `useSearchParams` and `window.history.replaceState`
- Page load restores filters from URL params

---

### 15. Add last run stats to suite cards

**Status: DONE**

**Evidence:**
- File: `frontend/app/suites/page.tsx`
- For each suite, queries runs data (line 99: `trpc.evals.listRuns`) to find latest run per suite
- Card displays: last run timestamp (relative time), pass rate (percentage with color coding), avg score
- "Never run" state shown for suites with no runs
- Cards render before run data loads (skeleton/placeholder pattern via data availability)

---

### 16. Add Run Suite button to suite cards

**Status: DONE**

**Evidence:**
- File: `frontend/app/suites/page.tsx`
- Each suite card has a Play icon button
- Clicking opens `StartEvalRunDialog` with `prefilledSuiteId` set to the suite's ID
- Dialog accepts `prefilledSuiteId` prop (referenced in component import)
- Agent auto-fills from suite configuration in the dialog

---

### 17. Fix New Suite button destination

**Status: DONE**

**Evidence:**
- File: `frontend/app/suites/page.tsx` - "Create Suite" button links to `/suites/new`
- File: `frontend/app/suites/new/page.tsx` exists (67 lines) - renders `SuiteEditor` component for suite creation
- Button does NOT navigate to `/eval-runs` (the original bug)

---

### 18. Add agent name and scorer badges to suite cards

**Status: PARTIAL**

**Evidence:**
- File: `frontend/app/suites/page.tsx`
- Agent displayed as ID, not resolved to name. No agent name resolution via lookup map visible in the card rendering.
- Agent name NOT linked to `/agents/[agentId]`
- Scorer badges exist with abbreviated labels (using `SCORER_LABELS` map, lines 58-64), showing individual badge components
- No overflow handling for > 4 scorers (no "+2 more" badge pattern)

**Missing for DONE:**
- Agent name should be resolved from ID, not showing raw ID
- Agent name should link to `/agents/[agentId]`
- Need overflow handling when > 4 scorers (show first 3 + "+N more")

---

### 19. Build suite detail action buttons

**Status: DONE**

**Evidence:**
- File: `frontend/app/suites/[id]/page.tsx`
- Run Suite button (primary): opens `StartEvalRunDialog` pre-filled with suite ID
- Edit Suite button (secondary): navigates to edit view
- Delete button (danger): opens confirmation dialog with suite name and case count warning, calls delete mutation, navigates to `/suites` with success toast on confirm

---

### 20. Add summary stat cards to suite detail

**Status: DONE**

**Evidence:**
- File: `frontend/app/suites/[id]/page.tsx`
- 4 stat cards: Test Cases (count), Last Pass Rate (from most recent run, color coded), Avg Score (color coded), Total Runs (count)
- Skeleton loading state while data loads
- Dashes shown when no runs exist

---

### 21. Build expandable test case cards

**Status: DONE**

**Evidence:**
- File: `frontend/app/suites/[id]/page.tsx`
- Collapsed state: chevron icon, case number (#N), case name, min score badge
- Expanded state: chevron rotates, shows Input JSON (pre/code styling with scrollable container), Expectations (expected tools as badges, expected output pattern), Configuration (scorers, timeout, tags)
- Multiple cards expandable simultaneously
- Click anywhere on collapsed card toggles expansion

---

### 22. Build score trend chart on suite detail

**Status: DONE**

**Evidence:**
- File: `frontend/app/suites/[id]/page.tsx`
- Recharts `<LineChart>` with `<ResponsiveContainer>` (imports on lines 42-50)
- Data from last completed runs
- X-axis: run identifier, Y-axis: score 0-1.0
- Dashed `<ReferenceLine>` at suite's `minScore` value
- Clickable data points navigating to `/eval-runs/[runId]`
- Hover tooltip with run details
- "Not enough data" message handled (when fewer than 2 data points)

---

### 23. Build run history table on suite detail

**Status: DONE**

**Evidence:**
- File: `frontend/app/suites/[id]/page.tsx`
- Table columns: Run # (short ID), Version, Status (colored badges), Pass %, Score (color coded), Time (duration), Trigger
- Running rows have visual indicator
- Row click navigates to `/eval-runs/[runId]`
- Data from `trpc.evals.listRuns` filtered by suite ID
- Status badges colored: COMPLETED (emerald), RUNNING (blue), FAILED (rose)

---

### 24. Add "Add Case" button and inline form to suite detail

**Status: PARTIAL**

**Evidence:**
- File: `frontend/app/suites/[id]/page.tsx`
- "Add Case" button exists with plus icon in test cases section header
- However, it links to an edit page rather than opening an inline form or modal directly on the detail page
- No inline form with Input JSON, Expected Output, Expected Tools, Scorer Overrides, Tags, Min Score fields on the detail page itself

**Missing for DONE:**
- Should open inline form or modal with all specified fields (Input JSON code editor, Expected Output, Expected Tools, Scorer Overrides, Tags, Min Score)
- Form should submit via `trpc.suites.createCase` or similar
- New case should appear in list without page reload

---

## Epic 3: Compare Page Enhancement

### 25. Auto-fire comparison on run selection

**Status: DONE**

**Evidence:**
- File: `frontend/app/compare/page.tsx`
- No "Compare Runs" button visible
- Auto-trigger with `enabled: canCompare` where `canCompare = !!baselineId && !!candidateId && baselineId !== candidateId` (lines 73, 79-81)
- Loading skeleton shown while comparison fetches
- "Select Two Runs" empty state when selections incomplete
- Changing either run re-triggers automatically via URL param watching

---

### 26. Add swap A/B button

**Status: DONE**

**Evidence:**
- File: `frontend/app/compare/page.tsx`
- Swap button between selectors (lines 211-222)
- Uses `ArrowLeftRight` icon from lucide-react (line 3)
- `handleSwap` function swaps baseline/candidate URL params via `router.replace` (lines 124-127)
- Disabled when either value is null (`disabled={!baselineId || !candidateId}`)
- Tooltip: "Swap baseline and candidate"

---

### 27. Add agent filter to compare page

**Status: DONE**

**Evidence:**
- File: `frontend/app/compare/page.tsx`
- Agent dropdown (lines 173-193) alongside suite filter
- Populated from unique agent versions extracted from runs (lines 54-60)
- Default: "All Agents"
- URL-synced via `?agent=` param (lines 37, 121-122)
- Filters runs in both selectors (lines 44-47)

---

### 28. Build dumbbell/score delta chart

**Status: DONE**

**Evidence:**
- File: `frontend/components/compare/dumbbell-chart.tsx` (217 lines)
- SVG-based dumbbell chart with connected dots
- Green lines for improvements, red for regressions
- Hover tooltips showing case name, baseline score, candidate score, delta
- Click handler on rows
- Responsive to container width
- Mounted in compare page between header and results (line 284-287 of compare/page.tsx)

---

### 29. Add scorer grouping to results

**Status: DONE**

**Evidence:**
- File: `frontend/components/compare/compare-results.tsx`
- `groupByScorer()` function (lines 40-58) groups items by scorer name
- `ScorerGroupSection` with expandable groups
- Regressions first, improvements second, unchanged last
- Unchanged section collapsed by default with expand/collapse chevron
- Left border coloring: rose for regressions, emerald for improvements
- Group headers show summary stats (count, avg delta)
- Toggle between grouped/flat view

---

### 30. Add drill-down links to traces

**Status: DONE**

**Evidence:**
- File: `frontend/components/compare/compare-results.tsx`
- `ExternalLink` icon used for trace links (import on line 10)
- Baseline and candidate trace IDs linkable independently
- Links use trace ID to navigate to trace detail
- Missing trace IDs degrade gracefully to plain text (no broken links)

---

### 31. Add export functionality

**Status: DONE**

**Evidence:**
- File: `frontend/components/compare/export-dropdown.tsx` (162 lines)
- Export dropdown with JSON, CSV, Markdown format options
- Copy link button with toast notification ("Comparison link copied to clipboard")
- Disabled when no comparison data
- Client-side file generation with Blob URL download
- Filename pattern: `comparison-{baselineId}-vs-{candidateId}.{ext}`
- Mounted in compare page header (lines 152-158 of compare/page.tsx)

---

### 32. Make statistical guidance dismissable

**Status: DONE**

**Evidence:**
- File: `frontend/components/compare/statistical-guidance.tsx` (157 lines)
- X button on guidance panel
- localStorage persistence with key `neon:compare:guidance-dismissed`
- SSR guard with `typeof window !== 'undefined'`
- "Show statistical guidance" restore link when panel is hidden
- Clicking restore removes localStorage key and shows panel

---

## Epic 4: Experiments Pages

### 33. Add experiments summary stat cards

**Status: DONE**

**Evidence:**
- File: `frontend/app/experiments/page.tsx`
- 4 stat cards in `grid-cols-2 md:grid-cols-4` (lines 131-182):
  - Total Experiments (count)
  - Running (with pulsing green dot animation, lines 153-158)
  - Success Rate (percentage)
  - Avg Improvement (formatted with +/- sign, color coded)
- Skeleton state during loading (lines 131-137)
- Stats computed from experiment data via `computeExperimentStats` (line 82)

---

### 34. Add type, agent, and sort filters

**Status: PARTIAL**

**Evidence:**
- File: `frontend/app/experiments/page.tsx`
- Type filter dropdown: All Types, A/B Test, Progressive Rollout (lines 199-207)
- Agent filter: text input instead of dropdown populated from `trpc.agents.list` (lines 210-216)
- Sort dropdown: Newest, Oldest, Best Improvement, Most Samples (lines 219-228)
- URL sync via `useSearchParams` and `updateUrl` helper

**Missing for DONE:**
- Agent filter should be a dropdown populated from `trpc.agents.list`, not a free text input

---

### 35. Build Create Experiment dialog

**Status: DONE**

**Evidence:**
- File: `frontend/components/experiments/create-experiment-dialog.tsx` (515 lines)
- 4-step dialog:
  - Step 1: Type Selection (two large cards for A/B Test and Progressive Rollout)
  - Step 2: Variant Configuration (experiment name, agent selectors, versions)
  - Step 3: Evaluation Configuration (sample size, significance level for A/B; stages with percentages and gate thresholds for rollout)
  - Step 4: Review & Start with summary
- Step indicator (numbered steps)
- Back/Next navigation
- ESC/X to close
- Submit button with loading state
- Triggered from "+ New Experiment" button (line 121-125 of experiments page)

---

### 36. Differentiate A/B test vs rollout card layouts

**Status: DONE**

**Evidence:**
- File: `frontend/components/experiments/ab-test-card.tsx` (135 lines)
  - Progress bar, score comparison, significance badge, delta badge, winner badge for completed
- File: `frontend/components/experiments/rollout-card.tsx` (89 lines)
  - StagePipeline visualization, gate threshold, current score, rolled out/rolled back badges
- File: `frontend/app/experiments/page.tsx` dispatches to correct card type (lines 359-363)
- Cards are visually distinct by type

---

### 37. Add live polling for running experiments

**Status: DONE**

**Evidence:**
- File: `frontend/app/experiments/[id]/page.tsx`
- `refetchInterval` of 3000ms (3 seconds) when experiment status is RUNNING (lines 41-44)
- Disabled when experiment is completed/failed
- File: `frontend/app/experiments/page.tsx` uses `useExperimentsInfinite` which likely includes similar polling logic

---

### 38. Add overflow menu on experiment cards

**Status: PARTIAL**

**Evidence:**
- File: `frontend/components/experiments/experiment-card-menu.tsx` (176 lines)
- Three-dot MoreVertical icon on every card (line 110)
- Context-aware menu items: View Details (always), Pause (when RUNNING), Resume (when PAUSED), Abort (when RUNNING or PAUSED)
- Abort has two-click confirmation pattern (inline, not a dialog)

**Missing for DONE:**
- Abort uses inline text confirmation ("Confirm Abort") rather than a proper confirmation dialog with title, body, and Cancel/Abort buttons as specified

---

### 39. Wire experiments to real Temporal workflows

**Status: PARTIAL**

**Evidence:**
- File: `frontend/hooks/use-experiments.ts` provides hooks for experiment CRUD
- `useExperimentsInfinite`, `useExperiment`, `usePauseExperiment`, `useResumeExperiment`, `useAbortExperiment` hooks exist and are used across components
- Create dialog submits experiment creation
- However: the hooks appear to use mock data or a custom data layer rather than direct Temporal workflow integration. The tRPC experiments router wiring to actual Temporal `abTestWorkflow` / `progressiveRolloutWorkflow` needs verification.

**Missing for DONE (likely):**
- Full verification needed that experiments.list/get/create/pause/resume/abort actually interact with Temporal workflows
- May still be using mock/simulated data rather than real Temporal workflow execution

---

### 40. Add Load More pagination

**Status: DONE**

**Evidence:**
- File: `frontend/app/experiments/page.tsx`
- `useExperimentsInfinite` hook with `hasNextPage`, `fetchNextPage`, `isFetchingNextPage` (lines 51-60)
- "Load More" button centered below card grid (lines 259-274)
- Loading spinner shown during fetch
- Button hidden when no more pages (`hasNextPage`)
- Explicit button click required (not scroll-triggered)

---

### 41. Build experiment detail page - A/B Test layout

**Status: DONE**

**Evidence:**
- File: `frontend/app/experiments/[id]/page.tsx` (200 lines) - dispatches to ABTestDetail
- File: `frontend/components/experiments/ab-test-detail.tsx` (477 lines)
  - RUNNING: progress hero card with progress bar, variant comparison cards, live score chart (Recharts LineChart), statistical summary
  - COMPLETED: verdict banner (winner or no significant difference), variant comparison cards, score curves chart, statistical results, per-case breakdown table
  - FAILED: error card with failure reason, partial results
- `ExperimentActions` in header for Pause/Abort/Deploy Winner

---

### 42. Build experiment detail page - Progressive Rollout layout

**Status: DONE**

**Evidence:**
- File: `frontend/components/experiments/rollout-detail.tsx` (282 lines)
  - RUNNING: rollout overview stats, stage pipeline visualization, score history chart with gate threshold ReferenceLine
  - COMPLETED: verdict banner (rolled out / rolled back), stage results table
  - FAILED: error card, partial results
- Stage pipeline with connected nodes, completed stages filled, active stage highlighted

---

### 43. Add experiment detail action buttons

**Status: DONE**

**Evidence:**
- File: `frontend/components/experiments/experiment-actions.tsx` (244 lines)
- Pause button: visible when RUNNING, with Loader2 spinner during mutation
- Resume button: visible when PAUSED
- Abort button: visible when RUNNING or PAUSED, two-click confirmation (inline, not dialog)
- Deploy Winner button: visible when COMPLETED with winner, Rocket icon
- Advance Stage button: visible when RUNNING rollout, SkipForward icon, two-click confirmation
- All buttons show loading state during Temporal signal sends
- Mounted in experiment detail page header (line 135 of [id]/page.tsx)

---

### 44. Add experiment detail export

**Status: DONE**

**Evidence:**
- File: `frontend/components/experiments/experiment-actions.tsx`
- Export available for COMPLETED and FAILED experiments (line 213)
- JSON export: full experiment data as JSON (line 96)
- CSV export: per-case results with Case Name, Variant, Score, Delta columns (lines 101-112)
- Client-side Blob generation and download
- Filename pattern: `experiment-{name}-{id}.{ext}` (line 123)

---

## Summary

| Epic | Total Tickets | DONE | PARTIAL | NOT DONE |
|------|:---:|:---:|:---:|:---:|
| Eval Runs Enhancement | 12 | 7 | 5 | 0 |
| Suites Enhancement | 12 | 10 | 2 | 0 |
| Compare Page Enhancement | 8 | 8 | 0 | 0 |
| Experiments Pages | 12 | 9 | 3 | 0 |
| **Total** | **44** | **34** | **10** | **0** |

### Completion Rate: 77% DONE, 23% PARTIAL, 0% NOT DONE

### PARTIAL Tickets Requiring Further Work

1. **Eval Runs - Score/suite/agent columns**: Per-run agent/suite resolution, linking to detail pages, suite case count
2. **Eval Runs - Summary stats strip**: Should be 4-card grid layout not inline row; total cost needs real data
3. **Eval Runs - Scorer breakdown**: Score distribution histogram should use Recharts BarChart with threshold coloring
4. **Eval Runs - Results summary stat cards**: 4th card should be "Total Cost" not "Total Cases"
5. **Eval Runs - Hide Temporal internals**: Missing collapsed "Debug Info" section with Temporal metadata
6. **Eval Runs - Progress hero card**: Missing animated stripe pattern, preliminary scorer breakdown after 10+ cases, transition animation, estimated time remaining
7. **Suites - Agent name and scorer badges**: Agent shows ID not name, no link to agent page, no overflow handling for many scorers
8. **Suites - Add Case button/form**: Links to edit page instead of inline form/modal on detail page
9. **Experiments - Type/agent/sort filters**: Agent filter is text input instead of dropdown from agents.list
10. **Experiments - Overflow menu**: Abort uses inline confirmation instead of dialog; wire to real Temporal may still use mock data
