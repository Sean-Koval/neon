# Data Layer & Cross-Cutting Infrastructure

- type: epic
- priority: 1
- labels: frontend, api, data-layer, infrastructure


Infrastructure issues that span multiple pages or establish shared data foundations. These tasks build the tRPC routers, hooks, and storage migrations that multiple feature epics depend on. Completing these unblocks downstream work in Command Center, Agents, Training, and Experiments pages.

**Current state:** Several pages rely on hardcoded mock data or in-memory storage. This epic migrates to real ClickHouse/Postgres-backed queries and builds the shared hooks that multiple pages consume.

**Key files:**
- `frontend/server/trpc/routers/_app.ts` — tRPC router registry
- `frontend/server/trpc/routers/` — individual routers (agents, feedback, etc.)
- `frontend/hooks/` — React Query hooks consumed by pages
- `frontend/app/api/` — Next.js API routes

---
## Build datasets tRPC router

- type: task
- priority: 1
- labels: frontend, api, data-layer
- estimate: 360

### Description


Build a new tRPC router for managing training datasets. Datasets are collections of examples sourced from corrections, preferences, and traces, used for fine-tuning and evaluation.

**Wireframe:** `frontend/branding/wireframes/training/datasets.txt` (datasets list and detail), `frontend/branding/wireframes/training/export.txt` (export flow)

**Requirements**

1. **New router** `frontend/server/trpc/routers/datasets.ts`:

   - **`list`** (query):
     - Input: `{ format?: 'jsonl'|'csv'|'parquet', agentId?: string, status?: 'building'|'ready'|'exported' }`
     - Returns: `DatasetSummary[]` with `{ id, name, format, exampleCount, sources: string[], status, createdAt, updatedAt }`
     - Query: Postgres `datasets` table with optional filters
     - Sort by `updatedAt` descending

   - **`get`** (query):
     - Input: `{ id: string }`
     - Returns: full `Dataset` with `{ id, name, description, format, config, sources: DatasetSource[], exampleCount, status, createdAt, updatedAt }`
     - `DatasetSource`: `{ type: 'corrections'|'preferences'|'traces', count: number, dateRange: { from, to } }`
     - Joins Postgres metadata with ClickHouse example counts

   - **`create`** (mutation):
     - Input: `{ name, description?, format, sources: { type, agentId?, dateRange? }[], config?: DatasetConfig }`
     - Async operation: creates dataset record in Postgres with status `building`, kicks off background job to aggregate examples from specified sources into ClickHouse `dataset_examples` table
     - Returns: `{ id, status: 'building' }`

   - **`delete`** (mutation):
     - Input: `{ id: string }`
     - Soft delete: sets `deleted_at` timestamp in Postgres
     - Does not delete ClickHouse examples immediately (background cleanup)

   - **`getExamples`** (query):
     - Input: `{ datasetId: string, cursor?: string, limit?: number }` (default limit 20)
     - Returns: paginated examples from ClickHouse `dataset_examples` table
     - Each example: `{ id, input, expectedOutput, actualOutput, source, metadata }`

   - **`export`** (mutation):
     - Input: `{ datasetId: string, format: 'jsonl'|'csv'|'parquet' }`
     - Generates file in specified format from ClickHouse examples
     - Returns: `{ downloadUrl: string, expiresAt: string }`

2. **Register in `frontend/server/trpc/routers/_app.ts`**:
   - Add `datasets: datasetsRouter` to the app router

3. **Database requirements**:
   - Postgres table: `datasets` (id, project_id, name, description, format, config JSONB, status, created_at, updated_at, deleted_at)
   - ClickHouse table: `dataset_examples` (id, dataset_id, project_id, input, expected_output, actual_output, source_type, source_id, metadata, created_at)

### Acceptance Criteria
- All 6 procedures are implemented and type-safe
- `list` returns filtered results based on format, agent, and status
- `create` initiates async dataset building and returns immediately
- `getExamples` supports cursor-based pagination
- `export` generates a downloadable file
- Router is registered and accessible via tRPC client
- Required by: Training Datasets tab, Training Export tab
---
## Build agents.getVersions tRPC endpoint

- type: task
- priority: 1
- labels: frontend, api, data-layer
- estimate: 180

### Description


Add a `getVersions` procedure to the existing agents tRPC router. This provides version history with metrics for the Agents detail Versions tab.

**Wireframe:** `frontend/branding/wireframes/agents/detail-versions.txt`

**Requirements**

1. **New procedure in `frontend/server/trpc/routers/agents.ts`**:
   - Procedure name: `getVersions`
   - Input: `{ agentId: string }`
   - Returns: `AgentVersion[]`

2. **`AgentVersion` shape**:
   ```
   {
     version: string,
     firstSeen: Date,
     lastSeen: Date,
     traceCount: number,
     environment: 'production' | 'staging' | 'development' | null,
     label: string | null,
     passRate: number | null
   }
   ```

3. **ClickHouse query**:
   ```sql
   SELECT
     agent_version AS version,
     MIN(timestamp) AS first_seen,
     MAX(timestamp) AS last_seen,
     COUNT(*) AS trace_count
   FROM traces
   WHERE agent_id = {agentId:String}
     AND project_id = {projectId:String}
   GROUP BY agent_version
   ORDER BY first_seen DESC
   ```

4. **Postgres join**:
   - Query `agents` table metadata JSONB for version labels and environment mappings
   - If an agent has `metadata.versions` object, look up `metadata.versions[version]` for `{ label, environment }`
   - If no metadata exists for a version, return `environment: null, label: null`

5. **Pass rate computation**:
   - For each version, query ClickHouse eval results:
     ```sql
     SELECT
       countIf(score >= min_pass_score) / count(*) AS pass_rate
     FROM eval_results
     WHERE agent_id = {agentId:String}
       AND agent_version = {version:String}
     ```
   - If no eval results exist for a version, return `passRate: null`

### Acceptance Criteria
- `trpc.agents.getVersions({ agentId })` returns version history sorted by first seen (newest first)
- Each version includes trace count, date range, and optional environment/label
- Pass rate is computed from actual eval results, not hardcoded
- Versions with no eval data return `passRate: null`
- Required by: Agents Versions tab
---
## Migrate feedback storage from in-memory to ClickHouse

- type: task
- priority: 1
- labels: frontend, api, data-layer, migration
- estimate: 360

### Description


The current feedback tRPC router (`frontend/server/trpc/routers/feedback.ts`) uses in-memory arrays for storing preferences and corrections. Migrate to ClickHouse for persistent, queryable storage.

**Wireframe:** `frontend/branding/wireframes/training/index.txt` — Training overview references feedback data as a source for datasets

**Requirements**

1. **Create ClickHouse tables**:

   - **`feedback_preferences`**:
     ```sql
     CREATE TABLE feedback_preferences (
       id UUID DEFAULT generateUUIDv4(),
       project_id String,
       agent_id String,
       preferred_id String,
       rejected_id String,
       confidence Float32,
       decision_time_ms UInt32,
       reason String DEFAULT '',
       timestamp DateTime64(3) DEFAULT now64(3)
     ) ENGINE = MergeTree()
     ORDER BY (project_id, agent_id, timestamp)
     ```

   - **`feedback_corrections`**:
     ```sql
     CREATE TABLE feedback_corrections (
       id UUID DEFAULT generateUUIDv4(),
       project_id String,
       agent_id String,
       original String,
       corrected String,
       correction_types Array(String),
       change_summary String DEFAULT '',
       timestamp DateTime64(3) DEFAULT now64(3)
     ) ENGINE = MergeTree()
     ORDER BY (project_id, agent_id, timestamp)
     ```

2. **Update `frontend/server/trpc/routers/feedback.ts`**:
   - Replace all in-memory array reads with ClickHouse SELECT queries
   - Replace all in-memory array pushes with ClickHouse INSERT statements
   - Use the ClickHouse client from `@/lib/clickhouse` (existing pattern)
   - Maintain the same tRPC procedure signatures so no frontend changes are needed

3. **Specific procedure updates**:
   - `submitPreference`: INSERT into `feedback_preferences`
   - `submitCorrection`: INSERT into `feedback_corrections`
   - `getPreferences`: SELECT from `feedback_preferences` with pagination and optional agent filter
   - `getCorrections`: SELECT from `feedback_corrections` with pagination and optional agent filter
   - `getStats`: aggregate counts and recent activity from both tables

4. **Migration script** `scripts/migrations/003-feedback-tables.sql`:
   - Contains the CREATE TABLE statements
   - Idempotent: uses `CREATE TABLE IF NOT EXISTS`
   - Document in script header how to run it

5. **Remove in-memory storage**:
   - Delete the in-memory arrays and any initialization code
   - Ensure no other code references the old in-memory store

### Acceptance Criteria
- All feedback data persists across server restarts
- Existing tRPC procedure signatures unchanged (no frontend breakage)
- Preferences and corrections queryable by project, agent, and time range
- Migration script runs cleanly on fresh ClickHouse instance
- Required by: Training Feedback tab, Training Datasets tab (feedback as dataset source)
---
## Build useRunningWork composite hook

- type: task
- priority: 1
- labels: frontend, api, data-layer
- estimate: 180

### Description


Build a composite hook that aggregates all currently running work items (eval runs, experiments, training loops) into a unified list. Multiple pages need to show running work status.

**Wireframe:** `frontend/branding/wireframes/command-center/index.txt` — "Running Work" section, `frontend/branding/wireframes/global/status-bar.txt` — status bar running work indicator

**Requirements**

1. **New hook** `frontend/hooks/use-running-work.ts`:
   - Exports `useRunningWork()` returning `{ items: RunningWorkItem[], isLoading, error }`

   - **`RunningWorkItem` shape**:
     ```
     {
       id: string,
       type: 'eval' | 'experiment' | 'training',
       name: string,
       progress: number,      // 0-100
       detail: string,        // e.g., "45/100 cases · 2m elapsed"
       href: string           // link to detail page
     }
     ```

2. **Data sources**:
   - **Running eval runs**: from `useWorkflowRuns({ status: 'RUNNING' })` (existing hook/query)
     - Map to: `{ id: run.id, type: 'eval', name: run.suiteName, progress: run.completedCases / run.totalCases * 100, detail: '${run.completedCases}/${run.totalCases} cases · ${elapsed}', href: '/eval-runs/${run.id}' }`
     - Poll interval: 5 seconds

   - **Running experiments**: from experiment workflow queries (Temporal)
     - If experiment workflows not yet implemented, return empty array with TODO comment
     - Poll interval: 15 seconds

   - **Active training loops**: from training loop workflow queries (Temporal)
     - If training loop workflows not yet implemented, return empty array with TODO comment
     - Poll interval: 30 seconds

3. **Normalization and sorting**:
   - Combine all items into single array
   - Sort by type priority: training (highest) > experiment > eval (lowest)
   - Within same type, sort by progress ascending (least complete first)

4. **Error handling**:
   - If one source fails, still return items from other sources
   - Set `error` only if all sources fail
   - Individual source failures logged to console

### Acceptance Criteria
- `useRunningWork()` returns unified list of all running work
- Eval runs appear with real progress data when evals are running
- Experiment and training stubs return empty arrays without errors
- Items sorted by type priority, then by progress
- Different polling intervals for different work types
- Partial failures don't break the entire hook
- Required by: Command Center "Running Work" panel, Status Bar
---
## Build useActivityFeed hook and API endpoint

- type: task
- priority: 1
- labels: frontend, api, data-layer
- estimate: 360

### Description


Build the data layer for the activity feed that appears on the Command Center and Agent detail pages. This aggregates recent events from multiple sources into a unified timeline.

**Wireframe:** `frontend/branding/wireframes/command-center/index.txt` — "Recent Activity" section, `frontend/branding/wireframes/agents/detail.txt` — "Recent Activity" section on agent detail

**Requirements**

1. **New API route** `frontend/app/api/activity/route.ts`:
   - `GET` endpoint with query params: `?limit=10&agentId=optional`
   - Returns: `{ events: ActivityEvent[] }`

   - **`ActivityEvent` shape**:
     ```
     {
       id: string,
       type: 'eval-complete' | 'deploy' | 'optimization' | 'alert',
       description: string,
       timestamp: string,       // ISO 8601
       href: string,            // link to detail page
       metadata: Record<string, unknown>  // type-specific extra data
     }
     ```

   - **Event sources** (query each, merge, sort by timestamp):
     - **Eval run completions**: query `eval_runs` table for recently completed runs, join with suites for names. Description format: `"booking-agent eval completed: 95% pass rate"`
     - **Prompt version changes**: query `prompts` table for recent `is_production` flag changes. Description format: `"booking-prompt v3 deployed to production"`
     - **Alert triggers**: query existing alerts API for recent triggered alerts. Description format: `"Pass rate regression detected for booking-agent"`
     - **Optimization completions**: query training loop workflow status for recently completed loops. Description format: `"Auto-improve loop completed for booking-agent: +2.1% pass rate"`

   - Merge all events, sort by timestamp descending, return top N (default 10)
   - Use `withAuth` middleware for workspace scoping
   - If `agentId` param provided, filter all sources to that agent only

2. **New hook** `frontend/hooks/use-activity-feed.ts`:
   - Exports `useActivityFeed(options?: { agentId?: string, limit?: number })`
   - Returns `{ events: ActivityEvent[], isLoading, error }`
   - Calls `GET /api/activity?limit=${limit}&agentId=${agentId}`
   - React Query config: `staleTime: 30_000` (30 seconds), `queryKey: ['activity-feed', agentId, limit]`

3. **Type definitions**:
   - Export `ActivityEvent` type from `frontend/types/activity.ts` or co-located with the hook
   - Ensure type is shared between API route and hook

### Acceptance Criteria
- API returns aggregated events from all sources sorted by most recent
- Optional `agentId` filter restricts events to a specific agent
- Hook provides typed data with loading and error states
- StaleTime of 30s prevents excessive refetching
- Empty state handled gracefully (returns `{ events: [] }`)
- Required by: Command Center "Recent Activity" section, Agent Detail "Recent Activity" section
---
## Replace all mock data with real queries

- type: task
- priority: 1
- labels: frontend, api, data-layer, integration
- estimate: 480

### Description


Systematic audit and replacement of all remaining hardcoded mock data across the application. This is the final integration pass that wires every page to real data sources.

**No specific wireframe** — this is a cross-cutting integration task that touches multiple pages.

**Requirements**

1. **Command Center (`frontend/app/page.tsx`)**:
   - Replace `MOCK_AGENTS` array with `useAgentHealth()` hook (from Command Center epic)
   - Replace `MOCK_ACTIVITY` array with `useActivityFeed()` hook (from this epic)
   - Replace hardcoded KPI card values with `useDashboard()` real data:
     - Agents Active: real count from agents list
     - Errors (24h): real error count from ClickHouse traces
     - Daily Cost: real cost sum from ClickHouse traces
     - Pass Rate: real aggregate pass rate from eval results

2. **Experiments list (`frontend/app/experiments/page.tsx` or equivalent)**:
   - Replace mock experiments array with Temporal workflow queries
   - Use `trpc.workflows.list` or similar to fetch experiment workflows
   - Map workflow data to experiment list items

3. **Experiments detail (`frontend/app/experiments/[id]/page.tsx` or equivalent)**:
   - Replace mock variant data with Temporal workflow query results
   - Fetch experiment configuration and results from workflow state

4. **Prompts list (`frontend/app/prompts/page.tsx` or equivalent)**:
   - Replace mock prompts array with `trpc.prompts.list` query
   - If router doesn't exist yet, create a basic prompts tRPC router

5. **Prompts detail (`frontend/app/prompts/[id]/page.tsx` or equivalent)**:
   - Replace mock prompt data with `trpc.prompts.getById` query

6. **State verification for each page** — confirm all four states work:
   - **Empty state**: no data returns → show appropriate empty message (e.g., "No agents registered yet")
   - **Loading state**: data fetching → show skeleton placeholders
   - **Error state**: API failure → show error boundary or inline error message
   - **Populated state**: real data → renders correctly with proper formatting

**Implementation Approach**

- Work page by page, starting with Command Center (highest visibility)
- For each page:
  1. Identify all mock data constants (search for `MOCK_`, `mock`, hardcoded arrays)
  2. Determine which hook/query provides the real data
  3. Replace mock with hook call
  4. Add loading skeleton if not present
  5. Add empty state if not present
  6. Add error handling if not present
  7. Test all four states

### Acceptance Criteria
- No `MOCK_` constants remain in any page component
- No hardcoded data arrays used for display (only for type definitions or tests)
- Every page handles empty, loading, error, and populated states
- Command Center shows real agent health, activity, and KPI data
- Experiments pages show real workflow data (or graceful empty state if no experiments exist)
- Prompts pages show real prompt data (or graceful empty state if no prompts exist)
- Required by: All pages (final integration pass before launch)