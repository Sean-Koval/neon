# Creating Custom Scorers

Scorers evaluate agent outputs and return a score between 0 and 1. This guide shows how to create custom scorers for your specific evaluation needs.

## Scorer Basics

A scorer is a function that evaluates an agent's output and returns a score result:

```typescript
import { defineScorer, type EvalContext, type ScoreResult } from '@neon/sdk';

const myScorer = defineScorer({
  name: 'my-scorer',
  description: 'Evaluates something specific',
  dataType: 'numeric', // 'numeric' | 'categorical' | 'boolean'
  evaluate: async (context: EvalContext): Promise<ScoreResult> => {
    // Your scoring logic here
    return {
      value: 0.85,
      reason: 'Explanation of the score',
    };
  },
});
```

## The EvalContext Object

The `evaluate` function receives an `EvalContext` with all the information about the test:

```typescript
interface EvalContext {
  // The trace containing all spans
  trace: {
    trace: {
      traceId: string;
      name: string;
      status: 'ok' | 'error';
      durationMs: number;
      metadata: Record<string, unknown>;
    };
    spans: Array<{
      spanId: string;
      name: string;
      spanType: 'span' | 'generation' | 'tool' | 'retrieval' | 'event';
      input: string;
      output: string;
      toolName?: string;
      toolInput?: string;
      toolOutput?: string;
      model?: string;
      durationMs: number;
    }>;
  };

  // Expected values from the test definition
  expected?: {
    output?: string;
    outputContains?: string[];
    toolCalls?: string[];
  };

  // Additional metadata from the test
  metadata?: Record<string, unknown>;

  // Test and suite configuration
  config?: {
    timeout?: number;
    threshold?: number;
  };
}
```

## The ScoreResult Object

Return a `ScoreResult` from your scorer:

```typescript
interface ScoreResult {
  // Score value between 0 and 1
  value: number;

  // Optional explanation
  reason?: string;

  // Optional metadata
  metadata?: Record<string, unknown>;
}
```

## Simple Examples

### Word Count Scorer

Scores based on response length:

```typescript
const wordCountScorer = defineScorer({
  name: 'word_count',
  description: 'Evaluates response length',
  dataType: 'numeric',
  evaluate: async (context) => {
    const output = getLastOutput(context);
    const wordCount = output.split(/\s+/).filter(Boolean).length;

    // Score 1.0 for 50-200 words, less for shorter or longer
    let score: number;
    if (wordCount < 20) {
      score = wordCount / 20;
    } else if (wordCount <= 200) {
      score = 1.0;
    } else {
      score = Math.max(0, 1 - (wordCount - 200) / 300);
    }

    return {
      value: score,
      reason: `Response has ${wordCount} words`,
      metadata: { wordCount },
    };
  },
});

// Helper to get the last output
function getLastOutput(context: EvalContext): string {
  const generations = context.trace.spans.filter(s => s.spanType === 'generation');
  return generations[generations.length - 1]?.output || '';
}
```

### Regex Match Scorer

Scores based on pattern matching:

```typescript
function regexScorer(pattern: RegExp, options?: { name?: string }): Scorer {
  return defineScorer({
    name: options?.name || 'regex_match',
    description: `Matches pattern: ${pattern.source}`,
    dataType: 'boolean',
    evaluate: async (context) => {
      const output = getLastOutput(context);
      const matches = pattern.test(output);

      return {
        value: matches ? 1 : 0,
        reason: matches ? 'Pattern matched' : 'Pattern not found',
      };
    },
  });
}

// Usage
const emailScorer = regexScorer(/\b[\w.-]+@[\w.-]+\.\w+\b/, { name: 'has_email' });
```

### Sentiment Scorer

Scores based on positive/negative words:

```typescript
const sentimentScorer = defineScorer({
  name: 'sentiment',
  description: 'Evaluates response sentiment',
  dataType: 'numeric',
  evaluate: async (context) => {
    const output = getLastOutput(context).toLowerCase();

    const positiveWords = ['great', 'excellent', 'good', 'helpful', 'thanks'];
    const negativeWords = ['bad', 'terrible', 'wrong', 'error', 'fail'];

    const positiveCount = positiveWords.filter(w => output.includes(w)).length;
    const negativeCount = negativeWords.filter(w => output.includes(w)).length;

    const total = positiveCount + negativeCount;
    if (total === 0) return { value: 0.5, reason: 'Neutral sentiment' };

    const score = positiveCount / total;
    return {
      value: score,
      reason: `Sentiment: ${score > 0.5 ? 'positive' : 'negative'}`,
      metadata: { positiveCount, negativeCount },
    };
  },
});
```

## Advanced Examples

### Async External API Scorer

Call external APIs for evaluation:

```typescript
const factCheckScorer = defineScorer({
  name: 'fact_check',
  description: 'Verifies facts using external API',
  dataType: 'numeric',
  evaluate: async (context) => {
    const output = getLastOutput(context);

    try {
      const response = await fetch('https://api.factcheck.example/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: output }),
      });

      const result = await response.json();
      return {
        value: result.accuracy,
        reason: result.explanation,
        metadata: { claims: result.claims },
      };
    } catch (error) {
      return {
        value: 0,
        reason: `Fact check failed: ${error.message}`,
      };
    }
  },
});
```

### Tool Validation Scorer

Validates tool call parameters:

```typescript
const toolParamScorer = defineScorer({
  name: 'tool_params',
  description: 'Validates tool call parameters',
  dataType: 'numeric',
  evaluate: async (context) => {
    const toolCalls = context.trace.spans.filter(s => s.spanType === 'tool');

    if (toolCalls.length === 0) {
      return { value: 0, reason: 'No tool calls found' };
    }

    let validCount = 0;
    const issues: string[] = [];

    for (const call of toolCalls) {
      const params = JSON.parse(call.toolInput || '{}');

      // Example: validate search tool has query parameter
      if (call.toolName === 'search' && !params.query) {
        issues.push('search: missing query parameter');
      } else {
        validCount++;
      }
    }

    const score = validCount / toolCalls.length;
    return {
      value: score,
      reason: issues.length ? issues.join('; ') : 'All tool calls valid',
    };
  },
});
```

### Composite Scorer

Combine multiple scorers:

```typescript
function compositeScorer(
  scorers: Array<{ scorer: Scorer; weight: number }>,
  options?: { name?: string }
): Scorer {
  const totalWeight = scorers.reduce((sum, s) => sum + s.weight, 0);

  return defineScorer({
    name: options?.name || 'composite',
    description: 'Weighted combination of scorers',
    dataType: 'numeric',
    evaluate: async (context) => {
      const results = await Promise.all(
        scorers.map(async ({ scorer, weight }) => ({
          result: await scorer.evaluate(context),
          weight,
        }))
      );

      const weightedSum = results.reduce(
        (sum, { result, weight }) => sum + result.value * weight,
        0
      );

      const finalScore = weightedSum / totalWeight;
      const reasons = results.map(
        ({ result }, i) => `${scorers[i].scorer.name}: ${result.value.toFixed(2)}`
      );

      return {
        value: finalScore,
        reason: reasons.join(', '),
        metadata: { breakdown: results.map(r => r.result) },
      };
    },
  });
}

// Usage
const qualityScorer = compositeScorer([
  { scorer: wordCountScorer, weight: 0.3 },
  { scorer: sentimentScorer, weight: 0.3 },
  { scorer: toolParamScorer, weight: 0.4 },
]);
```

## Using Custom Scorers

### In Tests

```typescript
const test = defineTest({
  name: 'my-test',
  input: { query: 'Hello' },
  scorer: myScorer, // Inline scorer
});
```

### In Suites

```typescript
const suite = defineSuite({
  name: 'my-suite',
  tests: [test1, test2],
  scorers: {
    word_count: wordCountScorer,
    sentiment: sentimentScorer,
    quality: qualityScorer,
  },
});
```

### Reference by Name

```typescript
const test = defineTest({
  name: 'my-test',
  input: { query: 'Hello' },
  scorers: ['word_count', 'sentiment'], // Reference suite scorers
});
```

## Best Practices

### 1. Handle Edge Cases

```typescript
evaluate: async (context) => {
  const output = getLastOutput(context);

  // Handle empty output
  if (!output || output.trim() === '') {
    return { value: 0, reason: 'Empty output' };
  }

  // Your scoring logic...
}
```

### 2. Provide Meaningful Reasons

```typescript
return {
  value: 0.7,
  reason: `Score 0.7: Found 3 of 4 expected keywords (missing: "temperature")`,
};
```

### 3. Use Metadata for Debugging

```typescript
return {
  value: score,
  reason: 'Evaluation complete',
  metadata: {
    input: context.trace.trace.metadata,
    outputLength: output.length,
    matchedPatterns: ['pattern1', 'pattern2'],
    processingTime: Date.now() - startTime,
  },
};
```

### 4. Make Scorers Configurable

```typescript
function createKeywordScorer(options: {
  keywords: string[];
  caseSensitive?: boolean;
  minMatch?: number;
}): Scorer {
  const { keywords, caseSensitive = false, minMatch = 1 } = options;

  return defineScorer({
    name: 'keyword_match',
    evaluate: async (context) => {
      let output = getLastOutput(context);
      let searchKeywords = keywords;

      if (!caseSensitive) {
        output = output.toLowerCase();
        searchKeywords = keywords.map(k => k.toLowerCase());
      }

      const matched = searchKeywords.filter(k => output.includes(k));
      const score = matched.length / keywords.length;

      return {
        value: score >= minMatch / keywords.length ? score : 0,
        reason: `Matched ${matched.length}/${keywords.length} keywords`,
      };
    },
  });
}
```

### 5. Handle Async Errors

```typescript
evaluate: async (context) => {
  try {
    // Async operation that might fail
    const result = await externalApi.evaluate(getLastOutput(context));
    return { value: result.score, reason: result.explanation };
  } catch (error) {
    // Return a score with error explanation, don't throw
    return {
      value: 0,
      reason: `Evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
```

## Testing Scorers

Test your scorers with mock contexts:

```typescript
import { describe, test, expect } from 'bun:test';

describe('wordCountScorer', () => {
  test('scores short responses low', async () => {
    const context = createMockContext({
      output: 'Hello world',
    });

    const result = await wordCountScorer.evaluate(context);
    expect(result.value).toBeLessThan(0.5);
  });

  test('scores optimal length responses high', async () => {
    const context = createMockContext({
      output: 'A '.repeat(100), // 100 words
    });

    const result = await wordCountScorer.evaluate(context);
    expect(result.value).toBe(1);
  });
});

function createMockContext(options: { output: string }): EvalContext {
  return {
    trace: {
      trace: {
        traceId: 'test-trace',
        name: 'test',
        status: 'ok',
        durationMs: 1000,
        metadata: {},
      },
      spans: [
        {
          spanId: 'test-span',
          name: 'generation',
          spanType: 'generation',
          input: 'test input',
          output: options.output,
          durationMs: 1000,
        },
      ],
    },
    expected: {},
    metadata: {},
  };
}
```
