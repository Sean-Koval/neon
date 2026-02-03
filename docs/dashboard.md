# Dashboard

The Neon dashboard provides real-time visibility into agent execution, evaluation results, and performance trends.

## Overview

The dashboard is built with Next.js 15 and React 19, providing:

- **Trace visualization** — Hierarchical span trees with timing
- **Evaluation tracking** — Real-time progress and results
- **Score analytics** — Trends, distributions, and comparisons
- **Component analysis** — Cross-component correlation

## Pages

### Home Dashboard (`/`)

The main dashboard shows:

- **Recent Traces** — Latest agent executions with status
- **Active Runs** — In-progress evaluation runs
- **Score Summary** — Pass rates and trends
- **Quick Filters** — Time range, agent, status

```
┌─────────────────────────────────────────────────────────────┐
│  Neon Dashboard                                    [Filters]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Traces      │  │ Pass Rate   │  │ Avg Score   │         │
│  │ 1,234       │  │ 87%         │  │ 0.82        │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  Recent Traces                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ agent-run-001  │ ✓ ok  │ 1.2s  │ 5 spans │ 2m ago   │  │
│  │ agent-run-002  │ ✗ err │ 3.4s  │ 8 spans │ 5m ago   │  │
│  │ agent-run-003  │ ✓ ok  │ 0.8s  │ 3 spans │ 8m ago   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  Active Evaluation Runs                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ core-tests  │ ████████░░ 80%  │ 8/10 cases │ 2m     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Trace Viewer (`/traces/[id]`)

Detailed view of a single trace execution:

**Span Tree** — Hierarchical view of all operations

```
agent-run (1.2s)
├── planning (50ms)
├── generation: llm-call (800ms)
│   └── model: claude-3-5-sonnet
│   └── tokens: 150 → 200
├── tool: web-search (200ms)
│   └── status: success
│   └── results: 5
└── generation: response (150ms)
```

**Timeline** — Waterfall visualization

```
|--planning--|
             |--------llm-call--------|
                                      |--search--|
                                                 |--response--|
0ms         50ms                     850ms     1050ms       1200ms
```

**Span Details** — Click any span to see:

- Input/output content
- Token counts and costs
- Timing breakdown
- Custom attributes
- Associated scores

**Scores Panel** — Evaluation scores for this trace

```
┌────────────────────────────────────────┐
│ Scores                                 │
├────────────────────────────────────────┤
│ tool_selection    0.95  ████████████░ │
│ reasoning         0.82  █████████░░░░ │
│ grounding         0.78  ████████░░░░░ │
│ overall           0.85  █████████░░░░ │
└────────────────────────────────────────┘
```

### Trace Comparison (`/traces/diff`)

Compare two traces side-by-side:

```
┌─────────────────────────┬─────────────────────────┐
│ Baseline (v1.2.2)       │ Candidate (v1.2.3)      │
├─────────────────────────┼─────────────────────────┤
│ agent-run (1.5s)        │ agent-run (1.2s) ↓      │
│ ├── planning (80ms)     │ ├── planning (50ms) ↓   │
│ ├── llm-call (900ms)    │ ├── llm-call (800ms) ↓  │
│ ├── search (400ms)      │ ├── search (200ms) ↓    │
│ └── response (120ms)    │ └── response (150ms) ↑  │
├─────────────────────────┼─────────────────────────┤
│ Score: 0.78             │ Score: 0.85 ↑           │
└─────────────────────────┴─────────────────────────┘
```

Key differences are highlighted:
- 🟢 Improvements (faster, higher score)
- 🔴 Regressions (slower, lower score)
- 🟡 Changed (different structure)

### Evaluation Runs (`/runs`)

List of evaluation runs:

| Run | Suite | Status | Progress | Pass Rate | Duration |
|-----|-------|--------|----------|-----------|----------|
| run-001 | core-tests | ✓ completed | 10/10 | 90% | 45s |
| run-002 | regression | ⏳ running | 5/20 | 80% | — |
| run-003 | edge-cases | ✗ failed | 3/10 | 30% | 12s |

### Run Detail (`/eval-runs/[id]`)

Detailed view of an evaluation run:

**Progress Tracker** — Real-time updates

```
┌──────────────────────────────────────────────────────┐
│ Evaluation Run: core-tests                           │
│ Status: Running                                      │
│                                                      │
│ Progress: ████████████░░░░░░░░ 60%                  │
│ Completed: 6/10 cases                               │
│ Passed: 5  Failed: 1                                │
│                                                      │
│ Elapsed: 2m 30s                                      │
└──────────────────────────────────────────────────────┘
```

**Results Table** — Per-case breakdown

| Case | Status | Score | tool_selection | llm_judge | Duration |
|------|--------|-------|----------------|-----------|----------|
| weather-query | ✓ pass | 0.92 | 1.0 | 0.84 | 1.2s |
| math-query | ✓ pass | 0.88 | 1.0 | 0.76 | 0.8s |
| complex-query | ✗ fail | 0.45 | 0.3 | 0.60 | 2.1s |

**Score Distribution** — Histogram of scores

```
     │
   8 │       ████
   6 │    ████████
   4 │ ████████████
   2 │ ████████████████
     └─────────────────────
       0.0  0.5  0.8  1.0
```

### Analytics (`/analytics`)

Score trends and analysis over time.

**Score Trends** — Time series charts

```
Score over Time
1.0 │                    ╭───╮
0.8 │     ╭──────────────╯   ╰───
0.6 │ ────╯
0.4 │
    └──────────────────────────────
      Jan    Feb    Mar    Apr
```

**Component Health** — Health status by component

| Component | Score | Pass Rate | Trend | Health |
|-----------|-------|-----------|-------|--------|
| weather-tool | 0.95 | 98% | ↑ | 🟢 healthy |
| search-tool | 0.72 | 85% | → | 🟡 warning |
| calculator | 0.45 | 60% | ↓ | 🔴 critical |

**Correlation Matrix** — Cross-component correlation

```
              weather  search  calc
  weather      1.00    0.65   0.23
  search       0.65    1.00   0.45
  calc         0.23    0.45   1.00
```

### Human Feedback (`/feedback`)

Collect human preferences for RLHF training.

**Preference Collection**

```
┌─────────────────────────────────────────────────────────┐
│ Which response is better?                               │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────┐  ┌─────────────────────┐      │
│  │ Response A          │  │ Response B          │      │
│  │                     │  │                     │      │
│  │ The weather in      │  │ Tokyo weather:      │      │
│  │ Tokyo is currently  │  │ 72°F, sunny.       │      │
│  │ 72°F with sunny     │  │                     │      │
│  │ skies...            │  │                     │      │
│  │                     │  │                     │      │
│  │      [Select A]     │  │      [Select B]     │      │
│  └─────────────────────┘  └─────────────────────┘      │
│                                                         │
│  [ ] Both are good    [ ] Both are bad    [Skip]       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Components

### DashboardFiltersBar

Filter traces by multiple criteria:

```typescript
<DashboardFiltersBar
  filters={{
    dateRange: { start: Date, end: Date },
    agentId: string,
    status: 'ok' | 'error' | 'all',
    minScore: number,
    tags: string[],
  }}
  onChange={(filters) => { /* update */ }}
/>
```

### TraceTimeline

Hierarchical span visualization:

```typescript
<TraceTimeline
  trace={traceWithSpans}
  selectedSpanId={spanId}
  onSpanSelect={(span) => { /* show details */ }}
  highlightErrors={true}
  showTiming={true}
/>
```

### SpanDetail

Detailed view of a single span:

```typescript
<SpanDetail
  span={span}
  scores={spanScores}
  showInput={true}
  showOutput={true}
  showAttributes={true}
/>
```

### EvalRunProgress

Real-time progress tracking:

```typescript
<EvalRunProgress
  runId={runId}
  onComplete={(result) => { /* handle */ }}
  pollIntervalMs={1000}
/>
```

### ScoreTrends

Time series score charts:

```typescript
<ScoreTrends
  data={trendData}
  scorers={['tool_selection', 'llm_judge']}
  dateRange={{ start, end }}
  groupBy="day"
/>
```

### CorrelationHeatmap

Cross-component correlation:

```typescript
<CorrelationHeatmap
  correlations={correlationMatrix}
  components={componentList}
  onCellClick={(pair) => { /* drill down */ }}
/>
```

### TraceSelector

Multi-trace selection for comparison:

```typescript
<TraceSelector
  traces={traceList}
  selected={selectedIds}
  onSelect={(ids) => { /* update */ }}
  maxSelection={2}
/>
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `j` / `k` | Navigate traces up/down |
| `Enter` | Open selected trace |
| `Esc` | Close modal / deselect |
| `f` | Focus filter input |
| `r` | Refresh data |
| `?` | Show shortcuts help |

## Theming

The dashboard supports light and dark themes:

**Dark Theme (Default)**
- Deep charcoal backgrounds (#0a0c10)
- Vibrant neon accents (cyan, magenta, lime)
- Glow effects on interactive elements

**Light Theme**
- Soft blue-white gradients
- Professional accent colors
- Clean, high-contrast text

Toggle via the theme button in the header.

## API Integration

The dashboard uses tRPC for type-safe API calls:

```typescript
// frontend/lib/trpc.ts
import { createTRPCProxyClient } from '@trpc/client'

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/api/trpc',
    }),
  ],
})

// Usage in components
const traces = trpc.traces.list.useQuery({ limit: 50 })
const trace = trpc.traces.get.useQuery({ traceId })
```

## Real-Time Updates

The dashboard uses polling for live updates:

```typescript
// Poll for run progress
const { data: status } = useQuery({
  queryKey: ['runStatus', runId],
  queryFn: () => getRunStatus(runId),
  refetchInterval: 1000, // Poll every second
  enabled: status !== 'completed',
})
```

For high-frequency updates, WebSocket support is planned.

## Performance

### Query Optimization

- ClickHouse queries are optimized for time-range filters
- Trace list uses cursor-based pagination
- Span trees are loaded on demand (not all at once)

### Caching

- React Query provides client-side caching
- Stale data shown while refetching
- Cache invalidation on mutations

### Lazy Loading

- Large trace outputs loaded on demand
- Score details fetched when expanded
- Images and charts use intersection observer
