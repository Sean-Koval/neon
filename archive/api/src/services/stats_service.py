"""Dashboard statistics service.

Provides efficient SQL-based aggregation for dashboard statistics,
avoiding Python-side loops for performance.
"""

from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import Float, Integer, and_, case, func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db import EvalRunModel
from src.models.eval import EvalRunStatus


class StatsService:
    """Service for computing dashboard statistics via SQL aggregation."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_dashboard_stats(
        self,
        project_id: UUID,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> dict[str, Any]:
        """Compute dashboard statistics using efficient SQL aggregation.

        Args:
            project_id: The project ID to compute stats for.
            date_from: Optional start date filter (inclusive).
            date_to: Optional end date filter (inclusive).

        Returns:
            Dictionary containing:
                - total_runs: Total number of runs
                - passed_runs: Runs where summary.failed=0 AND summary.errored=0
                - failed_runs: Runs that failed or had failures/errors
                - pass_rate: Percentage of passed runs
                - fail_rate: Percentage of failed runs
                - avg_score: Average score across completed runs with scores
                - runs_this_week: Number of runs in the last 7 days
        """
        # Build base filters
        base_filters = [EvalRunModel.project_id == project_id]

        if date_from:
            base_filters.append(EvalRunModel.created_at >= date_from)
        if date_to:
            base_filters.append(EvalRunModel.created_at <= date_to)

        # Extract JSON fields using PostgreSQL ->> operator via op()
        # This extracts the value as text
        summary_failed = EvalRunModel.summary.op("->>")("failed")
        summary_errored = EvalRunModel.summary.op("->>")("errored")
        summary_avg_score = EvalRunModel.summary.op("->>")("avg_score")

        # A run is "passed" if:
        #   - status is 'completed'
        #   - summary is not null
        #   - summary->>'failed' = '0'
        #   - summary->>'errored' = '0'
        passed_condition = and_(
            EvalRunModel.status == EvalRunStatus.COMPLETED.value,
            EvalRunModel.summary.isnot(None),
            summary_failed == "0",
            summary_errored == "0",
        )

        # A run is "failed" if:
        #   - status is 'failed', OR
        #   - status is 'completed' AND (summary->>'failed' != '0' OR summary->>'errored' != '0')
        failed_condition = case(
            (EvalRunModel.status == EvalRunStatus.FAILED.value, literal(1)),
            (
                and_(
                    EvalRunModel.status == EvalRunStatus.COMPLETED.value,
                    EvalRunModel.summary.isnot(None),
                    func.cast(summary_failed, Integer) > 0,
                ),
                literal(1),
            ),
            (
                and_(
                    EvalRunModel.status == EvalRunStatus.COMPLETED.value,
                    EvalRunModel.summary.isnot(None),
                    func.cast(summary_errored, Integer) > 0,
                ),
                literal(1),
            ),
            else_=literal(0),
        )

        # Main aggregation query
        stats_query = select(
            func.count(EvalRunModel.id).label("total_runs"),
            func.sum(case((passed_condition, 1), else_=0)).label("passed_runs"),
            func.sum(failed_condition).label("failed_runs"),
            func.avg(
                case(
                    (
                        and_(
                            EvalRunModel.status == EvalRunStatus.COMPLETED.value,
                            EvalRunModel.summary.isnot(None),
                        ),
                        func.cast(summary_avg_score, Float),
                    ),
                    else_=None,
                )
            ).label("avg_score"),
        ).where(and_(*base_filters))

        result = await self.db.execute(stats_query)
        row = result.one()

        total_runs = row.total_runs or 0
        passed_runs = int(row.passed_runs or 0)
        failed_runs = int(row.failed_runs or 0)
        avg_score = float(row.avg_score) if row.avg_score is not None else 0.0

        # Compute rates
        pass_rate = round((passed_runs / total_runs) * 100, 1) if total_runs > 0 else 0.0
        fail_rate = round((failed_runs / total_runs) * 100, 1) if total_runs > 0 else 0.0

        # Runs this week query (always uses last 7 days, regardless of date filters)
        week_ago = datetime.utcnow() - timedelta(days=7)
        week_query = select(func.count(EvalRunModel.id)).where(
            and_(
                EvalRunModel.project_id == project_id,
                EvalRunModel.created_at >= week_ago,
            )
        )
        week_result = await self.db.execute(week_query)
        runs_this_week = week_result.scalar() or 0

        return {
            "total_runs": total_runs,
            "passed_runs": passed_runs,
            "failed_runs": failed_runs,
            "pass_rate": pass_rate,
            "fail_rate": fail_rate,
            "avg_score": round(avg_score, 2),
            "runs_this_week": runs_this_week,
        }
