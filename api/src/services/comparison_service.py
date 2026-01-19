"""Comparison service for regression detection."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db import EvalResultModel, EvalRunModel, EvalCaseModel
from src.routers.compare import CompareResponse, RegressionItem, RunReference


class ComparisonService:
    """Service for comparing eval runs."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def compare_runs(
        self,
        project_id: UUID,
        baseline_run_id: UUID,
        candidate_run_id: UUID,
        threshold: float = 0.05,
    ) -> CompareResponse | None:
        """Compare two runs and identify regressions."""
        # Get both runs
        baseline = await self._get_run(project_id, baseline_run_id)
        candidate = await self._get_run(project_id, candidate_run_id)

        if not baseline or not candidate:
            return None

        # Get results for both runs
        baseline_results = await self._get_results(baseline_run_id)
        candidate_results = await self._get_results(candidate_run_id)

        # Index baseline results by case_id and scorer
        baseline_scores: dict[UUID, dict[str, float]] = {}
        for result in baseline_results:
            baseline_scores[result.case_id] = result.scores

        # Get case names
        case_ids = list(
            set([r.case_id for r in baseline_results] + [r.case_id for r in candidate_results])
        )
        case_names = await self._get_case_names(case_ids)

        # Compare scores
        regressions: list[RegressionItem] = []
        improvements: list[RegressionItem] = []
        unchanged = 0

        for result in candidate_results:
            case_name = case_names.get(result.case_id, "unknown")
            baseline_case_scores = baseline_scores.get(result.case_id, {})

            for scorer, candidate_score in result.scores.items():
                baseline_score = baseline_case_scores.get(scorer)
                if baseline_score is None:
                    continue

                delta = candidate_score - baseline_score

                if delta < -threshold:
                    regressions.append(
                        RegressionItem(
                            case_name=case_name,
                            scorer=scorer,
                            baseline_score=baseline_score,
                            candidate_score=candidate_score,
                            delta=delta,
                        )
                    )
                elif delta > threshold:
                    improvements.append(
                        RegressionItem(
                            case_name=case_name,
                            scorer=scorer,
                            baseline_score=baseline_score,
                            candidate_score=candidate_score,
                            delta=delta,
                        )
                    )
                else:
                    unchanged += 1

        # Calculate overall delta
        baseline_avg = self._calculate_avg_score(baseline_results)
        candidate_avg = self._calculate_avg_score(candidate_results)
        overall_delta = candidate_avg - baseline_avg

        # Determine pass/fail
        passed = len(regressions) == 0

        return CompareResponse(
            baseline=RunReference(
                id=baseline.id,
                agent_version=baseline.agent_version,
            ),
            candidate=RunReference(
                id=candidate.id,
                agent_version=candidate.agent_version,
            ),
            passed=passed,
            overall_delta=round(overall_delta, 4),
            regressions=sorted(regressions, key=lambda r: r.delta),
            improvements=sorted(improvements, key=lambda r: -r.delta),
            unchanged=unchanged,
            threshold=threshold,
        )

    async def _get_run(self, project_id: UUID, run_id: UUID) -> EvalRunModel | None:
        """Get a run by ID."""
        result = await self.db.execute(
            select(EvalRunModel).where(
                EvalRunModel.id == run_id,
                EvalRunModel.project_id == project_id,
            )
        )
        return result.scalar_one_or_none()

    async def _get_results(self, run_id: UUID) -> list[EvalResultModel]:
        """Get all results for a run."""
        result = await self.db.execute(
            select(EvalResultModel).where(EvalResultModel.run_id == run_id)
        )
        return list(result.scalars().all())

    async def _get_case_names(self, case_ids: list[UUID]) -> dict[UUID, str]:
        """Get case names by IDs."""
        if not case_ids:
            return {}

        result = await self.db.execute(
            select(EvalCaseModel).where(EvalCaseModel.id.in_(case_ids))
        )
        cases = result.scalars().all()
        return {c.id: c.name for c in cases}

    def _calculate_avg_score(self, results: list[EvalResultModel]) -> float:
        """Calculate average score across all results."""
        if not results:
            return 0.0

        total = 0.0
        count = 0
        for result in results:
            for score in result.scores.values():
                total += score
                count += 1

        return total / count if count > 0 else 0.0
