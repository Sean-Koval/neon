"""
Neon SDK

Python SDK for agent evaluation with tracing and scoring.

Example:
    ```python
    from neon_sdk import Neon, NeonConfig
    from neon_sdk.tracing import trace, span, generation
    from neon_sdk.scorers import contains, exact_match, llm_judge

    # Create client
    client = Neon(NeonConfig(api_key="your-api-key"))

    # Use tracing
    with trace("my-agent"):
        with generation("gpt-call", model="gpt-4"):
            response = call_llm(prompt)

    # Use scorers
    scorer = contains(["success", "completed"])
    result = scorer.evaluate(context)
    ```

Optional Dependencies:
    - temporal: pip install neon-sdk[temporal]
      ```python
      from neon_sdk.temporal import NeonTemporalClient, TemporalClientConfig
      ```

    - clickhouse: pip install neon-sdk[clickhouse]
      ```python
      from neon_sdk.clickhouse import NeonClickHouseClient, ClickHouseConfig
      ```

    - all: pip install neon-sdk[all]
"""

__version__ = "0.1.0"

# Client
from neon_sdk.client import (
    Neon,
    NeonConfig,
    NeonSync,
    create_neon_client,
    create_neon_client_sync,
)

# Scorers (convenience imports)
from neon_sdk.scorers import (
    # Base
    EvalContext,
    Scorer,
    ScoreResult,
    analyze_causality,
    # Causal
    causal_analysis_scorer,
    # Rule-based
    contains,
    define_scorer,
    error_rate_scorer,
    exact_match,
    helpfulness_judge,
    iteration_scorer,
    json_match_scorer,
    latency_scorer,
    # LLM Judge
    llm_judge,
    response_quality_judge,
    root_cause_scorer,
    safety_judge,
    scorer,
    success_scorer,
    token_efficiency_scorer,
    tool_selection_scorer,
)

# Tracing (convenience imports)
from neon_sdk.tracing import (
    TraceContext,
    generation,
    get_current_context,
    memory,
    planning,
    prompt,
    reasoning,
    retrieval,
    routing,
    span,
    tool,
    trace,
    traced,
)

# Types
from neon_sdk.types import (
    ComponentType,
    CreateDatasetInput,
    CreateScoreInput,
    Dataset,
    # Evaluation types
    DatasetItem,
    EvalCaseResult,
    EvalRun,
    EvalRunResult,
    EvalRunStatus,
    EvalRunSummary,
    Score,
    # Score types
    ScoreDataType,
    ScoreSource,
    Span,
    SpanKind,
    SpanStatus,
    SpanType,
    SpanWithChildren,
    Trace,
    TraceFilters,
    # Trace types
    TraceStatus,
    TraceSummary,
    TraceWithSpans,
)

__all__ = [
    # Version
    "__version__",
    # Client
    "Neon",
    "NeonSync",
    "NeonConfig",
    "create_neon_client",
    "create_neon_client_sync",
    # Trace types
    "TraceStatus",
    "SpanKind",
    "SpanType",
    "ComponentType",
    "SpanStatus",
    "Trace",
    "Span",
    "SpanWithChildren",
    "TraceWithSpans",
    "TraceSummary",
    "TraceFilters",
    # Score types
    "ScoreDataType",
    "ScoreSource",
    "Score",
    "CreateScoreInput",
    # Evaluation types
    "DatasetItem",
    "Dataset",
    "EvalRunStatus",
    "EvalRun",
    "EvalCaseResult",
    "EvalRunResult",
    "EvalRunSummary",
    "CreateDatasetInput",
    # Tracing
    "trace",
    "span",
    "traced",
    "generation",
    "tool",
    "retrieval",
    "reasoning",
    "planning",
    "prompt",
    "routing",
    "memory",
    "TraceContext",
    "get_current_context",
    # Scorers - Base
    "EvalContext",
    "ScoreResult",
    "Scorer",
    "define_scorer",
    "scorer",
    # Scorers - Rule-based
    "contains",
    "exact_match",
    "tool_selection_scorer",
    "json_match_scorer",
    "latency_scorer",
    "error_rate_scorer",
    "token_efficiency_scorer",
    "success_scorer",
    "iteration_scorer",
    # Scorers - LLM Judge
    "llm_judge",
    "response_quality_judge",
    "safety_judge",
    "helpfulness_judge",
    # Scorers - Causal
    "causal_analysis_scorer",
    "root_cause_scorer",
    "analyze_causality",
]
