"""Eval run service."""

import logging
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.agent.loader import AgentLoadError, load_agent
from src.models.db import EvalCaseModel, EvalResultModel, EvalRunModel, EvalSuiteModel
from src.models.eval import (
    EvalResult,
    EvalRun,
    EvalRunCreate,
    EvalRunStatus,
    EvalRunSummary,
    ScoreDetail,
)

if TYPE_CHECKING:
    from src.services.eval_runner import EvalRunner

logger = logging.getLogger(__name__)


class RunService:
    """Service for eval run operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_runs(
        self,
        project_id: UUID,
        suite_id: UUID | None = None,
        status_filter: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[EvalRun]:
        """List runs with optional filtering."""
        query = (
            select(EvalRunModel)
            .where(EvalRunModel.project_id == project_id)
            .options(selectinload(EvalRunModel.suite))
            .order_by(EvalRunModel.created_at.desc())
            .limit(limit)
            .offset(offset)
        )

        if suite_id:
            query = query.where(EvalRunModel.suite_id == suite_id)
        if status_filter:
            query = query.where(EvalRunModel.status == status_filter)

        result = await self.db.execute(query)
        runs = result.scalars().all()
        return [self._to_run_model(r) for r in runs]

    async def count_runs(
        self,
        project_id: UUID,
        suite_id: UUID | None = None,
        status_filter: str | None = None,
    ) -> int:
        """Count runs with optional filtering."""
        query = select(func.count(EvalRunModel.id)).where(
            EvalRunModel.project_id == project_id
        )

        if suite_id:
            query = query.where(EvalRunModel.suite_id == suite_id)
        if status_filter:
            query = query.where(EvalRunModel.status == status_filter)

        result = await self.db.execute(query)
        return result.scalar() or 0

    async def get_run(self, project_id: UUID, run_id: UUID) -> EvalRun | None:
        """Get a run by ID."""
        result = await self.db.execute(
            select(EvalRunModel)
            .where(
                EvalRunModel.id == run_id,
                EvalRunModel.project_id == project_id,
            )
            .options(selectinload(EvalRunModel.suite))
        )
        run = result.scalar_one_or_none()
        if not run:
            return None
        return self._to_run_model(run)

    async def get_run_results(
        self, project_id: UUID, run_id: UUID, failed_only: bool = False
    ) -> list[EvalResult]:
        """Get results for a run."""
        query = (
            select(EvalResultModel)
            .join(EvalRunModel)
            .join(EvalCaseModel)
            .where(
                EvalRunModel.id == run_id,
                EvalRunModel.project_id == project_id,
            )
            .order_by(EvalResultModel.created_at)
        )

        if failed_only:
            query = query.where(EvalResultModel.passed == False)  # noqa: E712

        result = await self.db.execute(query)
        results = result.scalars().all()

        # Fetch case names
        case_ids = [r.case_id for r in results]
        case_result = await self.db.execute(
            select(EvalCaseModel).where(EvalCaseModel.id.in_(case_ids))
        )
        cases = {c.id: c.name for c in case_result.scalars().all()}

        return [self._to_result_model(r, cases.get(r.case_id, "unknown")) for r in results]

    async def create_run(
        self, project_id: UUID, suite_id: UUID, data: EvalRunCreate
    ) -> tuple[EvalRun, EvalRunModel, EvalSuiteModel] | None:
        """Create a new run.

        Returns:
            A tuple of (EvalRun response, EvalRunModel, EvalSuiteModel) if successful,
            or None if the suite doesn't exist.
        """
        # Verify suite exists and belongs to project
        result = await self.db.execute(
            select(EvalSuiteModel).where(
                EvalSuiteModel.id == suite_id,
                EvalSuiteModel.project_id == project_id,
            )
        )
        suite = result.scalar_one_or_none()
        if not suite:
            return None

        run = EvalRunModel(
            suite_id=suite_id,
            project_id=project_id,
            agent_version=data.agent_version,
            trigger=data.trigger,
            trigger_ref=data.trigger_ref,
            config=data.config,
            status=EvalRunStatus.PENDING.value,
        )
        self.db.add(run)
        await self.db.commit()
        await self.db.refresh(run)

        return self._to_run_model(run, suite_name=suite.name), run, suite

    async def start_execution(
        self,
        run: EvalRunModel,
        suite: EvalSuiteModel,
        eval_runner: "EvalRunner",
        working_dir: str | None = None,
    ) -> None:
        """Execute a run asynchronously.

        This method loads the agent and executes the run using EvalRunner.
        It handles errors by updating the run status to FAILED.

        Args:
            run: The run model to execute.
            suite: The suite containing test cases.
            eval_runner: The EvalRunner instance to use for execution.
            working_dir: Optional working directory for agent loading.
        """
        try:
            # Load the agent from the suite's agent_id
            logger.info(f"Loading agent from {suite.agent_id} for run {run.id}")
            agent = load_agent(suite.agent_id, working_dir=working_dir)

            # Execute the run
            logger.info(f"Starting execution for run {run.id}")
            await eval_runner.execute_run(run, suite, agent)
            logger.info(f"Completed execution for run {run.id}")

        except AgentLoadError as e:
            # Agent loading failed - mark run as failed
            logger.error(f"Failed to load agent for run {run.id}: {e}")
            run.status = EvalRunStatus.FAILED.value
            run.completed_at = datetime.utcnow()
            run.summary = {
                "error": f"Failed to load agent: {e}",
                "error_type": "agent_load_error",
            }
            await self.db.commit()

        except Exception as e:
            # Unexpected error - mark run as failed
            logger.exception(f"Unexpected error during run {run.id}: {e}")
            run.status = EvalRunStatus.FAILED.value
            run.completed_at = datetime.utcnow()
            run.summary = {
                "error": str(e),
                "error_type": type(e).__name__,
            }
            await self.db.commit()

    async def cancel_run(self, project_id: UUID, run_id: UUID) -> bool:
        """Cancel a running evaluation."""
        result = await self.db.execute(
            select(EvalRunModel).where(
                EvalRunModel.id == run_id,
                EvalRunModel.project_id == project_id,
                EvalRunModel.status.in_([EvalRunStatus.PENDING.value, EvalRunStatus.RUNNING.value]),
            )
        )
        run = result.scalar_one_or_none()
        if not run:
            return False

        run.status = EvalRunStatus.CANCELLED.value
        run.completed_at = datetime.utcnow()
        await self.db.commit()
        return True

    def _to_run_model(self, run: EvalRunModel, suite_name: str | None = None) -> EvalRun:
        """Convert DB model to Pydantic model."""
        summary = None
        if run.summary:
            summary = EvalRunSummary(**run.summary)

        return EvalRun(
            id=run.id,
            suite_id=run.suite_id,
            suite_name=suite_name or (run.suite.name if run.suite else "unknown"),
            project_id=run.project_id,
            agent_version=run.agent_version,
            trigger=run.trigger,
            trigger_ref=run.trigger_ref,
            status=EvalRunStatus(run.status),
            config=run.config,
            summary=summary,
            started_at=run.started_at,
            completed_at=run.completed_at,
            created_at=run.created_at,
        )

    def _to_result_model(self, result: EvalResultModel, case_name: str) -> EvalResult:
        """Convert DB model to Pydantic model."""
        score_details = None
        if result.score_details:
            score_details = {
                k: ScoreDetail(**v) for k, v in result.score_details.items()
            }

        return EvalResult(
            id=result.id,
            run_id=result.run_id,
            case_id=result.case_id,
            case_name=case_name,
            mlflow_run_id=result.mlflow_run_id,
            mlflow_trace_id=result.mlflow_trace_id,
            status=result.status,
            output=result.output,
            scores=result.scores,
            score_details=score_details,
            passed=result.passed,
            execution_time_ms=result.execution_time_ms,
            error=result.error,
            created_at=result.created_at,
        )
