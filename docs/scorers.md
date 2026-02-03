# Scorers

Neon provides specialized scorers designed for evaluating AI agents. Unlike generic LLM evaluation, these scorers understand agent-specific patterns like tool selection, reasoning chains, and grounded responses.

## Built-in Scorers

### Rule-Based Scorers

Fast, deterministic scorers that don't require LLM calls.

#### `exactMatch`

Checks for exact string or value match.

```typescript
import { exactMatch } from '@neon/sdk'

const scorer = exactMatch('expected output')
// or match any of several values
const scorer = exactMatch(['option1', 'option2'])
```

#### `contains`

Checks if output contains expected strings.

```typescript
import { contains } from '@neon/sdk'

const scorer = contains(['Paris', 'France'])
// Case-insensitive
const scorer = contains(['paris'], { caseSensitive: false })
```

#### `regex`

Pattern matching with regular expressions.

```typescript
import { regex } from '@neon/sdk'

const scorer = regex(/\d{3}-\d{4}/)  // Phone number pattern
```

#### `toolSelection`

Evaluates whether the agent selected appropriate tools.

```typescript
import { toolSelection } from '@neon/sdk'

const scorer = toolSelection({
  expected: ['web_search', 'calculator'],
  // Optional: require specific order
  strictOrder: false,
  // Optional: penalize extra tools
  penalizeExtra: true,
})
```

**Score Calculation:**
- Jaccard similarity between expected and actual tools
- Sequence similarity (LCS) if `strictOrder: true`
- Penalty for unexpected tools if `penalizeExtra: true`

#### `latency`

Measures execution time against thresholds.

```typescript
import { latency } from '@neon/sdk'

const scorer = latency({
  maxMs: 5000,      // Score 1.0 under this
  targetMs: 2000,   // Score 0.8 under this
})
```

#### `tokenEfficiency`

Evaluates token usage relative to output quality.

```typescript
import { tokenEfficiency } from '@neon/sdk'

const scorer = tokenEfficiency({
  maxTokens: 1000,
  minTokens: 50,
})
```

### LLM Judge Scorers

Use language models to evaluate subjective criteria.

#### `llmJudge`

General-purpose LLM evaluation with custom criteria.

```typescript
import { llmJudge } from '@neon/sdk'

const scorer = llmJudge({
  criteria: 'Response should be helpful, accurate, and well-structured',
  model: 'claude-3-5-sonnet',  // or 'gpt-4o', 'gemini-1.5-pro'
  // Optional: scoring rubric
  rubric: `
    1 - Completely wrong or unhelpful
    2 - Partially correct but missing key information
    3 - Correct but could be clearer
    4 - Good response with minor issues
    5 - Excellent, complete response
  `,
})
```

#### `reasoning`

Evaluates the quality of agent reasoning.

```typescript
import { reasoning } from '@neon/sdk'

const scorer = reasoning({
  model: 'claude-3-5-sonnet',
  // Evaluates:
  // - Logical coherence (0-3 points)
  // - Information usage (0-3 points)
  // - Problem decomposition (0-2 points)
  // - Completeness (0-2 points)
})
```

#### `grounding`

Evaluates whether responses are grounded in provided context.

```typescript
import { grounding } from '@neon/sdk'

const scorer = grounding({
  model: 'claude-3-5-sonnet',
  // Evaluates:
  // - Factual accuracy (0-4 points)
  // - Evidence support (0-4 points)
  // - Expected content presence (0-2 points)
})
```

#### Domain-Specific Judges

Pre-configured judges for common domains.

```typescript
import { codeReviewJudge, safetyJudge, helpfulnessJudge } from '@neon/sdk'

// Code quality evaluation
const codeScorer = codeReviewJudge({
  language: 'typescript',
  checkSecurity: true,
})

// Safety evaluation
const safetyScorer = safetyJudge({
  strictness: 'high',
})

// General helpfulness
const helpfulScorer = helpfulnessJudge()
```

## Python SDK

All scorers are available in Python with identical functionality:

```python
from neon_sdk.scorers import (
    exact_match,
    contains,
    regex,
    tool_selection,
    latency,
    llm_judge,
    reasoning,
    grounding,
)

# Rule-based
scorer = contains(["Paris", "France"], case_sensitive=False)

# LLM Judge
scorer = llm_judge(
    criteria="Response should be accurate and helpful",
    model="claude-3-5-sonnet",
)

# Tool selection
scorer = tool_selection(
    expected=["web_search"],
    strict_order=False,
)
```

## Custom Scorers

Create custom scorers by extending the base class.

**TypeScript:**
```typescript
import { BaseScorer, ScorerResult, ScorerContext } from '@neon/sdk'

class MyCustomScorer extends BaseScorer {
  name = 'my-custom-scorer'
  description = 'Evaluates custom criteria'

  async evaluate(context: ScorerContext): Promise<ScorerResult> {
    const { output, expected, trace } = context

    // Your scoring logic
    const score = calculateScore(output)

    return {
      score,
      reason: 'Custom evaluation passed',
      evidence: ['Detail 1', 'Detail 2'],
    }
  }
}

// Use in tests
defineTest(suite, {
  name: 'my-test',
  scorers: [new MyCustomScorer()],
})
```

**Python:**
```python
from neon_sdk.scorers.base import BaseScorer, ScorerResult

class MyCustomScorer(BaseScorer):
    name = "my-custom-scorer"
    description = "Evaluates custom criteria"

    async def evaluate(self, context) -> ScorerResult:
        output = context.output

        # Your scoring logic
        score = calculate_score(output)

        return ScorerResult(
            score=score,
            reason="Custom evaluation passed",
            evidence=["Detail 1", "Detail 2"],
        )
```

## Combining Scorers

Use multiple scorers for comprehensive evaluation:

```typescript
defineTest(suite, {
  name: 'comprehensive-test',
  scorers: [
    // Fast rule-based checks
    contains(['expected', 'keywords']),
    toolSelection({ expected: ['search'] }),
    latency({ maxMs: 5000 }),

    // Deeper LLM evaluation
    llmJudge({ criteria: 'Response quality' }),
    reasoning(),
  ],
  // Minimum average score across all scorers
  minScore: 0.8,
})
```

## Score Aggregation

When multiple scorers are used, scores are aggregated:

| Strategy | Description |
|----------|-------------|
| `mean` (default) | Average of all scores |
| `min` | Lowest score (strictest) |
| `max` | Highest score (most lenient) |
| `weighted` | Custom weights per scorer |

```typescript
defineTest(suite, {
  name: 'weighted-test',
  scorers: [
    { scorer: contains(['key']), weight: 0.3 },
    { scorer: llmJudge({ criteria: '...' }), weight: 0.7 },
  ],
  aggregation: 'weighted',
})
```

## Score Interpretation

| Score | Interpretation |
|-------|----------------|
| 0.9 - 1.0 | Excellent — Agent performed optimally |
| 0.7 - 0.9 | Good — Minor issues, generally acceptable |
| 0.5 - 0.7 | Fair — Significant issues needing attention |
| 0.0 - 0.5 | Poor — Major failures requiring investigation |

## Best Practices

1. **Start with rule-based scorers** — They're fast and deterministic
2. **Use LLM judges for subjective criteria** — Reasoning quality, helpfulness
3. **Combine multiple scorers** — Cover different failure modes
4. **Set appropriate thresholds** — Higher for critical paths, lower for experiments
5. **Cache LLM judge results** — Avoid redundant API calls in CI
