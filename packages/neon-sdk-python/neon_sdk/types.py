"""Neon SDK Types.

Core types for trace, span, score, and evaluation data.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

# =============================================================================
# Trace Types
# =============================================================================


class TraceStatus(str, Enum):
    """Trace status."""

    UNSET = "unset"
    OK = "ok"
    ERROR = "error"


class SpanKind(str, Enum):
    """Span kind following OTel specification."""

    INTERNAL = "internal"
    SERVER = "server"
    CLIENT = "client"
    PRODUCER = "producer"
    CONSUMER = "consumer"


class SpanType(str, Enum):
    """Extended span type for AI agent operations."""

    SPAN = "span"
    GENERATION = "generation"
    TOOL = "tool"
    RETRIEVAL = "retrieval"
    EVENT = "event"


class ComponentType(str, Enum):
    """Component type for attribution in compound AI systems.

    Used to identify which component of the agent system a span belongs to.
    """

    PROMPT = "prompt"  # Prompt construction and formatting
    RETRIEVAL = "retrieval"  # RAG/document retrieval operations
    TOOL = "tool"  # Tool selection and execution
    REASONING = "reasoning"  # Chain-of-thought, planning, or reasoning steps
    PLANNING = "planning"  # High-level task decomposition and planning
    MEMORY = "memory"  # Memory access and management
    ROUTING = "routing"  # Agent routing and orchestration
    OTHER = "other"  # Unclassified or custom components


class SpanStatus(str, Enum):
    """Span status."""

    UNSET = "unset"
    OK = "ok"
    ERROR = "error"


class Trace(BaseModel):
    """Trace represents a complete agent execution."""

    trace_id: str = Field(..., alias="traceId")
    project_id: str = Field(..., alias="projectId")
    name: str
    timestamp: datetime
    end_time: datetime | None = Field(None, alias="endTime")
    duration_ms: int = Field(..., alias="durationMs")
    status: TraceStatus
    metadata: dict[str, str] = Field(default_factory=dict)
    # Agent context
    agent_id: str | None = Field(None, alias="agentId")
    agent_version: str | None = Field(None, alias="agentVersion")
    workflow_id: str | None = Field(None, alias="workflowId")
    workflow_run_id: str | None = Field(None, alias="workflowRunId")
    # Aggregated stats
    total_input_tokens: int = Field(0, alias="totalInputTokens")
    total_output_tokens: int = Field(0, alias="totalOutputTokens")
    total_cost_usd: float | None = Field(None, alias="totalCostUsd")
    tool_call_count: int = Field(0, alias="toolCallCount")
    llm_call_count: int = Field(0, alias="llmCallCount")

    model_config = {"populate_by_name": True}


class Span(BaseModel):
    """Span represents an individual operation within a trace."""

    span_id: str = Field(..., alias="spanId")
    trace_id: str = Field(..., alias="traceId")
    project_id: str = Field(..., alias="projectId")
    parent_span_id: str | None = Field(None, alias="parentSpanId")
    name: str
    kind: SpanKind
    span_type: SpanType = Field(..., alias="spanType")
    component_type: ComponentType | None = Field(None, alias="componentType")
    timestamp: datetime
    end_time: datetime | None = Field(None, alias="endTime")
    duration_ms: int = Field(..., alias="durationMs")
    status: SpanStatus
    status_message: str | None = Field(None, alias="statusMessage")
    # LLM generation fields
    model: str | None = None
    model_parameters: dict[str, str] | None = Field(None, alias="modelParameters")
    input: str | None = None
    output: str | None = None
    input_tokens: int | None = Field(None, alias="inputTokens")
    output_tokens: int | None = Field(None, alias="outputTokens")
    total_tokens: int | None = Field(None, alias="totalTokens")
    cost_usd: float | None = Field(None, alias="costUsd")
    # Tool fields
    tool_name: str | None = Field(None, alias="toolName")
    tool_input: str | None = Field(None, alias="toolInput")
    tool_output: str | None = Field(None, alias="toolOutput")
    # Attributes
    attributes: dict[str, str] = Field(default_factory=dict)

    model_config = {"populate_by_name": True}


class SpanWithChildren(Span):
    """Span with children for tree rendering."""

    children: list[SpanWithChildren] = Field(default_factory=list)


class TraceWithSpans(BaseModel):
    """Trace with all spans."""

    trace: Trace
    spans: list[SpanWithChildren]


class TraceSummary(BaseModel):
    """Trace summary for list views."""

    trace_id: str = Field(..., alias="traceId")
    name: str
    timestamp: datetime
    duration_ms: int = Field(..., alias="durationMs")
    status: TraceStatus
    total_tokens: int = Field(..., alias="totalTokens")
    tool_calls: int = Field(..., alias="toolCalls")
    llm_calls: int = Field(..., alias="llmCalls")
    agent_id: str | None = Field(None, alias="agentId")
    agent_version: str | None = Field(None, alias="agentVersion")

    model_config = {"populate_by_name": True}


class TraceFilters(BaseModel):
    """Filters for trace queries."""

    project_id: str = Field(..., alias="projectId")
    status: TraceStatus | None = None
    start_date: datetime | None = Field(None, alias="startDate")
    end_date: datetime | None = Field(None, alias="endDate")
    agent_id: str | None = Field(None, alias="agentId")
    search: str | None = None
    limit: int | None = None
    offset: int | None = None

    model_config = {"populate_by_name": True}


# =============================================================================
# Score Types
# =============================================================================


class ScoreDataType(str, Enum):
    """Score data type."""

    NUMERIC = "numeric"
    CATEGORICAL = "categorical"
    BOOLEAN = "boolean"


class ScoreSource(str, Enum):
    """Source of the score."""

    API = "api"
    SDK = "sdk"
    ANNOTATION = "annotation"
    EVAL = "eval"
    TEMPORAL = "temporal"


class Score(BaseModel):
    """Score represents an evaluation result."""

    score_id: str = Field(..., alias="scoreId")
    project_id: str = Field(..., alias="projectId")
    trace_id: str = Field(..., alias="traceId")
    span_id: str | None = Field(None, alias="spanId")
    name: str
    value: float
    score_type: ScoreDataType = Field(..., alias="scoreType")
    string_value: str | None = Field(None, alias="stringValue")
    comment: str | None = None
    source: ScoreSource
    config_id: str | None = Field(None, alias="configId")
    timestamp: datetime
    author_id: str | None = Field(None, alias="authorId")
    eval_run_id: str | None = Field(None, alias="evalRunId")

    model_config = {"populate_by_name": True}


class CreateScoreInput(BaseModel):
    """Input for creating a score."""

    project_id: str = Field(..., alias="projectId")
    trace_id: str = Field(..., alias="traceId")
    span_id: str | None = Field(None, alias="spanId")
    name: str
    value: float
    score_type: ScoreDataType | None = Field(None, alias="scoreType")
    string_value: str | None = Field(None, alias="stringValue")
    comment: str | None = None
    source: ScoreSource | None = None
    config_id: str | None = Field(None, alias="configId")
    author_id: str | None = Field(None, alias="authorId")
    eval_run_id: str | None = Field(None, alias="evalRunId")

    model_config = {"populate_by_name": True}


# =============================================================================
# Evaluation Types
# =============================================================================


class DatasetItem(BaseModel):
    """Dataset item."""

    input: dict[str, Any]
    expected: dict[str, Any] | None = None


class Dataset(BaseModel):
    """Dataset for batch evaluation."""

    id: str
    project_id: str = Field(..., alias="projectId")
    name: str
    description: str | None = None
    items: list[DatasetItem] = Field(default_factory=list)
    trace_ids: list[str] | None = Field(None, alias="traceIds")
    metadata: dict[str, Any] | None = None
    created_at: datetime = Field(..., alias="createdAt")
    updated_at: datetime = Field(..., alias="updatedAt")

    model_config = {"populate_by_name": True}


class EvalRunStatus(str, Enum):
    """Evaluation run status."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class EvalRunProgress(BaseModel):
    """Evaluation run progress."""

    completed: int
    total: int


class EvalRun(BaseModel):
    """Evaluation run."""

    id: str
    project_id: str = Field(..., alias="projectId")
    dataset_id: str | None = Field(None, alias="datasetId")
    score_config_ids: list[str] = Field(..., alias="scoreConfigIds")
    agent_id: str | None = Field(None, alias="agentId")
    agent_version: str | None = Field(None, alias="agentVersion")
    status: EvalRunStatus
    progress: EvalRunProgress
    workflow_id: str | None = Field(None, alias="workflowId")
    created_at: datetime = Field(..., alias="createdAt")
    completed_at: datetime | None = Field(None, alias="completedAt")
    error_message: str | None = Field(None, alias="errorMessage")

    model_config = {"populate_by_name": True}


class EvalCaseScore(BaseModel):
    """Score for an evaluation case."""

    name: str
    value: float
    reason: str | None = None


class EvalCaseResult(BaseModel):
    """Evaluation case result."""

    case_index: int = Field(..., alias="caseIndex")
    trace_id: str = Field(..., alias="traceId")
    status: str  # "passed" | "failed" | "error"
    scores: list[EvalCaseScore]
    duration_ms: int | None = Field(None, alias="durationMs")

    model_config = {"populate_by_name": True}


class EvalRunScoreSummary(BaseModel):
    """Summary statistics for a score."""

    avg: float
    min: float
    max: float
    count: int


class EvalRunSummary(BaseModel):
    """Evaluation run summary."""

    total: int
    passed: int
    failed: int
    avg_score: float = Field(..., alias="avgScore")
    pass_rate: float = Field(..., alias="passRate")
    scores_by_name: dict[str, EvalRunScoreSummary] = Field(..., alias="scoresByName")

    model_config = {"populate_by_name": True}


class EvalRunResult(BaseModel):
    """Evaluation run result."""

    run_id: str = Field(..., alias="runId")
    results: list[EvalCaseResult]
    summary: EvalRunSummary

    model_config = {"populate_by_name": True}


class CreateDatasetInput(BaseModel):
    """Input for creating a dataset."""

    project_id: str = Field(..., alias="projectId")
    name: str
    description: str | None = None
    items: list[DatasetItem] | None = None
    trace_ids: list[str] | None = Field(None, alias="traceIds")
    metadata: dict[str, Any] | None = None

    model_config = {"populate_by_name": True}
