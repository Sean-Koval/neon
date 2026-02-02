# Neon SDK for Python

Python SDK for agent evaluation with tracing and scoring. Full feature parity with the TypeScript SDK.

## Installation

```bash
# Core SDK
pip install neon-sdk
uv add neon-sdk

# With Temporal (durable workflow execution)
pip install neon-sdk[temporal]

# With ClickHouse (trace storage and analytics)
pip install neon-sdk[clickhouse]

# All optional dependencies
pip install neon-sdk[all]
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

### ClickHouse Integration

Direct access to ClickHouse for trace storage and analytics queries:

```bash
pip install neon-sdk[clickhouse]
```

```python
from neon_sdk.clickhouse import NeonClickHouseClient, ClickHouseConfig

# Create client
client = NeonClickHouseClient(ClickHouseConfig(
    host="localhost",
    port=8123,
    database="neon",
))

# Insert traces
from neon_sdk.clickhouse import TraceRecord, SpanRecord
client.insert_traces([
    TraceRecord(
        trace_id="trace-123",
        project_id="proj-1",
        name="my-agent",
        status="ok",
        timestamp=datetime.now(),
    )
])

# Query traces with filtering
traces = client.query_traces(
    project_id="proj-1",
    status="error",
    limit=100,
)

# Get trace with all spans
result = client.get_trace_with_spans("proj-1", "trace-123")
print(result["trace"])
print(result["spans"])

# Dashboard analytics
summary = client.get_dashboard_summary(
    project_id="proj-1",
    start_date="2024-01-01",
    end_date="2024-01-31",
)
print(f"Total traces: {summary.total_traces}")
print(f"Avg duration: {summary.avg_duration_ms}ms")
print(f"Error rate: {summary.error_rate}%")

# Daily stats for charts
daily = client.get_daily_stats("proj-1", "2024-01-01", "2024-01-31")
for day in daily:
    print(f"{day.date}: {day.trace_count} traces, {day.error_rate}% errors")

# Score trends
trends = client.get_score_trends("proj-1", "2024-01-01", "2024-01-31")
for trend in trends:
    print(f"{trend.scorer_name}: {trend.avg_score:.2f}")
```

### Temporal Integration

Durable workflow execution for agent runs and evaluations:

```bash
pip install neon-sdk[temporal]
```

```python
from neon_sdk.temporal import (
    NeonTemporalClient,
    TemporalClientConfig,
    StartAgentRunInput,
    StartEvalRunInput,
)

# Create and connect client
client = NeonTemporalClient(TemporalClientConfig(
    address="localhost:7233",
    namespace="default",
    task_queue="agent-workers",
))
await client.connect()

# Start an agent run
result = await client.start_agent_run(StartAgentRunInput(
    project_id="proj-123",
    agent_id="agent-456",
    agent_version="1.0.0",
    input_data={"query": "Hello, world!"},
    tools=[{"name": "search", "type": "web"}],
))
print(f"Started workflow: {result['workflow_id']}")

# Check agent status
status = await client.get_agent_status(result["workflow_id"])
print(f"Status: {status.status}")  # pending, running, completed, failed

# Get progress
progress = await client.get_agent_progress(result["workflow_id"])
print(f"Step {progress.current_step}/{progress.total_steps}")
print(f"Current action: {progress.current_action}")

# Send approval signal (for human-in-the-loop)
await client.approve_agent(result["workflow_id"], approved=True)

# Wait for result
final_result = await client.wait_for_agent_result(result["workflow_id"])

# Start an evaluation run
eval_result = await client.start_eval_run(StartEvalRunInput(
    run_id="eval-123",
    project_id="proj-123",
    agent_id="agent-456",
    agent_version="1.0.0",
    dataset={"items": [...]},
    tools=[...],
    scorers=["accuracy", "latency"],
))

# Monitor eval progress
eval_progress = await client.get_eval_progress(eval_result["workflow_id"])
print(f"Completed: {eval_progress.completed}/{eval_progress.total}")

# List all workflows
workflows = await client.list_workflows(query="WorkflowType='agentRunWorkflow'")

# Disconnect when done
await client.disconnect()
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

# Install with all optional dependencies for development
uv pip install -e ".[dev,all]"

# Run tests
uv run pytest

# Run tests with coverage
uv run pytest --cov=neon_sdk

# Type checking
uv run mypy neon_sdk

# Linting
uv run ruff check neon_sdk

# Format code
uv run ruff format neon_sdk
```

## Package Structure

```
neon_sdk/
├── __init__.py          # Main exports
├── py.typed             # PEP 561 marker for type checking
├── types.py             # Pydantic models (Trace, Span, Score, etc.)
├── client.py            # Async & sync API clients
├── tracing/             # Tracing utilities
│   └── __init__.py      # Context managers, decorators
├── scorers/             # Evaluation scorers
│   ├── __init__.py      # Exports
│   ├── base.py          # Base types & define_scorer
│   ├── rule_based.py    # Deterministic scorers
│   ├── llm_judge.py     # LLM-based evaluation
│   └── causal.py        # Causal analysis
├── clickhouse/          # ClickHouse integration (optional)
│   └── __init__.py      # Storage & analytics client
├── temporal/            # Temporal integration (optional)
│   └── __init__.py      # Workflow execution client
└── tests/               # Test suite
    ├── test_tracing.py
    └── test_scorers.py
```

## License

MIT
