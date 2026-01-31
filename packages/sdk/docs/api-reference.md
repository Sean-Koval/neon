# API Reference

Complete reference for all public exports from `@neon/sdk`.

## Test Definitions

### defineTest

Creates a test case definition.

```typescript
function defineTest(config: TestConfig): Test
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Unique test name |
| `input` | `Record<string, unknown>` | Yes | Input passed to the agent |
| `expected` | `ExpectedOutput` | No | Expected outputs for validation |
| `scorers` | `string[]` | No | Names of suite scorers to run |
| `scorer` | `Scorer \| InlineScorer` | No | Inline scorer for this test |
| `timeout` | `number` | No | Test timeout in ms (default: 60000) |
| `metadata` | `Record<string, unknown>` | No | Additional test metadata |

**ExpectedOutput:**

```typescript
interface ExpectedOutput {
  output?: string;          // Exact expected output
  outputContains?: string[]; // Strings output should contain
  toolCalls?: string[];     // Expected tool calls
}
```

**Example:**

```typescript
const test = defineTest({
  name: 'weather-query',
  input: { query: 'What is the weather in NYC?' },
  expected: {
    toolCalls: ['get_weather'],
    outputContains: ['temperature', 'NYC'],
  },
  timeout: 30000,
});
```

### defineSuite

Groups tests with shared configuration and scorers.

```typescript
function defineSuite(config: SuiteConfig): Suite
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Suite name |
| `tests` | `Test[]` | Yes | Tests in the suite |
| `datasets` | `Dataset[]` | No | Datasets to generate tests from |
| `scorers` | `Record<string, Scorer>` | No | Named scorers available to tests |
| `config` | `SuiteOptions` | No | Suite-level configuration |

**SuiteOptions:**

```typescript
interface SuiteOptions {
  parallel?: number;      // Parallel execution count (default: 1)
  timeout?: number;       // Suite timeout in ms (default: 300000)
  agentId?: string;       // Agent identifier
  agentVersion?: string;  // Agent version
}
```

**Example:**

```typescript
const suite = defineSuite({
  name: 'my-agent-v1',
  tests: [test1, test2, test3],
  scorers: {
    quality: llmJudge({ prompt: '...' }),
    tools: toolSelectionScorer(),
  },
  config: {
    parallel: 5,
    timeout: 300000,
  },
});
```

### defineDataset

Creates a dataset for generating test cases.

```typescript
function defineDataset(config: DatasetConfig): Dataset
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Dataset name |
| `cases` | `DatasetCase[]` | Yes | Test cases in the dataset |

**Example:**

```typescript
const dataset = defineDataset({
  name: 'weather-queries',
  cases: [
    { input: { query: 'Weather in NYC?' }, expected: { toolCalls: ['get_weather'] } },
    { input: { query: 'Weather in LA?' }, expected: { toolCalls: ['get_weather'] } },
  ],
});
```

### run

Executes tests and returns results.

```typescript
function run(testOrSuite: Test | Test[] | Suite, options?: RunOptions): Promise<TestResult | TestResult[] | SuiteResult>
```

**RunOptions:**

| Field | Type | Description |
|-------|------|-------------|
| `agent` | `(input: Record<string, unknown>) => Promise<AgentOutput>` | Agent function to execute |
| `parallel` | `number` | Parallel execution count |
| `timeout` | `number` | Test timeout in ms |
| `filter` | `string \| RegExp` | Filter tests by name |
| `scorers` | `Record<string, Scorer>` | Additional scorers |

**AgentOutput:**

```typescript
interface AgentOutput {
  output: string;                          // Agent's text output
  toolCalls?: string[];                    // Tools called
  traceId?: string;                        // Trace ID for linking
  metadata?: Record<string, unknown>;      // Additional metadata
}
```

**Example:**

```typescript
// Single test
const result = await run(test, {
  agent: async (input) => ({
    output: 'Response text',
    toolCalls: ['tool1'],
  }),
});

// Suite
const suiteResult = await run(suite, {
  agent: myAgent,
  parallel: 5,
});
```

---

## Scorers

### defineScorer

Creates a custom scorer.

```typescript
function defineScorer(config: ScorerConfig): Scorer
```

**ScorerConfig:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Scorer name |
| `description` | `string` | No | Scorer description |
| `dataType` | `'numeric' \| 'categorical' \| 'boolean'` | No | Score data type (default: 'numeric') |
| `evaluate` | `(context: EvalContext) => Promise<ScoreResult>` | Yes | Evaluation function |

**ScoreResult:**

```typescript
interface ScoreResult {
  value: number;                           // Score 0-1
  reason?: string;                         // Explanation
  metadata?: Record<string, unknown>;      // Additional data
}
```

**Example:**

```typescript
const customScorer = defineScorer({
  name: 'length-check',
  description: 'Checks response length',
  dataType: 'numeric',
  evaluate: async (ctx) => ({
    value: ctx.trace.spans[0]?.output?.length > 100 ? 1 : 0,
    reason: 'Response length check',
  }),
});
```

### Built-in Scorers

#### exactMatch

Checks for exact output match.

```typescript
function exactMatch(expected: string, options?: ExactMatchConfig): Scorer
```

**Options:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `caseSensitive` | `boolean` | `true` | Case-sensitive comparison |
| `trim` | `boolean` | `true` | Trim whitespace |
| `name` | `string` | `'exact_match'` | Scorer name |

**Example:**

```typescript
exactMatch('Hello, world!', { caseSensitive: false })
```

#### contains

Checks if output contains specified strings.

```typescript
function contains(strings: string[], options?: ContainsConfig): Scorer
```

**Options:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `caseSensitive` | `boolean` | `false` | Case-sensitive matching |
| `matchAll` | `boolean` | `false` | Require all strings to match |
| `name` | `string` | `'contains'` | Scorer name |

**Example:**

```typescript
contains(['weather', 'temperature'], { matchAll: true })
```

#### toolSelectionScorer

Validates expected tools were called.

```typescript
function toolSelectionScorer(options?: { name?: string }): Scorer
```

**Example:**

```typescript
const test = defineTest({
  name: 'weather-test',
  input: { query: 'Weather?' },
  expected: { toolCalls: ['get_weather'] },
});

const suite = defineSuite({
  tests: [test],
  scorers: {
    tools: toolSelectionScorer(),
  },
});
```

#### llmJudge

Uses an LLM to evaluate responses.

```typescript
function llmJudge(config: LLMJudgeConfig): Scorer
```

**LLMJudgeConfig:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `prompt` | `string` | Required | Evaluation prompt template |
| `model` | `string` | `'claude-3-haiku-20240307'` | Model to use |
| `parseResponse` | `(text: string) => number` | Built-in | Custom response parser |
| `maxTokens` | `number` | `256` | Max tokens for response |
| `name` | `string` | `'llm_judge'` | Scorer name |
| `temperature` | `number` | `0` | LLM temperature |

**Template Variables:**

| Variable | Description |
|----------|-------------|
| `{{input}}` | Agent input |
| `{{output}}` | Agent output |
| `{{expected}}` | Expected output (JSON) |
| `{{trace_name}}` | Trace name |
| `{{duration_ms}}` | Duration in ms |
| `{{tool_calls}}` | Tool calls (comma-separated) |

**Example:**

```typescript
llmJudge({
  prompt: `Rate this response 0-1:
Input: {{input}}
Output: {{output}}
Return JSON: {"score": 0-1, "reason": "..."}`,
  model: 'claude-3-haiku-20240307',
})
```

#### Pre-built LLM Judges

```typescript
// Response quality (accuracy, relevance, clarity)
responseQualityJudge

// Safety check (harmful content, PII, misinformation)
safetyJudge

// Helpfulness (addresses user needs)
helpfulnessJudge
```

#### Other Built-in Scorers

```typescript
// JSON structure matching
jsonMatchScorer(expected: object, options?: { strict?: boolean })

// Response latency check
latencyScorer(maxMs: number)

// Error rate scoring
errorRateScorer()

// Token efficiency
tokenEfficiencyScorer(maxTokens: number)

// Simple success/failure
successScorer()

// Iteration count scoring
iterationScorer(maxIterations: number)
```

---

## Runner

### TestRunner

Class for running test suites.

```typescript
class TestRunner {
  constructor(options?: RunnerOptions)
  runSuite(suite: Suite): Promise<SuiteResult>
  runTest(test: Test, scorers?: Record<string, Scorer>): Promise<TestResult>
}
```

**RunnerOptions:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `parallel` | `number` | `1` | Parallel test count |
| `timeout` | `number` | `60000` | Test timeout ms |
| `reporter` | `Reporter` | Console | Result reporter |
| `filter` | `string \| RegExp` | None | Test name filter |

### Reporters

```typescript
// Console output with colors
consoleReporter(options?: { verbose?: boolean })

// JSON output
jsonReporter()
```

---

## Tracing

### trace

Creates a trace context.

```typescript
function trace<T>(name: string, fn: () => T | Promise<T>): Promise<T>
```

### span

Creates a span within the current trace.

```typescript
function span<T>(name: string, fn: () => T | Promise<T>, options?: SpanOptions): Promise<T>
```

### generation

Creates a generation span (LLM call).

```typescript
function generation<T>(name: string, fn: () => T | Promise<T>, options?: {
  model?: string;
  input?: string;
}): Promise<T>
```

### tool

Creates a tool span.

```typescript
function tool<T>(name: string, fn: () => T | Promise<T>, options?: {
  toolName?: string;
  toolInput?: string;
}): Promise<T>
```

**Example:**

```typescript
const result = await trace('my-agent-run', async () => {
  const response = await generation('llm-call', async () => {
    return await llm.generate(prompt);
  }, { model: 'gpt-4' });

  const toolResult = await tool('search', async () => {
    return await searchApi.search(query);
  }, { toolName: 'web_search' });

  return { response, toolResult };
});
```

---

## Cloud Sync

### NeonCloudClient

Client for syncing results to Neon Cloud.

```typescript
class NeonCloudClient {
  constructor(config: CloudConfig)
  syncResults(results: SuiteResult[], options?: SyncOptions): Promise<SyncResponse>
}
```

### Helper Functions

```typescript
// Check if cloud sync is configured
function isCloudSyncConfigured(): boolean

// Create client from environment variables
function createCloudClientFromEnv(): NeonCloudClient

// Sync results to cloud
function syncResultsToCloud(results: SuiteResult[], options?: SyncOptions): Promise<SyncResult[]>

// Background sync (non-blocking)
function createBackgroundSync(results: SuiteResult[], options?: SyncOptions): Promise<SyncResult[]>

// Format sync status for display
function formatSyncStatus(results: SyncResult[], verbose?: boolean): string
```

**Environment Variables:**

| Variable | Description |
|----------|-------------|
| `NEON_API_URL` | Neon API endpoint |
| `NEON_API_KEY` | API key for authentication |
| `NEON_PROJECT_ID` | Project ID for results |

---

## Client

### Neon

Main client class.

```typescript
class Neon {
  constructor(config?: NeonConfig)
  eval: {
    runSuite(suite: Suite, options?: RunOptions): Promise<SuiteResult>
    runTest(test: Test, options?: RunOptions): Promise<TestResult>
  }
}
```

**NeonConfig:**

| Field | Type | Description |
|-------|------|-------------|
| `apiKey` | `string` | API key |
| `apiUrl` | `string` | API URL |
| `projectId` | `string` | Project ID |

**Example:**

```typescript
const neon = new Neon({
  apiKey: process.env.NEON_API_KEY,
});

const result = await neon.eval.runSuite(suite, {
  agent: myAgent,
});
```

---

## Types

### Core Types

```typescript
interface Test {
  name: string;
  input: Record<string, unknown>;
  expected?: ExpectedOutput;
  scorers?: string[];
  scorer?: Scorer | InlineScorer;
  timeout?: number;
  metadata?: Record<string, unknown>;
}

interface Suite {
  name: string;
  tests: Test[];
  datasets?: Dataset[];
  scorers?: Record<string, Scorer>;
  config?: SuiteOptions;
}

interface TestResult {
  test: string;
  passed: boolean;
  duration: number;
  scores: Array<{
    name: string;
    value: number;
    passed: boolean;
    reason?: string;
  }>;
  error?: string;
  trace?: TraceData;
}

interface SuiteResult {
  suite: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;
    avgScore: number;
    duration: number;
  };
  results: TestResult[];
}
```

### Scorer Types

```typescript
interface Scorer {
  name: string;
  description?: string;
  dataType: 'numeric' | 'categorical' | 'boolean';
  evaluate: (context: EvalContext) => Promise<ScoreResult>;
}

type InlineScorer = (context: EvalContext) => ScoreResult | Promise<ScoreResult>;

interface EvalContext {
  trace: TraceData;
  expected?: ExpectedOutput;
  metadata?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

interface ScoreResult {
  value: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}
```

### Trace Types

```typescript
interface TraceData {
  trace: {
    traceId: string;
    name: string;
    status: 'ok' | 'error';
    durationMs: number;
    metadata: Record<string, unknown>;
  };
  spans: SpanData[];
}

interface SpanData {
  spanId: string;
  parentSpanId?: string;
  name: string;
  spanType: 'span' | 'generation' | 'tool' | 'retrieval' | 'event';
  input: string;
  output: string;
  toolName?: string;
  toolInput?: string;
  toolOutput?: string;
  model?: string;
  durationMs: number;
  status: 'ok' | 'error';
}
```
