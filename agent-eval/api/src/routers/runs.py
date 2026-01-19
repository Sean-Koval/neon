"""Eval run routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.middleware import require_scope
from src.db.session import get_db
from src.models.auth import ApiKey, ApiKeyScope
from src.models.eval import EvalResult, EvalRun, EvalRunCreate, EvalRunList
from src.services.run_service import RunService

router = APIRouter(prefix="/runs")


@router.get("", response_model=EvalRunList)
async def list_runs(
    suite_id: UUID | None = None,
    status_filter: str | None = None,
    limit: int = 50,
    offset: int = 0,
    key: ApiKey = Depends(require_scope(ApiKeyScope.READ)),
    db: AsyncSession = Depends(get_db),
) -> EvalRunList:
    """List eval runs with optional filtering."""
    service = RunService(db)
    runs = await service.list_runs(
        project_id=key.project_id,
        suite_id=suite_id,
        status_filter=status_filter,
        limit=limit,
        offset=offset,
    )
    total = await service.count_runs(key.project_id, suite_id, status_filter)
    return EvalRunList(items=runs, total=total)


@router.get("/{run_id}", response_model=EvalRun)
async def get_run(
    run_id: UUID,
    key: ApiKey = Depends(require_scope(ApiKeyScope.READ)),
    db: AsyncSession = Depends(get_db),
) -> EvalRun:
    """Get an eval run by ID."""
    service = RunService(db)
    run = await service.get_run(key.project_id, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.get("/{run_id}/results", response_model=list[EvalResult])
async def get_run_results(
    run_id: UUID,
    failed_only: bool = False,
    key: ApiKey = Depends(require_scope(ApiKeyScope.READ)),
    db: AsyncSession = Depends(get_db),
) -> list[EvalResult]:
    """Get results for an eval run."""
    service = RunService(db)
    results = await service.get_run_results(key.project_id, run_id, failed_only)
    return results


@router.post("/{run_id}/cancel", status_code=status.HTTP_200_OK)
async def cancel_run(
    run_id: UUID,
    key: ApiKey = Depends(require_scope(ApiKeyScope.EXECUTE)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Cancel a running evaluation."""
    service = RunService(db)
    success = await service.cancel_run(key.project_id, run_id)
    if not success:
        raise HTTPException(status_code=404, detail="Run not found or not cancellable")
    return {"status": "cancelled"}


# =============================================================================
# Suite Run Endpoint
# =============================================================================


@router.post(
    "/suites/{suite_id}/run",
    response_model=EvalRun,
    status_code=status.HTTP_201_CREATED,
)
async def start_run(
    suite_id: UUID,
    data: EvalRunCreate,
    key: ApiKey = Depends(require_scope(ApiKeyScope.EXECUTE)),
    db: AsyncSession = Depends(get_db),
) -> EvalRun:
    """Start an eval run for a suite."""
    service = RunService(db)
    run = await service.create_run(key.project_id, suite_id, data)
    if not run:
        raise HTTPException(status_code=404, detail="Suite not found")
    return run
