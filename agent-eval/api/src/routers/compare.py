"""Comparison routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.middleware import require_scope
from src.db.session import get_db
from src.models.auth import ApiKey, ApiKeyScope
from src.services.comparison_service import ComparisonService

router = APIRouter(prefix="/compare")


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


@router.post("", response_model=CompareResponse)
async def compare_runs(
    data: CompareRequest,
    key: ApiKey = Depends(require_scope(ApiKeyScope.READ)),
    db: AsyncSession = Depends(get_db),
) -> CompareResponse:
    """Compare two eval runs and identify regressions."""
    service = ComparisonService(db)
    result = await service.compare_runs(
        project_id=key.project_id,
        baseline_run_id=data.baseline_run_id,
        candidate_run_id=data.candidate_run_id,
        threshold=data.threshold,
    )
    if not result:
        raise HTTPException(status_code=404, detail="One or both runs not found")
    return result


@router.get("/{baseline_id}/{candidate_id}", response_model=CompareResponse)
async def get_comparison(
    baseline_id: UUID,
    candidate_id: UUID,
    threshold: float = 0.05,
    key: ApiKey = Depends(require_scope(ApiKeyScope.READ)),
    db: AsyncSession = Depends(get_db),
) -> CompareResponse:
    """Get comparison between two runs."""
    service = ComparisonService(db)
    result = await service.compare_runs(
        project_id=key.project_id,
        baseline_run_id=baseline_id,
        candidate_run_id=candidate_id,
        threshold=threshold,
    )
    if not result:
        raise HTTPException(status_code=404, detail="One or both runs not found")
    return result
