"""Evaluation models - Pydantic schemas for eval suites, cases, runs, and results."""

from datetime import datetime
from enum import Enum
from typing import Annotated, Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# =============================================================================
# Type Aliases for Validated Fields
# =============================================================================

Score = Annotated[float, Field(ge=0.0, le=1.0, description="Score between 0 and 1")]
PositiveInt = Annotated[int, Field(gt=0, description="Positive integer")]


# =============================================================================
# Enums
# =============================================================================


class ScorerType(str, Enum):
    """Available scorer types for evaluating agent behavior."""

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


class EvalResultStatus(str, Enum):
    """Status of an individual eval result."""

    SUCCESS = "success"
    FAILED = "failed"
    ERROR = "error"
    TIMEOUT = "timeout"


class TriggerType(str, Enum):
    """How the eval run was triggered."""

    MANUAL = "manual"
    CI = "ci"
    SCHEDULED = "scheduled"


# =============================================================================
# Eval Case
# =============================================================================


class EvalCaseBase(BaseModel):
    """Base eval case model.

    Represents a single test case for agent evaluation. Each case defines:
    - Input to send to the agent
    - Expected behavior (tools to call, output patterns)
    - Scoring configuration and thresholds
    """

    name: str = Field(
        ..., min_length=1, max_length=255, description="Unique name for the test case"
    )
    description: str | None = Field(default=None, max_length=2000)

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
        None, max_length=1000, description="Regex pattern output must match"
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
    min_score: float = Field(
        default=0.7, ge=0.0, le=1.0, description="Minimum average score to pass (0-1)"
    )

    # Metadata
    tags: list[str] = Field(default_factory=list)
    timeout_seconds: int = Field(default=300, gt=0, le=3600, description="Timeout in seconds (1-3600)")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Validate case name is a valid identifier-like string."""
        if not v.replace("_", "").replace("-", "").replace(".", "").isalnum():
            raise ValueError("Name must contain only alphanumeric characters, underscores, hyphens, or dots")
        return v

    @field_validator("scorers")
    @classmethod
    def validate_scorers_not_empty(cls, v: list[ScorerType]) -> list[ScorerType]:
        """Ensure at least one scorer is specified."""
        if not v:
            raise ValueError("At least one scorer must be specified")
        return v

    @model_validator(mode="after")
    def validate_tool_expectations(self) -> "EvalCaseBase":
        """Validate that expected_tools and expected_tool_sequence are not both set."""
        if self.expected_tools is not None and self.expected_tool_sequence is not None:
            raise ValueError(
                "Cannot specify both expected_tools and expected_tool_sequence. "
                "Use expected_tools for order-independent checks or expected_tool_sequence for ordered checks."
            )
        return self


class EvalCaseCreate(EvalCaseBase):
    """Create eval case request."""

    pass


class EvalCase(EvalCaseBase):
    """Eval case response."""

    id: UUID
    suite_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# Eval Suite
# =============================================================================


class EvalSuiteBase(BaseModel):
    """Base eval suite model.

    Represents a collection of test cases for evaluating an agent.
    Provides default configuration that can be overridden per-case.
    """

    name: str = Field(
        ..., min_length=1, max_length=255, description="Unique name for the suite"
    )
    description: str | None = Field(default=None, max_length=2000)
    agent_id: str = Field(
        ..., min_length=1, max_length=255, description="Identifier for the agent being tested"
    )

    # Default configuration for all cases in the suite
    default_scorers: list[ScorerType] = Field(
        default=[ScorerType.TOOL_SELECTION, ScorerType.REASONING],
        description="Default scorers to run on cases that don't specify their own",
    )
    default_min_score: float = Field(
        default=0.7, ge=0.0, le=1.0, description="Default minimum score to pass (0-1)"
    )
    default_timeout_seconds: int = Field(
        default=300, gt=0, le=3600, description="Default timeout in seconds (1-3600)"
    )

    # Suite execution settings
    parallel: bool = Field(default=True, description="Run cases in parallel")
    stop_on_failure: bool = Field(
        default=False, description="Stop execution after first failure"
    )

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Validate suite name is a valid identifier-like string."""
        if not v.replace("_", "").replace("-", "").replace(".", "").isalnum():
            raise ValueError("Name must contain only alphanumeric characters, underscores, hyphens, or dots")
        return v


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

    model_config = ConfigDict(from_attributes=True)


class EvalSuiteList(BaseModel):
    """List of eval suites."""

    items: list[EvalSuite]
    total: int


# =============================================================================
# Eval Run
# =============================================================================


class EvalRunSummary(BaseModel):
    """Summary of an eval run.

    Provides aggregated statistics for a completed evaluation run.
    """

    total_cases: int = Field(ge=0, description="Total number of cases in the run")
    passed: int = Field(ge=0, description="Number of cases that passed")
    failed: int = Field(ge=0, description="Number of cases that failed")
    errored: int = Field(ge=0, description="Number of cases that errored")
    avg_score: float = Field(ge=0.0, le=1.0, description="Average score across all cases")
    scores_by_type: dict[str, float] = Field(
        default_factory=dict, description="Average score per scorer type"
    )
    execution_time_ms: int = Field(ge=0, description="Total execution time in milliseconds")

    @model_validator(mode="after")
    def validate_counts(self) -> "EvalRunSummary":
        """Validate that passed + failed + errored equals total_cases."""
        if self.passed + self.failed + self.errored != self.total_cases:
            raise ValueError("passed + failed + errored must equal total_cases")
        return self


class EvalRunCreate(BaseModel):
    """Create eval run request."""

    agent_version: str | None = Field(
        default=None, max_length=255, description="Version identifier (git SHA, tag, etc.)"
    )
    trigger: TriggerType = Field(default=TriggerType.MANUAL, description="How the run was triggered")
    trigger_ref: str | None = Field(
        default=None, max_length=255, description="Reference for the trigger (PR number, commit SHA, etc.)"
    )
    config: dict[str, Any] | None = Field(
        default=None, description="Runtime configuration overrides"
    )


class EvalRun(BaseModel):
    """Eval run response.

    Represents a single execution of an evaluation suite against an agent version.
    """

    id: UUID
    suite_id: UUID
    suite_name: str
    project_id: UUID
    agent_version: str | None
    trigger: TriggerType
    trigger_ref: str | None
    status: EvalRunStatus
    config: dict[str, Any] | None
    summary: EvalRunSummary | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EvalRunList(BaseModel):
    """Paginated list of eval runs."""

    items: list[EvalRun]
    total: int = Field(ge=0)


# =============================================================================
# Eval Result
# =============================================================================


class ScoreDetail(BaseModel):
    """Detailed score information from a scorer.

    Provides the score value along with explanation and supporting evidence.
    """

    score: float = Field(ge=0.0, le=1.0, description="Score between 0 and 1")
    reason: str = Field(..., min_length=1, description="Explanation for the score")
    evidence: list[str] = Field(
        default_factory=list, description="Supporting evidence for the score"
    )


class EvalResult(BaseModel):
    """Result for a single eval case execution.

    Contains the agent output, scores from each scorer, and execution metadata.
    """

    id: UUID
    run_id: UUID
    case_id: UUID
    case_name: str
    mlflow_run_id: str | None = Field(
        default=None, description="MLflow run ID for trace lookup"
    )
    mlflow_trace_id: str | None = Field(
        default=None, description="MLflow trace ID for detailed analysis"
    )
    status: EvalResultStatus = Field(description="Execution status")
    output: dict[str, Any] | None = Field(
        default=None, description="Agent output (if successful)"
    )
    scores: dict[str, float] = Field(
        default_factory=dict, description="Score per scorer type"
    )
    score_details: dict[str, ScoreDetail] | None = Field(
        default=None, description="Detailed score info per scorer"
    )
    passed: bool = Field(description="Whether the case passed based on min_score")
    execution_time_ms: int | None = Field(
        default=None, ge=0, description="Execution time in milliseconds"
    )
    error: str | None = Field(
        default=None, description="Error message if status is error/timeout"
    )
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="after")
    def validate_error_consistency(self) -> "EvalResult":
        """Ensure error is set when status indicates failure."""
        if self.status in (EvalResultStatus.ERROR, EvalResultStatus.TIMEOUT) and not self.error:
            raise ValueError(f"error must be set when status is {self.status.value}")
        return self


class EvalResultList(BaseModel):
    """Paginated list of eval results."""

    items: list[EvalResult]
    total: int = Field(ge=0)


# =============================================================================
# Comparison Models
# =============================================================================


class RegressionDetail(BaseModel):
    """Details about a regression between two runs."""

    case_name: str = Field(description="Name of the case that regressed")
    scorer: str = Field(description="Scorer that detected the regression")
    baseline_score: float = Field(ge=0.0, le=1.0, description="Score in baseline run")
    candidate_score: float = Field(ge=0.0, le=1.0, description="Score in candidate run")
    delta: float = Field(description="Change in score (negative indicates regression)")


class ImprovementDetail(BaseModel):
    """Details about an improvement between two runs."""

    case_name: str = Field(description="Name of the case that improved")
    scorer: str = Field(description="Scorer that detected the improvement")
    baseline_score: float = Field(ge=0.0, le=1.0, description="Score in baseline run")
    candidate_score: float = Field(ge=0.0, le=1.0, description="Score in candidate run")
    delta: float = Field(description="Change in score (positive indicates improvement)")


class CompareRequest(BaseModel):
    """Request to compare two eval runs."""

    baseline_run_id: UUID = Field(description="Run ID to use as baseline")
    candidate_run_id: UUID = Field(description="Run ID to compare against baseline")
    threshold: float = Field(
        default=0.05,
        ge=0.0,
        le=1.0,
        description="Minimum score drop to count as regression",
    )


class CompareResponse(BaseModel):
    """Response from comparing two eval runs."""

    baseline: EvalRun
    candidate: EvalRun
    passed: bool = Field(description="True if no significant regressions detected")
    overall_delta: float = Field(description="Overall change in average score")
    regressions: list[RegressionDetail] = Field(
        default_factory=list, description="Cases that regressed"
    )
    improvements: list[ImprovementDetail] = Field(
        default_factory=list, description="Cases that improved"
    )
    unchanged: int = Field(ge=0, description="Number of cases with no significant change")
