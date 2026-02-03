# Architecture

Neon is an agent operations platform built for observability, durable execution, and systematic evaluation of AI agents. This document explains how the system works under the hood.

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     YOUR AGENTS                                  │
│         (Any runtime: Cloud Run, Lambda, K8s, local)            │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │      SDK / OpenTelemetry     │
              │   @neon/sdk  |  neon-sdk    │
              └──────────────┬──────────────┘
                             │
┌────────────────────────────┼────────────────────────────────────┐
│                      NEON PLATFORM                               │
│  ┌─────────────────────────┴─────────────────────────┐          │
│  │              Next.js Frontend & API                │          │
│  │         Dashboard, tRPC routes, REST API          │          │
│  └────────────┬─────────────────────┬────────────────┘          │
│               │                     │                            │
│     ┌─────────▼─────────┐  ┌───────▼────────┐                   │
│     │    ClickHouse     │  │    Temporal    │                   │
│     │  (Trace Storage)  │  │  (Workflows)   │                   │
│     │                   │  │                │                   │
│     │ • traces          │  │ • evalRun      │                   │
│     │ • spans           │  │ • agentRun     │                   │
│     │ • scores          │  │ • abTest       │                   │
│     └───────────────────┘  └───────┬────────┘                   │
│                                    │                             │
│                          ┌─────────▼─────────┐                   │
│                          │  Temporal Workers │                   │
│                          │                   │                   │
│                          │ • emitSpan()      │                   │
│                          │ • scoreTrace()    │                   │
│                          │ • llmCall()       │                   │
│                          └───────────────────┘                   │
│                                                                  │
│     ┌───────────────────┐                                        │
│     │    PostgreSQL     │  (Metadata: projects, configs, users)  │
│     └───────────────────┘                                        │
└──────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Trace Ingestion

Traces flow into Neon via two paths:

**SDK Tracing (Recommended)**
```typescript
import { trace, generation, tool } from '@neon/sdk'

const result = await trace('agent-run', async () => {
  const response = await generation('llm-call', { model: 'claude-3-5-sonnet' }, async () => {
    return await llm.chat(prompt)
  })

  await tool('search', async () => {
    return await searchAPI.query(response.query)
  })

  return response
})
```

**OpenTelemetry (Any Language)**
```python
from opentelemetry import trace
tracer = trace.get_tracer("my-agent")

@tracer.start_as_current_span("agent-run")
async def run_agent(query: str):
    # Your agent code
    return await llm.generate(query)
```

Both paths produce spans that are sent to the `/api/traces/ingest` endpoint and stored in ClickHouse.

### 2. ClickHouse Storage

ClickHouse is optimized for analytical queries over time-series data. Neon uses three main tables:

**Trace Table**
```sql
CREATE TABLE trace (
  trace_id String,
  project_id UUID,
  name String,
  status Enum('ok', 'error'),
  start_time DateTime64(3),
  end_time DateTime64(3),
  duration_ms UInt64,
  total_input_tokens UInt32,
  total_output_tokens UInt32,
  tool_call_count UInt16,
  llm_call_count UInt16,
  attributes Map(String, String)
) ENGINE = MergeTree()
ORDER BY (project_id, start_time, trace_id)
```

**Span Table**
```sql
CREATE TABLE span (
  span_id String,
  trace_id String,
  parent_span_id Nullable(String),
  name String,
  span_type Enum('span', 'generation', 'tool', 'retrieval'),
  component_type Nullable(String),
  start_time DateTime64(3),
  end_time DateTime64(3),
  duration_ms UInt64,
  model Nullable(String),
  input String,
  output String,
  input_tokens UInt32,
  output_tokens UInt32,
  attributes Map(String, String)
) ENGINE = MergeTree()
ORDER BY (trace_id, start_time, span_id)
```

**Score Table**
```sql
CREATE TABLE score (
  score_id UUID,
  trace_id String,
  span_id Nullable(String),
  name String,
  value Float64,
  score_type Enum('numeric', 'categorical', 'boolean'),
  source Enum('api', 'sdk', 'annotation', 'eval', 'temporal'),
  scorer_name Nullable(String),
  reason Nullable(String),
  evidence Array(String),
  created_at DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (trace_id, created_at, score_id)
```

### 3. Temporal Workflows

Temporal provides durable execution for long-running evaluations. Workflows survive crashes, timeouts, and can pause for human approval.

**Eval Run Workflow**
```typescript
export async function evalRunWorkflow(input: EvalRunInput): Promise<EvalRunResult> {
  const { projectId, dataset, scorers, config } = input
  const results: EvalCaseResult[] = []

  // Process each test case
  for (const item of dataset.items) {
    const caseResult = await workflow.executeChild(evalCaseWorkflow, {
      args: [{ projectId, item, scorers }],
      workflowId: `eval-case-${item.id}`,
    })
    results.push(caseResult)

    // Update progress (queryable)
    progress = { completed: results.length, total: dataset.items.length }
  }

  return aggregateResults(results)
}
```

**Key Workflow Features:**
- **Progress Queries**: Poll `progressQuery` to get real-time status
- **Signals**: Send `cancelRunSignal` or `pauseSignal` to control execution
- **Child Workflows**: Each test case runs in isolation
- **Retries**: Automatic retry on transient failures

### 4. Temporal Activities

Activities are the building blocks that do actual work:

```typescript
// Emit span to ClickHouse
export async function emitSpan(span: SpanInput): Promise<void> {
  await fetch(`${API_URL}/api/traces/ingest`, {
    method: 'POST',
    body: JSON.stringify(span),
  })
}

// Score a trace using configured scorers
export async function scoreTrace(input: ScoreInput): Promise<ScoreResult[]> {
  const { trace, scorers } = input
  const results: ScoreResult[] = []

  for (const scorer of scorers) {
    const result = await scorer.evaluate({ trace })
    results.push(result)
  }

  return results
}

// Call LLM for generation or judging
export async function llmCall(input: LLMInput): Promise<LLMOutput> {
  const response = await anthropic.messages.create({
    model: input.model,
    messages: input.messages,
  })
  return { content: response.content, usage: response.usage }
}
```

## Data Flow

### Trace Collection

```
1. Agent executes with SDK tracing
   │
   ├─ trace("agent-run") creates root span
   │   ├─ generation("llm-call") creates child span
   │   ├─ tool("search") creates child span
   │   └─ retrieval("rag") creates child span
   │
2. On trace completion, SDK batches spans
   │
3. POST /api/traces/ingest
   │
4. API validates and writes to ClickHouse
   │
5. Spans available for querying immediately
```

### Evaluation Execution

```
1. SDK calls neon.eval.runSuite(suite)
   │
2. POST /api/runs starts Temporal workflow
   │
   ├─ evalRunWorkflow created
   │   │
   │   ├─ For each test case:
   │   │   ├─ evalCaseWorkflow (child)
   │   │   │   ├─ Execute agent
   │   │   │   ├─ emitSpan() activity
   │   │   │   ├─ scoreTrace() activity
   │   │   │   └─ Return EvalCaseResult
   │   │   │
   │   │   └─ Aggregate results
   │   │
   │   └─ Return EvalRunResult
   │
3. Frontend polls /api/runs/[id]/status
   │
4. Workflow queries return progress
   │
5. On completion, results in ClickHouse + Temporal
```

### Score Computation

```
1. Trace stored in ClickHouse
   │
2. Scorer requested (via eval or manual)
   │
   ├─ Rule-based scorer (fast, local)
   │   ├─ contains() - string matching
   │   ├─ regex() - pattern matching
   │   └─ toolSelection() - tool comparison
   │
   └─ LLM Judge scorer (slower, accurate)
       ├─ llmJudge() - custom criteria
       ├─ reasoning() - reasoning quality
       └─ grounding() - factual accuracy
   │
3. Score written to ClickHouse
   │
4. Score visible in dashboard + API
```

## Component Types

Neon tracks different types of agent operations:

| Component Type | Description | Example |
|----------------|-------------|---------|
| `generation` | LLM calls | Claude completion |
| `tool` | External tool calls | API request, search |
| `retrieval` | RAG/vector search | Document lookup |
| `reasoning` | Chain-of-thought | Internal reasoning |
| `planning` | Action planning | Task decomposition |
| `routing` | Decision routing | Model selection |
| `memory` | Memory operations | Context retrieval |
| `prompt` | Prompt construction | Template rendering |

This taxonomy enables:
- Filtering spans by type in the dashboard
- Type-specific scorers (e.g., tool selection)
- Component-level analytics

## Span Attributes

### Standard Attributes

Every span includes:

```typescript
{
  span_id: string
  trace_id: string
  parent_span_id: string | null
  name: string
  span_type: 'span' | 'generation' | 'tool' | 'retrieval'
  start_time: Date
  end_time: Date
  duration_ms: number
}
```

### Generation Attributes

LLM calls include:

```typescript
{
  model: string              // 'claude-3-5-sonnet'
  input: string              // Prompt text
  output: string             // Response text
  input_tokens: number
  output_tokens: number
  temperature: number
  stop_reason: string
}
```

### Tool Attributes

Tool calls include:

```typescript
{
  tool_name: string          // 'web_search'
  tool_input: object         // { query: '...' }
  tool_output: object        // { results: [...] }
  tool_status: 'success' | 'error'
  error_message?: string
}
```

### Skill Selection Context

When agents select tools/skills:

```typescript
{
  skill_category: string           // 'search', 'calculation'
  selection_confidence: number     // 0.0 - 1.0
  selection_reason: string         // 'User asked for weather'
  alternatives_considered: string[] // ['calculator', 'search']
}
```

## Scalability

### ClickHouse Partitioning

Tables are partitioned by month for efficient queries:

```sql
PARTITION BY toYYYYMM(start_time)
```

### Data Retention

Configure TTL for automatic cleanup:

```sql
TTL start_time + INTERVAL 90 DAY
```

### Horizontal Scaling

- **ClickHouse**: Add shards for write throughput
- **Temporal**: Add workers for workflow throughput
- **Frontend**: Deploy multiple instances behind load balancer

## Security

### Data Isolation

- Traces are scoped to `project_id`
- API routes validate project membership
- ClickHouse queries always filter by project

### Secrets Management

| Secret | Storage | Usage |
|--------|---------|-------|
| LLM API keys | Environment | Scorer LLM calls |
| Database URLs | Environment | ClickHouse, PostgreSQL |
| Session secret | Environment | Auth tokens |
| API keys | PostgreSQL | External client auth |

### Network Security

- ClickHouse: Internal network only (no public access)
- PostgreSQL: Internal network only
- Temporal: Internal network only
- Frontend: Public (with auth)

## Deployment Profiles

### Development (Minimal)

```bash
docker compose up -d
# Starts: ClickHouse, PostgreSQL
```

### With Durable Execution

```bash
docker compose --profile temporal up -d
# Adds: Temporal Server, Temporal UI
```

### Production (Full)

```bash
docker compose --profile full up -d
# Adds: Workers, Redis, all services
```

### High Throughput

```bash
docker compose --profile streaming up -d
# Adds: Redpanda (Kafka-compatible)
```

## Extension Points

### Custom Scorers

```typescript
import { defineScorer } from '@neon/sdk'

const myScorer = defineScorer({
  name: 'my-scorer',
  dataType: 'numeric',
  evaluate: async (context) => {
    // Custom logic
    return { score: 0.9, reason: 'Passed' }
  },
})
```

### Custom Activities

Add new Temporal activities in `temporal-workers/src/activities/`:

```typescript
export async function myActivity(input: MyInput): Promise<MyOutput> {
  // Custom logic
}
```

### API Extensions

Add new routes in `frontend/app/api/`:

```typescript
// frontend/app/api/my-endpoint/route.ts
export async function GET(request: Request) {
  // Custom endpoint
}
```

## Monitoring

### Health Endpoints

| Endpoint | Service |
|----------|---------|
| `GET /api/health` | Frontend + deps |
| `GET :8123/ping` | ClickHouse |
| `pg_isready` | PostgreSQL |
| `tctl cluster health` | Temporal |

### Key Metrics

- Trace ingestion rate (traces/second)
- Span storage size (GB)
- Eval workflow duration (seconds)
- Scorer latency (ms)
- LLM API cost ($)
