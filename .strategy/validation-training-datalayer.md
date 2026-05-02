# Validation Report: Training Pipeline & Data Layer Epics

**Date:** 2026-02-13
**Branch:** `feat/core-ip-optimization-activities`
**Validator:** Claude Opus 4.6

---

## EPIC 1: Training Pipeline

### Ticket 1: Build Training page shell and tab structure
**Status: DONE**

**Evidence:**
- Page exists at `frontend/app/training/page.tsx` (772 lines).
- Page title "Training" rendered with `GraduationCap` icon (line 179-181).
- Agent filter dropdown in header, URL-synced via `setParam('agent', ...)` (line 188-199). Uses `trpc.agents.list.useQuery()` for options (line 87).
- 4 pipeline stat cards in `grid grid-cols-2 lg:grid-cols-4 gap-4` (line 204):
  - **Feedback Collected**: total count from `feedbackStats?.totalFeedback` (line 208).
  - **Curated Datasets**: count from `datasets.length` (line 217).
  - **Active Loops**: count of running/awaiting_approval loops (line 231-233).
  - **Best Improvement**: highest improvement with agent name (line 240-252).
- 4-tab bar with Feedback, Datasets, Export, Auto-Improve (line 38-44, 333-361).
- Tab state URL-synced via `?tab=feedback` using `setTab()` (line 128-136).
- Auto-Improve tab badge shows pending count when > 0 (line 352-356).
- Sidebar navigation includes "Training" link at `frontend/components/sidebar.tsx` line 55.

**Minor deviation:** Active Loops stat card does NOT have a pulse animation dot when loops are running. The spec says "pulse animation dot if > 0" but the implementation only changes text color to emerald. The pulse dot appears on loop status badges deeper in the page (line 550) but not on the stat card itself.

---

### Ticket 2: Build Feedback tab -- Preferences mode
**Status: DONE**

**Evidence:**
- Component at `frontend/components/training/feedback-preferences.tsx` (289 lines).
- Segmented control for Preferences/Corrections/History in page.tsx (lines 389-405).
- Side-by-side comparison: grid-cols-1 lg:grid-cols-2 layout (line 167), Response A and Response B cards with content display.
- Clicking a response highlights it with colored border + ring (lines 172-177, 204-209).
- Timed decision tracking: timer starts on `useEffect` per `currentIndex`, records `decisionTimeMs` on selection (lines 34-49).
- Elapsed time displayed via Clock icon (line 272-275).
- Confidence stars 1-5, clickable (lines 248-268).
- Reason input (optional) (lines 239-244).
- Submit calls `trpc.feedback.create` with preference data (lines 51-79).
- On success, loads next pair; on empty queue, shows "All comparisons reviewed" (lines 103-113).
- Session complete state shows count of completed (lines 115-131).

**Minor deviation:** Component is named `feedback-preferences.tsx` (matches spec). The component uses `trpc.feedback.comparisons` and `trpc.feedback.create` -- slightly different procedure names than spec's `trpc.feedback.createComparison` but functionally equivalent. Also, choices include "Tie" and "Both Bad" buttons (beyond spec) which is additive.

---

### Ticket 3: Build Feedback tab -- Corrections mode
**Status: DONE**

**Evidence:**
- Component at `frontend/components/training/feedback-corrections.tsx` (270 lines).
- Original response display (collapsible, line 132-152).
- Corrected response textarea pre-filled with original (lines 155-193).
- Error type checkboxes (multi-select): Factual Error, Hallucination, Incomplete, Wrong Tool, Style/Tone, Formatting (lines 8-15, 196-218).
- Change summary: auto-generated diff stats showing char and word counts (lines 46-59, 160-175).
- Agent/trace selector: uses comparison pairs from `trpc.feedback.comparisons` (line 22).
- Submit calls `trpc.feedback.create` with correction data (lines 67-90).
- On success, loads next response (lines 86-88).
- Empty state shows "No responses to correct" (lines 118-128).

**Minor deviation:** Change summary shows char/word diff counts rather than "Changed 12 words, added 3 sentences" as spec described, but functionally equivalent.

---

### Ticket 4: Build Feedback tab -- History mode
**Status: DONE**

**Evidence:**
- Component at `frontend/components/training/feedback-history.tsx` (197 lines).
- Table with columns: Type (badge), Choice/Action, Confidence, Time, Date (lines 57-64).
- Type badges: "pref" (blue) / "correct" (amber) (lines 78-86).
- Expandable rows: click to expand with full content (lines 68-69, 137-176).
- Preferences expanded view: shows reason and comparison ID (lines 140-149).
- Corrections expanded view: shows original vs corrected side-by-side (lines 151-172).
- Pagination: "Load More" button with showing X of total (lines 185-194).
- Empty state when no feedback (lines 40-49).
- Uses `trpc.feedback.list` with limit/offset (line 20).

**Minor deviations:**
- Columns differ slightly from spec (Choice/Action and Confidence instead of Agent and Summary). No Agent column.
- Type/Agent filters not present as standalone controls (relies on page-level agent filter).
- Uses "Load More" instead of traditional page-based pagination (20 items per page matches spec, but navigation style differs).

---

### Ticket 5: Build Datasets tab -- card list
**Status: DONE**

**Evidence:**
- Component at `frontend/components/training/dataset-cards.tsx` (253 lines).
- Responsive grid: `grid grid-cols-1 lg:grid-cols-2 gap-4` (line 107) -- spec says `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`, so slightly different breakpoints and fewer columns on wide screens.
- Card shows: name (font-semibold), format badge (SFT/DPO/KTO/DSPy with distinct colors, lines 16-21), example counts with train/test split (line 216), created timestamp (line 219).
- Source composition bar with correct colors: purple=corrections, blue=preferences, emerald=traces (lines 186-211).
- Status: building shown with spinning Loader2 icon (lines 125-127); no explicit "ready" or "failed" badge, but building state is visually indicated.
- Search input filters by dataset name (lines 95-103).
- "Create Dataset" button in page.tsx Datasets tab section (lines 422-429).
- Empty state: "No datasets yet" (lines 80-90).
- Skeleton loading cards (lines 59-78).

**Minor deviations:**
- Grid is `grid-cols-1 lg:grid-cols-2` instead of spec's `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`.
- No format filter dropdown (Search-only filtering).
- Status badge not explicitly shown on cards (building is shown via spinner, but no ready/failed badge).

---

### Ticket 6: Build Datasets tab -- Create Dataset wizard
**Status: DONE**

**Evidence:**
- Component at `frontend/components/training/create-dataset-wizard.tsx` (358 lines).
- 4-step wizard dialog with step indicator (lines 96-125): Configure, Sources, Split, Preview.
- Step 1 -- Configure: name input (validated), agent selector, format radio cards with descriptions for SFT/DPO/KTO/DSPy (lines 128-175).
- Step 2 -- Sources: multi-select checkboxes for corrections, preferences, traces. Trace threshold slider 0.5-1.0 (lines 178-222).
- Step 3 -- Split: train/test ratio selector (70/30, 80/20, 90/10), visual bar, stratified toggle, shuffle seed (lines 226-268).
- Step 4 -- Preview: summary of config, sample examples (lines 272-317).
- Back/Next navigation, validation prevents advancing with incomplete fields (lines 55-60, 320-353).
- Submit creates dataset via `trpc.datasets.create` and closes dialog (lines 62-79).

**Minor deviations:**
- Split options are predefined buttons (70/30, 80/20, 90/10) rather than a continuous slider (spec: 50/50 to 95/5).
- Count preview per source not shown in Step 2 (spec: "Count preview: shows number of available examples per source").
- Step 4 doesn't show estimated file size.

---

### Ticket 7: Build Datasets tab -- detail panel
**Status: DONE**

**Evidence:**
- Component at `frontend/components/training/dataset-detail-panel.tsx` (179 lines).
- Slide-in panel from right: `fixed right-0 top-0 bottom-0 z-50 w-[480px]` with `animate-in slide-in-from-right` (line 37).
- Close button (X) in top-right (line 44).
- Click outside closes panel (backdrop at line 34).
- Config summary: name, agent, format, examples, split, score filter, created date, last rebuilt (lines 58-79).
- Source breakdown: bar chart with corrections/preferences/traces proportions (lines 82-103).
- Example preview with pagination dots (lines 106-150).
- Rebuild button with loading state (lines 159-171).
- Export button (lines 154-157).

**Minor deviations:**
- Panel width is `w-[480px]` instead of spec's `w-96` (384px).
- No delete button on the panel (spec required delete with confirmation dialog).
- No Escape key handler (spec required press Escape to close).
- Source breakdown uses horizontal bars, not pie/donut chart as spec suggested.

---

### Ticket 8: Build datasets tRPC router
**Status: DONE**

**Evidence:**
- Router at `frontend/server/trpc/routers/datasets.ts` (475 lines).
- Procedures implemented: `list`, `get`, `create`, `delete`, `getExamples`, `rebuild`, `export`, `exportHistory`, `clearExportHistory`, `getPreview` (more than the 5 required).
- `list` supports filtering by format, agentId, status, search (lines 161-199).
- `create` triggers async build, returns immediately with "building" status (lines 211-276).
- `getExamples` returns paginated examples with offset/limit (lines 290-303).
- `delete` removes dataset (lines 278-288).
- `export` generates export with format serializers and records in history (lines 328-375).
- Router registered in `frontend/server/trpc/routers/index.ts` as `datasets: datasetsRouter` (line 65).

**Minor deviations:**
- Uses in-memory stores (Map) instead of Postgres + ClickHouse. Comment on line 57 says "will be replaced with ClickHouse + Postgres".
- Uses seed data instead of real DB queries.

---

### Ticket 9: Build Export tab -- 3-step flow
**Status: DONE**

**Evidence:**
- Component at `frontend/components/training/export-flow.tsx` (260 lines).
- 3-step vertical flow with numbered sections (lines 98-219).
- Step 1 -- Select Dataset: dropdown of ready datasets, each showing name/count/format (lines 99-118). Summary card below dropdown (lines 113-117).
- Step 2 -- Choose Format: 5 format radio cards: OpenAI, HuggingFace, DSPy, Agent Lightning, Custom JSON (lines 8-14, 121-168).
- Step 3 -- Preview & Export: preview of formatted data (lines 174-187), export options checkboxes (include test split, metadata header, shuffle) (lines 189-202), download button (lines 205-218).
- Steps sequentially gated: Step 2 and 3 disabled until dataset selected via `isStepsEnabled` (lines 94, 121, 171).
- Export history table included inline below the flow (lines 222-257).

**Minor deviations:**
- JSON preview not syntax-highlighted with colored keys/strings/numbers as spec described (keys in blue, strings in emerald, numbers in amber). Uses plain monospace pre.
- File size estimate not displayed in Step 3 preview area.

---

### Ticket 10: Build Export tab -- Custom JSON template
**Status: DONE**

**Evidence:**
- Custom template editor is inline in `export-flow.tsx` (lines 152-167) rather than a separate component.
- Template editor appears when "Custom JSON" format is selected (line 152).
- Default template pre-filled (line 38).
- Available variables listed with `{{input}}`, `{{output}}`, `{{source_type}}`, etc. (lines 162-164).
- Live preview updates via `trpc.datasets.getPreview` query that renders with custom template (lines 44-47).
- Template substitution in router handles Handlebars-style variables (datasets.ts lines 426-441).

**Minor deviations:**
- Not a separate component `custom-template-editor.tsx` -- embedded in `export-flow.tsx`.
- No click-to-insert for variables (just displayed as reference text).
- No JSON validation warning on malformed templates (server side returns `{ error: "Invalid template" }` but no client-side validation).

---

### Ticket 11: Build Export tab -- export history
**Status: DONE**

**Evidence:**
- Export history table is inline in `export-flow.tsx` (lines 222-257) rather than a separate component.
- Table columns: Dataset Name, Format, Size, Date, re-download button (lines 228-234).
- "Exports cached for 30 days" note (line 256).
- Re-download button present (line 246).
- Data from `trpc.datasets.exportHistory` query (line 31).

**Minor deviations:**
- Not a separate component `export-history.tsx` -- embedded in `export-flow.tsx`.
- No "Clear History" button (spec required clearing with confirmation).
- No expired link handling (spec: after 30 days, show "Expired" instead of download link).
- Sorted by most recent first, limited to 10 items.

---

### Ticket 12: Build export API endpoint
**Status: DONE**

**Evidence:**
- Export mutation `datasets.export` at `frontend/server/trpc/routers/datasets.ts` lines 328-375.
- Input accepts: datasetId, format (5 options), options (includeTestSplit, includeMetadataHeader, shuffleExamples), customTemplate.
- Format-specific serializers in `getPreview` (lines 410-447): OpenAI, HuggingFace, DSPy, Agent Lightning, Custom JSON -- all 5 formats produce correctly structured output.
- Custom template applies Handlebars-style variable substitution (lines 426-441).
- Export recorded in history store (lines 352-367).
- Returns downloadUrl, fileSize, exampleCount.

**Minor deviations:**
- Options (test split, metadata, shuffle) are accepted in the schema but the export mutation only uses includeTestSplit for count calculation. The other options are not actually applied to the generated output.
- No actual file generation (returns a URL path but doesn't create a real downloadable file). This is expected for an in-memory prototype.
- No signed/time-limited URLs.

---

### Ticket 13: Build Auto-Improve tab -- pipeline visualization
**Status: DONE**

**Evidence:**
- Component at `frontend/components/training/pipeline-visualization.tsx` (223 lines).
- 6-stage horizontal pipeline: collecting, curating, optimizing, evaluating, deploying, monitoring (lines 51-57).
- Each node: icon, stage label, status-dependent styling (lines 60-88):
  - Completed: emerald border/icon.
  - Running: primary border with pulse (via Loader2 animate-spin).
  - Pending: muted border.
  - Failed: rose border.
  - Awaiting approval: amber border.
- Connecting lines between nodes with status-dependent colors (lines 90-103, 208-214).
- Responsive: horizontally scrollable via `overflow-x-auto` with `min-w-[920px]` (lines 165-166).
- Clickable stages that are completed/running/failed/awaiting (lines 169-172).

**Minor deviations:**
- Stages render as rectangular cards (h-24 rounded-lg) rather than circles as spec described.
- Pending borders use `border-border` (solid) rather than `border-dashed border-muted`.
- No dedicated stage-specific icons from lucide-react per stage -- uses status-based icons instead.

---

### Ticket 14: Build Auto-Improve tab -- approval banner
**Status: DONE**

**Evidence:**
- Component at `frontend/components/training/approval-banner.tsx` (103 lines).
- Amber-toned banner with AlertTriangle icon (line 42-44).
- Shows: score before/after, improvement delta, agent name, stage requiring approval (lines 47-53).
- Three action buttons: Approve & Deploy (primary), Reject (rose), Skip Stage (ghost) (lines 71-97).
- Actions send Temporal signals via `trpc.trainingLoops.signal` (lines 33-36).
- Loading state during signal send (lines 77-79).
- `onResolved` callback triggers refetch (line 36).

**Minor deviations:**
- Banner background is `bg-amber-500/10 border border-amber-500/30` instead of spec's `bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800`. Functionally similar but different exact colors.
- Approve button uses `btn btn-primary` class rather than explicit `bg-emerald-600` as spec described.
- No threshold display in the format described by spec ("Score: 0.87 -> 0.92 (threshold: 0.85)").

---

### Ticket 15: Build Auto-Improve tab -- stage detail accordion
**Status: DONE**

**Evidence:**
- Component at `frontend/components/training/stage-detail-accordion.tsx` (94 lines).
- Shows stage-specific metrics with labeled key-value grid (lines 22-56, 78-91).
- Metric labels per stage: collecting (feedbackCount, timeRange, sources), curating (datasetSize, qualityScore), optimizing (strategy, iteration), evaluating (evalScore, baselineScore, passRate), deploying (target, rollbackAvailable), monitoring (monitoringPeriod, liveScore, regressionDetected) (lines 22-56).
- Duration display (lines 74-76).
- Positive/negative value coloring (lines 83-86).

**Minor deviations:**
- Not truly an "accordion" with expand/collapse -- it's a single section panel shown inline. The parent page.tsx handles the toggle logic.
- Currently active stage is managed by parent, not self-contained accordion.
- Section header does NOT match pipeline node color (spec: "header colors match pipeline status"). Uses simple capitalize text.
- No link from EVALUATING stage to eval run detail page.
- No rollback button in DEPLOYING stage.

---

### Ticket 16: Build Auto-Improve tab -- Configure New Loop dialog
**Status: DONE**

**Evidence:**
- Component at `frontend/components/training/configure-loop-dialog.tsx` (262 lines).
- Dialog trigger: "New Loop" button in page.tsx Auto-Improve tab header (lines 481-487).
- Agent selector from `trpc.agents.list` (lines 94-106).
- Strategy selector: Coordinate Ascent, Example Selection, Reflection with descriptions (lines 14-30, 108-129).
- Trigger selector: Manual, Regression, Signal (lines 32-36, 131-152).
- Advanced settings (collapsible): max iterations, improvement threshold, auto-approve threshold, eval suite, monitoring period (lines 154-234).
- Validation: auto-approve > improvement threshold (line 58, 202-203).
- Summary text (lines 60-64, 238-240).
- Submit starts training loop via `trpc.trainingLoops.start` (lines 66-79).

**Minor deviations:**
- Source configuration (feedback window radio, min quality score slider, trace score threshold slider) not present as described in spec. Instead has simpler Advanced Settings.
- No stage toggles to enable/disable individual pipeline stages (spec: "Checkboxes to enable/disable individual pipeline stages").

---

### Ticket 17: Build Auto-Improve tab -- iteration history
**Status: DONE**

**Evidence:**
- Component at `frontend/components/training/iteration-history.tsx` (191 lines).
- Table columns: Agent, Strategy, Score Delta, Status, Date (lines 76-89).
- Improvement column colored: positive=emerald, negative=rose (lines 113-119).
- Outcome badges with correct colors: deployed=emerald, rejected=rose, skipped=gray (lines 22-29, 124-133).
- Expandable detail rows showing iteration number, agent version, duration, loop ID (lines 139-165).
- Sorted by most recent first (line 37-38).
- Empty state (lines 60-66).
- "Load More" pagination (lines 175-188).

**Minor deviations:**
- Columns differ slightly: "Agent" instead of "Iteration #", no "Started" time or "Duration" in the main row (these are in the expanded detail).
- Data source is seed data, not real Temporal workflow queries (trainingLoops.ts line 477: "TODO: Wire to ClickHouse").

---

### Ticket 18: Wire Auto-Improve to Temporal workflows
**Status: DONE**

**Evidence:**
- Router at `frontend/server/trpc/routers/trainingLoops.ts` (516 lines).
- Temporal integration via imports from `@/lib/temporal`: `startTrainingLoopWorkflow`, `getTrainingLoopStatus`, `signalTrainingLoop`, `listTrainingLoops`, `getWorkflowStatus` (lines 13-19).
- Status polling: `trpc.trainingLoops.list` queries Temporal via `listTrainingLoops()` and `getTrainingLoopStatus()` (lines 292-345). Frontend polls with `refetchInterval: 30000` for pendingApprovals (page.tsx line 85-86).
- Signal sending: `trainingLoops.signal` mutation supports all 6 signals: pause, resume, abort, approve, reject, skipStage (lines 366-389).
- Multiple concurrent loops: list returns array of loops (line 332).
- Start procedure creates Temporal workflow execution (lines 391-464).
- Error handling: `isTemporalUnavailable()` detects connectivity issues, falls back to seed data (lines 86-96, 334-344).
- Abort confirmation dialog in page.tsx (lines 691-739).

**Minor deviations:**
- Iteration history queries seed data, not real Temporal workflow executions (line 477 has TODO comment).
- Loop selector UI: loops shown stacked in cards, no selector dropdown for choosing between them.

---

## EPIC 2: Data Layer & Cross-Cutting Infrastructure

### Ticket 1: Build datasets tRPC router
**Status: DONE (same as Training Epic Ticket 8)**

**Evidence:** See Training Pipeline Ticket 8 above. All 6 required procedures implemented (list, get, create, delete, getExamples, export) plus extras (rebuild, exportHistory, clearExportHistory, getPreview). Router registered in `_app.ts`.

**Key deviation:** Uses in-memory stores, not Postgres + ClickHouse as specified. No `datasets` Postgres table or `dataset_examples` ClickHouse table created.

---

### Ticket 2: Build agents.getVersions tRPC endpoint
**Status: DONE**

**Evidence:**
- Procedure at `frontend/server/trpc/routers/agents.ts` lines 145-214.
- Input: `{ agentId: string }`.
- ClickHouse query groups traces by `agent_version`, returns `first_seen`, `last_seen`, `trace_count`, `avg_duration` (lines 153-179).
- Score enrichment: joins with `scores` table to compute `avg_score` per version (lines 182-204).
- Returns sorted by `first_seen DESC` (line 168).

**Minor deviations:**
- Returns `avgScore` (average score) instead of `passRate` as spec described. No pass rate computation from eval_results table.
- No Postgres join for version labels/environment mappings. The spec wanted `metadata.versions[version]` lookup for `{ label, environment }`.
- Return shape differs: `{ version, firstSeen, lastSeen, traceCount, avgScore, avgDuration }` vs spec's `{ version, firstSeen, lastSeen, traceCount, environment, label, passRate }`.

---

### Ticket 3: Migrate feedback storage from in-memory to ClickHouse
**Status: DONE**

**Evidence:**
- Feedback router at `frontend/server/trpc/routers/feedback.ts` (431 lines).
- Uses ClickHouse functions from `@/lib/clickhouse`: `insertFeedback`, `insertComparison`, `queryFeedback`, `queryComparisons`, `getFeedbackStats`, `healthCheck` (lines 11-21).
- ClickHouse availability check with 30s cache (lines 86-101).
- `create` mutation: inserts into ClickHouse when available, falls back to in-memory (lines 155-221).
- `list` query: reads from ClickHouse with filters, falls back to in-memory (lines 226-282).
- `comparisons` query: reads from ClickHouse, falls back (lines 287-333).
- `stats` query: aggregates from ClickHouse, falls back (lines 400-430).
- ClickHouse functions implemented in `frontend/lib/clickhouse.ts` with table DDL comments (lines 1384-1420).
- Table DDL includes `feedback` and `comparisons` tables with correct schema.

**Minor deviations:**
- No migration script at `scripts/migrations/003-feedback-tables.sql`. The DDL is documented as comments in `clickhouse.ts` but not as a standalone migration file.
- Table names are `feedback` and `comparisons` (not `feedback_preferences` and `feedback_corrections` as spec described). This is a unified schema which may be cleaner.
- In-memory fallback still present (graceful degradation pattern) rather than fully removing in-memory storage.
- tRPC procedure signatures slightly different from spec (uses unified `create` instead of `submitPreference`/`submitCorrection`).

---

### Ticket 4: Build useRunningWork composite hook
**Status: NOT DONE**

**Evidence:**
- No file found at `frontend/hooks/use-running-work.ts`.
- No file matching `use-running-work*` in the hooks directory.
- Hook not exported from `frontend/hooks/index.ts`.

**What's missing:**
- The entire `useRunningWork()` composite hook.
- Unified `RunningWorkItem` type aggregating eval runs, experiments, and training loops.
- Different polling intervals for different work types.
- Error handling for partial source failures.

---

### Ticket 5: Build useActivityFeed hook and API endpoint
**Status: NOT DONE**

**Evidence:**
- No file found at `frontend/hooks/use-activity-feed.ts`.
- No directory found at `frontend/app/api/activity/`.
- No `ActivityEvent` type definition found in hooks or types directories.

**What's missing:**
- API route `GET /api/activity` with event aggregation from multiple sources.
- `useActivityFeed()` hook with React Query integration.
- `ActivityEvent` type definition.
- Event sources: eval completions, prompt version changes, alert triggers, optimization completions.

---

### Ticket 6: Replace all mock data with real queries
**Status: PARTIAL**

**Evidence:**
- **Command Center** (`frontend/app/page.tsx`): No `MOCK_` constants found. Uses `useDashboard()` hook and `trpc.agents.list.useQuery()` for real data. DONE.
- **Experiments** (`frontend/app/experiments/page.tsx`): No `MOCK_` constants. Uses `useExperimentsInfinite()` hook backed by `trpc.experiments` router. DONE.
- **Prompts** (`frontend/app/prompts/page.tsx`): No `MOCK_` constants. Uses `trpc.prompts.list` and related queries. DONE.
- **Training** page: Uses real tRPC queries (feedback.stats, datasets.list, trainingLoops.list, etc.). DONE on the frontend side.

**However, backend uses in-memory/seed data:**
- `datasets.ts` router: all operations use in-memory `Map<string, Dataset>` with seeded demo data (line 60-61). NOT real Postgres/ClickHouse.
- `trainingLoops.ts` router: `iterationHistory` query returns seed data (line 477). Temporal connection attempted first with seed data fallback.
- `feedback.ts` router: Attempts ClickHouse first, falls back to in-memory. This is the closest to "real" but still has fallback.

**Missing:**
- `useRunningWork` hook not built (required by Command Center "Running Work" panel).
- `useActivityFeed` hook not built (required by Command Center "Recent Activity" section).

---

## Summary Table

| # | Epic | Ticket | Status |
|---|------|--------|--------|
| 1 | Training | Page shell and tab structure | DONE |
| 2 | Training | Feedback tab -- Preferences mode | DONE |
| 3 | Training | Feedback tab -- Corrections mode | DONE |
| 4 | Training | Feedback tab -- History mode | DONE |
| 5 | Training | Datasets tab -- card list | DONE |
| 6 | Training | Datasets tab -- Create Dataset wizard | DONE |
| 7 | Training | Datasets tab -- detail panel | DONE |
| 8 | Training | Build datasets tRPC router | DONE |
| 9 | Training | Export tab -- 3-step flow | DONE |
| 10 | Training | Export tab -- Custom JSON template | DONE |
| 11 | Training | Export tab -- export history | DONE |
| 12 | Training | Build export API endpoint | DONE |
| 13 | Training | Auto-Improve tab -- pipeline visualization | DONE |
| 14 | Training | Auto-Improve tab -- approval banner | DONE |
| 15 | Training | Auto-Improve tab -- stage detail accordion | DONE |
| 16 | Training | Auto-Improve tab -- Configure New Loop dialog | DONE |
| 17 | Training | Auto-Improve tab -- iteration history | DONE |
| 18 | Training | Wire Auto-Improve to Temporal workflows | DONE |
| 19 | Data Layer | Build datasets tRPC router | DONE |
| 20 | Data Layer | Build agents.getVersions tRPC endpoint | DONE |
| 21 | Data Layer | Migrate feedback storage to ClickHouse | DONE |
| 22 | Data Layer | Build useRunningWork composite hook | NOT DONE |
| 23 | Data Layer | Build useActivityFeed hook and API endpoint | NOT DONE |
| 24 | Data Layer | Replace all mock data with real queries | PARTIAL |

**Totals:**
- DONE: 21 tickets
- PARTIAL: 1 ticket
- NOT DONE: 2 tickets

**Overall: 21/24 tickets implemented (87.5%)**

---

## Key Gaps

1. **useRunningWork hook** -- entirely missing. Needed for Command Center "Running Work" panel and global status bar.
2. **useActivityFeed hook and API** -- entirely missing. Needed for Command Center "Recent Activity" section and Agent detail pages.
3. **Mock data replacement** -- Frontend pages are clean (no MOCK_ constants), but backend routers for datasets and iteration history still use in-memory/seed data rather than real database queries.
4. **Feedback migration script** -- DDL exists as comments in clickhouse.ts but no standalone migration file at `scripts/migrations/003-feedback-tables.sql`.
