# Neon SDK for Python

Python SDK for agent evaluation with tracing and scoring. Full feature parity with the TypeScript SDK.

## Installation

```bash
# Using pip
pip install neon-sdk

# Using uv
uv add neon-sdk

# With optional dependencies
pip install neon-sdk[temporal,clickhouse,all]
```

## Quick Start

```python
from neon_sdk import Neon, NeonConfig
from neon_sdk.tracing import trace, span, generation, tool
from neon_sdk.scorers import contains, exact_match, llm_judge, LLMJudgeConfig

# Create client
client = Neon(NeonConfig(api_key="your-api-key"))

# Use tracing
with trace("my-agent"):
    with generation("gpt-call", model="gpt-4"):
        response = call_llm(prompt)
    
    with tool("search", tool_name="web_search"):
        results = search(query)

# Use scorers
scorer = contains(["success", "completed"])
result = scorer.evaluate(context)
```

## Features

### Tracing

The SDK provides context managers and decorators for tracing agent operations:

```python
from neon_sdk.tracing import (
    trace,           # Root trace context
    span,            # Generic span
    generation,      # LLM generation span
    tool,            # Tool execution span
    retrieval,       # RAG retrieval span
    reasoning,       # Chain-of-thought span
    planning,        # Task decomposition span
    prompt,          # Prompt construction span
    routing,         # Agent routing span
    memory,          # Memory access span
    traced,          # Decorator for functions
)

# Context manager usage
with trace("my-operation"):
    with generation("llm-call", model="gpt-4"):
        response = await llm.chat(prompt)

# Decorator usage
@traced("my-function")
def my_function(x: int) -> int:
    return x * 2

@traced("async-function")
async def async_function(x: int) -> int:
    return x * 2
```

### Scorers

#### Rule-Based Scorers

Deterministic scorers that don't require LLM calls:

```python
from neon_sdk.scorers import (
    contains,              # Check if output contains string(s)
    exact_match,           # Check for exact output match
    tool_selection_scorer, # Check if expected tools were called
    json_match_scorer,     # Check if output matches JSON structure
    latency_scorer,        # Score based on execution latency
    error_rate_scorer,     # Score based on span error rate
    token_efficiency_scorer, # Score based on token usage
    success_scorer,        # Check if trace completed successfully
    iteration_scorer,      # Score based on iteration count
)

# Contains scorer
scorer = contains("hello")  # Simple
scorer = contains(["hello", "world"])  # Multiple strings
scorer = contains(ContainsConfig(
    expected=["error", "warning"],
    match_all=False,  # OR mode
    case_sensitive=True,
))

# Exact match scorer
scorer = exact_match("expected output")
scorer = exact_match(ExactMatchConfig(
    expected="Hello World",
    case_sensitive=False,
    normalize_whitespace=True,
))

# Tool selection
scorer = tool_selection_scorer(["search", "calculate"])

# Latency with custom thresholds
scorer = latency_scorer(LatencyThresholds(
    excellent=500,
    good=2000,
    acceptable=5000,
))
```

#### LLM Judge Scorers

Use an LLM to evaluate agent performance:

```python
from neon_sdk.scorers import (
    llm_judge,
    LLMJudgeConfig,
    response_quality_judge,  # Pre-built quality scorer
    safety_judge,            # Pre-built safety scorer
    helpfulness_judge,       # Pre-built helpfulness scorer
)

# Custom LLM judge
scorer = llm_judge(LLMJudgeConfig(
    prompt='''Rate the response quality from 0 to 1.

    Input: {{input}}
    Output: {{output}}

    Provide your rating as JSON: {"score": <0-1>, "reason": "<explanation>"}''',
    model='claude-3-haiku-20240307',
))

# With custom parser
scorer = llm_judge(LLMJudgeConfig(
    prompt='Is this response helpful? Answer YES or NO.',
    parse_response=lambda text: 1.0 if 'YES' in text.upper() else 0.0,
))

# Pre-built judges
result = response_quality_judge.evaluate(context)
result = safety_judge.evaluate(context)
result = helpfulness_judge.evaluate(context)
```

#### Causal Analysis Scorers

Analyze error propagation and identify root causes:

```python
from neon_sdk.scorers import (
    causal_analysis_scorer,
    causal_analysis_detailed_scorer,
    root_cause_scorer,
    analyze_causality,
)

# Basic causal analysis
scorer = causal_analysis_scorer()

# With custom weights
scorer = causal_analysis_scorer(CausalAnalysisConfig(
    root_cause_weight=0.6,
    chain_completeness_weight=0.3,
    error_rate_weight=0.1,
))

# Get detailed analysis
result = analyze_causality(context)
print(result.explanation)
# "Causal chain: retrieval failed → reasoning failed → tool call failed"
```

#### Custom Scorers

Define your own scorers:

```python
from neon_sdk.scorers import define_scorer, scorer, ScorerConfig, EvalContext, ScoreResult

# Using define_scorer
custom = define_scorer(ScorerConfig(
    name='custom_metric',
    data_type=ScoreDataType.NUMERIC,
    evaluate=lambda ctx: ScoreResult(
        value=calculate_score(ctx.trace),
        reason="Calculated custom metric",
    ),
))

# Using decorator
@scorer("my_scorer")
def my_scorer(context: EvalContext) -> ScoreResult:
    score = calculate_score(context.trace)
    return ScoreResult(value=score, reason="My custom scorer")
```

### API Client

```python
from neon_sdk import Neon, NeonSync, NeonConfig

# Async client
client = Neon(NeonConfig(api_key="your-api-key"))

# List traces
traces = await client.traces.list()

# Get a specific trace
trace = await client.traces.get("trace-id")

# Search traces
results = await client.traces.search("error")

# Create a score
score = await client.scores.create(CreateScoreInput(
    project_id="project-id",
    trace_id="trace-id",
    name="accuracy",
    value=0.95,
))

# Create a dataset
dataset = await client.datasets.create(CreateDatasetInput(
    project_id="project-id",
    name="test-cases",
    items=[
        {"input": {"query": "Hello"}, "expected": {"contains": "Hi"}},
    ],
))

# Run evaluation
run = await client.eval.run_suite(suite)
result = await client.eval.wait_for_run(run.id)

# Synchronous client
sync_client = NeonSync(NeonConfig(api_key="your-api-key"))
traces = sync_client.traces.list()
```

## Type Definitions

The SDK includes comprehensive type definitions matching the TypeScript SDK:

```python
from neon_sdk.types import (
    # Trace types
    TraceStatus, SpanKind, SpanType, ComponentType, SpanStatus,
    Trace, Span, SpanWithChildren, TraceWithSpans, TraceSummary, TraceFilters,
    
    # Score types
    ScoreDataType, ScoreSource, Score, CreateScoreInput,
    
    # Evaluation types
    DatasetItem, Dataset, EvalRunStatus, EvalRun, EvalCaseResult,
    EvalRunResult, EvalRunSummary, CreateDatasetInput,
)
```

## Development

```bash
# Install dependencies
cd packages/neon-sdk-python
uv sync

# Run tests
uv run pytest

# Type checking
uv run mypy neon_sdk

# Linting
uv run ruff check neon_sdk
```

## License

MIT
