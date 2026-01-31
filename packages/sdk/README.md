# @neon/sdk

TypeScript SDK for Neon Agent Ops - Evals as code.

Build, test, and evaluate AI agents with confidence using a simple, expressive API.

## Features

- **Evals as Code** - Define tests, scorers, and datasets in TypeScript
- **Built-in Scorers** - Tool selection, LLM judges, rule-based checks
- **CLI Support** - Run evals from the command line with `npx neon eval`
- **CI/CD Ready** - JSON output, exit codes, threshold checks
- **Cloud Sync** - Optional sync to Neon Cloud for tracking and analysis

## Installation

```bash
bun add @neon/sdk
# or
npm install @neon/sdk
```

## Quick Start

### 1. Define Tests

```typescript
// evals/my-agent.eval.ts
import { defineTest, defineSuite, contains, llmJudge } from '@neon/sdk';

// Define a test case
const weatherTest = defineTest({
  name: 'weather-query',
  input: { query: 'What is the weather in NYC?' },
  expected: {
    toolCalls: ['get_weather'],
    outputContains: ['temperature', 'NYC'],
  },
});

// Define a suite with scorers
export const suite = defineSuite({
  name: 'my-agent-v1',
  tests: [weatherTest],
  scorers: {
    keywords: contains(['weather', 'temperature']),
    quality: llmJudge({
      prompt: 'Rate response quality 0-1: {{output}}',
    }),
  },
  config: {
    parallel: 5,
    timeout: 60000,
  },
});
```

### 2. Run Evaluations

**CLI:**

```bash
npx neon eval
```

**Programmatic:**

```typescript
import { run } from '@neon/sdk';

const result = await run(suite, {
  agent: async (input) => {
    const response = await myAgent.invoke(input);
    return {
      output: response.text,
      toolCalls: response.toolCalls,
    };
  },
});

console.log(result.summary);
// { total: 1, passed: 1, failed: 0, passRate: 1.0, avgScore: 0.95 }
```

### 3. View Results

```
Suite: my-agent-v1
  ✓ weather-query (1.2s)
    - keywords: 1.00
    - quality: 0.90

Summary
  Total:  1
  Passed: 1
  Failed: 0
```

## Built-in Scorers

### Rule-Based

```typescript
// Exact match
exactMatch('expected output')

// Contains strings
contains(['keyword1', 'keyword2'], { matchAll: true })

// Tool selection validation
toolSelectionScorer()

// JSON structure matching
jsonMatchScorer({ expected: 'structure' })
```

### LLM Judges

```typescript
// Custom LLM judge
llmJudge({
  prompt: 'Rate the response: {{output}}',
  model: 'claude-3-haiku-20240307',
})

// Pre-built judges
responseQualityJudge  // Quality, accuracy, clarity
safetyJudge           // Safety, harmful content
helpfulnessJudge      // User needs, actionability
```

### Performance

```typescript
latencyScorer(5000)           // Max latency in ms
tokenEfficiencyScorer(1000)   // Max tokens
errorRateScorer()             // Error tracking
```

## Custom Scorers

```typescript
import { defineScorer } from '@neon/sdk';

const wordCountScorer = defineScorer({
  name: 'word_count',
  description: 'Checks response length',
  dataType: 'numeric',
  evaluate: async (context) => {
    const output = context.trace.spans[0]?.output || '';
    const words = output.split(/\s+/).length;

    return {
      value: words >= 50 ? 1 : words / 50,
      reason: `Response has ${words} words`,
    };
  },
});
```

## CLI Reference

```bash
# Run all eval files
npx neon eval

# Run specific patterns
npx neon eval "tests/**/*.eval.js"

# Filter by test name
npx neon eval --filter "weather"

# Parallel execution
npx neon eval --parallel 5

# JSON output for CI
npx neon eval --format json

# Verbose output
npx neon eval --verbose

# Disable cloud sync
npx neon eval --no-sync
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Run evaluations
  run: npx neon eval --format json > results.json
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

- name: Check for failures
  run: |
    if grep -q '"failed": [1-9]' results.json; then
      exit 1
    fi
```

See [Integrations Guide](./docs/integrations.md) for GitLab CI, CircleCI, and more.

## API Reference

### Test Definitions

| Function | Description |
|----------|-------------|
| `defineTest(config)` | Create a test case |
| `defineSuite(config)` | Group tests with scorers |
| `defineDataset(config)` | Create a dataset for test generation |
| `run(testOrSuite, options)` | Execute tests |

### Scorers

| Function | Description |
|----------|-------------|
| `defineScorer(config)` | Create a custom scorer |
| `exactMatch(expected)` | Exact output matching |
| `contains(strings)` | Contains strings check |
| `toolSelectionScorer()` | Validate tool calls |
| `llmJudge(config)` | LLM-based evaluation |
| `responseQualityJudge` | Pre-built quality judge |
| `safetyJudge` | Pre-built safety judge |
| `helpfulnessJudge` | Pre-built helpfulness judge |

### Cloud Sync

| Function | Description |
|----------|-------------|
| `isCloudSyncConfigured()` | Check if sync is configured |
| `syncResultsToCloud(results)` | Sync results to Neon Cloud |
| `createBackgroundSync(results)` | Non-blocking sync |

## Documentation

- [CLI Reference](./docs/cli-reference.md) - Complete command-line usage
- [Custom Scorers](./docs/custom-scorers.md) - Creating custom evaluation logic
- [Integrations](./docs/integrations.md) - CI/CD and framework integrations
- [API Reference](./docs/api-reference.md) - Complete API documentation

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | For LLM judges | Anthropic API key |
| `OPENAI_API_KEY` | Alternative | OpenAI API key |
| `NEON_API_URL` | For cloud sync | Neon Cloud API endpoint |
| `NEON_API_KEY` | For cloud sync | Neon Cloud API key |
| `NEON_PROJECT_ID` | For cloud sync | Neon Cloud project ID |

## Examples

See the [examples](./examples) directory:

- [basic.eval.ts](./examples/basic.eval.ts) - Basic test suite with scorers

## Troubleshooting

### TypeScript Files

The CLI runs JavaScript files. For TypeScript:

```bash
# Option 1: Compile first
tsc && npx neon eval "dist/**/*.eval.js"

# Option 2: Use tsx
npx tsx node_modules/@neon/sdk/src/cli/index.ts eval

# Option 3: Use bun
bun run node_modules/@neon/sdk/src/cli/index.ts eval
```

### LLM Judge Errors

Ensure `ANTHROPIC_API_KEY` is set:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

### No Tests Found

Check your file patterns:

```bash
npx neon eval --verbose
```

Test files must export a `Suite` object:

```typescript
export const suite = defineSuite({ ... });
// or
export default defineSuite({ ... });
```

## License

MIT
