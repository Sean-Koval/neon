"""Evaluation models - Pydantic schemas for eval suites, cases, runs, and results."""

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class ScorerType(str, Enum):
    """Available scorer types."""

    TOOL_SELECTION = "tool_selection"
    REASONING = "reasoning"
    GROUNDING = "grounding"
    EFFICIENCY = "efficiency"
    CUSTOM = "custom"


class EvalRunStatus(str, Enum):
    """Evaluation run status."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


# =============================================================================
# Eval Case
# =============================================================================


class EvalCaseBase(BaseModel):
    """Base eval case model."""

    name: str = Field(..., description="Unique name for the test case")
    description: str | None = None

    # Input to the agent
    input: dict[str, Any] = Field(..., description="Agent input (passed to agent.run())")

    # Expected behavior
    expected_tools: list[str] | None = Field(
        None, description="Tools that should be called (order-independent)"
    )
    expected_tool_sequence: list[str] | None = Field(
        None, description="Tools in exact order (if order matters)"
    )
    expected_output_contains: list[str] | None = Field(
        None, description="Strings that must appear in output"
    )
    expected_output_pattern: str | None = Field(
        None, description="Regex pattern output must match"
    )

    # Scorer configuration
    scorers: list[ScorerType] = Field(
        default=[ScorerType.TOOL_SELECTION, ScorerType.REASONING],
        description="Scorers to run on this case",
    )
    scorer_config: dict[str, Any] | None = Field(
        None, description="Per-scorer configuration overrides"
    )

    # Thresholds
    min_score: float = Field(default=0.7, description="Minimum average score to pass")

    # Metadata
    tags: list[str] = Field(default_factory=list)
    timeout_seconds: int = Field(default=300)


class EvalCaseCreate(EvalCaseBase):
    """Create eval case request."""

    pass


class EvalCase(EvalCaseBase):
    """Eval case response."""

    id: UUID
    suite_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# =============================================================================
# Eval Suite
# =============================================================================


class EvalSuiteBase(BaseModel):
    """Base eval suite model."""

    name: str
    description: str | None = None
    agent_id: str = Field(..., description="Identifier for the agent being tested")

    # Default configuration
    default_scorers: list[ScorerType] = Field(
        default=[ScorerType.TOOL_SELECTION, ScorerType.REASONING]
    )
    default_min_score: float = 0.7
    default_timeout_seconds: int = 300

    # Suite settings
    parallel: bool = Field(default=True, description="Run cases in parallel")
    stop_on_failure: bool = Field(default=False)


class EvalSuiteCreate(EvalSuiteBase):
    """Create eval suite request."""

    cases: list[EvalCaseCreate] | None = None


class EvalSuite(EvalSuiteBase):
    """Eval suite response."""

    id: UUID
    project_id: UUID
    created_at: datetime
    updated_at: datetime
    cases: list[EvalCase] = Field(default_factory=list)

    class Config:
        from_attributes = True


class EvalSuiteList(BaseModel):
    """List of eval suites."""

    items: list[EvalSuite]
    total: int


# =============================================================================
# Eval Run
# =============================================================================


class EvalRunSummary(BaseModel):
    """Summary of an eval run."""

    total_cases: int
    passed: int
    failed: int
    errored: int
    avg_score: float
    scores_by_type: dict[str, float]
    execution_time_ms: int


class EvalRunCreate(BaseModel):
    """Create eval run request."""

    agent_version: str | None = None
    trigger: str = "manual"  # manual, ci, scheduled
    trigger_ref: str | None = None  # PR number, commit SHA, etc.
    config: dict[str, Any] | None = None


class EvalRun(BaseModel):
    """Eval run response."""

    id: UUID
    suite_id: UUID
    suite_name: str
    project_id: UUID
    agent_version: str | None
    trigger: str
    trigger_ref: str | None
    status: EvalRunStatus
    config: dict[str, Any] | None
    summary: EvalRunSummary | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


class EvalRunList(BaseModel):
    """List of eval runs."""

    items: list[EvalRun]
    total: int


# =============================================================================
# Eval Result
# =============================================================================


class ScoreDetail(BaseModel):
    """Detailed score information."""

    score: float
    reason: str
    evidence: list[str] = Field(default_factory=list)


class EvalResult(BaseModel):
    """Result for a single eval case."""

    id: UUID
    run_id: UUID
    case_id: UUID
    case_name: str
    mlflow_run_id: str | None
    mlflow_trace_id: str | None
    status: str  # success, failed, error, timeout
    output: dict[str, Any] | None
    scores: dict[str, float]
    score_details: dict[str, ScoreDetail] | None
    passed: bool
    execution_time_ms: int | None
    error: str | None
    created_at: datetime

    class Config:
        from_attributes = True
