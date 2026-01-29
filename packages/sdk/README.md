# @neon/sdk

TypeScript SDK for Neon Agent Ops - Evals as code.

## Installation

```bash
bun add @neon/sdk
```

## Quick Start

### Define Tests

```typescript
import { defineTest, defineSuite, run } from '@neon/sdk';

// Define a single test case
const weatherTest = defineTest({
  name: 'weather-query',
  input: { query: 'What is the weather in NYC?' },
  expected: {
    toolCalls: ['get_weather'],
    outputContains: ['temperature', 'NYC'],
  },
});

// Define a test with an inline scorer
const qualityTest = defineTest({
  name: 'response-quality',
  input: { query: 'Explain quantum computing' },
  scorer: (ctx) => {
    const output = ctx.metadata?.output as string;
    const hasKeyTerms = ['quantum', 'qubit', 'superposition'].some(
      term => output?.toLowerCase().includes(term)
    );
    return { value: hasKeyTerms ? 1 : 0, reason: hasKeyTerms ? 'Contains key terms' : 'Missing key terms' };
  },
});
```

### Define Suites

```typescript
import { defineSuite, llmJudge, toolSelectionScorer } from '@neon/sdk';

const agentSuite = defineSuite({
  name: 'my-agent-v1',
  tests: [weatherTest, qualityTest],
  scorers: {
    tool_selection: toolSelectionScorer(),
    quality: llmJudge({
      prompt: 'Rate the response quality from 0-1...',
    }),
  },
  config: {
    parallel: 5,
    timeout: 120000,
  },
});
```

### Run Tests

```typescript
import { run } from '@neon/sdk';

// Run a single test
const result = await run(weatherTest, {
  agent: async (input) => {
    const response = await myAgent.invoke(input);
    return {
      output: response.text,
      toolCalls: response.toolCalls,
    };
  },
});

console.log(result.passed); // true/false
console.log(result.scores); // Array of score results

// Run a suite
const suiteResult = await run(agentSuite, {
  agent: myAgentFunction,
  parallel: 5,
});

console.log(suiteResult.summary);
// { total: 2, passed: 2, failed: 0, passRate: 1.0, avgScore: 0.95 }

// Run multiple tests
const results = await run([test1, test2, test3], {
  timeout: 30000,
  filter: /weather/,
});
```

## API Reference

### `defineTest(config)`

Creates a test case definition.

```typescript
interface Test {
  name: string;                    // Test name
  input: Record<string, unknown>;  // Input passed to agent
  expected?: {                     // Expected outputs for built-in checks
    toolCalls?: string[];          // Expected tool calls
    outputContains?: string[];     // Strings the output should contain
    output?: string;               // Exact expected output
  };
  scorers?: string[];              // Named scorers to run
  scorer?: Scorer | InlineScorer;  // Inline scorer for this test
  timeout?: number;                // Test timeout in ms (default: 60000)
}
```

### `defineSuite(config)`

Groups tests with shared configuration.

```typescript
interface Suite {
  name: string;                            // Suite name
  tests: Test[];                           // Tests in the suite
  datasets?: Dataset[];                    // Optional datasets
  scorers?: Record<string, Scorer>;        // Named scorers
  config?: {
    parallel?: number;                     // Parallel execution (default: 1)
    timeout?: number;                      // Suite timeout (default: 300000)
    agentId?: string;                      // Agent identifier
    agentVersion?: string;                 // Agent version
  };
}
```

### `run(testOrSuite, options)`

Executes tests and returns structured results.

```typescript
interface RunOptions {
  parallel?: number;                       // Parallel execution count
  timeout?: number;                        // Test timeout in ms
  filter?: string | RegExp;                // Filter tests by name
  agent?: (input) => Promise<AgentOutput>; // Agent execution function
  scorers?: Record<string, Scorer>;        // Additional scorers
}

interface AgentOutput {
  output: string;                          // Agent's text output
  toolCalls?: string[];                    // Tools called
  traceId?: string;                        // Trace ID for linking
  metadata?: Record<string, unknown>;      // Additional metadata
}
```

Returns:
- `TestResult` for a single test
- `TestResult[]` for an array of tests
- `SuiteResult` for a suite

### `defineScorer(config)`

Creates a custom scorer.

```typescript
import { defineScorer } from '@neon/sdk';

const customScorer = defineScorer({
  name: 'custom-metric',
  dataType: 'numeric',
  evaluate: async ({ trace, expected, metadata }) => {
    // Your scoring logic
    return { value: 0.95, reason: 'Evaluation passed' };
  },
});
```

## Built-in Scorers

The SDK includes several pre-built scorers:

- `toolSelectionScorer()` - Validates expected tools were called
- `containsScorer(strings)` - Checks output contains strings
- `exactMatchScorer()` - Exact output matching
- `llmJudge(config)` - LLM-based evaluation
- `responseQualityJudge()` - Response quality scoring
- `safetyJudge()` - Safety evaluation
- `latencyScorer(threshold)` - Latency checking
- `tokenEfficiencyScorer(maxTokens)` - Token usage efficiency

## Async Support

All scorers support async evaluation:

```typescript
const asyncScorer = defineScorer({
  name: 'async-check',
  evaluate: async ({ trace }) => {
    const result = await someAsyncOperation(trace);
    return { value: result ? 1 : 0 };
  },
});

// Inline async scorer
const test = defineTest({
  name: 'async-test',
  input: { query: 'test' },
  scorer: async (ctx) => {
    await delay(100);
    return { value: 0.9 };
  },
});
```

## License

MIT
