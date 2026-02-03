# SDK Reference

Neon provides SDKs for TypeScript and Python with identical APIs. Both support tracing, scoring, test definition, and cloud sync.

## Installation

**TypeScript:**
```bash
bun add @neon/sdk
# or
npm install @neon/sdk
```

**Python:**
```bash
pip install neon-sdk
# With optional integrations:
pip install neon-sdk[temporal,clickhouse]
```

## Client

The `Neon` client provides access to the API for traces, scores, and evaluations.

**TypeScript:**
```typescript
import { Neon, createNeonClient } from '@neon/sdk'

const neon = createNeonClient({
  apiUrl: 'http://localhost:3000',
  projectId: 'my-project',
})

// Or with full configuration
const neon = new Neon({
  apiUrl: process.env.NEON_API_URL,
  projectId: process.env.NEON_PROJECT_ID,
  apiKey: process.env.NEON_API_KEY,
})
```

**Python:**
```python
from neon_sdk import Neon, NeonConfig, create_neon_client

neon = create_neon_client(
    api_url="http://localhost:3000",
    project_id="my-project",
)

# Synchronous variant for notebooks
from neon_sdk import NeonSync
neon = NeonSync(config)
```

### Client Methods

```typescript
// Traces
neon.traces.list(filters?: TraceFilters)
neon.traces.get(traceId: string): TraceWithSpans

// Scores
neon.scores.create(input: CreateScoreInput)
neon.scores.createBatch(inputs: CreateScoreInput[])
neon.scores.list(traceId: string): Score[]

// Datasets
neon.datasets.create(input: CreateDatasetInput)
neon.datasets.list(): Dataset[]

// Evaluations
neon.eval.runSuite(suite: Suite): EvalRun
neon.eval.waitForRun(runId: string): EvalRunResult
neon.eval.getRunStatus(runId: string): EvalRunStatus
```

---

## Tracing

Tracing captures the execution flow of your agent with minimal overhead.

### Basic Tracing

**TypeScript:**
```typescript
import { trace, span, generation, tool, retrieval } from '@neon/sdk'

// Wrap your agent execution
const result = await trace('agent-run', async () => {
  // Nested spans track individual operations
  const plan = await span('planning', async () => {
    return createPlan(query)
  })

  // LLM calls with token tracking
  const response = await generation('llm-call', {
    model: 'claude-3-5-sonnet',
  }, async () => {
    return await anthropic.messages.create({
      model: 'claude-3-5-sonnet',
      messages: [{ role: 'user', content: query }],
    })
  })

  // Tool execution
  const searchResults = await tool('web-search', async () => {
    return await searchAPI.search(response.query)
  })

  // RAG retrieval
  const docs = await retrieval('vector-search', async () => {
    return await vectorDB.query(query, { topK: 5 })
  })

  return finalResponse
})
```

**Python:**
```python
from neon_sdk.tracing import trace, span, generation, tool, retrieval

with trace("agent-run"):
    with span("planning"):
        plan = create_plan(query)

    with generation("llm-call", model="claude-3-5-sonnet"):
        response = await anthropic.messages.create(
            model="claude-3-5-sonnet",
            messages=[{"role": "user", "content": query}],
        )

    with tool("web-search"):
        search_results = await search_api.search(response.query)

    with retrieval("vector-search"):
        docs = await vector_db.query(query, top_k=5)
```

### Span Types

| Function | Type | Use Case |
|----------|------|----------|
| `trace()` | root | Top-level agent execution |
| `span()` | generic | General operations |
| `generation()` | generation | LLM completions |
| `tool()` | tool | External tool/API calls |
| `retrieval()` | retrieval | RAG/vector search |
| `reasoning()` | reasoning | Chain-of-thought |
| `planning()` | planning | Task decomposition |
| `routing()` | routing | Model/path selection |
| `memory()` | memory | Context management |
| `prompt()` | prompt | Template rendering |

### Span Attributes

Add custom attributes to any span:

```typescript
await generation('llm-call', {
  model: 'claude-3-5-sonnet',
  attributes: {
    temperature: 0.7,
    max_tokens: 1000,
    user_id: 'user-123',
  },
}, async () => {
  // ...
})
```

### Context Management

Access the current trace context:

```typescript
import { getCurrentContext, setCurrentContext, getActiveSpan } from '@neon/sdk'

// Get current trace/span IDs
const context = getCurrentContext()
console.log(context.traceId, context.spanId)

// Get the active span for adding attributes
const span = getActiveSpan()
span?.setAttribute('key', 'value')
```

---

## Scorers

Scorers evaluate agent outputs. Neon includes rule-based and LLM-powered scorers.

### Rule-Based Scorers

Fast, deterministic scoring without LLM calls.

```typescript
import {
  exactMatch,
  contains,
  regex,
  toolSelection,
  latency,
  tokenEfficiency,
} from '@neon/sdk'

// Exact string match
const exact = exactMatch('expected output')
const exactAny = exactMatch(['option1', 'option2'])

// Contains substrings
const containsScorer = contains(['Paris', 'France'])
const caseInsensitive = contains(['paris'], { caseSensitive: false })

// Regex pattern
const pattern = regex(/\d{3}-\d{4}/)

// Tool selection accuracy
const tools = toolSelection({
  expected: ['web_search', 'calculator'],
  strictOrder: false,
  penalizeExtra: true,
})

// Performance thresholds
const speed = latency({ maxMs: 5000, targetMs: 2000 })
const efficiency = tokenEfficiency({ maxTokens: 1000 })
```

### LLM Judge Scorers

Use Claude to evaluate subjective criteria.

```typescript
import { llmJudge, reasoning, grounding } from '@neon/sdk'

// Custom criteria
const quality = llmJudge({
  criteria: 'Response should be helpful, accurate, and well-structured',
  model: 'claude-3-5-sonnet',
  rubric: `
    1 - Completely wrong or unhelpful
    2 - Partially correct but missing key info
    3 - Correct but could be clearer
    4 - Good response with minor issues
    5 - Excellent, complete response
  `,
})

// Pre-built reasoning scorer
const reasoningQuality = reasoning({
  model: 'claude-3-5-sonnet',
  // Evaluates: logical coherence, information usage,
  // problem decomposition, completeness
})

// Grounding scorer (factual accuracy)
const groundedness = grounding({
  model: 'claude-3-5-sonnet',
  // Evaluates: factual accuracy, evidence support,
  // expected content presence
})
```

### Domain Judges

Pre-configured for specific domains:

```typescript
import {
  codeReviewJudge,
  safetyJudge,
  helpfulnessJudge,
} from '@neon/sdk'

const codeQuality = codeReviewJudge({
  language: 'typescript',
  checkSecurity: true,
  checkPerformance: true,
})

const safety = safetyJudge({
  strictness: 'high',
  categories: ['harmful', 'illegal', 'unethical'],
})

const helpful = helpfulnessJudge()
```

### Custom Scorers

Create your own scorer:

```typescript
import { defineScorer, ScorerContext, ScoreResult } from '@neon/sdk'

const myScorer = defineScorer({
  name: 'my-custom-scorer',
  dataType: 'numeric', // or 'categorical', 'boolean'

  async evaluate(context: ScorerContext): Promise<ScoreResult> {
    const { output, expected, trace, spans } = context

    // Your scoring logic
    const score = calculateScore(output, expected)
    const passed = score >= 0.8

    return {
      score,
      passed,
      reason: passed ? 'Meets criteria' : 'Below threshold',
      evidence: ['Detail 1', 'Detail 2'],
    }
  },
})
```

**Python:**
```python
from neon_sdk.scorers import define_scorer, ScorerContext, ScoreResult

@define_scorer(name="my-custom-scorer", data_type="numeric")
async def my_scorer(context: ScorerContext) -> ScoreResult:
    output = context.output
    expected = context.expected

    score = calculate_score(output, expected)
    passed = score >= 0.8

    return ScoreResult(
        score=score,
        passed=passed,
        reason="Meets criteria" if passed else "Below threshold",
        evidence=["Detail 1", "Detail 2"],
    )
```

---

## Test Definition

Define test suites as code for systematic evaluation.

### Defining Suites

```typescript
import { defineSuite, defineTest, defineDataset } from '@neon/sdk'
import { contains, toolSelection, llmJudge } from '@neon/sdk'

const suite = defineSuite({
  name: 'weather-agent-tests',
  description: 'Tests for the weather agent',

  // Default scorers for all tests
  defaultScorers: [
    contains,
    toolSelection({ expected: [] }),
    llmJudge({ criteria: 'Response quality' }),
  ],

  // Default pass threshold
  defaultMinScore: 0.7,

  // Execution settings
  parallel: true,
  stopOnFailure: false,
  timeoutMs: 300000,
})
```

### Defining Tests

```typescript
defineTest(suite, {
  name: 'weather-query',
  description: 'Should use weather API for weather questions',

  // Input to the agent
  input: {
    query: 'What is the weather in Tokyo?',
  },

  // Expected behavior
  expectedTools: ['get_weather'],
  expected: {
    contains: ['Tokyo', 'temperature', 'weather'],
  },

  // Scorers (override suite defaults)
  scorers: [
    contains(['Tokyo', 'weather']),
    toolSelection({ expected: ['get_weather'] }),
  ],

  // Pass threshold (override suite default)
  minScore: 0.8,

  // Tags for filtering
  tags: ['weather', 'critical'],
})

// Test with context
defineTest(suite, {
  name: 'grounded-summary',
  input: {
    query: 'Summarize this document',
    context: {
      document: 'The document discusses X, Y, and Z...',
    },
  },
  expected: {
    contains: ['X', 'Y', 'Z'],
  },
  scorers: [grounding()],
})
```

### Defining Datasets

Reusable test data for batch evaluation:

```typescript
const weatherDataset = defineDataset({
  name: 'weather-queries',
  description: 'Common weather questions',

  items: [
    {
      input: { query: 'Weather in Tokyo?' },
      expected: { contains: ['Tokyo'] },
    },
    {
      input: { query: 'Weather in Paris?' },
      expected: { contains: ['Paris'] },
    },
    {
      input: { query: 'Weather in NYC?' },
      expected: { contains: ['New York'] },
    },
  ],
})

// Use dataset in suite
const suite = defineSuite({
  name: 'weather-batch-tests',
  dataset: weatherDataset,
  defaultScorers: [contains, toolSelection({ expected: ['get_weather'] })],
})
```

### Running Tests

**Local Execution:**
```typescript
import { runSuite, consoleReporter, jsonReporter } from '@neon/sdk'

// Run with console output
const results = await runSuite(suite, {
  agent: myAgent,
  reporter: consoleReporter,
})

// Run with JSON output
const results = await runSuite(suite, {
  agent: myAgent,
  reporter: jsonReporter('results.json'),
})

console.log(results.summary.passRate) // 0.85
console.log(results.summary.avgScore) // 0.82
```

**Cloud Execution (via Temporal):**
```typescript
const run = await neon.eval.runSuite(suite)
console.log(run.id) // 'run-123'

// Poll for completion
const result = await neon.eval.waitForRun(run.id)
console.log(result.summary)
```

---

## Cloud Sync

Sync local results to Neon cloud for persistence and collaboration.

```typescript
import { NeonCloudClient, syncResultsToCloud, createBackgroundSync } from '@neon/sdk'

// Manual sync
const cloudClient = new NeonCloudClient({
  apiUrl: process.env.NEON_API_URL,
  apiKey: process.env.NEON_API_KEY,
})

await syncResultsToCloud(cloudClient, results)

// Background sync (non-blocking)
const sync = createBackgroundSync(cloudClient)
sync.queue(results)
await sync.flush() // Wait for all queued syncs

// Check if configured
import { isCloudSyncConfigured } from '@neon/sdk'
if (isCloudSyncConfigured()) {
  await syncResultsToCloud(results)
}
```

---

## Optimization Signals

Generate training signals from evaluation results.

```typescript
import {
  generateSignals,
  generateRewardSignals,
  generateDemonstrationSignals,
  aggregateSignals,
  toRLHFFormat,
} from '@neon/sdk'

// Generate all signal types
const signals = await generateSignals(evalResults, {
  includeRewards: true,
  includePreferences: true,
  includeDemonstrations: true,
})

// Reward signals (success/failure)
const rewards = await generateRewardSignals(evalResults)

// Demonstration signals (good trajectories)
const demos = await generateDemonstrationSignals(evalResults, {
  minScore: 0.9,
})

// Aggregate across batches
const aggregated = aggregateSignals([signals1, signals2])

// Convert to RLHF format
const rlhfData = toRLHFFormat(signals)
```

---

## Export Formats

Export traces for ML training pipelines.

### Agent Lightning Format

```typescript
import {
  exportToAgentLightning,
  exportBatchToAgentLightning,
  streamExportToAgentLightning,
} from '@neon/sdk'

// Single trace
const episode = exportToAgentLightning(trace, {
  includeIntermediateSteps: true,
  rewardKey: 'final_score',
})

// Batch export
const episodes = exportBatchToAgentLightning(traces)

// Stream for large datasets
for await (const episode of streamExportToAgentLightning(traceStream)) {
  await writeToFile(episode)
}
```

### Python Integrations

```python
from neon_sdk.integrations import (
    export_to_agent_lightning,
    export_to_dpo_pairs,
    export_to_openai_finetune,
    create_dspy_dataset,
)

# Agent Lightning (RL training)
episodes = export_to_agent_lightning(traces)

# DPO pairs for TRL (HuggingFace)
pairs = export_to_dpo_pairs(
    good_traces=high_score_traces,
    bad_traces=low_score_traces,
)

# OpenAI fine-tuning format
finetune_data = export_to_openai_finetune(traces)

# DSPy dataset
dspy_dataset = create_dspy_dataset(traces)
```

---

## Types Reference

### Core Types

```typescript
interface Trace {
  traceId: string
  projectId: string
  name: string
  status: 'ok' | 'error'
  startTime: Date
  endTime: Date
  durationMs: number
  totalInputTokens: number
  totalOutputTokens: number
  toolCallCount: number
  llmCallCount: number
  attributes: Record<string, string>
}

interface Span {
  spanId: string
  traceId: string
  parentSpanId: string | null
  name: string
  spanType: 'span' | 'generation' | 'tool' | 'retrieval'
  componentType?: ComponentType
  startTime: Date
  endTime: Date
  durationMs: number
  model?: string
  input?: string
  output?: string
  inputTokens?: number
  outputTokens?: number
  attributes: Record<string, string>
}

interface Score {
  scoreId: string
  traceId: string
  spanId?: string
  name: string
  value: number
  scoreType: 'numeric' | 'categorical' | 'boolean'
  source: 'api' | 'sdk' | 'annotation' | 'eval' | 'temporal'
  scorerName?: string
  reason?: string
  evidence?: string[]
  createdAt: Date
}

type ComponentType =
  | 'generation'
  | 'tool'
  | 'retrieval'
  | 'reasoning'
  | 'planning'
  | 'routing'
  | 'memory'
  | 'prompt'
```

### Evaluation Types

```typescript
interface Suite {
  name: string
  description?: string
  tests: Test[]
  defaultScorers: Scorer[]
  defaultMinScore: number
  parallel: boolean
  timeoutMs: number
}

interface Test {
  name: string
  description?: string
  input: Record<string, any>
  expected?: Expected
  expectedTools?: string[]
  expectedToolSequence?: string[]
  scorers?: Scorer[]
  minScore?: number
  tags?: string[]
}

interface EvalRun {
  id: string
  suiteId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  createdAt: Date
}

interface EvalRunResult {
  runId: string
  suiteName: string
  status: 'completed' | 'failed'
  summary: EvalSummary
  results: EvalCaseResult[]
}

interface EvalSummary {
  totalCases: number
  passed: number
  failed: number
  passRate: number
  avgScore: number
  scoresByScorer: Record<string, ScorerSummary>
  durationMs: number
}
```

### Scorer Types

```typescript
interface Scorer {
  name: string
  dataType: 'numeric' | 'categorical' | 'boolean'
  evaluate: (context: ScorerContext) => Promise<ScoreResult>
}

interface ScorerContext {
  trace: TraceWithSpans
  output: any
  expected?: any
  spans: Span[]
  config?: Record<string, any>
}

interface ScoreResult {
  score: number
  passed?: boolean
  reason?: string
  evidence?: string[]
}
```
