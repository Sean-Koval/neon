"""Comparison models for API requests/responses."""

from uuid import UUID

from pydantic import BaseModel, Field


class CompareRequest(BaseModel):
    """Compare two runs request."""

    baseline_run_id: UUID
    candidate_run_id: UUID
    threshold: float = Field(default=0.05, ge=0.0, le=1.0)


class RegressionItem(BaseModel):
    """Single regression/improvement item."""

    case_name: str
    scorer: str
    baseline_score: float
    candidate_score: float
    delta: float


class RunReference(BaseModel):
    """Reference to a run."""

    id: UUID
    agent_version: str | None


class CompareResponse(BaseModel):
    """Compare two runs response."""

    baseline: RunReference
    candidate: RunReference
    passed: bool
    overall_delta: float
    regressions: list[RegressionItem]
    improvements: list[RegressionItem]
    unchanged: int
    threshold: float
