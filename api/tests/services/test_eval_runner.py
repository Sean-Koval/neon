"""Tests for EvalRunner with MLflow integration.

This module validates that EvalRunner properly integrates with NeonMLflowClient:
- Injects MLflow client dependency
- Sets experiment per project_id at run start
- Uses execute_with_tracing() for agent execution
- Populates mlflow_run_id and mlflow_trace_id in results
- Includes TraceSummary in score_details
- Handles tracing failures gracefully
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.models.db import EvalCaseModel, EvalResultModel, EvalRunModel, EvalSuiteModel
from src.models.eval import EvalRunStatus
from src.services.eval_runner import AgentProtocol, EvalRunner
from src.services.mlflow_client import ExecutionResult, TraceSummary

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_db():
    """Create a mock async database session."""
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.execute = AsyncMock()
    return db


@pytest.fixture
def mock_mlflow_client():
    """Create a mock NeonMLflowClient."""
    client = MagicMock()
    client.set_experiment = MagicMock(return_value="exp-123")
    client.execute_with_tracing = MagicMock()
    return client


@pytest.fixture
def mock_project():
    """Create a mock project."""
    project = MagicMock()
    project.id = uuid4()
    project.name = "test-project"
    project.slug = "test-project"
    return project


@pytest.fixture
def mock_suite(mock_project):
    """Create a mock eval suite."""
    suite = MagicMock(spec=EvalSuiteModel)
    suite.id = uuid4()
    suite.project_id = mock_project.id
    suite.name = "test-suite"
    suite.agent_id = "test-agent"
    suite.config = {"parallel": False}
    suite.cases = []
    return suite


@pytest.fixture
def mock_case(mock_suite):
    """Create a mock eval case."""
    case = MagicMock(spec=EvalCaseModel)
    case.id = uuid4()
    case.suite_id = mock_suite.id
    case.name = "test-case"
    case.input = {"query": "What is 2+2?", "context": {}}
    case.expected_tools = None
    case.expected_tool_sequence = None
    case.expected_output_contains = None
    case.expected_output_pattern = None
    case.scorers = []  # No scorers to simplify tests
    case.scorer_config = None
    case.min_score = 0.7
    case.timeout_seconds = 300
    case.tags = []
    return case


@pytest.fixture
def mock_run(mock_suite, mock_project):
    """Create a mock eval run."""
    run = MagicMock(spec=EvalRunModel)
    run.id = uuid4()
    run.suite_id = mock_suite.id
    run.project_id = mock_project.id
    run.agent_version = "v1.0.0"
    run.trigger = "manual"
    run.status = "pending"
    run.config = None
    run.summary = None
    run.started_at = None
    run.completed_at = None
    return run


@pytest.fixture
def mock_agent():
    """Create a mock agent that implements AgentProtocol."""
    agent = MagicMock(spec=AgentProtocol)
    agent.run = MagicMock(return_value={"response": "4", "tools_used": []})
    return agent


@pytest.fixture
def sample_trace_summary():
    """Create a sample TraceSummary."""
    return TraceSummary(
        trace_id="trace-abc123",
        total_spans=5,
        tool_calls=["calculator", "search"],
        llm_calls=2,
        total_tokens=500,
        input_tokens=300,
        output_tokens=200,
        duration_ms=1500,
        status="OK",
        error=None,
    )


@pytest.fixture
def sample_execution_result(sample_trace_summary):
    """Create a sample ExecutionResult."""
    return ExecutionResult(
        mlflow_run_id="run-xyz789",
        mlflow_trace_id="trace-abc123",
        output={"response": "4", "tools_used": ["calculator"]},
        status="success",
        error=None,
        execution_time_ms=1500,
        trace_summary=sample_trace_summary,
    )


# =============================================================================
# Unit Tests: Constructor and Dependency Injection
# =============================================================================


class TestEvalRunnerInit:
    """Tests for EvalRunner initialization."""

    def test_init_with_explicit_mlflow_client(self, mock_db, mock_mlflow_client):
        """Should use injected MLflow client."""
        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        assert runner.db is mock_db
        assert runner.mlflow_client is mock_mlflow_client

    @patch("src.services.eval_runner.get_mlflow_client")
    def test_init_uses_default_client_when_none_provided(self, mock_get_client, mock_db):
        """Should use singleton client when none provided."""
        default_client = MagicMock()
        mock_get_client.return_value = default_client

        runner = EvalRunner(db=mock_db)

        mock_get_client.assert_called_once()
        assert runner.mlflow_client is default_client

    def test_init_creates_scorers(self, mock_db, mock_mlflow_client):
        """Should initialize all scorers."""
        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        assert "tool_selection" in runner.scorers
        assert "reasoning" in runner.scorers
        assert "grounding" in runner.scorers


# =============================================================================
# Unit Tests: execute_run() with MLflow
# =============================================================================


class TestExecuteRunMLflow:
    """Tests for execute_run() MLflow integration."""

    @pytest.mark.asyncio
    async def test_sets_experiment_from_project_id(
        self, mock_db, mock_mlflow_client, mock_run, mock_suite, mock_agent
    ):
        """Should set MLflow experiment using project_id."""
        mock_suite.cases = []
        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        await runner.execute_run(mock_run, mock_suite, mock_agent)

        mock_mlflow_client.set_experiment.assert_called_once_with(str(mock_run.project_id))

    @pytest.mark.asyncio
    async def test_updates_run_status_to_running(
        self, mock_db, mock_mlflow_client, mock_run, mock_suite, mock_agent
    ):
        """Should update run status to RUNNING at start."""
        mock_suite.cases = []
        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        await runner.execute_run(mock_run, mock_suite, mock_agent)

        # Verify status was set to RUNNING (may have been changed to COMPLETED after)
        assert mock_run.started_at is not None

    @pytest.mark.asyncio
    async def test_updates_run_status_to_completed_on_success(
        self, mock_db, mock_mlflow_client, mock_run, mock_suite, mock_agent
    ):
        """Should update run status to COMPLETED on success."""
        mock_suite.cases = []
        # Mock the _calculate_summary - need proper async mock chain
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute = AsyncMock(return_value=mock_result)
        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        await runner.execute_run(mock_run, mock_suite, mock_agent)

        assert mock_run.status == EvalRunStatus.COMPLETED.value
        assert mock_run.completed_at is not None


# =============================================================================
# Unit Tests: _execute_case() with MLflow Tracing
# =============================================================================


class TestExecuteCaseMLflow:
    """Tests for _execute_case() MLflow tracing integration."""

    @pytest.mark.asyncio
    async def test_calls_execute_with_tracing(
        self,
        mock_db,
        mock_mlflow_client,
        mock_run,
        mock_suite,
        mock_case,
        mock_agent,
        sample_execution_result,
    ):
        """Should use execute_with_tracing for agent execution."""
        mock_mlflow_client.execute_with_tracing.return_value = sample_execution_result
        mock_suite.cases = [mock_case]
        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        await runner._execute_case(mock_run, mock_case, mock_suite, mock_agent)

        mock_mlflow_client.execute_with_tracing.assert_called_once()
        call_kwargs = mock_mlflow_client.execute_with_tracing.call_args[1]
        assert "agent_fn" in call_kwargs
        assert call_kwargs["input_data"] == {"query": "What is 2+2?", "context": {}}

    @pytest.mark.asyncio
    async def test_passes_correct_tags(
        self,
        mock_db,
        mock_mlflow_client,
        mock_run,
        mock_suite,
        mock_case,
        mock_agent,
        sample_execution_result,
    ):
        """Should pass correct neon.* tags to execute_with_tracing."""
        mock_mlflow_client.execute_with_tracing.return_value = sample_execution_result
        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        await runner._execute_case(mock_run, mock_case, mock_suite, mock_agent)

        call_kwargs = mock_mlflow_client.execute_with_tracing.call_args[1]
        tags = call_kwargs["tags"]

        assert tags["run_id"] == str(mock_run.id)
        assert tags["case_name"] == mock_case.name
        assert tags["suite_id"] == str(mock_suite.id)
        assert tags["suite_name"] == mock_suite.name
        assert tags["project_id"] == str(mock_run.project_id)
        assert tags["agent_version"] == mock_run.agent_version

    @pytest.mark.asyncio
    async def test_sets_run_name_correctly(
        self,
        mock_db,
        mock_mlflow_client,
        mock_run,
        mock_suite,
        mock_case,
        mock_agent,
        sample_execution_result,
    ):
        """Should set run_name as run_id/case_name."""
        mock_mlflow_client.execute_with_tracing.return_value = sample_execution_result
        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        await runner._execute_case(mock_run, mock_case, mock_suite, mock_agent)

        call_kwargs = mock_mlflow_client.execute_with_tracing.call_args[1]
        expected_run_name = f"{mock_run.id}/{mock_case.name}"
        assert call_kwargs["run_name"] == expected_run_name

    @pytest.mark.asyncio
    async def test_populates_mlflow_run_id(
        self,
        mock_db,
        mock_mlflow_client,
        mock_run,
        mock_suite,
        mock_case,
        mock_agent,
        sample_execution_result,
    ):
        """Should populate mlflow_run_id in result."""
        mock_mlflow_client.execute_with_tracing.return_value = sample_execution_result
        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        result = await runner._execute_case(mock_run, mock_case, mock_suite, mock_agent)

        assert result.mlflow_run_id == "run-xyz789"

    @pytest.mark.asyncio
    async def test_populates_mlflow_trace_id(
        self,
        mock_db,
        mock_mlflow_client,
        mock_run,
        mock_suite,
        mock_case,
        mock_agent,
        sample_execution_result,
    ):
        """Should populate mlflow_trace_id in result."""
        mock_mlflow_client.execute_with_tracing.return_value = sample_execution_result
        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        result = await runner._execute_case(mock_run, mock_case, mock_suite, mock_agent)

        assert result.mlflow_trace_id == "trace-abc123"

    @pytest.mark.asyncio
    async def test_includes_trace_summary_in_score_details(
        self,
        mock_db,
        mock_mlflow_client,
        mock_run,
        mock_suite,
        mock_case,
        mock_agent,
        sample_execution_result,
    ):
        """Should include TraceSummary in score_details."""
        mock_mlflow_client.execute_with_tracing.return_value = sample_execution_result
        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        result = await runner._execute_case(mock_run, mock_case, mock_suite, mock_agent)

        assert "trace_summary" in result.score_details
        trace_summary = result.score_details["trace_summary"]
        assert trace_summary["trace_id"] == "trace-abc123"
        assert trace_summary["tool_calls"] == ["calculator", "search"]
        assert trace_summary["llm_calls"] == 2
        assert trace_summary["total_tokens"] == 500

    @pytest.mark.asyncio
    async def test_handles_execution_without_trace(
        self,
        mock_db,
        mock_mlflow_client,
        mock_run,
        mock_suite,
        mock_case,
        mock_agent,
    ):
        """Should handle execution where trace is not captured."""
        exec_result = ExecutionResult(
            mlflow_run_id="run-no-trace",
            mlflow_trace_id=None,  # No trace captured
            output={"response": "result"},
            status="success",
            error=None,
            execution_time_ms=100,
            trace_summary=None,
        )
        mock_mlflow_client.execute_with_tracing.return_value = exec_result
        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        result = await runner._execute_case(mock_run, mock_case, mock_suite, mock_agent)

        assert result.mlflow_run_id == "run-no-trace"
        assert result.mlflow_trace_id is None
        assert "trace_summary" not in result.score_details

    @pytest.mark.asyncio
    async def test_handles_execution_error(
        self,
        mock_db,
        mock_mlflow_client,
        mock_run,
        mock_suite,
        mock_case,
        mock_agent,
    ):
        """Should handle agent execution error."""
        exec_result = ExecutionResult(
            mlflow_run_id="run-error",
            mlflow_trace_id="trace-error",
            output=None,
            status="error",
            error="Agent crashed!",
            execution_time_ms=50,
            trace_summary=None,
        )
        mock_mlflow_client.execute_with_tracing.return_value = exec_result
        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        result = await runner._execute_case(mock_run, mock_case, mock_suite, mock_agent)

        assert result.status == "error"
        assert result.error == "Agent crashed!"
        assert result.mlflow_run_id == "run-error"
        assert not result.passed

    @pytest.mark.asyncio
    async def test_uses_execution_time_from_mlflow(
        self,
        mock_db,
        mock_mlflow_client,
        mock_run,
        mock_suite,
        mock_case,
        mock_agent,
        sample_execution_result,
    ):
        """Should use execution_time_ms from MLflow result."""
        mock_mlflow_client.execute_with_tracing.return_value = sample_execution_result
        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        result = await runner._execute_case(mock_run, mock_case, mock_suite, mock_agent)

        assert result.execution_time_ms == 1500

    @pytest.mark.asyncio
    async def test_stores_result_in_database(
        self,
        mock_db,
        mock_mlflow_client,
        mock_run,
        mock_suite,
        mock_case,
        mock_agent,
        sample_execution_result,
    ):
        """Should store EvalResultModel in database."""
        mock_mlflow_client.execute_with_tracing.return_value = sample_execution_result
        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        await runner._execute_case(mock_run, mock_case, mock_suite, mock_agent)

        mock_db.add.assert_called_once()
        added_result = mock_db.add.call_args[0][0]
        assert isinstance(added_result, EvalResultModel)
        mock_db.commit.assert_called()


# =============================================================================
# Unit Tests: Agent Callable Wrapper
# =============================================================================


class TestAgentCallableWrapper:
    """Tests for agent callable wrapper in _execute_case."""

    @pytest.mark.asyncio
    async def test_wraps_protocol_agent(
        self,
        mock_db,
        mock_mlflow_client,
        mock_run,
        mock_suite,
        mock_case,
        sample_execution_result,
    ):
        """Should wrap AgentProtocol and call run method."""
        mock_mlflow_client.execute_with_tracing.return_value = sample_execution_result

        # Create a protocol-based agent
        agent = MagicMock(spec=AgentProtocol)
        agent.run = MagicMock(return_value={"output": "test"})

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)
        await runner._execute_case(mock_run, mock_case, mock_suite, agent)

        # Get the agent_fn that was passed to execute_with_tracing
        call_kwargs = mock_mlflow_client.execute_with_tracing.call_args[1]
        agent_fn = call_kwargs["agent_fn"]

        # Call it to verify it calls agent.run
        agent_fn("test query", {"key": "value"})
        agent.run.assert_called_once_with("test query", {"key": "value"})

    @pytest.mark.asyncio
    async def test_wraps_callable_agent(
        self,
        mock_db,
        mock_mlflow_client,
        mock_run,
        mock_suite,
        mock_case,
        sample_execution_result,
    ):
        """Should wrap plain callable and call it directly."""
        mock_mlflow_client.execute_with_tracing.return_value = sample_execution_result

        # Create a plain callable agent (no run method)
        def callable_agent(query: str, context: dict[str, Any] | None = None) -> dict:
            return {"output": f"processed: {query}"}

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)
        await runner._execute_case(mock_run, mock_case, mock_suite, callable_agent)

        # Get the agent_fn that was passed
        call_kwargs = mock_mlflow_client.execute_with_tracing.call_args[1]
        agent_fn = call_kwargs["agent_fn"]

        # Call it to verify it works
        result = agent_fn("hello", {})
        assert result == {"output": "processed: hello"}


# =============================================================================
# Unit Tests: Edge Cases
# =============================================================================


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    @pytest.mark.asyncio
    async def test_handles_missing_agent_version(
        self,
        mock_db,
        mock_mlflow_client,
        mock_run,
        mock_suite,
        mock_case,
        mock_agent,
        sample_execution_result,
    ):
        """Should handle run without agent_version."""
        mock_run.agent_version = None
        mock_mlflow_client.execute_with_tracing.return_value = sample_execution_result
        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        await runner._execute_case(mock_run, mock_case, mock_suite, mock_agent)

        call_kwargs = mock_mlflow_client.execute_with_tracing.call_args[1]
        tags = call_kwargs["tags"]
        assert "agent_version" not in tags

    @pytest.mark.asyncio
    async def test_handles_empty_input_context(
        self,
        mock_db,
        mock_mlflow_client,
        mock_run,
        mock_suite,
        mock_case,
        mock_agent,
        sample_execution_result,
    ):
        """Should handle case with no context in input."""
        mock_case.input = {"query": "test"}  # No context key
        mock_mlflow_client.execute_with_tracing.return_value = sample_execution_result
        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        await runner._execute_case(mock_run, mock_case, mock_suite, mock_agent)

        call_kwargs = mock_mlflow_client.execute_with_tracing.call_args[1]
        assert call_kwargs["input_data"] == {"query": "test", "context": {}}

    @pytest.mark.asyncio
    async def test_timeout_error_handling(
        self,
        mock_db,
        mock_mlflow_client,
        mock_run,
        mock_suite,
        mock_case,
        mock_agent,
    ):
        """Should handle TimeoutError during execution."""
        mock_mlflow_client.execute_with_tracing.side_effect = TimeoutError()
        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        result = await runner._execute_case(mock_run, mock_case, mock_suite, mock_agent)

        assert result.status == "timeout"
        assert "timed out" in result.error
        assert not result.passed

    @pytest.mark.asyncio
    async def test_general_exception_handling(
        self,
        mock_db,
        mock_mlflow_client,
        mock_run,
        mock_suite,
        mock_case,
        mock_agent,
    ):
        """Should handle unexpected exceptions."""
        mock_mlflow_client.execute_with_tracing.side_effect = RuntimeError("Unexpected!")
        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)

        result = await runner._execute_case(mock_run, mock_case, mock_suite, mock_agent)

        assert result.status == "error"
        assert "Unexpected!" in result.error
        assert not result.passed


# =============================================================================
# Integration-style Tests (using more complete mocking)
# =============================================================================


class TestFullRunExecution:
    """Tests for complete run execution flow."""

    @pytest.mark.asyncio
    async def test_full_run_with_multiple_cases(
        self,
        mock_db,
        mock_mlflow_client,
        mock_run,
        mock_suite,
        mock_agent,
    ):
        """Should execute all cases with MLflow tracing."""
        # Create multiple cases
        case1 = MagicMock(spec=EvalCaseModel)
        case1.id = uuid4()
        case1.suite_id = mock_suite.id
        case1.name = "case-1"
        case1.input = {"query": "query1", "context": {}}
        case1.scorers = []
        case1.scorer_config = None
        case1.min_score = 0.7
        case1.timeout_seconds = 300

        case2 = MagicMock(spec=EvalCaseModel)
        case2.id = uuid4()
        case2.suite_id = mock_suite.id
        case2.name = "case-2"
        case2.input = {"query": "query2", "context": {}}
        case2.scorers = []
        case2.scorer_config = None
        case2.min_score = 0.7
        case2.timeout_seconds = 300

        mock_suite.cases = [case1, case2]
        mock_suite.config = {"parallel": False}

        # Setup execution results
        exec_result1 = ExecutionResult(
            mlflow_run_id="run-1",
            mlflow_trace_id="trace-1",
            output={"response": "result1"},
            status="success",
            error=None,
            execution_time_ms=100,
            trace_summary=None,
        )
        exec_result2 = ExecutionResult(
            mlflow_run_id="run-2",
            mlflow_trace_id="trace-2",
            output={"response": "result2"},
            status="success",
            error=None,
            execution_time_ms=150,
            trace_summary=None,
        )
        mock_mlflow_client.execute_with_tracing.side_effect = [exec_result1, exec_result2]

        # Mock summary calculation - need proper async mock chain
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute = AsyncMock(return_value=mock_result)

        runner = EvalRunner(db=mock_db, mlflow_client=mock_mlflow_client)
        await runner.execute_run(mock_run, mock_suite, mock_agent)

        # Verify both cases were executed
        assert mock_mlflow_client.execute_with_tracing.call_count == 2

        # Verify experiment was set once
        mock_mlflow_client.set_experiment.assert_called_once()

        # Verify run completed
        assert mock_run.status == EvalRunStatus.COMPLETED.value
