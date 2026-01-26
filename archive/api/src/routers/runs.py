"""Eval run routes."""

import asyncio
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.auth.middleware import require_scope
from src.db.session import async_session_factory, get_db
from src.models.auth import ApiKey, ApiKeyScope
from src.models.db import EvalRunModel, EvalSuiteModel
from src.models.eval import EvalResult, EvalRun, EvalRunCreate, EvalRunList
from src.services.eval_runner import EvalRunner
from src.services.run_service import RunService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/runs")


# Background task for run execution
async def _execute_run_background(run_id: UUID, suite_id: UUID) -> None:
    """Execute a run in the background with its own database session.

    This function is spawned as a background task and manages its own
    database session to avoid issues with the request session being closed.

    Args:
        run_id: The ID of the run to execute.
        suite_id: The ID of the suite containing the test cases.
    """
    async with async_session_factory() as db:
        try:
            # Re-fetch the run and suite with fresh session
            from sqlalchemy import select

            run_result = await db.execute(
                select(EvalRunModel).where(EvalRunModel.id == run_id)
            )
            run = run_result.scalar_one_or_none()

            suite_result = await db.execute(
                select(EvalSuiteModel)
                .where(EvalSuiteModel.id == suite_id)
                .options(selectinload(EvalSuiteModel.cases))
            )
            suite = suite_result.scalar_one_or_none()

            if not run or not suite:
                logger.error(f"Run {run_id} or suite {suite_id} not found in background task")
                return

            # Create services with fresh session
            run_service = RunService(db)
            eval_runner = EvalRunner(db)

            # Execute the run
            await run_service.start_execution(run, suite, eval_runner)

        except Exception as e:
            logger.exception(f"Background execution failed for run {run_id}: {e}")


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
    """Start an eval run for a suite.

    Creates a new run record with status='pending' and spawns a background
    task to execute the run asynchronously. The run status will transition
    from pending → running → completed/failed as execution progresses.
    """
    service = RunService(db)
    result = await service.create_run(key.project_id, suite_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Suite not found")

    run_response, run_model, suite = result

    # Spawn background task for execution
    logger.info(f"Spawning background task for run {run_model.id}")
    asyncio.create_task(_execute_run_background(run_model.id, suite.id))

    return run_response
