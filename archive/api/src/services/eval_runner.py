"""Eval runner service - executes evaluations against agents."""

import asyncio
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
from src.services.mlflow_client import NeonMLflowClient


class AgentProtocol(Protocol):
    """Protocol that agents must implement."""

    def run(self, query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Execute the agent with given input."""
        ...


class EvalRunner:
    """Service for executing evaluations with MLflow tracing.

    All agent executions are traced via MLflow, enabling detailed analysis
    of tool calls, LLM interactions, and token usage.
    """

    def __init__(
        self,
        db: AsyncSession,
        mlflow_client: NeonMLflowClient | None = None,
    ):
        """Initialize the eval runner.

        Args:
            db: Async database session.
            mlflow_client: MLflow client for tracing. If None, a default client is created.
        """
        self.db = db
        self.mlflow_client = mlflow_client or NeonMLflowClient()
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
        """Execute all cases in a run with MLflow tracing.

        Sets up MLflow experiment based on project_id, then executes
        each case with tracing enabled.

        Args:
            run: The eval run to execute.
            suite: The eval suite containing cases.
            agent: The agent to evaluate.
        """
        # Update run status
        run.status = EvalRunStatus.RUNNING.value
        run.started_at = datetime.utcnow()
        await self.db.commit()

        try:
            # Set MLflow experiment for this project
            project_id = str(run.project_id)
            self.mlflow_client.set_experiment(project_id)

            # Get cases
            cases = suite.cases

            # Execute cases (parallel or sequential based on config)
            config = suite.config or {}
            parallel = config.get("parallel", True)
            stop_on_failure = config.get("stop_on_failure", False)

            if parallel:
                tasks = [
                    self._execute_case(run, case, agent, suite.id)
                    for case in cases
                ]
                await asyncio.gather(*tasks, return_exceptions=True)
            else:
                for case in cases:
                    result = await self._execute_case(run, case, agent, suite.id)
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
        suite_id: UUID,
    ) -> EvalResultModel:
        """Execute a single test case with MLflow tracing.

        Args:
            run: The parent eval run.
            case: The case to execute.
            agent: The agent to evaluate.
            suite_id: The suite ID for tagging.

        Returns:
            The eval result with MLflow tracing information.
        """
        status = "success"
        output: dict[str, Any] | None = None
        error: str | None = None
        scores: dict[str, float] = {}
        score_details: dict[str, Any] = {}
        mlflow_run_id: str | None = None
        mlflow_trace_id: str | None = None

        # Prepare input for agent
        query = case.input.get("query", "")
        context = case.input.get("context", {})

        # Build tags for MLflow tracing
        tags = {
            "run_id": str(run.id),
            "case_id": str(case.id),
            "case_name": case.name,
            "suite_id": str(suite_id),
        }
        if run.agent_version:
            tags["agent_version"] = run.agent_version

        try:
            # Execute agent with MLflow tracing
            execution_result = self.mlflow_client.execute_with_tracing(
                agent_fn=agent.run,
                input_data={"query": query, "context": context},
                run_name=f"{case.name}",
                tags=tags,
                timeout_seconds=case.timeout_seconds,
            )

            # Extract results from execution
            mlflow_run_id = execution_result.mlflow_run_id
            mlflow_trace_id = execution_result.mlflow_trace_id
            output = execution_result.output
            status = execution_result.status
            error = execution_result.error
            execution_time_ms = execution_result.execution_time_ms

            # Add trace summary to score_details if available
            if execution_result.trace_summary:
                score_details["trace_summary"] = asdict(execution_result.trace_summary)

            # Run scorers only if execution succeeded
            if status == "success" and output is not None:
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

        except TimeoutError:
            status = "timeout"
            error = f"Execution timed out after {case.timeout_seconds}s"
            execution_time_ms = case.timeout_seconds * 1000
        except Exception as e:
            status = "error"
            error = str(e)
            execution_time_ms = 0

        # Calculate pass/fail
        avg_score = sum(scores.values()) / len(scores) if scores else 0.0
        passed = avg_score >= case.min_score and status == "success"

        # Store result with MLflow tracing info
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

        # Aggregate trace statistics
        total_tool_calls = 0
        total_llm_calls = 0
        total_tokens = 0
        traced_results = 0

        for r in results:
            if r.score_details and "trace_summary" in r.score_details:
                traced_results += 1
                trace = r.score_details["trace_summary"]
                total_tool_calls += len(trace.get("tool_calls", []))
                total_llm_calls += trace.get("llm_calls", 0)
                total_tokens += trace.get("total_tokens", 0)

        return {
            "total_cases": total,
            "passed": passed,
            "failed": failed,
            "errored": errored,
            "avg_score": round(avg_score, 4),
            "scores_by_type": {k: round(v, 4) for k, v in scores_by_type.items()},
            "execution_time_ms": total_time,
            "trace_stats": {
                "traced_executions": traced_results,
                "total_tool_calls": total_tool_calls,
                "total_llm_calls": total_llm_calls,
                "total_tokens": total_tokens,
            },
        }
