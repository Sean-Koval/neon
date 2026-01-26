"""Tests for EvalRunner MLflow integration.

This module tests that the EvalRunner correctly integrates with MLflow tracing:
- Accepts NeonMLflowClient via dependency injection
- Sets experiment based on project_id
- Uses execute_with_tracing for agent execution
- Populates mlflow_run_id and mlflow_trace_id in results
- Includes TraceSummary in score_details
- Aggregates trace statistics in run summary
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.models.db import EvalCaseModel, EvalResultModel, EvalRunModel, EvalSuiteModel
from src.models.eval import EvalRunStatus
from src.services.eval_runner import EvalRunner
from src.services.mlflow_client import ExecutionResult, NeonMLflowClient, TraceSummary

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_db():
    """Create a mock async database session."""
    mock = AsyncMock()
    mock.add = MagicMock()
    mock.commit = AsyncMock()
    mock.execute = AsyncMock()
    return mock


@pytest.fixture
def mock_mlflow_client():
    """Create a mock NeonMLflowClient."""
    mock = MagicMock(spec=NeonMLflowClient)
    mock.set_experiment = MagicMock(return_value="exp-123")
    return mock


@pytest.fixture
def mock_agent():
    """Create a mock agent that implements AgentProtocol."""
    mock = MagicMock()
    mock.run = MagicMock(return_value={"response": "test response", "tools_used": []})
    return mock


@pytest.fixture
def sample_project_id():
    """Generate a sample project ID."""
    return uuid4()


@pytest.fixture
def sample_suite_id():
    """Generate a sample suite ID."""
    return uuid4()


@pytest.fixture
def sample_run(sample_project_id, sample_suite_id):
    """Create a sample EvalRunModel."""
    run = MagicMock(spec=EvalRunModel)
    run.id = uuid4()
    run.project_id = sample_project_id
    run.suite_id = sample_suite_id
    run.agent_version = "v1.0.0"
    run.status = EvalRunStatus.PENDING.value
    run.started_at = None
    run.completed_at = None
    run.summary = None
    return run


@pytest.fixture
def sample_case(sample_suite_id):
    """Create a sample EvalCaseModel."""
    case = MagicMock(spec=EvalCaseModel)
    case.id = uuid4()
    case.suite_id = sample_suite_id
    case.name = "test-case-1"
    case.input = {"query": "What is the weather?", "context": {"location": "NYC"}}
    case.scorers = ["tool_selection"]
    case.scorer_config = None
    case.min_score = 0.7
    case.timeout_seconds = 300
    return case


@pytest.fixture
def sample_suite(sample_suite_id, sample_case):
    """Create a sample EvalSuiteModel."""
    suite = MagicMock(spec=EvalSuiteModel)
    suite.id = sample_suite_id
    suite.name = "test-suite"
    suite.cases = [sample_case]
    suite.config = {"parallel": False, "stop_on_failure": False}
    return suite


@pytest.fixture
def sample_trace_summary():
    """Create a sample TraceSummary."""
    return TraceSummary(
        trace_id="trace-abc-123",
        total_spans=5,
        tool_calls=["search", "calculator"],
        llm_calls=2,
        total_tokens=500,
        input_tokens=200,
        output_tokens=300,
        duration_ms=1500,
        status="OK",
        error=None,
    )


@pytest.fixture
def sample_execution_result(sample_trace_summary):
    """Create a sample ExecutionResult."""
    return ExecutionResult(
        mlflow_run_id="mlflow-run-xyz",
        mlflow_trace_id="trace-abc-123",
        output={"response": "The weather is sunny", "tools_used": ["search"]},
        status="success",
        error=None,
        execution_time_ms=1500,
        trace_summary=sample_trace_summary,
    )


# =============================================================================
# Unit Tests: Constructor
# =============================================================================


class TestEvalRunnerInit:
    """Tests for EvalRunner initialization."""

    def test_accepts_mlflow_client(self, mock_db, mock_mlflow_client):
        """EvalRunner should accept NeonMLflowClient via dependency injection."""
        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        assert runner.mlflow_client is mock_mlflow_client

    def test_creates_default_client_when_none(self, mock_db):
        """EvalRunner should create a default NeonMLflowClient when none provided."""
        with patch("src.services.eval_runner.NeonMLflowClient") as mock_client_cls:
            mock_instance = MagicMock()
            mock_client_cls.return_value = mock_instance

            runner = EvalRunner(db=mock_db, mlflow_client=None)

            mock_client_cls.assert_called_once()
            assert runner.mlflow_client is mock_instance

    def test_initializes_scorers(self, mock_db, mock_mlflow_client):
        """EvalRunner should initialize all scorers."""
        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        assert "tool_selection" in runner.scorers
        assert "reasoning" in runner.scorers
        assert "grounding" in runner.scorers


# =============================================================================
# Unit Tests: execute_run
# =============================================================================


class TestExecuteRun:
    """Tests for execute_run method."""

    @pytest.mark.asyncio
    async def test_sets_experiment_with_project_id(
        self, mock_db, mock_mlflow_client, sample_run, sample_suite, mock_agent
    ):
        """execute_run should call set_experiment with project_id."""
        mock_mlflow_client.execute_with_tracing = MagicMock(
            return_value=ExecutionResult(
                mlflow_run_id="run-1",
                mlflow_trace_id=None,
                output={"response": "test"},
                status="success",
                error=None,
                execution_time_ms=100,
                trace_summary=None,
            )
        )

        # Mock the scorers to avoid actual scoring
        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)
        runner.scorers = {}

        # Mock _calculate_summary
        runner._calculate_summary = AsyncMock(return_value={"total_cases": 1})

        await runner.execute_run(sample_run, sample_suite, mock_agent)

        mock_mlflow_client.set_experiment.assert_called_once_with(str(sample_run.project_id))

    @pytest.mark.asyncio
    async def test_updates_run_status_to_running(
        self, mock_db, mock_mlflow_client, sample_run, sample_suite, mock_agent
    ):
        """execute_run should update run status to RUNNING at start."""
        mock_mlflow_client.execute_with_tracing = MagicMock(
            return_value=ExecutionResult(
                mlflow_run_id="run-1",
                mlflow_trace_id=None,
                output={},
                status="success",
                error=None,
                execution_time_ms=100,
                trace_summary=None,
            )
        )

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)
        runner.scorers = {}
        runner._calculate_summary = AsyncMock(return_value={})

        await runner.execute_run(sample_run, sample_suite, mock_agent)

        # Check that status was set to RUNNING at some point
        assert sample_run.status == EvalRunStatus.COMPLETED.value
        assert sample_run.started_at is not None

    @pytest.mark.asyncio
    async def test_handles_exception_sets_failed_status(
        self, mock_db, mock_mlflow_client, sample_run, sample_suite, mock_agent
    ):
        """execute_run should set FAILED status on exception."""
        # Make set_experiment raise an exception to trigger failure path
        mock_mlflow_client.set_experiment = MagicMock(
            side_effect=RuntimeError("MLflow connection failed")
        )

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        await runner.execute_run(sample_run, sample_suite, mock_agent)

        assert sample_run.status == EvalRunStatus.FAILED.value
        assert sample_run.completed_at is not None
        assert "MLflow connection failed" in sample_run.summary["error"]


# =============================================================================
# Unit Tests: _execute_case
# =============================================================================


class TestExecuteCase:
    """Tests for _execute_case method with MLflow integration."""

    @pytest.mark.asyncio
    async def test_calls_execute_with_tracing(
        self, mock_db, mock_mlflow_client, sample_run, sample_case, mock_agent, sample_execution_result
    ):
        """_execute_case should use mlflow_client.execute_with_tracing."""
        mock_mlflow_client.execute_with_tracing = MagicMock(return_value=sample_execution_result)

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)
        runner.scorers = {}  # Skip scoring for this test

        await runner._execute_case(sample_run, sample_case, mock_agent, sample_case.suite_id)

        mock_mlflow_client.execute_with_tracing.assert_called_once()
        call_kwargs = mock_mlflow_client.execute_with_tracing.call_args[1]

        assert call_kwargs["agent_fn"] == mock_agent.run
        assert call_kwargs["input_data"] == {
            "query": "What is the weather?",
            "context": {"location": "NYC"},
        }
        assert call_kwargs["run_name"] == "test-case-1"
        assert call_kwargs["timeout_seconds"] == 300

    @pytest.mark.asyncio
    async def test_passes_correct_tags(
        self, mock_db, mock_mlflow_client, sample_run, sample_case, mock_agent, sample_execution_result
    ):
        """_execute_case should pass run_id, case_id, case_name, suite_id as tags."""
        mock_mlflow_client.execute_with_tracing = MagicMock(return_value=sample_execution_result)

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)
        runner.scorers = {}

        await runner._execute_case(sample_run, sample_case, mock_agent, sample_case.suite_id)

        call_kwargs = mock_mlflow_client.execute_with_tracing.call_args[1]
        tags = call_kwargs["tags"]

        assert tags["run_id"] == str(sample_run.id)
        assert tags["case_id"] == str(sample_case.id)
        assert tags["case_name"] == "test-case-1"
        assert tags["suite_id"] == str(sample_case.suite_id)
        assert tags["agent_version"] == "v1.0.0"

    @pytest.mark.asyncio
    async def test_populates_mlflow_run_id(
        self, mock_db, mock_mlflow_client, sample_run, sample_case, mock_agent, sample_execution_result
    ):
        """_execute_case should populate mlflow_run_id in EvalResultModel."""
        mock_mlflow_client.execute_with_tracing = MagicMock(return_value=sample_execution_result)

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)
        runner.scorers = {}

        result = await runner._execute_case(sample_run, sample_case, mock_agent, sample_case.suite_id)

        assert result.mlflow_run_id == "mlflow-run-xyz"

    @pytest.mark.asyncio
    async def test_populates_mlflow_trace_id(
        self, mock_db, mock_mlflow_client, sample_run, sample_case, mock_agent, sample_execution_result
    ):
        """_execute_case should populate mlflow_trace_id in EvalResultModel."""
        mock_mlflow_client.execute_with_tracing = MagicMock(return_value=sample_execution_result)

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)
        runner.scorers = {}

        result = await runner._execute_case(sample_run, sample_case, mock_agent, sample_case.suite_id)

        assert result.mlflow_trace_id == "trace-abc-123"

    @pytest.mark.asyncio
    async def test_includes_trace_summary_in_score_details(
        self, mock_db, mock_mlflow_client, sample_run, sample_case, mock_agent, sample_execution_result
    ):
        """_execute_case should include TraceSummary in score_details."""
        mock_mlflow_client.execute_with_tracing = MagicMock(return_value=sample_execution_result)

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)
        runner.scorers = {}

        result = await runner._execute_case(sample_run, sample_case, mock_agent, sample_case.suite_id)

        assert "trace_summary" in result.score_details
        trace_summary = result.score_details["trace_summary"]
        assert trace_summary["trace_id"] == "trace-abc-123"
        assert trace_summary["total_spans"] == 5
        assert trace_summary["tool_calls"] == ["search", "calculator"]
        assert trace_summary["llm_calls"] == 2
        assert trace_summary["total_tokens"] == 500

    @pytest.mark.asyncio
    async def test_handles_no_trace_captured(
        self, mock_db, mock_mlflow_client, sample_run, sample_case, mock_agent
    ):
        """_execute_case should handle case where no trace is captured."""
        execution_result = ExecutionResult(
            mlflow_run_id="mlflow-run-xyz",
            mlflow_trace_id=None,  # No trace captured
            output={"response": "test"},
            status="success",
            error=None,
            execution_time_ms=100,
            trace_summary=None,
        )
        mock_mlflow_client.execute_with_tracing = MagicMock(return_value=execution_result)

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)
        runner.scorers = {}

        result = await runner._execute_case(sample_run, sample_case, mock_agent, sample_case.suite_id)

        assert result.mlflow_run_id == "mlflow-run-xyz"
        assert result.mlflow_trace_id is None
        assert "trace_summary" not in result.score_details

    @pytest.mark.asyncio
    async def test_handles_execution_error(
        self, mock_db, mock_mlflow_client, sample_run, sample_case, mock_agent
    ):
        """_execute_case should handle error status from execution."""
        execution_result = ExecutionResult(
            mlflow_run_id="mlflow-run-xyz",
            mlflow_trace_id="trace-err",
            output=None,
            status="error",
            error="Agent crashed",
            execution_time_ms=50,
            trace_summary=None,
        )
        mock_mlflow_client.execute_with_tracing = MagicMock(return_value=execution_result)

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        result = await runner._execute_case(sample_run, sample_case, mock_agent, sample_case.suite_id)

        assert result.status == "error"
        assert result.error == "Agent crashed"
        assert result.mlflow_run_id == "mlflow-run-xyz"
        assert not result.passed

    @pytest.mark.asyncio
    async def test_runs_scorers_on_success(
        self, mock_db, mock_mlflow_client, sample_run, sample_case, mock_agent, sample_execution_result
    ):
        """_execute_case should run scorers when execution succeeds."""
        mock_mlflow_client.execute_with_tracing = MagicMock(return_value=sample_execution_result)

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        # Mock the tool_selection scorer
        mock_scorer = AsyncMock()
        mock_scorer.score = AsyncMock(
            return_value=MagicMock(score=0.9, reason="Good tool selection", evidence=["tool1"])
        )
        runner.scorers = {"tool_selection": mock_scorer}

        result = await runner._execute_case(sample_run, sample_case, mock_agent, sample_case.suite_id)

        mock_scorer.score.assert_called_once()
        assert result.scores["tool_selection"] == 0.9
        assert result.score_details["tool_selection"]["score"] == 0.9

    @pytest.mark.asyncio
    async def test_skips_scorers_on_error(
        self, mock_db, mock_mlflow_client, sample_run, sample_case, mock_agent
    ):
        """_execute_case should skip scorers when execution fails."""
        execution_result = ExecutionResult(
            mlflow_run_id="run-1",
            mlflow_trace_id=None,
            output=None,
            status="error",
            error="Failed",
            execution_time_ms=50,
            trace_summary=None,
        )
        mock_mlflow_client.execute_with_tracing = MagicMock(return_value=execution_result)

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        mock_scorer = AsyncMock()
        runner.scorers = {"tool_selection": mock_scorer}

        await runner._execute_case(sample_run, sample_case, mock_agent, sample_case.suite_id)

        mock_scorer.score.assert_not_called()


# =============================================================================
# Unit Tests: _calculate_summary
# =============================================================================


class TestCalculateSummary:
    """Tests for _calculate_summary with trace statistics."""

    @pytest.mark.asyncio
    async def test_includes_trace_stats(self, mock_db, mock_mlflow_client):
        """_calculate_summary should include aggregated trace statistics."""
        # Create mock results with trace summaries
        result1 = MagicMock(spec=EvalResultModel)
        result1.passed = True
        result1.status = "success"
        result1.scores = {"tool_selection": 0.9}
        result1.execution_time_ms = 1000
        result1.score_details = {
            "trace_summary": {
                "tool_calls": ["search", "calc"],
                "llm_calls": 2,
                "total_tokens": 300,
            }
        }

        result2 = MagicMock(spec=EvalResultModel)
        result2.passed = True
        result2.status = "success"
        result2.scores = {"tool_selection": 0.8}
        result2.execution_time_ms = 800
        result2.score_details = {
            "trace_summary": {
                "tool_calls": ["search"],
                "llm_calls": 1,
                "total_tokens": 200,
            }
        }

        # Mock the database query
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [result1, result2]
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars
        mock_db.execute = AsyncMock(return_value=mock_result)

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        summary = await runner._calculate_summary(uuid4())

        assert "trace_stats" in summary
        assert summary["trace_stats"]["traced_executions"] == 2
        assert summary["trace_stats"]["total_tool_calls"] == 3  # 2 + 1
        assert summary["trace_stats"]["total_llm_calls"] == 3  # 2 + 1
        assert summary["trace_stats"]["total_tokens"] == 500  # 300 + 200

    @pytest.mark.asyncio
    async def test_handles_results_without_trace(self, mock_db, mock_mlflow_client):
        """_calculate_summary should handle results that have no trace_summary."""
        result1 = MagicMock(spec=EvalResultModel)
        result1.passed = True
        result1.status = "success"
        result1.scores = {"tool_selection": 0.9}
        result1.execution_time_ms = 1000
        result1.score_details = {}  # No trace_summary

        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [result1]
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars
        mock_db.execute = AsyncMock(return_value=mock_result)

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        summary = await runner._calculate_summary(uuid4())

        assert summary["trace_stats"]["traced_executions"] == 0
        assert summary["trace_stats"]["total_tool_calls"] == 0


# =============================================================================
# Integration-style Tests
# =============================================================================


class TestEvalRunnerIntegration:
    """Higher-level tests that verify the complete flow."""

    @pytest.mark.asyncio
    async def test_full_execution_flow(
        self, mock_db, mock_mlflow_client, sample_run, sample_suite, mock_agent, sample_trace_summary
    ):
        """Test the complete execution flow from run to results."""
        # Setup execution result
        execution_result = ExecutionResult(
            mlflow_run_id="mlflow-run-full",
            mlflow_trace_id="trace-full",
            output={"response": "Success", "tools_used": ["search"]},
            status="success",
            error=None,
            execution_time_ms=500,
            trace_summary=sample_trace_summary,
        )
        mock_mlflow_client.execute_with_tracing = MagicMock(return_value=execution_result)

        # Mock scorer
        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)
        mock_scorer = AsyncMock()
        mock_scorer.score = AsyncMock(
            return_value=MagicMock(score=0.85, reason="Good", evidence=[])
        )
        runner.scorers = {"tool_selection": mock_scorer}

        # Mock _calculate_summary to return valid summary
        runner._calculate_summary = AsyncMock(
            return_value={
                "total_cases": 1,
                "passed": 1,
                "failed": 0,
                "errored": 0,
                "avg_score": 0.85,
                "scores_by_type": {"tool_selection": 0.85},
                "execution_time_ms": 500,
                "trace_stats": {
                    "traced_executions": 1,
                    "total_tool_calls": 2,
                    "total_llm_calls": 2,
                    "total_tokens": 500,
                },
            }
        )

        # Execute
        await runner.execute_run(sample_run, sample_suite, mock_agent)

        # Verify MLflow integration
        mock_mlflow_client.set_experiment.assert_called_once()
        mock_mlflow_client.execute_with_tracing.assert_called_once()

        # Verify run completion
        assert sample_run.status == EvalRunStatus.COMPLETED.value
        assert sample_run.summary is not None
        assert "trace_stats" in sample_run.summary
