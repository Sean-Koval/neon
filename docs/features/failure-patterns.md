# Failure Pattern Detection

Neon's Failure Pattern Detection feature uses ML-based techniques to automatically identify recurring failure signatures in your agent traces. This helps you understand common failure modes, detect regressions, and prioritize fixes based on failure frequency.

## Overview

When agents fail, they often fail in predictable ways. The pattern detector:

1. **Extracts features** from failed spans (error messages, component types, tool names)
2. **Clusters similar failures** using token-based or semantic similarity
3. **Generates pattern signatures** for matching across traces
4. **Provides scorers** for evaluating pattern diversity and concentration

## Quick Start

```typescript
import {
  detectPatterns,
  patternDiversityScorer,
  patternConcentrationScorer,
} from '@neon/sdk';

// Detect patterns in a trace
const result = detectPatterns(evalContext);
console.log(result.patterns);      // Array of FailurePattern
console.log(result.topPattern);    // Most frequent pattern
console.log(result.summary);       // Human-readable summary

// Use as scorers in your test suite
const suite = defineSuite({
  name: 'Agent Reliability',
  scorers: [
    patternDiversityScorer(),      // High = varied failures (good)
    patternConcentrationScorer(),  // High = distributed (good)
  ],
  tests: [/* ... */],
});
```

## Core API

### detectPatterns()

Synchronous pattern detection using token-based similarity.

```typescript
function detectPatterns(
  input: EvalContext | SpanWithChildren[],
  config?: PatternDetectorConfig
): PatternAnalysisResult;
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `input` | `EvalContext \| SpanWithChildren[]` | Evaluation context or array of spans to analyze |
| `config` | `PatternDetectorConfig` | Optional configuration for detection |

**Returns:** `PatternAnalysisResult`

```typescript
interface PatternAnalysisResult {
  patterns: FailurePattern[];     // Detected patterns, sorted by frequency
  totalFailures: number;          // Total failed spans analyzed
  uniquePatterns: number;         // Number of unique patterns found
  topPattern: FailurePattern | null;  // Most frequent pattern
  summary: string;                // Human-readable summary
  unclusteredCount: number;       // Spans that couldn't be clustered
}
```

**Example:**

```typescript
const result = detectPatterns(evalContext, {
  minFrequency: 3,           // At least 3 occurrences to be a pattern
  similarityThreshold: 0.6,  // Stricter clustering
  maxPatterns: 5,            // Return top 5 patterns
});

if (result.topPattern) {
  console.log(`Most common: ${result.topPattern.name}`);
  console.log(`Frequency: ${result.topPattern.frequency}x`);
  console.log(`Category: ${result.topPattern.category}`);
}
```

### detectPatternsAsync()

Asynchronous pattern detection with embedding-based semantic similarity.

```typescript
async function detectPatternsAsync(
  input: EvalContext | SpanWithChildren[],
  config?: PatternDetectorConfig
): Promise<PatternAnalysisResult>;
```

Use this when you need more accurate semantic matching. Errors like "Connection refused" and "Cannot reach server" will be correctly identified as similar even though they share no tokens.

**Example with OpenAI embeddings:**

```typescript
import OpenAI from 'openai';

const openai = new OpenAI();

const embedFn = async (texts: string[]) => {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
  });
  return response.data.map(d => d.embedding);
};

const result = await detectPatternsAsync(evalContext, {
  similarityMethod: 'embedding',
  embeddingFn: embedFn,
  cacheEmbeddings: true,  // Cache to avoid redundant API calls
});
```

**Example with local embeddings (Transformers.js):**

```typescript
import { pipeline } from '@xenova/transformers';

// Load model once
const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

const embedFn = async (texts: string[]) => {
  const results = await extractor(texts, { pooling: 'mean', normalize: true });
  return results.tolist();
};

const result = await detectPatternsAsync(evalContext, {
  similarityMethod: 'embedding',
  embeddingFn: embedFn,
});
```

## Configuration

### PatternDetectorConfig

```typescript
interface PatternDetectorConfig {
  /** Minimum occurrences to be considered a pattern. Default: 2 */
  minFrequency?: number;

  /** Similarity threshold (0-1) for clustering. Default: 0.5 */
  similarityThreshold?: number;

  /** Maximum patterns to return. Default: 10 */
  maxPatterns?: number;

  /** Maximum example span IDs per pattern. Default: 5 */
  maxExamples?: number;

  /** Custom error category rules */
  customCategories?: Array<{ pattern: RegExp; category: ErrorCategory }>;

  /** Similarity method: "token" (fast) or "embedding" (semantic). Default: "token" */
  similarityMethod?: 'token' | 'embedding';

  /** Embedding function for semantic similarity (required for "embedding" mode) */
  embeddingFn?: EmbeddingFunction;

  /** Cache embeddings to avoid recomputing. Default: true */
  cacheEmbeddings?: boolean;
}
```

### Custom Error Categories

Add custom rules to categorize domain-specific errors:

```typescript
const result = detectPatterns(evalContext, {
  customCategories: [
    { pattern: /stripe.*payment/i, category: 'client_error' },
    { pattern: /openai.*rate.*limit/i, category: 'rate_limit' },
    { pattern: /database.*deadlock/i, category: 'server_error' },
  ],
});
```

Custom categories are checked before built-in categories.

## Error Categories

The detector automatically categorizes errors into these categories:

| Category | Example Patterns |
|----------|-----------------|
| `timeout` | "timeout", "timed out", "deadline exceeded" |
| `connection` | "connect", "ECONNREFUSED", "network error" |
| `rate_limit` | "rate limit", "too many requests", "quota" |
| `authentication` | "auth failed", "invalid token", "api key" |
| `authorization` | "forbidden", "permission denied", "403" |
| `validation` | "invalid input", "malformed", "required field" |
| `not_found` | "not found", "404", "does not exist" |
| `server_error` | "500", "internal server error", "503" |
| `client_error` | "400", "bad request" |
| `parse_error` | "JSON.parse", "syntax error" |
| `configuration` | "config error", "not configured" |
| `dependency` | "cannot find module", "require failed" |
| `resource_exhausted` | "out of memory", "disk full" |
| `unknown` | Everything else |

## FailurePattern Type

```typescript
interface FailurePattern {
  signature: string;              // Unique hash for this pattern
  name: string;                   // Human-readable name (auto-generated)
  messagePattern: string;         // Normalized error message pattern
  category: ErrorCategory;        // Error category
  componentTypes: ComponentType[]; // Components where this appears
  toolNames: string[];            // Associated tools
  spanTypes: SpanType[];          // Span types affected
  frequency: number;              // Number of occurrences
  firstSeen: Date;                // First occurrence
  lastSeen: Date;                 // Most recent occurrence
  exampleSpanIds: string[];       // Example span IDs
  confidence: number;             // Cluster cohesion (0-1)
}
```

## Pattern Matching

Match new failures against known patterns:

```typescript
import { matchesPattern, findMatchingPatterns } from '@neon/sdk';

// Check if a span matches a known pattern
const matches = matchesPattern(span, knownPattern, 0.8);

// Find all matching patterns for a span
const matchedPatterns = findMatchingPatterns(span, knownPatterns, 0.8);
for (const { pattern, similarity } of matchedPatterns) {
  console.log(`Matches "${pattern.name}" (${similarity.toFixed(2)} similarity)`);
}
```

## Scorers

### patternDiversityScorer()

Measures how diverse the failure patterns are. High score means failures are varied (different issues), low score means failures are repetitive (same issue recurring).

```typescript
const scorer = patternDiversityScorer({
  minFrequency: 2,
  similarityThreshold: 0.5,
});

// Score: 0.0 (all same pattern) to 1.0 (all unique)
const result = scorer.evaluate(context);
```

### patternConcentrationScorer()

Measures concentration in the top failure pattern. High score means failures are spread across patterns (no single dominant issue), low score means failures are concentrated (major recurring issue).

```typescript
const scorer = patternConcentrationScorer();

// Score: 0.0 (all same pattern) to 1.0 (evenly distributed)
const result = scorer.evaluate(context);
```

### novelPatternScorer()

Detects novel failure patterns not matching known patterns. Useful for catching new/unexpected failure modes.

```typescript
import { novelPatternScorer } from '@neon/sdk';

// Track known patterns from previous runs
const knownPatterns = await loadKnownPatterns();

const scorer = novelPatternScorer(knownPatterns, {
  matchThreshold: 0.8,  // How similar to consider a "match"
});

// Score: 0.0 (all novel) to 1.0 (all known)
const result = scorer.evaluate(context);
// result.reason contains details about novel failures
```

### patternAnalysisDetailedScorer()

Returns full pattern analysis as JSON in the reason field. Useful for debugging and detailed reports.

```typescript
const scorer = patternAnalysisDetailedScorer();
const result = scorer.evaluate(context);

const analysis = JSON.parse(result.reason);
console.log(analysis.patterns);
```

## Helper Functions

### normalizeErrorMessage()

Strips dynamic values from error messages for better grouping:

```typescript
import { normalizeErrorMessage } from '@neon/sdk';

const raw = "User abc-123-def not found at 2024-01-15T10:30:00Z";
const normalized = normalizeErrorMessage(raw);
// "User <UUID> not found at <TIMESTAMP>"
```

Replacements:
- UUIDs -> `<UUID>`
- Timestamps -> `<TIMESTAMP>`
- URLs -> `<URL>`
- IP addresses -> `<IP>`
- Email addresses -> `<EMAIL>`
- Hex strings -> `<HEX>`
- File paths -> `<PATH>`
- Numeric IDs (4+ digits) -> `<ID>`

### categorizeError()

Categorize an error message:

```typescript
import { categorizeError } from '@neon/sdk';

const category = categorizeError("Connection timeout after 30s");
// "timeout"

// With custom categories
const category = categorizeError(message, [
  { pattern: /stripe/i, category: 'client_error' },
]);
```

### extractFailureFeatures()

Extract structured features from a failed span:

```typescript
import { extractFailureFeatures } from '@neon/sdk';

const features = extractFailureFeatures(span);
console.log(features.errorCategory);    // "timeout"
console.log(features.normalizedMessage); // "<URL> timed out"
console.log(features.toolName);          // "http_request"
```

## Embedding Functions

When using embedding-based similarity, you provide an embedding function:

```typescript
type EmbeddingFunction = (texts: string[]) => Promise<number[][]>;
```

The function receives an array of text strings and should return an array of embedding vectors (arrays of numbers).

### Embedding Index

For batch processing, use the `EmbeddingIndex` class to pre-compute embeddings:

```typescript
import { EmbeddingIndex, cosineSimilarity } from '@neon/sdk';

// Build index from all error messages
const messages = spans.map(s => s.statusMessage).filter(Boolean);
const index = await EmbeddingIndex.build(messages, embedFn, true /* cache */);

// Fast similarity lookups
const similarity = index.getSimilarity(message1, message2);
```

### Cache Management

The SDK maintains a global LRU cache for embeddings (max 10,000 entries):

```typescript
import {
  clearEmbeddingCache,
  getEmbeddingCacheSize
} from '@neon/sdk';

console.log(`Cache size: ${getEmbeddingCacheSize()}`);
clearEmbeddingCache();  // Clear when switching models
```

## Use Cases

### 1. Regression Detection

Track known patterns and alert on new failure types:

```typescript
const knownPatterns = await loadFromDatabase();
const result = detectPatterns(newTrace);

for (const pattern of result.patterns) {
  const isNew = !knownPatterns.some(
    kp => kp.signature === pattern.signature
  );
  if (isNew) {
    await alertNewFailurePattern(pattern);
    await savePattern(pattern);
  }
}
```

### 2. Root Cause Analysis

Group failures by category to prioritize fixes:

```typescript
const result = detectPatterns(traces);
const byCategory = result.patterns.reduce((acc, p) => {
  acc[p.category] = acc[p.category] || [];
  acc[p.category].push(p);
  return acc;
}, {});

console.log('Failures by category:');
for (const [category, patterns] of Object.entries(byCategory)) {
  const total = patterns.reduce((sum, p) => sum + p.frequency, 0);
  console.log(`  ${category}: ${total} failures across ${patterns.length} patterns`);
}
```

### 3. Test Suite Health

Add pattern scorers to your test suite:

```typescript
const suite = defineSuite({
  name: 'Production Agent',
  scorers: [
    patternDiversityScorer(),
    novelPatternScorer(previouslySeenPatterns),
  ],
  assertions: [
    // Fail if failures are too concentrated (single recurring issue)
    (context) => ({
      name: 'Pattern Diversity',
      pass: patternConcentrationScorer().evaluate(context).value > 0.5,
    }),
  ],
  tests: [/* ... */],
});
```

### 4. Monitoring Dashboard

Export pattern data for visualization:

```typescript
const result = detectPatterns(traces);

const dashboardData = {
  totalFailures: result.totalFailures,
  uniquePatterns: result.uniquePatterns,
  topPatterns: result.patterns.slice(0, 5).map(p => ({
    name: p.name,
    frequency: p.frequency,
    category: p.category,
    trend: calculateTrend(p, previousResults),
  })),
  categoryBreakdown: result.patterns.reduce((acc, p) => {
    acc[p.category] = (acc[p.category] || 0) + p.frequency;
    return acc;
  }, {}),
};
```

## Best Practices

1. **Start with token-based similarity** - It's fast and works well for most cases. Switch to embeddings only if you see semantic mismatches.

2. **Set appropriate thresholds** - Start with defaults and adjust based on your data. Lower `similarityThreshold` for stricter grouping.

3. **Use custom categories** - Add domain-specific patterns for better categorization.

4. **Cache embeddings** - When using embedding-based similarity, enable caching to avoid redundant API calls.

5. **Monitor pattern evolution** - Track patterns over time to detect regressions and improvements.

6. **Combine with other scorers** - Pattern scorers work best alongside functional scorers.

## Related

- [Test Suites](../test-suites.md) - Define test suites with pattern scorers
- [Scorers](../scorers.md) - Custom scorer development
- [Breakpoints](./breakpoints.md) - Debug specific failure patterns
