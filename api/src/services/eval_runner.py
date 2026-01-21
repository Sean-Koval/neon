"""Eval runner service - executes evaluations against agents."""

import asyncio
from collections.abc import Callable
from dataclasses import asdict
from datetime import datetime
from typing import Any, Protocol
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db import EvalCaseModel, EvalResultModel, EvalRunModel, EvalSuiteModel
from src.models.eval import EvalRunStatus
from src.scorers.base import Scorer
from src.scorers.grounding import GroundingScorer
from src.scorers.reasoning import ReasoningScorer
from src.scorers.tool_selection import ToolSelectionScorer
from src.services.mlflow_client import NeonMLflowClient, get_mlflow_client


class AgentProtocol(Protocol):
    """Protocol that agents must implement."""

    def run(self, query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Execute the agent with given input."""
        ...


class EvalRunner:
    """Service for executing evaluations with MLflow tracing."""

    def __init__(
        self,
        db: AsyncSession,
        mlflow_client: NeonMLflowClient | None = None,
    ):
        """Initialize the eval runner.

        Args:
            db: Database session for storing results.
            mlflow_client: MLflow client for traced execution. Defaults to singleton.
        """
        self.db = db
        self.mlflow_client = mlflow_client or get_mlflow_client()
        self.scorers: dict[str, Scorer] = {
            "tool_selection": ToolSelectionScorer(),
            "reasoning": ReasoningScorer(),
            "grounding": GroundingScorer(),
        }

    async def execute_run(
        self,
        run: EvalRunModel,
        suite: EvalSuiteModel,
        agent: AgentProtocol | Callable[..., Any],
    ) -> None:
        """Execute all cases in a run with MLflow tracing.

        Each case execution is traced via MLflow and tagged with neon.* tags
        for querying. The experiment is set per project_id.

        Args:
            run: The eval run record to execute.
            suite: The eval suite containing cases to run.
            agent: The agent to test (protocol or callable).
        """
        # Set experiment for this project (creates neon-{project_id} experiment)
        project_id = str(run.project_id)
        self.mlflow_client.set_experiment(project_id)

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
                    self._execute_case(run, case, suite, agent)
                    for case in cases
                ]
                await asyncio.gather(*tasks, return_exceptions=True)
            else:
                for case in cases:
                    result = await self._execute_case(run, case, suite, agent)
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
        suite: EvalSuiteModel,
        agent: AgentProtocol | Callable[..., Any],
    ) -> EvalResultModel:
        """Execute a single test case with MLflow tracing.

        The agent execution is wrapped with MLflow tracing, capturing:
        - mlflow_run_id: The MLflow run ID for this case
        - mlflow_trace_id: The trace ID (if tracing captured)
        - TraceSummary: Tool calls, LLM calls, tokens in score_details

        Args:
            run: The parent eval run.
            case: The test case to execute.
            suite: The parent eval suite.
            agent: The agent to test.

        Returns:
            The EvalResultModel with execution results.
        """
        status = "success"
        output: dict[str, Any] | None = None
        error: str | None = None
        scores: dict[str, float] = {}
        score_details: dict[str, Any] = {}
        mlflow_run_id: str | None = None
        mlflow_trace_id: str | None = None
        execution_time_ms: int = 0

        try:
            # Build agent callable
            query = case.input.get("query", "")
            context = case.input.get("context", {})

            # Create wrapper function for agent execution
            def agent_callable(query: str, context: dict[str, Any] | None = None) -> Any:
                if hasattr(agent, "run"):
                    return agent.run(query, context)
                return agent(query, context)

            # Execute agent with MLflow tracing
            run_name = f"{run.id}/{case.name}"
            tags = {
                "run_id": str(run.id),
                "case_name": case.name,
                "suite_id": str(suite.id),
                "suite_name": suite.name,
                "project_id": str(run.project_id),
            }
            if run.agent_version:
                tags["agent_version"] = run.agent_version

            exec_result = self.mlflow_client.execute_with_tracing(
                agent_fn=agent_callable,
                input_data={"query": query, "context": context},
                run_name=run_name,
                tags=tags,
                timeout_seconds=case.timeout_seconds,
            )

            # Extract results from execution
            mlflow_run_id = exec_result.mlflow_run_id
            mlflow_trace_id = exec_result.mlflow_trace_id
            execution_time_ms = exec_result.execution_time_ms

            if exec_result.status == "success":
                output = exec_result.output
                status = "success"
            else:
                status = "error"
                error = exec_result.error

            # Add trace summary to score_details if available
            if exec_result.trace_summary:
                score_details["trace_summary"] = asdict(exec_result.trace_summary)

            # Run scorers if execution was successful
            if status == "success" and output is not None:
                for scorer_name in case.scorers:
                    scorer = self.scorers.get(scorer_name)
                    if scorer:
                        scorer_result = await scorer.score(
                            case=case,
                            output=output,
                            config=case.scorer_config,
                        )
                        scores[scorer_name] = scorer_result.score
                        score_details[scorer_name] = {
                            "score": scorer_result.score,
                            "reason": scorer_result.reason,
                            "evidence": scorer_result.evidence,
                        }

        except TimeoutError:
            status = "timeout"
            error = f"Execution timed out after {case.timeout_seconds}s"
        except Exception as e:
            status = "error"
            error = str(e)

        # Calculate pass/fail
        avg_score = sum(scores.values()) / len(scores) if scores else 0.0
        passed = avg_score >= case.min_score and status == "success"

        # Store result with MLflow IDs
        result = EvalResultModel(
            run_id=run.id,
            case_id=case.id,
            mlflow_run_id=mlflow_run_id,
            mlflow_trace_id=mlflow_trace_id,
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
        from sqlalchemy import select

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
