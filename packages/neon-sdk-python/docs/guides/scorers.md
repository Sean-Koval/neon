# Scorers Guide

Scorers evaluate agent performance by analyzing traces and outputs. The Neon SDK provides rule-based scorers, LLM-powered judges, and causal analysis tools.

## Overview

All scorers implement a common interface:

```python
from neon_sdk.scorers import EvalContext, ScoreResult

class Scorer:
    def evaluate(self, context: EvalContext) -> ScoreResult:
        ...
```

The `EvalContext` contains:
- `input`: The input to your agent
- `output`: The agent's output
- `expected`: Expected output (optional)
- `trace`: The full trace data (optional)

The `ScoreResult` contains:
- `value`: Numeric score (typically 0-1)
- `reason`: Human-readable explanation
- `metadata`: Additional data (optional)

## Rule-Based Scorers

Deterministic scorers that don't require LLM calls.

### Contains Scorer

Check if output contains specific strings:

```python
from neon_sdk.scorers import contains, ContainsConfig

# Simple usage
scorer = contains("hello")
scorer = contains(["hello", "world"])

# With configuration
scorer = contains(ContainsConfig(
    expected=["error", "warning"],
    match_all=False,  # OR mode (default is AND)
    case_sensitive=True,
))

result = scorer.evaluate(EvalContext(
    output="Hello, World!"
))
print(result.value)   # 1.0 or 0.0
print(result.reason)  # "Found: 'hello', 'world'"
```

### Exact Match Scorer

Check for exact output match:

```python
from neon_sdk.scorers import exact_match, ExactMatchConfig

# Simple usage
scorer = exact_match("expected output")

# With configuration
scorer = exact_match(ExactMatchConfig(
    expected="Hello World",
    case_sensitive=False,
    normalize_whitespace=True,
))

result = scorer.evaluate(EvalContext(
    output="  hello   world  "
))
print(result.value)  # 1.0
```

### Tool Selection Scorer

Verify expected tools were called:

```python
from neon_sdk.scorers import tool_selection_scorer

scorer = tool_selection_scorer(["search", "calculate"])

result = scorer.evaluate(EvalContext(
    trace=trace_with_tool_spans,
))
print(result.value)   # 1.0 if all tools called
print(result.reason)  # "All expected tools called: search, calculate"
```

### JSON Match Scorer

Check if output matches JSON structure:

```python
from neon_sdk.scorers import json_match_scorer

scorer = json_match_scorer({
    "status": "success",
    "data": {"type": "user"},
})

result = scorer.evaluate(EvalContext(
    output='{"status": "success", "data": {"type": "user", "id": 123}}'
))
```

### Latency Scorer

Score based on execution time:

```python
from neon_sdk.scorers import latency_scorer, LatencyThresholds

scorer = latency_scorer(LatencyThresholds(
    excellent=500,    # < 500ms = 1.0
    good=2000,        # < 2000ms = 0.8
    acceptable=5000,  # < 5000ms = 0.5
))

result = scorer.evaluate(EvalContext(trace=trace))
print(result.value)   # 0.8
print(result.reason)  # "Latency: 1200ms (good)"
```

### Other Rule-Based Scorers

```python
from neon_sdk.scorers import (
    error_rate_scorer,       # Score based on error spans
    token_efficiency_scorer, # Score based on token usage
    success_scorer,          # Check if trace completed successfully
    iteration_scorer,        # Score based on iteration count
)
```

## LLM Judge Scorers

Use an LLM to evaluate agent performance.

### Custom LLM Judge

```python
from neon_sdk.scorers import llm_judge, LLMJudgeConfig

scorer = llm_judge(LLMJudgeConfig(
    prompt='''Rate the response quality from 0 to 1.

    User Query: {{input}}
    Agent Response: {{output}}

    Consider:
    - Accuracy
    - Helpfulness
    - Clarity

    Return JSON: {"score": <0-1>, "reason": "<explanation>"}''',
    model='claude-3-haiku-20240307',
))

result = await scorer.evaluate(EvalContext(
    input={"query": "What is Python?"},
    output="Python is a high-level programming language...",
))
```

### Template Variables

Available variables in prompts:
- `{{input}}`: The input data
- `{{output}}`: The agent's output
- `{{expected}}`: Expected output (if provided)
- `{{trace}}`: Trace summary (if provided)

### Custom Response Parser

```python
scorer = llm_judge(LLMJudgeConfig(
    prompt='Is this response helpful? Answer YES or NO.',
    model='claude-3-haiku-20240307',
    parse_response=lambda text: 1.0 if 'YES' in text.upper() else 0.0,
))
```

### Pre-Built Judges

```python
from neon_sdk.scorers import (
    response_quality_judge,
    safety_judge,
    helpfulness_judge,
)

# Use directly
result = await response_quality_judge.evaluate(context)
result = await safety_judge.evaluate(context)
result = await helpfulness_judge.evaluate(context)
```

## Causal Analysis Scorers

Analyze error propagation and identify root causes.

```python
from neon_sdk.scorers import (
    causal_analysis_scorer,
    root_cause_scorer,
    analyze_causality,
    CausalAnalysisConfig,
)

# Basic causal analysis
scorer = causal_analysis_scorer()

# With custom weights
scorer = causal_analysis_scorer(CausalAnalysisConfig(
    root_cause_weight=0.6,
    chain_completeness_weight=0.3,
    error_rate_weight=0.1,
))

result = scorer.evaluate(EvalContext(trace=trace))
print(result.reason)
# "Causal chain: retrieval failed → reasoning failed → tool call failed"

# Get detailed analysis
analysis = analyze_causality(EvalContext(trace=trace))
print(analysis.root_cause)        # "retrieval"
print(analysis.causal_chain)      # ["retrieval", "reasoning", "tool"]
print(analysis.error_propagation) # 0.67
```

## Custom Scorers

### Using define_scorer

```python
from neon_sdk.scorers import define_scorer, ScorerConfig, ScoreDataType

custom = define_scorer(ScorerConfig(
    name='word_count',
    description='Score based on word count',
    data_type=ScoreDataType.NUMERIC,
    evaluate=lambda ctx: ScoreResult(
        value=min(len(ctx.output.split()) / 100, 1.0),
        reason=f"Word count: {len(ctx.output.split())}",
    ),
))
```

### Using the Decorator

```python
from neon_sdk.scorers import scorer, EvalContext, ScoreResult

@scorer("sentiment")
def sentiment_scorer(context: EvalContext) -> ScoreResult:
    # Your custom logic
    positive_words = ["good", "great", "excellent"]
    score = sum(1 for word in positive_words if word in context.output.lower())
    normalized = min(score / len(positive_words), 1.0)

    return ScoreResult(
        value=normalized,
        reason=f"Found {score} positive words",
    )
```

### Async Custom Scorers

```python
@scorer("external_api")
async def api_scorer(context: EvalContext) -> ScoreResult:
    # Call external API
    result = await external_api.evaluate(context.output)
    return ScoreResult(
        value=result.score,
        reason=result.explanation,
    )
```

## Combining Scorers

### Composite Scorer

```python
from neon_sdk.scorers import composite_scorer

scorer = composite_scorer([
    (contains(["thank you"]), 0.3),
    (exact_match("success"), 0.3),
    (latency_scorer(), 0.4),
])

result = scorer.evaluate(context)
# Weighted average of all scorers
```

### Running Multiple Scorers

```python
scorers = [
    contains(["helpful"]),
    response_quality_judge,
    latency_scorer(),
]

results = {}
for s in scorers:
    results[s.name] = await s.evaluate(context)

# Aggregate scores
avg_score = sum(r.value for r in results.values()) / len(results)
```

## Best Practices

### 1. Choose the Right Scorer Type

- **Rule-based**: Fast, deterministic, good for structural checks
- **LLM Judge**: Nuanced evaluation, semantic understanding
- **Causal Analysis**: Debug failures, understand error propagation

### 2. Use Multiple Scorers

```python
# Combine different perspectives
scorers = [
    contains(["expected", "keywords"]),  # Structural
    response_quality_judge,               # Semantic
    latency_scorer(),                     # Performance
]
```

### 3. Provide Clear Expected Values

```python
result = scorer.evaluate(EvalContext(
    input={"query": "What is 2+2?"},
    output="The answer is 4",
    expected={"contains": ["4"], "sentiment": "neutral"},
))
```

### 4. Handle Edge Cases

```python
@scorer("safe_scorer")
def safe_scorer(context: EvalContext) -> ScoreResult:
    if not context.output:
        return ScoreResult(value=0.0, reason="Empty output")

    try:
        score = calculate_score(context)
        return ScoreResult(value=score, reason="Success")
    except Exception as e:
        return ScoreResult(value=0.0, reason=f"Error: {e}")
```

## See Also

- [API Reference: Scorers](../api/scorers.md)
- [Tracing Guide](tracing.md)
- [ClickHouse Integration](clickhouse.md) - Store scores
