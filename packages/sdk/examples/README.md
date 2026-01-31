# Neon SDK Examples

This directory contains comprehensive examples demonstrating how to use the Neon SDK for agent evaluation.

## Quick Start

```bash
# Install dependencies
cd packages/sdk
bun install

# Run all examples
npx neon eval examples/

# Run a specific example
npx neon eval examples/eval-suite/getting-started.eval.ts
```

## Example Files

### Getting Started (`eval-suite/getting-started.eval.ts`)

The simplest example to understand the basics:
- Defining tests with `defineTest`
- Creating suites with `defineSuite`
- Using built-in scorers (`exactMatch`, `contains`)
- Exporting for CLI discovery

**Best for:** First-time users learning the SDK.

```bash
npx neon eval examples/eval-suite/getting-started.eval.ts
```

### Comprehensive Example (`eval-suite/agent-eval.eval.ts`)

Full-featured example demonstrating all SDK capabilities:
- All test definition patterns
- All built-in scorers
- Custom scorers
- Inline scorers
- Datasets
- Parallel execution and timeout configuration

**Best for:** Reference implementation for production use cases.

```bash
npx neon eval examples/eval-suite/agent-eval.eval.ts
```

### Custom Scorers (`eval-suite/custom-scorers.eval.ts`)

Deep dive into creating custom evaluation logic:
- Using `defineScorer` for full control
- Using `ruleBasedScorer` for simple checks
- Factory function pattern for configurable scorers
- Accessing trace data in scorers
- Async scorers

**Best for:** Teams with domain-specific evaluation requirements.

```bash
npx neon eval examples/eval-suite/custom-scorers.eval.ts
```

### LLM Judges (`eval-suite/llm-judges.eval.ts`)

AI-powered evaluation with Claude:
- Basic LLM judge setup
- Domain-specific judges (technical, customer service, factual)
- Custom response parsers
- Pre-built judges (`responseQualityJudge`, `safetyJudge`, `helpfulnessJudge`)
- Using expected output in comparisons

**Best for:** Evaluating subjective qualities like tone, helpfulness, and accuracy.

```bash
# Requires ANTHROPIC_API_KEY
ANTHROPIC_API_KEY=your-key npx neon eval examples/eval-suite/llm-judges.eval.ts
```

### Basic Example (`basic.eval.ts`)

Minimal example showing core concepts in a single file.

```bash
npx neon eval examples/basic.eval.ts
```

## CLI Options

```bash
npx neon eval [patterns...] [options]

Options:
  --filter <pattern>    Filter tests by name (string or regex)
  --parallel <number>   Number of tests to run in parallel (default: 1)
  --timeout <ms>        Timeout per test in milliseconds (default: 60000)
  --format <type>       Output format: console | json (default: console)
  --verbose             Show verbose output
  --cwd <path>          Working directory (default: current directory)
  --no-sync             Disable cloud sync
```

### Examples

```bash
# Run all evals in examples directory
npx neon eval examples/

# Run with filter
npx neon eval examples/ --filter "weather"

# Run in parallel
npx neon eval examples/ --parallel 5

# JSON output for CI/CD
npx neon eval examples/ --format json

# Verbose mode for debugging
npx neon eval examples/ --verbose

# Custom timeout
npx neon eval examples/ --timeout 120000
```

## Creating Your Own Eval

1. Create a file ending in `.eval.ts` (or `.eval.js`)

2. Define tests:
```typescript
import { defineTest } from "@neon/sdk";

const myTest = defineTest({
  name: "my-test",
  input: { query: "Hello" },
  expected: { outputContains: ["hello"] },
});
```

3. Create a suite:
```typescript
import { defineSuite, contains } from "@neon/sdk";

export const mySuite = defineSuite({
  name: "my-suite",
  tests: [myTest],
  scorers: {
    check: contains(),
  },
});
```

4. Export default:
```typescript
export default mySuite;
```

5. Run:
```bash
npx neon eval path/to/my-file.eval.ts
```

## Built-in Scorers Reference

### Rule-Based (Deterministic)

| Scorer | Description |
|--------|-------------|
| `exactMatch(expected?)` | Checks for exact string match |
| `contains(expected?)` | Checks if output contains string(s) |
| `toolSelectionScorer(tools?)` | Verifies expected tools were called |
| `jsonMatchScorer(expected?)` | Validates JSON structure |
| `latencyScorer(thresholds?)` | Scores based on execution time |
| `successScorer()` | Checks if trace completed successfully |
| `errorRateScorer()` | Scores based on span error rate |
| `tokenEfficiencyScorer(thresholds?)` | Scores based on token usage |
| `iterationScorer(max?)` | Penalizes excessive LLM iterations |

### LLM Judges (AI-Powered)

| Scorer | Description |
|--------|-------------|
| `llmJudge(config)` | Custom LLM evaluation |
| `responseQualityJudge` | Pre-built quality evaluator |
| `safetyJudge` | Pre-built safety checker |
| `helpfulnessJudge` | Pre-built helpfulness evaluator |

## Test Definition Reference

```typescript
interface Test {
  name: string;                    // Unique test identifier
  input: Record<string, unknown>;  // Passed to your agent
  expected?: {
    output?: string;               // For exact match
    outputContains?: string[];     // For contains check
    toolCalls?: string[];          // For tool verification
    [key: string]: unknown;        // Custom expected values
  };
  scorers?: string[];              // Named scorers from suite
  scorer?: Scorer | InlineScorer;  // Inline scorer function
  timeout?: number;                // Per-test timeout (ms)
}
```

## Suite Configuration Reference

```typescript
interface Suite {
  name: string;
  tests: Test[];
  datasets?: Dataset[];
  scorers?: Record<string, Scorer>;
  config?: {
    parallel?: number;    // Concurrent tests (default: 1)
    timeout?: number;     // Suite timeout (default: 300000)
    agentId?: string;     // Tag for tracking
    agentVersion?: string;
  };
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Required for LLM judges |
| `NEON_API_KEY` | Optional: Enable cloud sync |

## Need Help?

- Check the [SDK README](../README.md) for API documentation
- See [docs/](../../docs/) for architecture and design docs
- File issues at the GitHub repository
