# Training Pipeline

- type: epic
- priority: 1
- labels: frontend, ux, new-feature


Build the entire Training page from scratch with 4 tabs: Feedback, Datasets, Export, and Auto-Improve. This is the largest new feature area covering human feedback collection, dataset curation, export to fine-tuning formats, and automated prompt optimization loops.

**Wireframes:**
- `frontend/branding/wireframes/training/index.txt` (422 lines) — page shell, stat cards, Feedback tab
- `frontend/branding/wireframes/training/datasets.txt` (603 lines) — Datasets tab
- `frontend/branding/wireframes/training/export.txt` (362 lines) — Export tab
- `frontend/branding/wireframes/training/auto-improve.txt` (611 lines) — Auto-Improve tab

**Current state:** 0% implemented. Entire page and all 4 tabs must be built from scratch. No existing page at `/training`.

**Key files:**
- `frontend/app/training/page.tsx` — new page (to be created)
- `frontend/components/feedback/preference-picker.tsx` — existing preference component (reuse)
- `frontend/components/feedback/correction-form.tsx` — existing correction component (reuse)
- `frontend/components/optimization/loop-pipeline.tsx` — existing pipeline component (reference)
- `temporal-workers/src/workflows/training-loop.ts` — existing Temporal workflow for training loops

---
## Build Training page shell and tab structure

- type: task
- priority: 1
- labels: frontend, ux, new-feature
- estimate: 360

### Description


Create the Training page at `/training` with header, agent filter, pipeline stat cards, and 4-tab navigation structure.

**Wireframe:** `frontend/branding/wireframes/training/index.txt` — page header, stat cards, tab bar

**Requirements**

1. **New page** `frontend/app/training/page.tsx`:
   - Page title: "Training"
   - Agent filter dropdown in header (URL-synced as `&agent=booking-agent`)
   - Uses `trpc.agents.list` for agent dropdown options

2. **Pipeline stat cards** (4 cards in `grid grid-cols-2 lg:grid-cols-4 gap-4`):
   - **Feedback Collected**: total count of feedback items (preferences + corrections)
   - **Curated Datasets**: count of datasets
   - **Active Loops**: count of running training loops, with pulse animation dot if > 0
   - **Best Improvement**: highest improvement percentage with agent name (e.g. "+12% booking-agent")

3. **4-tab bar** below stat cards:
   - Tabs: Feedback (default), Datasets, Export, Auto-Improve
   - Tab state URL-synced as `?tab=feedback` via shallow routing
   - Badge on Auto-Improve tab when approval is pending (query training loop status for `AWAITING_APPROVAL` state)

4. **Tab content area**: renders the active tab's component
   - Initially each tab can render a placeholder/stub that will be built in subsequent issues

### Acceptance Criteria
- Page accessible at `/training`
- Agent filter dropdown populates with real agents and syncs to URL
- 4 stat cards render with correct labels (values can be 0 initially)
- Active Loops card shows pulse animation when loops are running
- Tab bar shows all 4 tabs with correct labels
- Tab state persists in URL (refreshing preserves active tab)
- Auto-Improve tab shows badge when approval is pending
- Sidebar navigation includes "Training" link
---
## Build Feedback tab — Preferences mode

- type: task
- priority: 1
- labels: frontend, ux, new-feature
- estimate: 360

### Description


Build the Preferences mode within the Feedback tab, allowing users to compare two responses side-by-side and record their preference with confidence and timing.

**Wireframe:** `frontend/branding/wireframes/training/index.txt` — Feedback tab, Preferences sub-tab

**Requirements**

1. **Segmented control** at top of Feedback tab: Preferences / Corrections / History
   - Default: Preferences

2. **Preference session UI** using `frontend/components/feedback/preference-picker.tsx` as base:
   - **Side-by-side comparison card**: two response cards shown next to each other (grid-cols-2)
   - Each card shows: agent response content, model name, latency, token count
   - User clicks the preferred response to select it (highlighted border on selection)

3. **Timed decision tracking**:
   - Start timer when comparison is displayed
   - Record `decisionTimeMs` when user makes selection
   - Display elapsed time subtly (e.g. small timer in corner)

4. **After selection, show**:
   - Confidence rating: 1-5 stars (clickable star row)
   - Reason textarea: optional, placeholder "Why did you prefer this response?"
   - Submit button

5. **Submit**: calls `trpc.feedback.createComparison` with `{ preferredId, rejectedId, confidence, decisionTimeMs, reason }`
   - On success: load next comparison pair
   - On empty queue: show "No more comparisons available" with count of completed today

6. **Component**: `frontend/components/training/feedback-preferences.tsx`

### Acceptance Criteria
- Side-by-side response comparison renders correctly
- Clicking a response highlights it as preferred
- Decision time is tracked from display to selection
- Confidence stars are clickable (1-5)
- Reason textarea is optional
- Submit creates feedback record and loads next pair
- Empty state shows when no comparisons are available
---
## Build Feedback tab — Corrections mode

- type: task
- priority: 1
- labels: frontend, ux, new-feature
- estimate: 360

### Description


Build the Corrections mode within the Feedback tab, allowing users to view an original response and submit a corrected version with error type classification.

**Wireframe:** `frontend/branding/wireframes/training/index.txt` — Feedback tab, Corrections sub-tab

**Requirements**

1. **Correction form** using `frontend/components/feedback/correction-form.tsx` as base:
   - **Original response display**: read-only card showing the agent's original response
   - **Corrected response textarea**: editable textarea pre-filled with original (user modifies)
   - **Error type checkboxes** (multi-select):
     - Factual Error
     - Hallucination
     - Incomplete
     - Wrong Tool
     - Style/Tone
   - **Change summary**: auto-generated showing diff word count (e.g. "Changed 12 words, added 3 sentences")

2. **Agent/trace selector**: dropdown or queue to pick which response to correct
   - Show responses from recent traces that had low scores
   - Or allow browsing recent agent responses

3. **Submit**: calls `trpc.feedback.create` with `{ traceId, original, corrected, correctionTypes[], changeSummary }`
   - On success: show success toast, load next response to correct
   - On empty queue: show "No responses to correct" message

4. **Component**: `frontend/components/training/feedback-corrections.tsx`

### Acceptance Criteria
- Original response shown in read-only card
- Corrected response textarea is editable and pre-filled with original
- Error type checkboxes allow multi-select
- Change summary auto-updates as user edits corrected response
- Submit creates correction record
- Loads next response after successful submission
- Empty state when no responses available
---
## Build Feedback tab — History mode

- type: task
- priority: 2
- labels: frontend, ux, new-feature
- estimate: 180

### Description


Build the History mode within the Feedback tab showing a table of all past feedback entries with expandable detail rows.

**Wireframe:** `frontend/branding/wireframes/training/index.txt` — Feedback tab, History sub-tab

**Requirements**

1. **Feedback history table** with columns:
   - **Type**: badge — "Preference" (blue) or "Correction" (amber)
   - **Agent**: agent name
   - **Timestamp**: relative format (e.g. "2h ago")
   - **Summary**: truncated preview of feedback content

2. **Expandable rows**:
   - Click row to expand and show full content
   - For preferences: show both responses with preferred one highlighted
   - For corrections: show original vs corrected with diff highlighting

3. **Filters**:
   - Type filter: All / Preferences / Corrections
   - Agent filter: dropdown of agents (syncs with page-level agent filter)

4. **Pagination**: 20 items per page, standard pagination controls
   - Uses `trpc.feedback.list` query with `{ type?, agentId?, offset, limit }`

5. **Component**: `frontend/components/training/feedback-history.tsx`

### Acceptance Criteria
- Table renders with type badges, agent names, timestamps, and summaries
- Rows are expandable showing full feedback content
- Type and agent filters work correctly
- Pagination controls navigate between pages
- 20 items per page
- Empty state when no feedback exists
---
## Build Datasets tab — card list

- type: task
- priority: 1
- labels: frontend, ux, new-feature
- estimate: 360

### Description


Build the Datasets tab content showing a card list of curated training datasets with format badges, source composition, and status indicators.

**Wireframe:** `frontend/branding/wireframes/training/datasets.txt` — dataset card list

**Requirements**

1. **Dataset cards** in a responsive grid (`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4`):
   - **Name**: dataset name (font-semibold)
   - **Format badge**: SFT / DPO / KTO / DSPy (each with distinct color)
   - **Example counts**: showing train/test split (e.g. "1,200 train / 300 test")
   - **Source composition bar**: proportional bar showing source breakdown:
     - Purple segment: corrections
     - Blue segment: preferences
     - Emerald segment: traces
   - **Created timestamp**: relative format
   - **Status badge**: ready (emerald) / building (blue with pulse) / failed (rose)

2. **Header area**:
   - "Create Dataset" button (primary, triggers wizard dialog)
   - Search input (filters by dataset name)
   - Format filter dropdown (All / SFT / DPO / KTO / DSPy)

3. **Data source**: `trpc.datasets.list` query (built in separate issue)
   - Handle loading state with skeleton cards
   - Handle empty state: "No datasets yet" with "Create your first dataset" CTA

4. **Component**: `frontend/components/training/dataset-cards.tsx`

### Acceptance Criteria
- Dataset cards render in responsive grid
- Format badges show correct colors per format type
- Source composition bar shows proportional segments with correct colors
- Status badges reflect dataset build state
- Search input filters cards by name
- Format dropdown filters cards by format
- "Create Dataset" button visible in header
- Empty state renders when no datasets exist
---
## Build Datasets tab — Create Dataset wizard

- type: task
- priority: 1
- labels: frontend, ux, new-feature
- estimate: 720

### Description


Build a 4-step wizard dialog for creating new training datasets from feedback, preferences, and trace data.

**Wireframe:** `frontend/branding/wireframes/training/datasets.txt` — Create Dataset wizard specification

**Requirements**

1. **4-step dialog** with progress indicator (step dots or progress bar):

   **Step 1 — Configure**:
   - Name input (required, validated)
   - Agent selector dropdown
   - Format radio cards with descriptions:
     - **SFT** (Supervised Fine-Tuning): "Input-output pairs for direct learning"
     - **DPO** (Direct Preference Optimization): "Preferred vs rejected pairs"
     - **KTO** (Kahneman-Tversky Optimization): "Binary good/bad labels"
     - **DSPy**: "Structured examples for DSPy optimization"
   - Format compatibility notes shown per selection

   **Step 2 — Sources**:
   - Multi-select checkboxes: Corrections, Preferences, Traces
   - For traces: score threshold slider (0.0-1.0, default 0.8) — only include traces above threshold
   - Count preview: shows number of available examples per source
   - Total count updates as sources and thresholds change

   **Step 3 — Split**:
   - Train/test ratio slider (default 80/20, range 50/50 to 95/5)
   - Visual bar showing proportions
   - Stratified toggle: "Maintain source proportions in both splits" (default on)
   - Preview counts: "960 train / 240 test"

   **Step 4 — Preview**:
   - Sample examples from each source (3-5 examples)
   - Total row count and estimated file size
   - "Create Dataset" button (primary)

2. **Navigation**: Back/Next buttons, step indicator shows completion
3. **Submit**: creates dataset asynchronously, returns to card list with "building" status
4. **Component**: `frontend/components/training/create-dataset-wizard.tsx`

### Acceptance Criteria
- 4-step wizard renders with progress indicator
- Step 1: all format options selectable with descriptions
- Step 2: source multi-select with trace threshold slider and count preview
- Step 3: train/test slider updates preview counts
- Step 4: sample examples displayed with total count and file size estimate
- Back/Next navigation works between steps
- Submit creates dataset and shows building status on card list
- Validation prevents advancing with incomplete required fields
---
## Build Datasets tab — detail panel

- type: task
- priority: 2
- labels: frontend, ux, new-feature
- estimate: 180

### Description


Build a slide-in detail panel for viewing dataset configuration, source breakdown, and example previews when a dataset card is clicked.

**Wireframe:** `frontend/branding/wireframes/training/datasets.txt` — dataset detail panel

**Requirements**

1. **Slide-in panel** (right side, `w-96`):
   - Triggered by clicking a dataset card
   - Slides in from right with transition
   - Close button (X) in top-right corner
   - Click outside or press Escape to close

2. **Panel content**:
   - **Config summary**: name, format, agent, created date, status
   - **Source breakdown**: pie/donut chart showing corrections/preferences/traces proportions
   - **Example preview**: paginated display of individual examples (3 per page, pagination dots)
   - **Actions**:
     - **Rebuild button**: creates a new version with same config (confirmation dialog)
     - **Delete button**: deletes dataset with confirmation dialog ("This cannot be undone. Delete {name}?")

3. **Data source**: `trpc.datasets.get({ id })` for metadata, `trpc.datasets.getExamples({ id, offset, limit })` for examples

4. **Component**: `frontend/components/training/dataset-detail-panel.tsx`

### Acceptance Criteria
- Panel slides in from right when dataset card is clicked
- Config summary displays all metadata
- Source breakdown chart renders proportionally
- Example preview shows examples with pagination dots
- Rebuild creates new version with confirmation
- Delete removes dataset with confirmation
- Panel closes on X click, outside click, or Escape
---
## Build datasets tRPC router

- type: task
- priority: 1
- labels: frontend, api, new-feature
- estimate: 360

### Description


Build the tRPC router for dataset CRUD operations and dataset construction from feedback and trace sources.

**Wireframe:** `frontend/branding/wireframes/training/datasets.txt` — data requirements

**Requirements**

1. **New router** `frontend/server/trpc/routers/datasets.ts`:

   **Procedures**:
   - **`list`** (query): filter by format, agent, status; returns `{ datasets: Dataset[], total: number }`
   - **`get`** (query): returns full dataset metadata by ID including source breakdown percentages
   - **`create`** (mutation): accepts `{ name, agentId, format, sources, scoreThreshold, trainTestRatio, stratified }`, triggers async dataset build
   - **`delete`** (mutation): deletes dataset by ID (soft delete or hard delete)
   - **`getExamples`** (query): paginated example retrieval `{ datasetId, offset, limit }` returning `{ examples: Example[], total: number }`

2. **Dataset construction logic** (in create mutation):
   - Query corrections from feedback table filtered by agent
   - Query preferences from feedback table filtered by agent
   - Query traces from ClickHouse filtered by agent and score threshold
   - Transform to target format (SFT/DPO/KTO/DSPy)
   - Apply train/test split with optional stratification
   - Store metadata in Postgres, examples in ClickHouse

3. **Schema types** (add to `frontend/server/trpc/routers/datasets.ts` or shared types):
   - `Dataset`: `{ id, name, agentId, format, status, trainCount, testCount, sourceBreakdown, createdAt }`
   - `Example`: `{ id, datasetId, split, source, input, output, metadata }`

4. **Register router** in `frontend/server/trpc/routers/index.ts` (or wherever routers are merged)

### Acceptance Criteria
- All 5 procedures implemented and callable from frontend
- `list` supports filtering by format, agent, and status
- `create` triggers async dataset build and returns immediately with "building" status
- `getExamples` returns paginated examples
- `delete` removes dataset
- Router registered and accessible via `trpc.datasets.*`
---
## Build Export tab — 3-step flow

- type: task
- priority: 1
- labels: frontend, ux, new-feature
- estimate: 360

### Description


Build the Export tab with a single-page vertical 3-step flow for selecting a dataset, choosing an export format, and previewing/downloading the result.

**Wireframe:** `frontend/branding/wireframes/training/export.txt` — 3-step export flow

**Requirements**

1. **Single-page vertical flow** (not wizard dialog) with 3 numbered sections:

   **Step 1 — Select Dataset**:
   - Dropdown of ready datasets (status === 'ready')
   - Each option shows: name, format badge, example count
   - Selection shows dataset summary card below dropdown

   **Step 2 — Choose Format** (5 radio cards):
   - **OpenAI Fine-Tune JSONL** (.jsonl): "Compatible with OpenAI fine-tuning API"
   - **HuggingFace TRL** (.json): "For Transformer Reinforcement Learning"
   - **DSPy** (.json): "Structured examples for DSPy optimizers"
   - **Agent Lightning** (.jsonl): "Neon's native agent format"
   - **Custom JSON** (.json): "Define your own template" (enables template editor, built in separate issue)
   - Each card: format name, file extension, one-line description

   **Step 3 — Preview & Export**:
   - Syntax-highlighted JSON preview (first 3 examples):
     - Keys in blue (`text-blue-500`)
     - Strings in emerald (`text-emerald-500`)
     - Numbers in amber (`text-amber-500`)
   - File size estimate
   - Export options checkboxes:
     - Include test split (default: off)
     - Include metadata header (default: on)
     - Shuffle examples (default: on)
   - **Download button** (primary, with download icon)

2. **Steps are sequential**: Step 2 disabled until dataset selected, Step 3 disabled until format selected

3. **Component**: `frontend/components/training/export-flow.tsx`

### Acceptance Criteria
- 3-step vertical flow renders with numbered sections
- Dataset dropdown populated from ready datasets
- 5 format radio cards selectable
- JSON preview shows syntax highlighting with correct colors
- File size estimate displayed
- Export options checkboxes functional
- Download button triggers file download
- Steps are sequentially gated (cannot skip ahead)
---
## Build Export tab — Custom JSON template

- type: task
- priority: 2
- labels: frontend, ux, new-feature
- estimate: 180

### Description


Build the custom JSON template editor that appears when "Custom JSON" format is selected in the Export tab, with Handlebars-style variable insertion and live preview.

**Wireframe:** `frontend/branding/wireframes/training/export.txt` — Custom JSON template section

**Requirements**

1. **Template editor** (shown only when "Custom JSON" format is selected):
   - Textarea with monospace font for template editing
   - Handlebars-style variable insertion: `{{input}}`, `{{output}}`, `{{tools}}`, `{{metadata.agent}}`, `{{metadata.timestamp}}`
   - Variable reference panel: list of available variables with click-to-insert

2. **Default template** pre-filled:
   ```json
   {
     "input": "{{input}}",
     "output": "{{output}}",
     "agent": "{{metadata.agent}}",
     "timestamp": "{{metadata.timestamp}}"
   }
   ```

3. **Live preview**: updates as template changes
   - Shows rendered output using first example from selected dataset
   - Syntax highlighted matching Step 3 preview styling

4. **Validation**: check template is valid JSON (ignoring `{{}}` variables), show error if malformed

5. **Component**: `frontend/components/training/custom-template-editor.tsx`

### Acceptance Criteria
- Template editor appears when Custom JSON is selected
- Default template pre-filled
- Available variables listed with click-to-insert
- Live preview updates as template changes
- Preview uses real data from first dataset example
- Validation warns on malformed JSON
- Template value passed to export API
---
## Build Export tab — export history

- type: task
- priority: 2
- labels: frontend, ux, new-feature
- estimate: 180

### Description


Build an export history table below the export flow showing past exports with re-download capability.

**Wireframe:** `frontend/branding/wireframes/training/export.txt` — export history section

**Requirements**

1. **Export history table** below the 3-step flow:
   - Columns: Dataset Name, Format, File Size, Timestamp (relative), Re-download link
   - Sorted by most recent first
   - 30-day cache for re-downloads (after 30 days, link shows "Expired")

2. **Re-download link**: clicking triggers file download of cached export

3. **"Clear History" button**: clears export history with confirmation dialog

4. **Data source**: `trpc.datasets.exportHistory` query or local storage for export records

5. **Component**: `frontend/components/training/export-history.tsx`

### Acceptance Criteria
- Table renders below export flow showing past exports
- All columns display correct data
- Re-download link triggers file download for cached exports
- Expired exports (>30 days) show "Expired" instead of download link
- Clear History removes all records with confirmation
- Empty state when no exports have been made
---
## Build export API endpoint

- type: task
- priority: 1
- labels: frontend, api, new-feature
- estimate: 360

### Description


Build the tRPC mutation for exporting datasets in various fine-tuning formats, with format-specific serializers that generate downloadable files.

**Wireframe:** `frontend/branding/wireframes/training/export.txt` — export format specifications

**Requirements**

1. **New tRPC mutation** `datasets.export`:
   - Input: `{ datasetId, format, options: { includeTestSplit, includeMetadataHeader, shuffleExamples }, customTemplate? }`
   - Output: `{ downloadUrl, fileSize, exampleCount }`

2. **Format-specific serializers**:

   **OpenAI Fine-Tune JSONL**:
   ```json
   {"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
   ```

   **HuggingFace TRL**:
   ```json
   {"prompt": "...", "completion": "...", "label": true}
   ```

   **DSPy**:
   ```json
   {"input": "...", "output": "...", "metadata": {"agent": "...", "score": 0.95}}
   ```

   **Agent Lightning**:
   ```json
   {"input": "...", "output": "...", "tools": [...], "trace_id": "..."}
   ```

   **Custom JSON**: apply user-provided Handlebars template

3. **File generation**:
   - Generate file server-side (in memory or temp file)
   - Return download URL (signed, time-limited)
   - Cache generated file for 30 days for re-downloads
   - Record export in history

4. **Options handling**:
   - `includeTestSplit`: if true, include test examples in export
   - `includeMetadataHeader`: if true, add metadata comment/header at top of file
   - `shuffleExamples`: if true, randomize example order

### Acceptance Criteria
- Export mutation accepts dataset ID and format
- All 5 formats produce correctly structured output
- Custom template applies Handlebars-style variable substitution
- Generated file is downloadable via returned URL
- Options (test split, metadata, shuffle) are respected
- Export recorded in history for re-download
---
## Build Auto-Improve tab — pipeline visualization

- type: task
- priority: 1
- labels: frontend, ux, new-feature
- estimate: 360

### Description


Build the 6-stage horizontal pipeline hero element for the Auto-Improve tab, showing the current state of the automated prompt optimization loop.

**Wireframe:** `frontend/branding/wireframes/training/auto-improve.txt` — pipeline visualization hero

**Requirements**

1. **6-stage horizontal pipeline** component:
   - Stages: COLLECTING -> CURATING -> OPTIMIZING -> EVALUATING -> DEPLOYING -> MONITORING
   - Rendered as horizontally connected nodes with connecting lines

2. **Each node**:
   - Circle with icon (stage-specific icon from lucide-react)
   - Stage label below circle
   - Status-dependent styling:
     - **Completed**: emerald border and icon (`border-emerald-500 text-emerald-500`)
     - **Running**: primary border with CSS pulse animation (`border-primary animate-pulse`)
     - **Pending**: muted/dashed border (`border-dashed border-muted`)
     - **Failed**: rose border (`border-rose-500 text-rose-500`)
     - **Awaiting approval**: amber border with pulse (`border-amber-500 animate-pulse`)

3. **Connecting lines** between nodes:
   - Solid line for completed transitions (`bg-emerald-500`)
   - Dashed line for pending transitions (`border-dashed border-muted`)
   - Animated line for active transition (CSS animation)

4. **Responsive**: horizontally scrollable on mobile, full-width on desktop

5. **Data source**: current loop status from Temporal query (passed as props from parent)

6. **Component**: `frontend/components/training/pipeline-visualization.tsx`

### Acceptance Criteria
- 6 stages render horizontally with connecting lines
- Each stage shows correct icon and label
- Status styling matches specification (completed=emerald, running=pulse, pending=dashed, failed=rose, awaiting=amber)
- Connecting lines reflect transition state
- Responsive on mobile (scrollable)
- Pipeline updates when loop status changes
---
## Build Auto-Improve tab — approval banner

- type: task
- priority: 1
- labels: frontend, ux, new-feature
- estimate: 180

### Description


Build the approval banner that appears when a training loop is awaiting human approval, with approve/reject/skip actions that send Temporal signals.

**Wireframe:** `frontend/branding/wireframes/training/auto-improve.txt` — approval banner

**Requirements**

1. **Amber banner** displayed at top of Auto-Improve tab when any loop is in `AWAITING_APPROVAL` state:
   - Background: `bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800`
   - Icon: AlertTriangle or ShieldCheck in amber

2. **Banner content**:
   - Current score vs threshold (e.g. "Score: 0.87 → 0.92 (threshold: 0.85)")
   - Improvement delta (e.g. "+5.7% improvement")
   - Stage requiring approval (e.g. "Approval needed before DEPLOYING stage")

3. **Three action buttons**:
   - **Approve** (emerald): `bg-emerald-600 hover:bg-emerald-700 text-white`
   - **Reject** (rose): `bg-rose-600 hover:bg-rose-700 text-white`
   - **Skip Stage** (outline): `border border-border hover:bg-surface-hover`

4. **Actions send Temporal signals**:
   - Approve: sends `approveSignal` to training loop workflow
   - Reject: sends `rejectSignal` to training loop workflow
   - Skip Stage: sends `skipStageSignal` to training loop workflow
   - All actions show loading state and confirmation

5. **Component**: `frontend/components/training/approval-banner.tsx`

### Acceptance Criteria
- Banner appears only when a loop is awaiting approval
- Shows current score, threshold, improvement delta, and stage name
- Approve button sends approveSignal to Temporal
- Reject button sends rejectSignal to Temporal
- Skip Stage button sends skipStageSignal to Temporal
- Banner disappears after action is taken
- Actions show loading state during Temporal signal send
---
## Build Auto-Improve tab — stage detail accordion

- type: task
- priority: 2
- labels: frontend, ux, new-feature
- estimate: 180

### Description


Build expandable accordion sections for each pipeline stage showing stage-specific metrics and details.

**Wireframe:** `frontend/branding/wireframes/training/auto-improve.txt` — stage detail sections

**Requirements**

1. **Expandable accordion** below pipeline visualization, one section per stage:

   **COLLECTING**:
   - Feedback count, trace count, time range covered
   - Source breakdown (corrections, preferences, traces)

   **CURATING**:
   - Dataset size (examples), quality score, filter criteria applied
   - Source composition bar (reuse from dataset cards)

   **OPTIMIZING**:
   - Strategy used: Coordinate Ascent / Example Selection / Reflection
   - Iteration count, best score achieved, improvement over baseline

   **EVALUATING**:
   - Eval run ID (linked to `/eval-runs/[id]`)
   - Pass rate, average score, regression check result

   **DEPLOYING**:
   - Version deployed, target environment
   - Rollback available (boolean with rollback button)

   **MONITORING**:
   - Duration monitored, regression detected (boolean)
   - Current score vs deployment score, alert triggers

2. **Stage styling**: section header matches pipeline node color (emerald for completed, etc.)
3. **Default state**: currently active stage expanded, others collapsed

4. **Component**: `frontend/components/training/stage-detail-accordion.tsx`

### Acceptance Criteria
- 6 accordion sections render, one per pipeline stage
- Each section shows stage-specific metrics as specified
- Currently active stage is expanded by default
- Section header colors match pipeline status
- Eval run ID in EVALUATING stage links to eval run detail page
- Rollback button in DEPLOYING stage triggers rollback action
---
## Build Auto-Improve tab — Configure New Loop dialog

- type: task
- priority: 1
- labels: frontend, ux, new-feature
- estimate: 360

### Description


Build the dialog for configuring and starting a new automated prompt optimization loop, with strategy selection, source configuration, and approval thresholds.

**Wireframe:** `frontend/branding/wireframes/training/auto-improve.txt` — Configure New Loop dialog

**Requirements**

1. **Dialog trigger**: "Configure New Loop" button in Auto-Improve tab header

2. **Dialog sections**:

   **Agent selector**:
   - Dropdown of available agents
   - Required field

   **Strategy selector**:
   - Dropdown with descriptions:
     - **Coordinate Ascent**: "Optimize one variable at a time, cycling through all"
     - **Example Selection**: "Select best training examples to maximize eval score"
     - **Reflection**: "LLM self-reflects on failures and rewrites prompt"

   **Source configuration**:
   - Feedback window: radio group (7d / 30d / 90d)
   - Min quality score: slider (0.0-1.0, default 0.5)
   - Trace score threshold: slider (0.0-1.0, default 0.7)

   **Evaluation configuration**:
   - Suite selector: dropdown of available eval suites
   - Minimum improvement threshold: number input with % suffix (default 5%)

   **Approval thresholds**:
   - Auto-approve threshold: number input (e.g. >=90%) — improvements above this are auto-deployed
   - Human review range: displayed as range between auto-approve and auto-reject
   - Auto-reject threshold: number input (e.g. <70%) — improvements below this are auto-rejected

   **Stage toggles**:
   - Checkboxes to enable/disable individual pipeline stages
   - COLLECTING and EVALUATING always enabled (required)
   - DEPLOYING and MONITORING can be disabled for dry-run mode

3. **Submit**: starts `trainingLoopWorkflow` via Temporal with full configuration
4. **Component**: `frontend/components/training/configure-loop-dialog.tsx`

### Acceptance Criteria
- Dialog opens from "Configure New Loop" button
- Agent selector populated from real agents
- Strategy dropdown shows all 3 options with descriptions
- Source config sliders work with real-time value display
- Evaluation config shows available eval suites
- Approval thresholds validate (auto-approve > auto-reject)
- Stage toggles allow disabling optional stages
- Submit starts Temporal workflow and closes dialog
- New loop appears in pipeline visualization
---
## Build Auto-Improve tab — iteration history

- type: task
- priority: 2
- labels: frontend, ux, new-feature
- estimate: 180

### Description


Build a table showing the history of past training loop iterations with per-iteration metrics and expandable detail rows.

**Wireframe:** `frontend/branding/wireframes/training/auto-improve.txt` — iteration history table

**Requirements**

1. **Iteration history table** below pipeline visualization and stage details:
   - Columns:
     - **Iteration #**: sequential number
     - **Started**: relative timestamp (e.g. "3h ago")
     - **Duration**: formatted duration (e.g. "12m 34s")
     - **Strategy**: strategy name used
     - **Improvement**: percentage delta with color (positive=emerald, negative=rose, zero=muted)
     - **Outcome**: badge — "Deployed" (emerald) / "Rejected" (rose) / "Skipped" (amber)
     - **Agent Version**: version number after iteration

2. **Expandable detail rows**:
   - Click row to expand
   - Shows per-stage metrics summary (compact version of stage detail accordion data)

3. **Sorting**: most recent first (default)

4. **Data source**: query completed training loop workflow executions from Temporal

5. **Component**: `frontend/components/training/iteration-history.tsx`

### Acceptance Criteria
- Table renders with all specified columns
- Improvement column colored by direction (positive=emerald, negative=rose)
- Outcome badges use correct colors
- Rows are expandable showing per-stage metrics
- Sorted by most recent iteration first
- Empty state when no iterations have run
---
## Wire Auto-Improve to Temporal workflows

- type: task
- priority: 1
- labels: frontend, api, new-feature
- estimate: 360

### Description


Integrate the Auto-Improve tab with the existing `trainingLoopWorkflow` Temporal workflow, enabling real-time status polling, signal sending, and multi-loop management.

**Wireframe:** `frontend/branding/wireframes/training/auto-improve.txt` — data integration requirements

**Requirements**

1. **Temporal integration** via existing workflow at `temporal-workers/src/workflows/training-loop.ts`:

   **Status polling**:
   - Use `getLoopStatusQuery` Temporal query to fetch current state
   - Poll every 30 seconds (not WebSocket)
   - Response includes: current stage, stage metrics, approval status, iteration count, scores
   - Use React Query with `refetchInterval: 30000`

2. **Signal sending** (via tRPC mutations that call Temporal client):
   - `pauseSignal`: pause the running loop
   - `resumeSignal`: resume a paused loop
   - `abortSignal`: abort the loop entirely (with confirmation dialog: "Abort training loop? This cannot be undone.")
   - `approveSignal`: approve pending deployment
   - `rejectSignal`: reject pending deployment
   - `skipStageSignal`: skip the current stage

3. **Multiple concurrent loops**:
   - Support displaying multiple active loops (one card/section per loop)
   - Each loop identified by workflow ID
   - Loop selector or stacked cards if multiple are running

4. **tRPC procedures** (new or added to existing router):
   - `trainingLoops.getStatus({ workflowId })`: query Temporal for loop status
   - `trainingLoops.list({ agentId? })`: list active and recent loop workflow IDs
   - `trainingLoops.signal({ workflowId, signal, payload? })`: send signal to workflow
   - `trainingLoops.start({ config })`: start new training loop workflow

5. **Error handling**: handle Temporal connectivity issues, workflow not found, signal failures

### Acceptance Criteria
- Auto-Improve tab shows real-time status from Temporal workflow
- Status updates every 30 seconds via polling
- All 6 signals can be sent from the UI
- Abort shows confirmation dialog before sending
- Multiple concurrent loops displayed correctly
- Error states handled gracefully (Temporal down, workflow not found)
- Starting a new loop creates a Temporal workflow execution