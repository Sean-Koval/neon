# Neon Frontend Design Specification

**Version:** 1.0
**Phase:** 5 - Frontend Dashboard
**Author:** Staff ML Engineer / Frontend Designer
**Date:** 2026-01-22

---

## 1. Design Philosophy

### 1.1 Core Principles

**Information-Dense, Not Pretty**
ML engineers want to see data, not marketing. Maximize information density while maintaining clarity. Every pixel should earn its place.

**Regression Detection is the Hero**
The primary value proposition is catching regressions before they ship. The comparison view should be the most polished, most obvious feature.

**Progressive Disclosure**
Summary → Detail → Raw Data. Users should get answers at a glance, with the ability to drill down infinitely.

**Status at a Glance**
Color coding, iconography, and spatial positioning should communicate state before the user reads text. A quick scan should answer "is everything okay?"

**Developer-First Aesthetics**
Monospace fonts for IDs/code, high contrast, minimal decoration, clear hierarchy. This is a tool, not a consumer app.

### 1.2 Design Anti-Patterns to Avoid

- Large empty spaces with sparse information
- Animations that delay access to data
- Modal overload (prefer inline expansion)
- Hidden actions requiring hover discovery
- Pagination when virtualization works better
- Dark patterns or unnecessary confirmation dialogs

---

## 2. Information Architecture

### 2.1 Primary Navigation

```
┌─────────────────────────────────────────────────┐
│  🔷 Neon                                        │
├─────────────────────────────────────────────────┤
│  📊 Dashboard        ← Overview, health check   │
│  📦 Suites           ← Test suite management    │
│  ▶️  Runs             ← Execution history        │
│  🔀 Compare          ← Regression detection     │
│  ⚙️  Settings         ← API keys, preferences   │
└─────────────────────────────────────────────────┘
```

### 2.2 User Journeys

| Journey | Entry Point | Goal | Key Views |
|---------|-------------|------|-----------|
| Health Check | Dashboard | "Are my agents okay?" | Stats, recent runs, trend |
| Investigate Failure | Runs → Run Detail | "What went wrong?" | Results table, score details, MLflow link |
| Regression Check | Compare | "Did my change break anything?" | Side-by-side diff, regression list |
| Suite Management | Suites → Suite Detail | "What tests exist?" | Case list, edit forms |
| New Evaluation | Suites → Create | "Run tests on my agent" | Suite form, trigger run |

### 2.3 URL Structure

```
/                           → Dashboard
/suites                     → Suite list
/suites/[id]                → Suite detail (with cases)
/suites/[id]/edit           → Edit suite
/suites/new                 → Create suite
/runs                       → Run list (filterable)
/runs/[id]                  → Run detail with results
/compare                    → Comparison selector
/compare/[baseline]/[candidate] → Comparison results
/settings                   → API key management
```

---

## 3. Visual Design System

### 3.1 Color Palette

**Status Colors (Semantic)**
```
Green  (#22c55e) → Passed, Success, Improvement
Yellow (#eab308) → Warning, Running, Borderline (0.6-0.8)
Red    (#ef4444) → Failed, Error, Regression
Gray   (#6b7280) → Pending, Unknown, Cancelled
Blue   (#3b82f6) → Active, In Progress, Links
```

**Score Color Function**
```typescript
function getScoreColor(score: number): string {
  if (score >= 0.8) return 'green'   // Good
  if (score >= 0.6) return 'yellow'  // Borderline
  return 'red'                        // Poor
}
```

**Delta Colors (for comparisons)**
```
Positive delta (improvement): Green with ↑ arrow
Negative delta (regression):  Red with ↓ arrow
No change:                    Gray, no arrow
```

### 3.2 Typography

```css
/* Base */
font-family: 'Inter', system-ui, sans-serif;
font-size: 14px;
line-height: 1.5;

/* Headings */
h1: 24px, font-weight: 700
h2: 18px, font-weight: 600
h3: 16px, font-weight: 600

/* Monospace (IDs, code, scores) */
font-family: 'JetBrains Mono', 'Fira Code', monospace;

/* Scores display */
font-variant-numeric: tabular-nums;  /* Aligned numbers */
```

### 3.3 Spacing Scale

```
4px  (space-1)  - Tight gaps
8px  (space-2)  - Element padding
12px (space-3)  - Related groups
16px (space-4)  - Section gaps
24px (space-6)  - Major sections
32px (space-8)  - Page sections
```

### 3.4 Component Patterns

**Cards**
- Background: white
- Border: 1px solid #e5e7eb
- Border-radius: 8px
- Shadow: sm (0 1px 2px rgba(0,0,0,0.05))

**Tables**
- Striped rows (subtle)
- Hover highlight
- Sticky headers for scroll
- Sortable columns (click header)

**Badges**
- Pill shape (rounded-full)
- Small text (12px)
- Status-colored background
- High contrast text

---

## 4. Page Specifications

### 4.1 Dashboard (`/`)

**Purpose:** At-a-glance health check for agent evaluation status.

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ Dashboard                                               │
│ Overview of your agent evaluations                      │
├─────────────┬─────────────┬─────────────┬──────────────┤
│ Total Runs  │ Passed      │ Failed      │ Avg Score    │
│ 156         │ 142 (91%)   │ 14 (9%)     │ 0.84         │
│ +12 week    │ ✓           │ ↓2 week     │ +0.02 week   │
├─────────────┴─────────────┴─────────────┴──────────────┤
│ Score Trend (7 days)                    [Line Chart]   │
├────────────────────────────────────────────────────────┤
│ Recent Runs                              [View All →]  │
│ ┌────────────────────────────────────────────────────┐ │
│ │ core-tests    │ abc123 │ ✓ completed │ 8/10 │ 0.82 │ │
│ │ regression    │ def456 │ ✓ completed │ 15/15│ 0.95 │ │
│ │ core-tests    │ ghi789 │ ● running   │ 5/10 │ 0.78 │ │
│ └────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

**Data Requirements:**
- GET `/api/v1/runs?limit=10` for recent runs
- Compute stats client-side or add stats endpoint
- Trend data: runs from last 7 days, aggregated by day

**Interactions:**
- Click run row → Navigate to `/runs/[id]`
- Click suite name → Navigate to `/suites/[id]`
- "View All" → Navigate to `/runs`

---

### 4.2 Suites List (`/suites`)

**Purpose:** Browse and manage evaluation suites.

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ Suites                              [+ New Suite]       │
│ Manage your evaluation test suites                      │
├─────────────────────────────────────────────────────────┤
│ Search: [________________________] Filter: [All ▼]      │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 📦 core-agent-tests                                 │ │
│ │    Tests core functionality of the support agent    │ │
│ │    Agent: support_agent:run  │  12 cases  │  3 runs │ │
│ │    Scorers: tool_selection, reasoning               │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ 📦 regression-suite                                 │ │
│ │    Regression tests for critical paths              │ │
│ │    Agent: support_agent:run  │  8 cases   │  15 runs│ │
│ │    Scorers: tool_selection, reasoning, grounding    │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Data Requirements:**
- GET `/api/v1/suites` with pagination

**Interactions:**
- Click suite card → Navigate to `/suites/[id]`
- "New Suite" button → Navigate to `/suites/new`

---

### 4.3 Suite Detail (`/suites/[id]`)

**Purpose:** View suite configuration and cases, trigger runs.

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ ← Suites / core-agent-tests            [Run] [Edit] [⋮]│
├─────────────────────────────────────────────────────────┤
│ Tests core functionality of the support agent           │
│                                                         │
│ Agent: support_agent:run                                │
│ Default Scorers: tool_selection, reasoning              │
│ Min Score: 0.70  │  Timeout: 300s  │  Parallel: Yes     │
├─────────────────────────────────────────────────────────┤
│ Cases (12)                              [+ Add Case]    │
├─────────────────────────────────────────────────────────┤
│ │ Name              │ Scorers         │ Min  │ Tags    │ │
│ ├───────────────────┼─────────────────┼──────┼─────────┤ │
│ │ basic-greeting    │ tool, reasoning │ 0.70 │ core    │ │
│ │ tool-lookup       │ tool            │ 0.80 │ tools   │ │
│ │ multi-turn-convo  │ reasoning       │ 0.70 │ convo   │ │
│ │ [expandable rows for case details...]                │ │
├─────────────────────────────────────────────────────────┤
│ Recent Runs                                             │
│ │ Run ID   │ Version │ Status    │ Score │ When       │ │
│ │ run-abc  │ v1.2.3  │ completed │ 0.85  │ 2h ago     │ │
│ │ run-def  │ v1.2.2  │ completed │ 0.82  │ 1d ago     │ │
└─────────────────────────────────────────────────────────┘
```

**Data Requirements:**
- GET `/api/v1/suites/[id]` (includes cases)
- GET `/api/v1/runs?suite_id=[id]&limit=5` for recent runs

**Interactions:**
- "Run" button → POST `/api/v1/suites/[id]/run`, then navigate to run
- Click case row → Expand inline to show case details
- "Edit" → Navigate to `/suites/[id]/edit`
- "Add Case" → Modal or inline form

---

### 4.4 Run Detail (`/runs/[id]`)

**Purpose:** Deep dive into a single evaluation run.

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ ← Runs / run-abc123                    [Compare] [⋮]    │
├──────────────────────┬──────────────────────────────────┤
│ Suite: core-tests    │ Status: ✓ completed              │
│ Version: abc123      │ Trigger: manual                  │
│ Started: 2h ago      │ Duration: 45s                    │
├──────────────────────┴──────────────────────────────────┤
│ Summary                                                 │
│ ┌─────────┬─────────┬─────────┬─────────┬─────────────┐ │
│ │ Total   │ Passed  │ Failed  │ Errored │ Avg Score   │ │
│ │ 10      │ 8       │ 2       │ 0       │ 0.82        │ │
│ └─────────┴─────────┴─────────┴─────────┴─────────────┘ │
│                                                         │
│ Scores by Type                                          │
│ tool_selection:  ████████████░░ 0.85                    │
│ reasoning:       ██████████░░░░ 0.79                    │
│ grounding:       ████████████░░ 0.83                    │
├─────────────────────────────────────────────────────────┤
│ Results (10)                    [Filter: All ▼] [Sort]  │
├─────────────────────────────────────────────────────────┤
│ │ Case            │ Status │ Score │ Details          │ │
│ ├─────────────────┼────────┼───────┼──────────────────┤ │
│ │ basic-greeting  │ ✓ pass │ 0.92  │ [▼ Expand]       │ │
│ │ tool-lookup     │ ✗ fail │ 0.58  │ [▼ Expand]       │ │
│ │ multi-turn      │ ✓ pass │ 0.85  │ [▼ Expand]       │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─ Expanded: tool-lookup ────────────────────────────┐  │
│ │ Score Breakdown:                                   │  │
│ │   tool_selection: 0.45 ⚠️                          │  │
│ │     Reason: "Selected search tool but should..."   │  │
│ │   reasoning: 0.70 ✓                                │  │
│ │     Reason: "Coherent reasoning chain..."          │  │
│ │                                                    │  │
│ │ [View in MLflow] [View Trace]                      │  │
│ └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Data Requirements:**
- GET `/api/v1/runs/[id]` for run metadata and summary
- GET `/api/v1/runs/[id]/results` for detailed results

**Interactions:**
- Expand row → Show score breakdown, reasons, evidence
- "View in MLflow" → External link to MLflow trace
- "Compare" → Navigate to compare with run selector
- Filter dropdown → Filter by status (pass/fail/error)

---

### 4.5 Compare View (`/compare`)

**Purpose:** THE CORE FEATURE. Compare two runs, highlight regressions.

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ Compare Runs                                            │
│ Detect regressions between evaluation runs              │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────┐  ┌─────────────────────┐        │
│ │ Baseline            │  │ Candidate           │        │
│ │ [Select run... ▼]   │  │ [Select run... ▼]   │        │
│ │ core-tests @ abc123 │  │ core-tests @ def456 │        │
│ │ Score: 0.85         │  │ Score: 0.79         │        │
│ └─────────────────────┘  └─────────────────────┘        │
│                                                         │
│ Threshold: [0.05 ▼]              [Compare]              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ╔═══════════════════════════════════════════════════╗   │
│ ║  ⚠️  REGRESSION DETECTED                          ║   │
│ ║  Overall: 0.85 → 0.79 (Δ -0.06)                   ║   │
│ ╚═══════════════════════════════════════════════════╝   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ 🔴 Regressions (2)                                      │
│ ┌───────────────────────────────────────────────────┐   │
│ │ tool-lookup                                       │   │
│ │   tool_selection: 0.85 → 0.45  ↓ -0.40           │   │
│ │   Exceeds threshold by 0.35                       │   │
│ ├───────────────────────────────────────────────────┤   │
│ │ context-retrieval                                 │   │
│ │   grounding: 0.80 → 0.65  ↓ -0.15                │   │
│ │   Exceeds threshold by 0.10                       │   │
│ └───────────────────────────────────────────────────┘   │
│                                                         │
│ 🟢 Improvements (1)                                     │
│ ┌───────────────────────────────────────────────────┐   │
│ │ basic-greeting                                    │   │
│ │   reasoning: 0.75 → 0.90  ↑ +0.15                │   │
│ └───────────────────────────────────────────────────┘   │
│                                                         │
│ ⚪ Unchanged: 7 cases within threshold                  │
└─────────────────────────────────────────────────────────┘
```

**Data Requirements:**
- GET `/api/v1/runs?limit=20` for run selector dropdown
- POST `/api/v1/compare` with baseline/candidate IDs and threshold

**Interactions:**
- Run selectors → Dropdown with recent runs, grouped by suite
- Threshold selector → 0.01, 0.05, 0.10, 0.15, 0.20
- "Compare" button → Triggers comparison
- Regression row click → Expand to show full score details

**Visual Emphasis:**
- Regression header should be LOUD (red background, large text)
- Delta indicators with arrows (↑↓)
- Clear pass/fail state at the top
- Regressions listed FIRST, improvements second

---

### 4.6 Settings (`/settings`)

**Purpose:** API key management and preferences.

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ Settings                                                │
├─────────────────────────────────────────────────────────┤
│ API Keys                                                │
│ ┌───────────────────────────────────────────────────┐   │
│ │ Name        │ Key (last 8)  │ Created    │ Action │   │
│ │ production  │ ...abc12345   │ 2 days ago │ [🗑️]   │   │
│ │ development │ ...xyz98765   │ 1 week ago │ [🗑️]   │   │
│ └───────────────────────────────────────────────────┘   │
│                                      [+ Create Key]     │
│                                                         │
│ ─────────────────────────────────────────────────────── │
│ Preferences                                             │
│ Default threshold: [0.05 ▼]                             │
│ Results per page:  [25 ▼]                               │
└─────────────────────────────────────────────────────────┘
```

---

## 5. Component Library

### 5.1 Core Components

| Component | Purpose | Variants |
|-----------|---------|----------|
| `Badge` | Status indicators | green, yellow, red, gray, blue |
| `Button` | Actions | primary, secondary, danger, ghost |
| `Card` | Content containers | default, bordered, elevated |
| `Table` | Data display | sortable, expandable, selectable |
| `Select` | Dropdowns | single, multi, searchable |
| `Input` | Form inputs | text, number, search |
| `Dialog` | Modals | default, confirmation, form |
| `Skeleton` | Loading states | text, card, table-row |
| `EmptyState` | No data | with icon, action |

### 5.2 Domain Components

| Component | Purpose |
|-----------|---------|
| `ScoreBadge` | Color-coded score display (0.85) |
| `StatusBadge` | Run/result status (completed, failed) |
| `DeltaIndicator` | Score change with arrow (+0.05 ↑) |
| `RunSelector` | Dropdown to pick a run |
| `ScoreBar` | Horizontal bar visualization |
| `CaseResultRow` | Expandable table row for results |
| `RegressionCard` | Highlighted regression item |
| `SuiteCard` | Suite list item card |

### 5.3 ScoreBadge Specification

```typescript
interface ScoreBadgeProps {
  score: number        // 0.0 - 1.0
  size?: 'sm' | 'md' | 'lg'
  showBar?: boolean    // Show horizontal fill bar
}

// Renders as: "0.85" with background color based on threshold
// Green: >= 0.8, Yellow: >= 0.6, Red: < 0.6
```

### 5.4 DeltaIndicator Specification

```typescript
interface DeltaIndicatorProps {
  baseline: number
  candidate: number
  threshold?: number   // Default 0.05
  showValues?: boolean // Show "0.85 → 0.79"
}

// Renders as: "↓ -0.06" in red if negative beyond threshold
// Or: "↑ +0.15" in green if positive
// Or: "—" in gray if within threshold
```

---

## 6. State Management

### 6.1 Server State (React Query)

```typescript
// Query keys convention
const queryKeys = {
  suites: ['suites'] as const,
  suite: (id: string) => ['suites', id] as const,
  runs: (filters?: RunFilters) => ['runs', filters] as const,
  run: (id: string) => ['runs', id] as const,
  runResults: (id: string) => ['runs', id, 'results'] as const,
  compare: (baseline: string, candidate: string) =>
    ['compare', baseline, candidate] as const,
}

// Stale times
const staleTime = {
  suites: 5 * 60 * 1000,      // 5 minutes
  runs: 30 * 1000,             // 30 seconds (may be running)
  runResults: 60 * 1000,       // 1 minute
  compare: Infinity,           // Never stale (immutable)
}
```

### 6.2 Client State (Local)

- UI preferences (theme, table density)
- Form draft state (create suite/case)
- Expanded rows in tables
- Selected items for comparison

### 6.3 Real-time Updates

For runs with status `pending` or `running`:
- Poll every 3 seconds
- Stop polling when status becomes terminal
- Use React Query's `refetchInterval` with condition

```typescript
useQuery({
  queryKey: queryKeys.run(id),
  queryFn: () => fetchRun(id),
  refetchInterval: (data) =>
    data?.status === 'running' ? 3000 : false
})
```

---

## 7. API Client Architecture

### 7.1 Type Definitions

```typescript
// frontend/lib/types.ts

export type ScorerType = 'tool_selection' | 'reasoning' | 'grounding'
export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
export type ResultStatus = 'success' | 'failed' | 'error' | 'timeout'
export type TriggerType = 'manual' | 'ci' | 'scheduled'

export interface EvalSuite {
  id: string
  project_id: string
  name: string
  description: string | null
  agent_id: string
  default_scorers: ScorerType[]
  default_min_score: number
  default_timeout_seconds: number
  parallel: boolean
  stop_on_failure: boolean
  cases: EvalCase[]
  created_at: string
  updated_at: string
}

export interface EvalCase {
  id: string
  suite_id: string
  name: string
  description: string | null
  input: Record<string, unknown>
  expected_tools: string[] | null
  expected_tool_sequence: string[] | null
  expected_output_contains: string[] | null
  expected_output_pattern: string | null
  scorers: ScorerType[]
  scorer_config: Record<string, unknown> | null
  min_score: number
  tags: string[]
  timeout_seconds: number
  created_at: string
  updated_at: string
}

export interface EvalRunSummary {
  total_cases: number
  passed: number
  failed: number
  errored: number
  avg_score: number
  scores_by_type: Record<ScorerType, number>
  execution_time_ms: number
}

export interface EvalRun {
  id: string
  suite_id: string
  suite_name: string
  project_id: string
  agent_version: string | null
  trigger: TriggerType
  trigger_ref: string | null
  status: RunStatus
  config: Record<string, unknown> | null
  summary: EvalRunSummary | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface ScoreDetail {
  score: number
  reason: string
  evidence: string[]
}

export interface EvalResult {
  id: string
  run_id: string
  case_id: string
  case_name: string
  mlflow_run_id: string | null
  mlflow_trace_id: string | null
  status: ResultStatus
  output: Record<string, unknown> | null
  scores: Record<ScorerType, number>
  score_details: Record<ScorerType, ScoreDetail>
  passed: boolean
  execution_time_ms: number | null
  error: string | null
  created_at: string
}

export interface RegressionDetail {
  case_name: string
  scorer: ScorerType
  baseline_score: number
  candidate_score: number
  delta: number
}

export interface CompareResponse {
  baseline: EvalRun
  candidate: EvalRun
  passed: boolean
  overall_delta: number
  regressions: RegressionDetail[]
  improvements: RegressionDetail[]
  unchanged: number
}
```

### 7.2 API Client

```typescript
// frontend/lib/api.ts

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

class ApiClient {
  private apiKey: string | null = null

  setApiKey(key: string) {
    this.apiKey = key
  }

  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey
    }

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { ...headers, ...options?.headers },
    })

    if (!res.ok) {
      throw new ApiError(res.status, await res.text())
    }
    return res.json()
  }

  // Suites
  getSuites = () => this.fetch<EvalSuite[]>('/suites')
  getSuite = (id: string) => this.fetch<EvalSuite>(`/suites/${id}`)
  createSuite = (data: CreateSuiteRequest) =>
    this.fetch<EvalSuite>('/suites', { method: 'POST', body: JSON.stringify(data) })

  // Runs
  getRuns = (params?: RunFilters) => this.fetch<EvalRun[]>(`/runs?${qs(params)}`)
  getRun = (id: string) => this.fetch<EvalRun>(`/runs/${id}`)
  getRunResults = (id: string) => this.fetch<EvalResult[]>(`/runs/${id}/results`)
  triggerRun = (suiteId: string, data?: TriggerRunRequest) =>
    this.fetch<EvalRun>(`/suites/${suiteId}/run`, { method: 'POST', body: JSON.stringify(data) })

  // Compare
  compare = (baseline: string, candidate: string, threshold?: number) =>
    this.fetch<CompareResponse>('/compare', {
      method: 'POST',
      body: JSON.stringify({ baseline_run_id: baseline, candidate_run_id: candidate, threshold })
    })
}

export const api = new ApiClient()
```

---

## 8. Responsive Behavior

### 8.1 Breakpoints

```
sm:  640px   - Mobile landscape
md:  768px   - Tablet
lg:  1024px  - Desktop
xl:  1280px  - Wide desktop
2xl: 1536px  - Ultra-wide
```

### 8.2 Layout Adaptations

**Mobile (< 768px):**
- Sidebar collapses to hamburger menu
- Stat cards stack vertically
- Tables become card lists
- Compare view stacks baseline/candidate vertically

**Tablet (768px - 1024px):**
- Sidebar visible but narrow
- 2-column stat grid
- Tables remain but with fewer columns

**Desktop (> 1024px):**
- Full sidebar with labels
- 4-column stat grid
- Full table columns

---

## 9. Loading & Error States

### 9.1 Loading Patterns

**Initial Page Load:**
- Show skeleton matching content shape
- Skeleton duration should be short (< 500ms feels instant)

**Table Loading:**
- Show skeleton rows (match expected count or 5)
- Keep headers visible

**Action Loading:**
- Button shows spinner, disabled state
- Toast for long-running actions

### 9.2 Error Patterns

**API Error:**
- Inline error with retry button
- Toast for non-critical errors

**Empty State:**
- Illustration or icon
- Helpful message
- CTA to create first item

**404:**
- Clear message
- Link back to list view

---

## 10. Accessibility

### 10.1 Requirements

- All interactive elements keyboard accessible
- Focus indicators visible
- Color not sole indicator (use icons/text)
- ARIA labels for icon-only buttons
- Announce loading/error states to screen readers
- Minimum touch target 44x44px on mobile

### 10.2 Implementation Notes

- Use semantic HTML (nav, main, article, section)
- Tables use proper th/td structure
- Forms have associated labels
- Modals trap focus
- Escape key closes dialogs

---

## 11. Performance Budget

| Metric | Target |
|--------|--------|
| First Contentful Paint | < 1.5s |
| Largest Contentful Paint | < 2.5s |
| Time to Interactive | < 3.5s |
| Bundle size (gzipped) | < 150kb |
| API response (p95) | < 500ms |

### 11.1 Optimization Strategies

- Route-based code splitting (Next.js automatic)
- React Query caching (avoid refetch)
- Virtual scrolling for large tables (> 100 rows)
- Debounce search inputs
- Optimistic updates for mutations

---

## 12. Implementation Priority

### Phase 5a: Foundation (Tasks FE-001 to FE-005)
Wire up API, types, React Query hooks. Get data flowing.

### Phase 5b: Core Views (Tasks FE-010 to FE-035)
Dashboard, runs list, run detail. The read-only experience.

### Phase 5c: Comparison (Tasks FE-040 to FE-044)
The hero feature. Regression detection UI.

### Phase 5d: Management (Tasks FE-020 to FE-025)
Suite/case CRUD. Forms and mutations.

### Phase 5e: Polish (Tasks FE-050 to FE-054)
Loading states, errors, empty states, responsive, a11y.

---

*This specification should be treated as a living document. Update as implementation reveals new requirements or constraints.*
