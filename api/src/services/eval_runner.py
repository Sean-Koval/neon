"""Eval runner service - executes evaluations against agents."""

import asyncio
import time
from datetime import datetime
from typing import Any, Protocol
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.models.db import EvalCaseModel, EvalResultModel, EvalRunModel, EvalSuiteModel
from src.models.eval import EvalRunStatus
from src.scorers.base import Scorer
from src.scorers.grounding import GroundingScorer
from src.scorers.reasoning import ReasoningScorer
from src.scorers.tool_selection import ToolSelectionScorer


class AgentProtocol(Protocol):
    """Protocol that agents must implement."""

    def run(self, query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Execute the agent with given input."""
        ...


class EvalRunner:
    """Service for executing evaluations."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.scorers: dict[str, Scorer] = {
            "tool_selection": ToolSelectionScorer(),
            "reasoning": ReasoningScorer(),
            "grounding": GroundingScorer(),
        }

    async def execute_run(
        self,
        run: EvalRunModel,
        suite: EvalSuiteModel,
        agent: AgentProtocol,
    ) -> None:
        """Execute all cases in a run."""
        # Update run status
        run.status = EvalRunStatus.RUNNING.value
        run.started_at = datetime.utcnow()
        await self.db.commit()

        try:
            # Get cases
            cases = suite.cases

            # Execute cases (parallel or sequential based on config)
            config = suite.config or {}
            parallel = config.get("parallel", True)
            stop_on_failure = config.get("stop_on_failure", False)

            if parallel:
                tasks = [
                    self._execute_case(run, case, agent)
                    for case in cases
                ]
                await asyncio.gather(*tasks, return_exceptions=True)
            else:
                for case in cases:
                    result = await self._execute_case(run, case, agent)
                    if stop_on_failure and not result.passed:
                        break

            # Calculate summary
            summary = await self._calculate_summary(run.id)
            run.summary = summary
            run.status = EvalRunStatus.COMPLETED.value
            run.completed_at = datetime.utcnow()

        except Exception as e:
            run.status = EvalRunStatus.FAILED.value
            run.completed_at = datetime.utcnow()
            run.summary = {"error": str(e)}

        await self.db.commit()

    async def _execute_case(
        self,
        run: EvalRunModel,
        case: EvalCaseModel,
        agent: AgentProtocol,
    ) -> EvalResultModel:
        """Execute a single test case."""
        start_time = time.time()
        status = "success"
        output: dict[str, Any] | None = None
        error: str | None = None
        scores: dict[str, float] = {}
        score_details: dict[str, Any] = {}

        try:
            # Execute agent
            query = case.input.get("query", "")
            context = case.input.get("context", {})
            output = agent.run(query, context)

            # Run scorers
            for scorer_name in case.scorers:
                scorer = self.scorers.get(scorer_name)
                if scorer:
                    result = await scorer.score(
                        case=case,
                        output=output,
                        config=case.scorer_config,
                    )
                    scores[scorer_name] = result.score
                    score_details[scorer_name] = {
                        "score": result.score,
                        "reason": result.reason,
                        "evidence": result.evidence,
                    }

        except asyncio.TimeoutError:
            status = "timeout"
            error = f"Execution timed out after {case.timeout_seconds}s"
        except Exception as e:
            status = "error"
            error = str(e)

        execution_time_ms = int((time.time() - start_time) * 1000)

        # Calculate pass/fail
        avg_score = sum(scores.values()) / len(scores) if scores else 0.0
        passed = avg_score >= case.min_score and status == "success"

        # Store result
        result = EvalResultModel(
            run_id=run.id,
            case_id=case.id,
            status=status,
            output=output,
            scores=scores,
            score_details=score_details,
            passed=passed,
            execution_time_ms=execution_time_ms,
            error=error,
        )
        self.db.add(result)
        await self.db.commit()

        return result

    async def _calculate_summary(self, run_id: UUID) -> dict[str, Any]:
        """Calculate summary statistics for a run."""
        from sqlalchemy import select, func

        # Get all results
        results = await self.db.execute(
            select(EvalResultModel).where(EvalResultModel.run_id == run_id)
        )
        results = list(results.scalars().all())

        total = len(results)
        passed = sum(1 for r in results if r.passed)
        failed = sum(1 for r in results if not r.passed and r.status == "success")
        errored = sum(1 for r in results if r.status in ("error", "timeout"))

        # Calculate average scores
        all_scores: dict[str, list[float]] = {}
        for result in results:
            for scorer, score in result.scores.items():
                if scorer not in all_scores:
                    all_scores[scorer] = []
                all_scores[scorer].append(score)

        scores_by_type = {
            scorer: sum(scores) / len(scores)
            for scorer, scores in all_scores.items()
        }

        avg_score = (
            sum(sum(scores) for scores in all_scores.values())
            / sum(len(scores) for scores in all_scores.values())
            if all_scores
            else 0.0
        )

        total_time = sum(r.execution_time_ms or 0 for r in results)

        return {
            "total_cases": total,
            "passed": passed,
            "failed": failed,
            "errored": errored,
            "avg_score": round(avg_score, 4),
            "scores_by_type": {k: round(v, 4) for k, v in scores_by_type.items()},
            "execution_time_ms": total_time,
        }
