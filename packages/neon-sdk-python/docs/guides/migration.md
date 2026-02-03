# Migration Guide: TypeScript to Python SDK

This guide helps you migrate from the TypeScript SDK (`@neon/sdk`) to the Python SDK (`neon-sdk`).

## Overview

The Python SDK provides full feature parity with the TypeScript SDK. Most concepts translate directly, with minor syntax differences to match Python conventions.

## Installation

**TypeScript:**
```bash
npm install @neon/sdk
# or
bun add @neon/sdk
```

**Python:**
```bash
pip install neon-sdk
# or
uv add neon-sdk
```

## Client Initialization

**TypeScript:**
```typescript
import { Neon, NeonConfig } from '@neon/sdk';

const client = new Neon({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.neon.dev',
});
```

**Python:**
```python
from neon_sdk import Neon, NeonConfig

client = Neon(NeonConfig(
    api_key='your-api-key',
    base_url='https://api.neon.dev',
))
```

### Sync vs Async

**TypeScript** - Always async:
```typescript
const traces = await client.traces.list();
```

**Python** - Choose async or sync:
```python
# Async
from neon_sdk import Neon
client = Neon(config)
traces = await client.traces.list()

# Sync
from neon_sdk import NeonSync
client = NeonSync(config)
traces = client.traces.list()
```

## Tracing

### Context Managers

**TypeScript:**
```typescript
import { trace, generation, tool } from '@neon/sdk/tracing';

await trace('my-agent', async (ctx) => {
  await generation('llm-call', { model: 'gpt-4' }, async () => {
    return await llm.chat(prompt);
  });

  await tool('search', { toolName: 'web_search' }, async () => {
    return await search(query);
  });
});
```

**Python:**
```python
from neon_sdk.tracing import trace, generation, tool

with trace('my-agent'):
    with generation('llm-call', model='gpt-4'):
        response = await llm.chat(prompt)

    with tool('search', tool_name='web_search'):
        results = await search(query)
```

### Decorator

**TypeScript:**
```typescript
import { traced } from '@neon/sdk/tracing';

const myFunction = traced('my-function', async (x: number) => {
  return x * 2;
});
```

**Python:**
```python
from neon_sdk.tracing import traced

@traced('my-function')
async def my_function(x: int) -> int:
    return x * 2
```

### All Span Types

| TypeScript | Python |
|------------|--------|
| `trace()` | `trace()` |
| `span()` | `span()` |
| `generation()` | `generation()` |
| `tool()` | `tool()` |
| `retrieval()` | `retrieval()` |
| `reasoning()` | `reasoning()` |
| `planning()` | `planning()` |
| `prompt()` | `prompt()` |
| `routing()` | `routing()` |
| `memory()` | `memory()` |

## Scorers

### Rule-Based Scorers

**TypeScript:**
```typescript
import { contains, exactMatch, toolSelectionScorer } from '@neon/sdk/scorers';

const scorer = contains(['hello', 'world']);
const scorer2 = exactMatch('expected output');
const scorer3 = toolSelectionScorer(['search', 'calculate']);
```

**Python:**
```python
from neon_sdk.scorers import contains, exact_match, tool_selection_scorer

scorer = contains(['hello', 'world'])
scorer2 = exact_match('expected output')
scorer3 = tool_selection_scorer(['search', 'calculate'])
```

### With Configuration

**TypeScript:**
```typescript
import { contains, ContainsConfig } from '@neon/sdk/scorers';

const scorer = contains({
  expected: ['error', 'warning'],
  matchAll: false,
  caseSensitive: true,
} as ContainsConfig);
```

**Python:**
```python
from neon_sdk.scorers import contains, ContainsConfig

scorer = contains(ContainsConfig(
    expected=['error', 'warning'],
    match_all=False,
    case_sensitive=True,
))
```

### LLM Judge

**TypeScript:**
```typescript
import { llmJudge, LLMJudgeConfig } from '@neon/sdk/scorers';

const scorer = llmJudge({
  prompt: `Rate the response quality from 0 to 1.
    Input: {{input}}
    Output: {{output}}
    Return JSON: {"score": <0-1>, "reason": "<explanation>"}`,
  model: 'claude-3-haiku-20240307',
} as LLMJudgeConfig);
```

**Python:**
```python
from neon_sdk.scorers import llm_judge, LLMJudgeConfig

scorer = llm_judge(LLMJudgeConfig(
    prompt='''Rate the response quality from 0 to 1.
    Input: {{input}}
    Output: {{output}}
    Return JSON: {"score": <0-1>, "reason": "<explanation>"}''',
    model='claude-3-haiku-20240307',
))
```

### Custom Scorers

**TypeScript:**
```typescript
import { defineScorer, ScorerConfig } from '@neon/sdk/scorers';

const customScorer = defineScorer({
  name: 'custom_metric',
  dataType: 'numeric',
  evaluate: (ctx) => ({
    value: calculateScore(ctx.trace),
    reason: 'Calculated custom metric',
  }),
});
```

**Python:**
```python
from neon_sdk.scorers import define_scorer, ScorerConfig, ScoreDataType

custom_scorer = define_scorer(ScorerConfig(
    name='custom_metric',
    data_type=ScoreDataType.NUMERIC,
    evaluate=lambda ctx: ScoreResult(
        value=calculate_score(ctx.trace),
        reason='Calculated custom metric',
    ),
))
```

**Python decorator alternative:**
```python
from neon_sdk.scorers import scorer

@scorer('custom_metric')
def custom_scorer(context: EvalContext) -> ScoreResult:
    return ScoreResult(
        value=calculate_score(context.trace),
        reason='Calculated custom metric',
    )
```

### Scorer Name Mapping

| TypeScript (camelCase) | Python (snake_case) |
|------------------------|---------------------|
| `contains` | `contains` |
| `exactMatch` | `exact_match` |
| `toolSelectionScorer` | `tool_selection_scorer` |
| `jsonMatchScorer` | `json_match_scorer` |
| `latencyScorer` | `latency_scorer` |
| `errorRateScorer` | `error_rate_scorer` |
| `tokenEfficiencyScorer` | `token_efficiency_scorer` |
| `successScorer` | `success_scorer` |
| `iterationScorer` | `iteration_scorer` |
| `llmJudge` | `llm_judge` |
| `responseQualityJudge` | `response_quality_judge` |
| `safetyJudge` | `safety_judge` |
| `helpfulnessJudge` | `helpfulness_judge` |
| `causalAnalysisScorer` | `causal_analysis_scorer` |
| `rootCauseScorer` | `root_cause_scorer` |

## Types

### Import Patterns

**TypeScript:**
```typescript
import {
  Trace,
  Span,
  Score,
  TraceStatus,
  SpanKind,
  EvalRun,
} from '@neon/sdk';
```

**Python:**
```python
from neon_sdk.types import (
    Trace,
    Span,
    Score,
    TraceStatus,
    SpanKind,
    EvalRun,
)
```

### Type Naming

| TypeScript | Python |
|------------|--------|
| `TraceStatus` | `TraceStatus` |
| `SpanKind` | `SpanKind` |
| `SpanType` | `SpanType` |
| `ScoreDataType` | `ScoreDataType` |
| `EvalRunStatus` | `EvalRunStatus` |

## ClickHouse Integration

**TypeScript:**
```typescript
import { NeonClickHouseClient, ClickHouseConfig } from '@neon/sdk/clickhouse';

const client = new NeonClickHouseClient({
  host: 'localhost',
  port: 8123,
  database: 'neon',
});

const traces = await client.queryTraces({
  projectId: 'proj-1',
  limit: 100,
});
```

**Python:**
```python
from neon_sdk.clickhouse import NeonClickHouseClient, ClickHouseConfig

client = NeonClickHouseClient(ClickHouseConfig(
    host='localhost',
    port=8123,
    database='neon',
))

traces = client.query_traces(
    project_id='proj-1',
    limit=100,
)
```

### Method Name Mapping

| TypeScript | Python |
|------------|--------|
| `insertTraces()` | `insert_traces()` |
| `queryTraces()` | `query_traces()` |
| `getTraceWithSpans()` | `get_trace_with_spans()` |
| `getDashboardSummary()` | `get_dashboard_summary()` |
| `getDailyStats()` | `get_daily_stats()` |
| `getScoreTrends()` | `get_score_trends()` |

## Temporal Integration

**TypeScript:**
```typescript
import { NeonTemporalClient, TemporalClientConfig } from '@neon/sdk/temporal';

const client = new NeonTemporalClient({
  address: 'localhost:7233',
  namespace: 'default',
  taskQueue: 'agent-workers',
});

await client.connect();

const result = await client.startAgentRun({
  projectId: 'proj-123',
  agentId: 'agent-456',
  inputData: { query: 'Hello' },
});
```

**Python:**
```python
from neon_sdk.temporal import NeonTemporalClient, TemporalClientConfig, StartAgentRunInput

client = NeonTemporalClient(TemporalClientConfig(
    address='localhost:7233',
    namespace='default',
    task_queue='agent-workers',
))

await client.connect()

result = await client.start_agent_run(StartAgentRunInput(
    project_id='proj-123',
    agent_id='agent-456',
    input_data={'query': 'Hello'},
))
```

## Common Patterns

### Error Handling

**TypeScript:**
```typescript
try {
  const trace = await client.traces.get(traceId);
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('Trace not found');
  }
}
```

**Python:**
```python
from neon_sdk import NotFoundError

try:
    trace = await client.traces.get(trace_id)
except NotFoundError:
    print('Trace not found')
```

### Async Iteration

**TypeScript:**
```typescript
for await (const trace of client.traces.stream()) {
  console.log(trace.name);
}
```

**Python:**
```python
async for trace in client.traces.stream():
    print(trace.name)
```

## Configuration Differences

| TypeScript | Python | Notes |
|------------|--------|-------|
| `apiKey` | `api_key` | Snake case |
| `baseUrl` | `base_url` | Snake case |
| `taskQueue` | `task_queue` | Snake case |
| `matchAll` | `match_all` | Snake case |
| `caseSensitive` | `case_sensitive` | Snake case |

## Key Differences Summary

1. **Naming Convention**: TypeScript uses camelCase, Python uses snake_case
2. **Async/Sync**: Python offers both async (`Neon`) and sync (`NeonSync`) clients
3. **Context Managers**: Python uses `with` statements instead of callback functions
4. **Decorators**: Python provides native decorator syntax with `@traced` and `@scorer`
5. **Configuration**: Use Pydantic models (e.g., `NeonConfig`, `LLMJudgeConfig`) instead of plain objects
6. **Type Hints**: Python uses type annotations; install types with `py.typed` marker

## Need Help?

- [Installation Guide](installation.md)
- [Quick Start Guide](quickstart.md)
- [API Reference](../api/client.md)
- [GitHub Issues](https://github.com/neon-dev/neon/issues)
