# Test Suites

Test suites define the expected behaviors of your agent. They organize test cases with inputs, expected outputs, and scoring criteria.

## Defining Suites

**TypeScript:**
```typescript
import { defineSuite, defineTest, defineDataset } from '@neon/sdk'

const suite = defineSuite({
  name: 'core-tests',
  description: 'Core agent functionality tests',
  defaultScorers: [contains, toolSelection, llmJudge({ criteria: '...' })],
  defaultMinScore: 0.7,
  parallel: true,
})
```

**Python:**
```python
from neon_sdk import define_suite

suite = define_suite(
    name="core-tests",
    description="Core agent functionality tests",
    default_scorers=[contains, tool_selection],
    default_min_score=0.7,
    parallel=True,
)
```

## Test Cases

### Basic Test

```typescript
defineTest(suite, {
  name: 'simple-query',
  description: 'Test basic question answering',
  input: {
    query: 'What is 2 + 2?',
  },
  expected: {
    contains: ['4'],
  },
  minScore: 0.8,
})
```

### Tool Expectations

```typescript
// Expect specific tools (order-independent)
defineTest(suite, {
  name: 'search-task',
  input: { query: 'Find the latest news about AI' },
  expectedTools: ['web_search'],
})

// Expect tools in specific order
defineTest(suite, {
  name: 'multi-step-task',
  input: { query: 'Research and summarize topic X' },
  expectedToolSequence: ['web_search', 'web_search', 'summarize'],
})

// Expect NO tools
defineTest(suite, {
  name: 'simple-math',
  input: { query: 'What is 5 * 5?' },
  expectedTools: [],  // Empty = no tools should be called
})
```

### Output Validation

```typescript
// Check for specific strings
defineTest(suite, {
  name: 'factual-check',
  input: { query: 'What is the capital of Japan?' },
  expected: {
    contains: ['Tokyo', 'Japan'],
  },
})

// Use regex pattern
defineTest(suite, {
  name: 'format-check',
  input: { query: 'List three items' },
  expected: {
    pattern: /1\..+2\..+3\./,
  },
})
```

### With Context

```typescript
defineTest(suite, {
  name: 'with-context',
  input: {
    query: 'Summarize this document',
    context: {
      document: 'Long document text here...',
      format: 'bullet_points',
    },
  },
  config: {
    maxTokens: 500,
  },
})
```

### Tags for Organization

```typescript
defineTest(suite, {
  name: 'edge-case-1',
  tags: ['edge-case', 'search', 'regression-v1.2'],
  // ...
})

defineTest(suite, {
  name: 'critical-feature',
  tags: ['critical', 'p0'],
  // ...
})

// Run only specific tags
// neon eval run core-tests --tags critical
```

## Datasets

Define reusable datasets for data-driven testing:

```typescript
const dataset = defineDataset({
  name: 'weather-queries',
  cases: [
    { input: { query: 'Weather in Tokyo?' }, expected: { contains: ['Tokyo'] } },
    { input: { query: 'Weather in Paris?' }, expected: { contains: ['Paris'] } },
    { input: { query: 'Weather in NYC?' }, expected: { contains: ['New York'] } },
  ],
})

// Use dataset in suite
defineSuite({
  name: 'weather-tests',
  dataset: dataset,
  defaultScorers: [contains, toolSelection({ expected: ['weather_api'] })],
})
```

## Best Practices

### 1. Cover Failure Modes

Test common agent failure modes:

```typescript
// Tool selection errors
defineTest(suite, {
  name: 'wrong-tool',
  description: "Shouldn't use search for simple math",
  input: { query: 'What is 10 / 2?' },
  expectedTools: [],  // Should NOT call search
})

// Hallucination check
defineTest(suite, {
  name: 'grounded-response',
  input: {
    query: 'What did the document say about X?',
    context: { document: 'The document mentions Y and Z' },
  },
  expected: {
    contains: ['Y', 'Z'],
    // Should NOT contain X if not in document
  },
  scorers: [grounding()],
})
```

### 2. Use Meaningful Names

```typescript
// Good
defineTest(suite, { name: 'search-factual-current-events' })
defineTest(suite, { name: 'no-tool-simple-arithmetic' })
defineTest(suite, { name: 'multi-step-research-comparison' })

// Bad
defineTest(suite, { name: 'test1' })
defineTest(suite, { name: 'case_a' })
```

### 3. Set Appropriate Thresholds

```typescript
// Critical functionality - high threshold
defineTest(suite, {
  name: 'critical-feature',
  minScore: 0.9,
})

// Experimental feature - lower threshold
defineTest(suite, {
  name: 'experimental-feature',
  minScore: 0.6,
})

// Uses suite default (0.7)
defineTest(suite, {
  name: 'standard-feature',
})
```

### 4. Include Regression Tests

When you fix a bug, add a test case:

```typescript
defineTest(suite, {
  name: 'regression-issue-123',
  description: 'Fixed in v1.2 - agent was calling wrong tool',
  input: { query: 'The specific query that caused the bug' },
  expectedTools: ['correct_tool'],
  tags: ['regression', 'issue-123'],
})
```

## Suite Organization

Organize suites by concern:

```
evals/
├── core.eval.ts          # Core functionality
├── regression.eval.ts    # Regression tests
├── edge-cases.eval.ts    # Edge cases
├── performance.eval.ts   # Performance-sensitive tests
└── integration.eval.ts   # Integration tests
```

Each file exports a suite:

```typescript
// evals/core.eval.ts
import { defineSuite, defineTest } from '@neon/sdk'

export const coreSuite = defineSuite({
  name: 'core-tests',
  // ...
})

defineTest(coreSuite, { /* ... */ })
defineTest(coreSuite, { /* ... */ })
```

## Running Tests

```bash
# Run all tests in a suite
bun run eval --suite core-tests

# Run specific tags
bun run eval --suite core-tests --tags critical

# Run with verbose output
bun run eval --suite core-tests --verbose

# Compare against baseline
bun run eval --suite core-tests --compare baseline-run-id
```

## Python Equivalent

```python
from neon_sdk import define_suite, define_test, define_dataset
from neon_sdk.scorers import contains, tool_selection, grounding

suite = define_suite(
    name="core-tests",
    description="Core agent functionality tests",
    default_min_score=0.7,
)

define_test(
    suite,
    name="search-task",
    input={"query": "Find the latest news about AI"},
    expected_tools=["web_search"],
)

define_test(
    suite,
    name="grounded-response",
    input={
        "query": "What did the document say?",
        "context": {"document": "The document mentions Y and Z"},
    },
    expected={"contains": ["Y", "Z"]},
    scorers=[grounding()],
)
```
