"""End-to-end integration tests for the evaluation flow.

These tests verify the complete evaluation pipeline:
EvalRunner → MLflow tracing → Scorers → Results
"""

from __future__ import annotations

import asyncio
import sys
from dataclasses import asdict
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

# Ensure imports work
_api_src = Path(__file__).parent.parent.parent / "api" / "src"
if str(_api_src) not in sys.path:
    sys.path.insert(0, str(_api_src))


# ============================================================================
# EvalRunner Integration Tests
# ============================================================================


@pytest.mark.integration
class TestEvalRunnerIntegration:
    """Test the EvalRunner with all components wired together."""

    @pytest.mark.asyncio
    async def test_execute_run_success(
        self,
        sample_run_model,
        sample_suite_model,
        mock_agent_pass,
        mock_mlflow_client,
    ):
        """Test successful execution of an eval run."""
        from src.models.eval import EvalRunStatus
        from src.services.eval_runner import EvalRunner

        # Create mock database session
        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.add = MagicMock()

        # Create results list to track what gets added
        added_results = []
        mock_db.add.side_effect = lambda x: added_results.append(x)

        # Mock the query for summary calculation
        mock_results = []

        async def mock_execute(query):
            result = MagicMock()
            result.scalars.return_value.all.return_value = mock_results
            return result

        mock_db.execute = mock_execute

        # Create runner with mocked MLflow client
        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        # Execute the run
        await runner.execute_run(
            run=sample_run_model,
            suite=sample_suite_model,
            agent=mock_agent_pass,
        )

        # Verify run status was updated
        assert sample_run_model.status == EvalRunStatus.COMPLETED.value
        assert sample_run_model.started_at is not None
        assert sample_run_model.completed_at is not None

        # Verify MLflow experiment was set
        mock_mlflow_client.set_experiment.assert_called_once()

        # Verify results were created (one per case)
        assert len(added_results) == len(sample_suite_model.cases)

    @pytest.mark.asyncio
    async def test_execute_run_with_error_agent(
        self,
        sample_run_model,
        sample_suite_model,
        mock_agent_error,
        mock_mlflow_client,
    ):
        """Test that agent errors are handled gracefully."""
        from src.services.eval_runner import EvalRunner

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.add = MagicMock()

        added_results = []
        mock_db.add.side_effect = lambda x: added_results.append(x)

        async def mock_execute(query):
            result = MagicMock()
            result.scalars.return_value.all.return_value = []
            return result

        mock_db.execute = mock_execute

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        await runner.execute_run(
            run=sample_run_model,
            suite=sample_suite_model,
            agent=mock_agent_error,
        )

        # Run should complete (not crash)
        assert sample_run_model.completed_at is not None

        # Results should show errors
        for result in added_results:
            assert result.status == "error"
            assert result.error is not None
            assert "Simulated agent error" in result.error

    @pytest.mark.asyncio
    async def test_execute_case_populates_mlflow_ids(
        self,
        sample_run_model,
        sample_suite_model,
        mock_agent_pass,
        mock_mlflow_client,
    ):
        """Test that MLflow run and trace IDs are captured."""
        from src.services.eval_runner import EvalRunner

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.add = MagicMock()

        added_results = []
        mock_db.add.side_effect = lambda x: added_results.append(x)

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        # Execute a single case
        case = sample_suite_model.cases[0]
        result = await runner._execute_case(
            run=sample_run_model,
            case=case,
            agent=mock_agent_pass,
            suite_id=sample_suite_model.id,
        )

        # Verify MLflow IDs are populated
        assert result.mlflow_run_id is not None
        assert result.mlflow_run_id.startswith("run-")
        assert result.mlflow_trace_id is not None
        assert result.mlflow_trace_id.startswith("trace-")

    @pytest.mark.asyncio
    async def test_execute_case_runs_all_scorers(
        self,
        sample_run_model,
        sample_suite_model,
        mock_agent_pass,
        mock_mlflow_client,
    ):
        """Test that all configured scorers are executed."""
        from src.services.eval_runner import EvalRunner

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.add = MagicMock()

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        # Execute case with multiple scorers
        case = sample_suite_model.cases[1]  # Has tool_selection, reasoning, grounding
        result = await runner._execute_case(
            run=sample_run_model,
            case=case,
            agent=mock_agent_pass,
            suite_id=sample_suite_model.id,
        )

        # Verify scores exist for each scorer
        assert "tool_selection" in result.scores
        assert "reasoning" in result.scores
        assert "grounding" in result.scores

        # Verify score details exist
        assert "tool_selection" in result.score_details
        assert "reasoning" in result.score_details
        assert "grounding" in result.score_details

        # Verify each detail has required fields
        for scorer_name in ["tool_selection", "reasoning", "grounding"]:
            detail = result.score_details[scorer_name]
            assert "score" in detail
            assert "reason" in detail
            assert "evidence" in detail

    @pytest.mark.asyncio
    async def test_execute_case_captures_trace_summary(
        self,
        sample_run_model,
        sample_suite_model,
        mock_agent_pass,
        mock_mlflow_client,
    ):
        """Test that trace summary is captured in score_details."""
        from src.services.eval_runner import EvalRunner

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.add = MagicMock()

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        case = sample_suite_model.cases[0]
        result = await runner._execute_case(
            run=sample_run_model,
            case=case,
            agent=mock_agent_pass,
            suite_id=sample_suite_model.id,
        )

        # Verify trace_summary is in score_details
        assert "trace_summary" in result.score_details

        trace_summary = result.score_details["trace_summary"]
        assert "trace_id" in trace_summary
        assert "total_spans" in trace_summary
        assert "tool_calls" in trace_summary
        assert "llm_calls" in trace_summary
        assert "total_tokens" in trace_summary

    @pytest.mark.asyncio
    async def test_calculate_summary_aggregates_correctly(
        self,
        sample_run_model,
    ):
        """Test that summary calculation aggregates results correctly."""
        from src.models.db import EvalResultModel
        from src.services.eval_runner import EvalRunner

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()

        # Create mock results
        mock_results = [
            MagicMock(
                spec=EvalResultModel,
                passed=True,
                status="success",
                scores={"tool_selection": 0.9, "reasoning": 0.8},
                execution_time_ms=100,
                score_details={
                    "trace_summary": {
                        "tool_calls": ["web_search"],
                        "llm_calls": 1,
                        "total_tokens": 100,
                    }
                },
            ),
            MagicMock(
                spec=EvalResultModel,
                passed=False,
                status="success",
                scores={"tool_selection": 0.5, "reasoning": 0.6},
                execution_time_ms=150,
                score_details={
                    "trace_summary": {
                        "tool_calls": [],
                        "llm_calls": 2,
                        "total_tokens": 200,
                    }
                },
            ),
            MagicMock(
                spec=EvalResultModel,
                passed=False,
                status="error",
                scores={},
                execution_time_ms=50,
                score_details={},
            ),
        ]

        async def mock_execute(query):
            result = MagicMock()
            result.scalars.return_value.all.return_value = mock_results
            return result

        mock_db.execute = mock_execute

        runner = EvalRunner(db=mock_db)
        summary = await runner._calculate_summary(sample_run_model.id)

        # Verify summary counts
        assert summary["total_cases"] == 3
        assert summary["passed"] == 1
        assert summary["failed"] == 1
        assert summary["errored"] == 1

        # Verify average scores
        assert "tool_selection" in summary["scores_by_type"]
        assert "reasoning" in summary["scores_by_type"]
        assert summary["scores_by_type"]["tool_selection"] == pytest.approx(0.7, rel=0.01)
        assert summary["scores_by_type"]["reasoning"] == pytest.approx(0.7, rel=0.01)

        # Verify execution time
        assert summary["execution_time_ms"] == 300

        # Verify trace stats
        assert summary["trace_stats"]["traced_executions"] == 2
        assert summary["trace_stats"]["total_tool_calls"] == 1
        assert summary["trace_stats"]["total_llm_calls"] == 3
        assert summary["trace_stats"]["total_tokens"] == 300


# ============================================================================
# Scorer Integration Tests
# ============================================================================


@pytest.mark.integration
class TestScorerIntegration:
    """Test all three scorers working together."""

    @pytest.mark.asyncio
    async def test_all_scorers_produce_valid_scores(self, real_scorers, mock_agent_pass):
        """Test that all three scorers produce valid scores for mock agent."""
        from src.models.db import EvalCaseModel

        # Create a test case
        case = MagicMock(spec=EvalCaseModel)
        case.input = {"query": "What is the capital of France?", "context": {}}
        case.expected_tools = ["web_search"]
        case.expected_tool_sequence = None
        case.expected_output_contains = ["Paris"]
        case.expected_output_pattern = None
        case.scorer_config = None

        # Get agent output
        output = mock_agent_pass("What is the capital of France?", {"require_search": True})

        # Test each scorer
        for scorer_name, scorer in real_scorers.items():
            result = await scorer.score(case=case, output=output, config=None)

            # Verify result structure
            assert hasattr(result, "score")
            assert hasattr(result, "reason")
            assert hasattr(result, "evidence")

            # Verify score is in valid range
            assert 0.0 <= result.score <= 1.0

            # Verify reason is non-empty
            assert result.reason

            # Verify evidence is a list
            assert isinstance(result.evidence, list)

    @pytest.mark.asyncio
    async def test_tool_selection_scorer_perfect_match(self, real_scorers):
        """Test ToolSelectionScorer with exact tool match."""
        from src.models.db import EvalCaseModel

        case = MagicMock(spec=EvalCaseModel)
        case.expected_tools = ["web_search", "calculator"]
        case.expected_tool_sequence = None

        output = {"tools_called": ["web_search", "calculator"], "output": "result"}

        result = await real_scorers["tool_selection"].score(case, output)

        assert result.score >= 0.9  # Should be nearly perfect
        assert "correctly" in result.reason.lower() or "excellent" in result.reason.lower()

    @pytest.mark.asyncio
    async def test_tool_selection_scorer_no_tools_expected(self, real_scorers):
        """Test ToolSelectionScorer when no tools should be called."""
        from src.models.db import EvalCaseModel

        case = MagicMock(spec=EvalCaseModel)
        case.expected_tools = []
        case.expected_tool_sequence = None

        # Agent correctly didn't call tools
        output = {"tools_called": [], "output": "direct answer"}

        result = await real_scorers["tool_selection"].score(case, output)

        assert result.score == 1.0
        assert "correctly called no tools" in str(result.evidence).lower()

    @pytest.mark.asyncio
    async def test_tool_selection_scorer_missing_tools(self, real_scorers):
        """Test ToolSelectionScorer with missing expected tools."""
        from src.models.db import EvalCaseModel

        case = MagicMock(spec=EvalCaseModel)
        case.expected_tools = ["web_search", "calculator"]
        case.expected_tool_sequence = None

        # Agent only called one tool
        output = {"tools_called": ["web_search"], "output": "partial result"}

        result = await real_scorers["tool_selection"].score(case, output)

        assert result.score < 1.0
        assert "missing" in str(result.evidence).lower()

    @pytest.mark.asyncio
    async def test_reasoning_scorer_with_good_reasoning(self, real_scorers):
        """Test ReasoningScorer with well-reasoned output."""
        from src.models.db import EvalCaseModel

        case = MagicMock(spec=EvalCaseModel)
        case.input = {"query": "What is 15 * 7?"}
        case.scorer_config = None

        output = {
            "output": "To calculate 15 * 7, I'll break it down: 15 * 7 = (10 * 7) + (5 * 7) = 70 + 35 = 105. The answer is 105.",
            "tools_called": [],
            "reasoning": "Step by step multiplication",
        }

        result = await real_scorers["reasoning"].score(case, output)

        # Should get reasonable score for showing work
        assert result.score > 0.3
        assert result.reason

    @pytest.mark.asyncio
    async def test_grounding_scorer_with_supported_claims(self, real_scorers):
        """Test GroundingScorer with well-grounded response."""
        from src.models.db import EvalCaseModel

        case = MagicMock(spec=EvalCaseModel)
        case.input = {"query": "What is 2 + 2?", "context": {}}
        case.expected_output_contains = ["4"]
        case.expected_output_pattern = None
        case.scorer_config = None

        output = {
            "output": "The answer is 4. This is basic arithmetic.",
            "tools_called": [],
        }

        result = await real_scorers["grounding"].score(case, output)

        # Should score well for having expected content
        assert result.score > 0.3
        assert result.reason


# ============================================================================
# MLflow Tracing Integration Tests
# ============================================================================


@pytest.mark.integration
class TestMLflowTracingIntegration:
    """Test MLflow tracing integration."""

    def test_mlflow_client_sets_experiment(self, mock_mlflow_client):
        """Test that experiment is set correctly."""
        exp_id = mock_mlflow_client.set_experiment("test-project")

        assert exp_id == "test-experiment-id"
        mock_mlflow_client.set_experiment.assert_called_with("test-project")

    def test_execute_with_tracing_returns_result(
        self,
        mock_mlflow_client,
        mock_agent_pass,
    ):
        """Test that execute_with_tracing returns proper result structure."""
        result = mock_mlflow_client.execute_with_tracing(
            agent_fn=mock_agent_pass,
            input_data={"query": "test", "context": {}},
            run_name="test-run",
            tags={"case_id": "123"},
        )

        assert result.mlflow_run_id is not None
        assert result.mlflow_trace_id is not None
        assert result.status == "success"
        assert result.output is not None
        assert result.error is None
        assert result.execution_time_ms >= 0
        assert result.trace_summary is not None

    def test_execute_with_tracing_handles_error(
        self,
        mock_mlflow_client,
        mock_agent_error,
    ):
        """Test that execute_with_tracing handles agent errors."""
        result = mock_mlflow_client.execute_with_tracing(
            agent_fn=mock_agent_error,
            input_data={"query": "test", "context": {}},
        )

        assert result.mlflow_run_id is not None
        assert result.status == "error"
        assert result.error is not None
        assert "Simulated agent error" in result.error
        assert result.output is None


# ============================================================================
# Pass/Fail Determination Tests
# ============================================================================


@pytest.mark.integration
class TestPassFailDetermination:
    """Test that pass/fail is determined correctly."""

    @pytest.mark.asyncio
    async def test_case_passes_when_score_meets_threshold(
        self,
        sample_run_model,
        mock_agent_pass,
        mock_mlflow_client,
    ):
        """Test that a case passes when average score meets min_score."""
        from src.models.db import EvalCaseModel
        from src.services.eval_runner import EvalRunner

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.add = MagicMock()

        # Create case with low threshold
        case = MagicMock(spec=EvalCaseModel)
        case.id = uuid4()
        case.name = "easy_case"
        case.input = {"query": "What is 2 + 2?", "context": {}}
        case.expected_tools = []
        case.expected_tool_sequence = None
        case.expected_output_contains = ["4"]
        case.expected_output_pattern = None
        case.scorers = ["tool_selection"]
        case.scorer_config = None
        case.min_score = 0.5  # Low threshold
        case.timeout_seconds = 30

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        result = await runner._execute_case(
            run=sample_run_model,
            case=case,
            agent=mock_agent_pass,
            suite_id=uuid4(),
        )

        assert result.passed is True
        assert result.status == "success"

    @pytest.mark.asyncio
    async def test_case_fails_when_score_below_threshold(
        self,
        sample_run_model,
        mock_mlflow_client,
    ):
        """Test that a case fails when average score is below min_score."""
        from src.models.db import EvalCaseModel
        from src.services.eval_runner import EvalRunner

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.add = MagicMock()

        # Agent that produces bad output
        def bad_agent(query, context=None):
            return {
                "output": "I don't know",
                "tools_called": ["wrong_tool"],
                "reasoning": "",
            }

        # Create case with high threshold
        case = MagicMock(spec=EvalCaseModel)
        case.id = uuid4()
        case.name = "hard_case"
        case.input = {"query": "What is the answer?", "context": {}}
        case.expected_tools = ["correct_tool"]
        case.expected_tool_sequence = None
        case.expected_output_contains = ["specific_answer"]
        case.expected_output_pattern = None
        case.scorers = ["tool_selection"]
        case.scorer_config = None
        case.min_score = 0.99  # Very high threshold
        case.timeout_seconds = 30

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        result = await runner._execute_case(
            run=sample_run_model,
            case=case,
            agent=bad_agent,
            suite_id=uuid4(),
        )

        assert result.passed is False

    @pytest.mark.asyncio
    async def test_case_fails_on_error_regardless_of_score(
        self,
        sample_run_model,
        mock_agent_error,
        mock_mlflow_client,
    ):
        """Test that a case fails when agent errors, regardless of other factors."""
        from src.models.db import EvalCaseModel
        from src.services.eval_runner import EvalRunner

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.add = MagicMock()

        case = MagicMock(spec=EvalCaseModel)
        case.id = uuid4()
        case.name = "error_case"
        case.input = {"query": "test", "context": {}}
        case.expected_tools = []
        case.expected_tool_sequence = None
        case.scorers = ["tool_selection"]
        case.scorer_config = None
        case.min_score = 0.0  # Even with 0 threshold
        case.timeout_seconds = 30

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        result = await runner._execute_case(
            run=sample_run_model,
            case=case,
            agent=mock_agent_error,
            suite_id=uuid4(),
        )

        assert result.passed is False
        assert result.status == "error"


# ============================================================================
# Parallel vs Sequential Execution Tests
# ============================================================================


@pytest.mark.integration
class TestExecutionModes:
    """Test parallel and sequential execution modes."""

    @pytest.mark.asyncio
    async def test_parallel_execution(
        self,
        sample_run_model,
        sample_suite_model,
        mock_agent_pass,
        mock_mlflow_client,
    ):
        """Test that parallel execution runs all cases."""
        from src.services.eval_runner import EvalRunner

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.add = MagicMock()

        added_results = []
        mock_db.add.side_effect = lambda x: added_results.append(x)

        async def mock_execute(query):
            result = MagicMock()
            result.scalars.return_value.all.return_value = added_results
            return result

        mock_db.execute = mock_execute

        # Set suite config for parallel
        sample_suite_model.config = {"parallel": True}

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        await runner.execute_run(
            run=sample_run_model,
            suite=sample_suite_model,
            agent=mock_agent_pass,
        )

        # All cases should be executed
        assert len(added_results) == len(sample_suite_model.cases)

    @pytest.mark.asyncio
    async def test_sequential_with_stop_on_failure(
        self,
        sample_run_model,
        sample_suite_model,
        mock_mlflow_client,
    ):
        """Test that sequential execution stops on first failure when configured."""
        from src.services.eval_runner import EvalRunner

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.add = MagicMock()

        added_results = []
        mock_db.add.side_effect = lambda x: added_results.append(x)

        async def mock_execute(query):
            result = MagicMock()
            result.scalars.return_value.all.return_value = added_results
            return result

        mock_db.execute = mock_execute

        # Agent that always fails
        def failing_agent(query, context=None):
            return {
                "output": "wrong",
                "tools_called": ["wrong_tool"],
                "reasoning": "",
            }

        # Set suite config for sequential with stop_on_failure
        sample_suite_model.config = {"parallel": False, "stop_on_failure": True}

        # Make cases fail by setting high min_score
        for case in sample_suite_model.cases:
            case.min_score = 0.99
            case.expected_tools = ["specific_tool"]

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        await runner.execute_run(
            run=sample_run_model,
            suite=sample_suite_model,
            agent=failing_agent,
        )

        # Should stop after first failure
        assert len(added_results) == 1


# ============================================================================
# Timeout Handling Tests
# ============================================================================


@pytest.mark.integration
class TestTimeoutHandling:
    """Test timeout handling in evaluation."""

    @pytest.mark.asyncio
    async def test_timeout_sets_result_status(
        self,
        sample_run_model,
    ):
        """Test that timeout is properly reflected in result status."""
        from src.models.db import EvalCaseModel
        from src.services.eval_runner import EvalRunner
        from src.services.mlflow_client import ExecutionResult

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.add = MagicMock()

        # Create MLflow client that returns timeout status
        mock_mlflow = MagicMock()
        mock_mlflow._current_experiment_id = "exp-123"
        mock_mlflow.set_experiment = MagicMock(return_value="exp-123")

        def timeout_execution(*args, **kwargs):
            return ExecutionResult(
                mlflow_run_id="run-timeout",
                mlflow_trace_id=None,
                output=None,
                status="timeout",
                error="Execution timed out after 5s",
                execution_time_ms=5000,
                trace_summary=None,
            )

        mock_mlflow.execute_with_tracing = MagicMock(side_effect=timeout_execution)

        # Case with short timeout
        case = MagicMock(spec=EvalCaseModel)
        case.id = uuid4()
        case.name = "timeout_case"
        case.input = {"query": "slow query", "context": {}}
        case.expected_tools = []
        case.expected_tool_sequence = None
        case.scorers = ["tool_selection"]
        case.scorer_config = None
        case.min_score = 0.5
        case.timeout_seconds = 5  # Short timeout

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow)

        result = await runner._execute_case(
            run=sample_run_model,
            case=case,
            agent=lambda q, c=None: {"output": "test"},  # Won't be called
            suite_id=uuid4(),
        )

        # Result should indicate timeout
        assert result.status == "timeout"
        assert result.passed is False
        assert "timed out" in result.error.lower()

    @pytest.mark.asyncio
    async def test_timeout_case_counted_as_error_in_summary(
        self,
        sample_run_model,
    ):
        """Test that timed out cases are counted in errored in summary."""
        from src.models.db import EvalResultModel
        from src.services.eval_runner import EvalRunner

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()

        # Create results with one timeout
        mock_results = [
            MagicMock(
                spec=EvalResultModel,
                passed=True,
                status="success",
                scores={"tool_selection": 0.9},
                execution_time_ms=100,
                score_details={},
            ),
            MagicMock(
                spec=EvalResultModel,
                passed=False,
                status="timeout",  # Timeout case
                scores={},
                execution_time_ms=5000,
                score_details={},
            ),
        ]

        async def mock_execute(query):
            result = MagicMock()
            result.scalars.return_value.all.return_value = mock_results
            return result

        mock_db.execute = mock_execute

        runner = EvalRunner(db=mock_db)
        summary = await runner._calculate_summary(sample_run_model.id)

        # Timeout should be counted as errored
        assert summary["total_cases"] == 2
        assert summary["passed"] == 1
        assert summary["errored"] == 1  # Timeout counts as error
        assert summary["failed"] == 0  # Not a regular failure


# ============================================================================
# Failed Agent Execution Tests
# ============================================================================


@pytest.mark.integration
class TestFailedAgentExecution:
    """Test handling of failed agent executions."""

    @pytest.mark.asyncio
    async def test_agent_exception_is_captured(
        self,
        sample_run_model,
        mock_agent_error,
        mock_mlflow_client,
    ):
        """Test that agent exceptions are captured in result."""
        from src.models.db import EvalCaseModel
        from src.services.eval_runner import EvalRunner

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.add = MagicMock()

        case = MagicMock(spec=EvalCaseModel)
        case.id = uuid4()
        case.name = "error_case"
        case.input = {"query": "test", "context": {}}
        case.expected_tools = []
        case.expected_tool_sequence = None
        case.scorers = ["tool_selection"]
        case.scorer_config = None
        case.min_score = 0.5
        case.timeout_seconds = 30

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        result = await runner._execute_case(
            run=sample_run_model,
            case=case,
            agent=mock_agent_error,
            suite_id=uuid4(),
        )

        assert result.status == "error"
        assert result.error is not None
        assert "Simulated agent error" in result.error
        assert result.passed is False
        assert result.output is None

    @pytest.mark.asyncio
    async def test_agent_error_does_not_crash_run(
        self,
        sample_run_model,
        sample_suite_model,
        mock_agent_error,
        mock_mlflow_client,
    ):
        """Test that agent error in one case doesn't crash the entire run."""
        from src.services.eval_runner import EvalRunner

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.add = MagicMock()

        added_results = []
        mock_db.add.side_effect = lambda x: added_results.append(x)

        async def mock_execute(query):
            result = MagicMock()
            result.scalars.return_value.all.return_value = added_results
            return result

        mock_db.execute = mock_execute

        # Set parallel to false so we process sequentially
        sample_suite_model.config = {"parallel": False}

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        await runner.execute_run(
            run=sample_run_model,
            suite=sample_suite_model,
            agent=mock_agent_error,
        )

        # Run should complete (not crash)
        assert sample_run_model.completed_at is not None

        # All cases should have been attempted (errors are captured)
        assert len(added_results) == len(sample_suite_model.cases)

        # All should have error status
        for result in added_results:
            assert result.status == "error"

    @pytest.mark.asyncio
    async def test_no_scores_on_error(
        self,
        sample_run_model,
        mock_agent_error,
        mock_mlflow_client,
    ):
        """Test that no scores are calculated when agent errors."""
        from src.models.db import EvalCaseModel
        from src.services.eval_runner import EvalRunner

        mock_db = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.add = MagicMock()

        case = MagicMock(spec=EvalCaseModel)
        case.id = uuid4()
        case.name = "error_case"
        case.input = {"query": "test", "context": {}}
        case.expected_tools = []
        case.expected_tool_sequence = None
        case.scorers = ["tool_selection", "reasoning", "grounding"]  # Multiple scorers
        case.scorer_config = None
        case.min_score = 0.5
        case.timeout_seconds = 30

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        result = await runner._execute_case(
            run=sample_run_model,
            case=case,
            agent=mock_agent_error,
            suite_id=uuid4(),
        )

        # No scores should be calculated
        assert result.scores == {}
        # Score details should not have scorer entries (may have trace_summary)
        scorer_keys = [k for k in result.score_details.keys() if k != "trace_summary"]
        assert len(scorer_keys) == 0
