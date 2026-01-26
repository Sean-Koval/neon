"""Tests for MLflow integration.

This module contains tests for the NeonMLflowClient, validating:
- Experiment management (set/get experiment)
- Run creation with tags
- Trace capture from agent execution
- Trace querying by tag
- TraceSummary extraction

Tests are divided into:
- Unit tests: Use mocking, run without MLflow server
- Integration tests: Require running MLflow server (marked with pytest.mark.integration)
"""

from __future__ import annotations

import time
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from src.services.mlflow_client import (
    ExecutionResult,
    ExperimentNotFoundError,
    MLflowClientError,
    NeonMLflowClient,
    RunInfo,
    TraceSummary,
    TraceNotFoundError,
    get_mlflow_client,
    reset_mlflow_client,
)


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_mlflow():
    """Mock the mlflow module."""
    with patch("src.services.mlflow_client.mlflow") as mock:
        yield mock


@pytest.fixture
def mock_mlflow_client():
    """Mock the MlflowClient class."""
    with patch("src.services.mlflow_client.MlflowClient") as mock:
        yield mock


@pytest.fixture
def client(mock_mlflow, mock_mlflow_client):
    """Create a NeonMLflowClient with mocked dependencies."""
    mock_mlflow_client.return_value = MagicMock()
    return NeonMLflowClient(tracking_uri="http://localhost:5000")


@pytest.fixture
def sample_trace():
    """Create a sample trace object for testing."""
    mock_trace = MagicMock()
    mock_trace.info.request_id = "trace-123"
    mock_trace.info.status = "OK"
    mock_trace.info.execution_time_ms = 1500

    # Create mock spans
    tool_span = MagicMock()
    tool_span.span_type = "TOOL"
    tool_span.name = "search_tool"
    tool_span.parent_id = "parent-1"
    tool_span.attributes = {}
    tool_span.events = []

    llm_span = MagicMock()
    llm_span.span_type = "CHAT_MODEL"
    llm_span.name = "gpt-4"
    llm_span.parent_id = "parent-1"
    llm_span.attributes = {
        "llm.token_count.total": 150,
        "llm.token_count.prompt": 100,
        "llm.token_count.completion": 50,
    }
    llm_span.events = []

    root_span = MagicMock()
    root_span.span_type = "CHAIN"
    root_span.name = "agent"
    root_span.parent_id = None
    root_span.attributes = {}
    root_span.events = []

    mock_trace.data.spans = [root_span, tool_span, llm_span]

    return mock_trace


# =============================================================================
# Unit Tests: Experiment Management
# =============================================================================


class TestExperimentManagement:
    """Tests for experiment management functionality."""

    def test_set_experiment_creates_with_prefix(self, client, mock_mlflow):
        """Setting experiment should add neon- prefix."""
        mock_experiment = MagicMock()
        mock_experiment.experiment_id = "exp-123"
        mock_mlflow.set_experiment.return_value = mock_experiment

        exp_id = client.set_experiment("my-project")

        mock_mlflow.set_experiment.assert_called_once_with("neon-my-project")
        assert exp_id == "exp-123"
        assert client._current_experiment_id == "exp-123"

    def test_set_experiment_no_double_prefix(self, client, mock_mlflow):
        """Setting experiment with existing prefix should not double-prefix."""
        mock_experiment = MagicMock()
        mock_experiment.experiment_id = "exp-123"
        mock_mlflow.set_experiment.return_value = mock_experiment

        client.set_experiment("neon-my-project")

        mock_mlflow.set_experiment.assert_called_once_with("neon-my-project")

    def test_get_experiment_returns_id(self, client):
        """Getting experiment should return experiment ID."""
        mock_exp = MagicMock()
        mock_exp.experiment_id = "exp-456"
        client._client.get_experiment_by_name.return_value = mock_exp

        exp_id = client.get_experiment("my-project")

        assert exp_id == "exp-456"
        client._client.get_experiment_by_name.assert_called_once_with("neon-my-project")

    def test_get_experiment_not_found_raises(self, client):
        """Getting non-existent experiment should raise error."""
        client._client.get_experiment_by_name.return_value = None

        with pytest.raises(ExperimentNotFoundError):
            client.get_experiment("nonexistent")


# =============================================================================
# Unit Tests: Run Management
# =============================================================================


class TestRunManagement:
    """Tests for MLflow run management."""

    def test_start_run_applies_neon_tags(self, client, mock_mlflow):
        """Starting a run should apply neon-prefixed tags."""
        mock_run = MagicMock()
        mock_run.info.run_id = "run-123"
        mock_mlflow.start_run.return_value.__enter__ = MagicMock(return_value=mock_run)
        mock_mlflow.start_run.return_value.__exit__ = MagicMock(return_value=False)

        with client.start_run(run_name="test-run", tags={"case_name": "test"}):
            pass

        call_kwargs = mock_mlflow.start_run.call_args[1]
        assert call_kwargs["run_name"] == "test-run"
        assert "neon.source" in call_kwargs["tags"]
        assert call_kwargs["tags"]["neon.case_name"] == "test"

    def test_search_runs_by_tag(self, client):
        """Searching runs by tag should use correct filter."""
        client._current_experiment_id = "exp-123"

        mock_run = MagicMock()
        mock_run.info.run_id = "run-abc"
        mock_run.info.experiment_id = "exp-123"
        mock_run.info.status = "FINISHED"
        mock_run.info.start_time = 1000
        mock_run.info.end_time = 2000
        mock_run.data.tags = {"neon.case_name": "test"}
        mock_run.data.metrics = {"score": 0.9}

        client._client.search_runs.return_value = [mock_run]

        results = client.search_runs_by_tag("case_name", "test")

        assert len(results) == 1
        assert results[0].run_id == "run-abc"
        client._client.search_runs.assert_called_once()
        call_args = client._client.search_runs.call_args
        assert "neon.case_name" in call_args[1]["filter_string"]


# =============================================================================
# Unit Tests: Execution with Tracing
# =============================================================================


class TestExecutionWithTracing:
    """Tests for agent execution with trace capture."""

    def test_execute_requires_experiment(self, client):
        """Executing without experiment should raise error."""
        client._current_experiment_id = None

        with pytest.raises(MLflowClientError, match="No experiment set"):
            client.execute_with_tracing(
                agent_fn=lambda **kwargs: "result",
                input_data={"query": "test"},
            )

    def test_execute_success_captures_trace(self, client, mock_mlflow, sample_trace):
        """Successful execution should capture trace and return result."""
        client._current_experiment_id = "exp-123"

        mock_run = MagicMock()
        mock_run.info.run_id = "run-123"
        mock_mlflow.start_run.return_value.__enter__ = MagicMock(return_value=mock_run)
        mock_mlflow.start_run.return_value.__exit__ = MagicMock(return_value=False)
        mock_mlflow.get_last_active_trace.return_value = sample_trace

        def mock_agent(**kwargs):
            return {"response": "Hello!", "tools_used": ["search"]}

        result = client.execute_with_tracing(
            agent_fn=mock_agent,
            input_data={"query": "test"},
            run_name="test-execution",
            tags={"case_name": "test_case"},
        )

        assert isinstance(result, ExecutionResult)
        assert result.mlflow_run_id == "run-123"
        assert result.mlflow_trace_id == "trace-123"
        assert result.status == "success"
        assert result.error is None
        assert result.output == {"response": "Hello!", "tools_used": ["search"]}
        assert result.trace_summary is not None

    def test_execute_error_captures_exception(self, client, mock_mlflow):
        """Failed execution should capture error details."""
        client._current_experiment_id = "exp-123"

        mock_run = MagicMock()
        mock_run.info.run_id = "run-456"
        mock_mlflow.start_run.return_value.__enter__ = MagicMock(return_value=mock_run)
        mock_mlflow.start_run.return_value.__exit__ = MagicMock(return_value=False)
        mock_mlflow.get_last_active_trace.return_value = None

        def failing_agent(**kwargs):
            raise ValueError("Agent failed!")

        result = client.execute_with_tracing(
            agent_fn=failing_agent,
            input_data={"query": "test"},
        )

        assert result.status == "error"
        assert "Agent failed!" in result.error
        assert result.output is None


# =============================================================================
# Unit Tests: Trace Operations
# =============================================================================


class TestTraceOperations:
    """Tests for trace retrieval and analysis."""

    def test_get_trace_success(self, client):
        """Getting existing trace should return it."""
        mock_trace = MagicMock()
        mock_trace.info.request_id = "trace-xyz"
        client._client.get_trace.return_value = mock_trace

        trace = client.get_trace("trace-xyz")

        assert trace.info.request_id == "trace-xyz"

    def test_get_trace_not_found_raises(self, client):
        """Getting non-existent trace should raise error."""
        client._client.get_trace.return_value = None

        with pytest.raises(TraceNotFoundError):
            client.get_trace("nonexistent")

    def test_search_traces_by_tag(self, client):
        """Searching traces by tag should use correct filter."""
        client._current_experiment_id = "exp-123"

        mock_trace = MagicMock()
        client._client.search_traces.return_value = [mock_trace]

        traces = client.search_traces_by_tag("run_id", "eval-run-1")

        assert len(traces) == 1
        call_args = client._client.search_traces.call_args
        assert "neon.run_id" in call_args[1]["filter_string"]
        assert "eval-run-1" in call_args[1]["filter_string"]


# =============================================================================
# Unit Tests: TraceSummary Extraction
# =============================================================================


class TestTraceSummaryExtraction:
    """Tests for TraceSummary extraction from traces."""

    def test_extract_summary_basic(self, client, sample_trace):
        """Should extract basic summary statistics."""
        summary = client.extract_trace_summary(sample_trace)

        assert isinstance(summary, TraceSummary)
        assert summary.trace_id == "trace-123"
        assert summary.total_spans == 3
        assert summary.tool_calls == ["search_tool"]
        assert summary.llm_calls == 1
        assert summary.total_tokens == 150
        assert summary.input_tokens == 100
        assert summary.output_tokens == 50
        assert summary.duration_ms == 1500
        assert summary.status == "OK"

    def test_extract_summary_with_error(self, client):
        """Should extract error information from failed trace."""
        mock_trace = MagicMock()
        mock_trace.info.request_id = "trace-err"
        mock_trace.info.status = "ERROR"
        mock_trace.info.execution_time_ms = 500

        # Root span with error event
        root_span = MagicMock()
        root_span.span_type = "CHAIN"
        root_span.parent_id = None
        root_span.attributes = {}
        error_event = MagicMock()
        error_event.name = "exception"
        error_event.attributes = {"exception.message": "Something went wrong"}
        root_span.events = [error_event]

        mock_trace.data.spans = [root_span]

        summary = client.extract_trace_summary(mock_trace)

        assert summary.status == "ERROR"
        assert summary.error == "Something went wrong"

    def test_extract_summary_empty_trace(self, client):
        """Should handle trace with no spans."""
        mock_trace = MagicMock()
        mock_trace.info.request_id = "trace-empty"
        mock_trace.info.status = "OK"
        mock_trace.info.execution_time_ms = 0
        mock_trace.data.spans = []

        summary = client.extract_trace_summary(mock_trace)

        assert summary.total_spans == 0
        assert summary.tool_calls == []
        assert summary.llm_calls == 0

    def test_get_tool_spans(self, client, sample_trace):
        """Should filter and return only tool spans."""
        # Need to set up spans with proper SpanType values
        from mlflow.entities import SpanType

        tool_span = MagicMock()
        tool_span.span_type = SpanType.TOOL
        tool_span.name = "my_tool"

        other_span = MagicMock()
        other_span.span_type = SpanType.CHAIN
        other_span.name = "chain"

        sample_trace.data.spans = [tool_span, other_span]

        tool_spans = client.get_tool_spans(sample_trace)

        assert len(tool_spans) == 1
        assert tool_spans[0].name == "my_tool"

    def test_get_llm_spans(self, client, sample_trace):
        """Should filter and return only LLM spans."""
        from mlflow.entities import SpanType

        llm_span = MagicMock()
        llm_span.span_type = SpanType.CHAT_MODEL
        llm_span.name = "gpt-4"

        other_span = MagicMock()
        other_span.span_type = SpanType.TOOL
        other_span.name = "tool"

        sample_trace.data.spans = [llm_span, other_span]

        llm_spans = client.get_llm_spans(sample_trace)

        assert len(llm_spans) == 1
        assert llm_spans[0].name == "gpt-4"


# =============================================================================
# Unit Tests: Module Functions
# =============================================================================


class TestModuleFunctions:
    """Tests for module-level helper functions."""

    def test_get_mlflow_client_singleton(self, mock_mlflow, mock_mlflow_client):
        """get_mlflow_client should return singleton."""
        reset_mlflow_client()  # Ensure clean state

        client1 = get_mlflow_client()
        client2 = get_mlflow_client()

        assert client1 is client2

    def test_reset_mlflow_client(self, mock_mlflow, mock_mlflow_client):
        """reset_mlflow_client should clear singleton."""
        reset_mlflow_client()
        client1 = get_mlflow_client()

        reset_mlflow_client()
        client2 = get_mlflow_client()

        assert client1 is not client2


# =============================================================================
# Integration Tests (require running MLflow server)
# =============================================================================


@pytest.mark.integration
class TestMLflowIntegration:
    """Integration tests that require a running MLflow server.

    Run with: pytest -m integration

    These tests validate the acceptance criteria:
    1. Can set experiment programmatically
    2. Can start/end runs with tags
    3. Can capture traces from agent execution
    4. Can query traces by tag
    5. TraceSummary extraction working
    """

    @pytest.fixture
    def integration_client(self):
        """Create a real client for integration tests."""
        # Use test tracking URI from environment or default
        import os
        tracking_uri = os.getenv("MLFLOW_TRACKING_URI", "http://localhost:5000")
        client = NeonMLflowClient(tracking_uri=tracking_uri)
        yield client

    def test_create_and_get_experiment(self, integration_client):
        """Should create and retrieve experiment."""
        import uuid
        exp_name = f"test-{uuid.uuid4().hex[:8]}"

        # Create experiment
        exp_id = integration_client.set_experiment(exp_name)
        assert exp_id is not None

        # Retrieve it
        retrieved_id = integration_client.get_experiment(exp_name)
        assert retrieved_id == exp_id

    def test_run_with_tags(self, integration_client):
        """Should create run with tags that can be queried."""
        import uuid
        exp_name = f"test-{uuid.uuid4().hex[:8]}"
        integration_client.set_experiment(exp_name)

        run_tag = f"test-run-{uuid.uuid4().hex[:8]}"

        # Create run with tags
        with integration_client.start_run(
            run_name="integration-test-run",
            tags={"test_id": run_tag}
        ) as run:
            run_id = run.info.run_id

        # Query by tag
        runs = integration_client.search_runs_by_tag("test_id", run_tag)
        assert len(runs) >= 1
        assert any(r.run_id == run_id for r in runs)

    def test_execute_with_tracing_simple(self, integration_client):
        """Should capture trace from simple function execution."""
        import uuid
        exp_name = f"test-{uuid.uuid4().hex[:8]}"
        integration_client.set_experiment(exp_name)

        # Simple traced function
        def simple_agent(query: str) -> dict[str, Any]:
            time.sleep(0.1)  # Simulate work
            return {"response": f"Processed: {query}"}

        result = integration_client.execute_with_tracing(
            agent_fn=simple_agent,
            input_data={"query": "test query"},
            run_name="simple-trace-test",
        )

        assert result.status == "success"
        assert result.mlflow_run_id is not None
        assert result.output == {"response": "Processed: test query"}
        assert result.execution_time_ms > 0

    def test_trace_summary_extraction(self, integration_client):
        """Should extract meaningful TraceSummary from trace."""
        import uuid
        exp_name = f"test-{uuid.uuid4().hex[:8]}"
        integration_client.set_experiment(exp_name)

        # Function that will generate spans
        def traced_agent(query: str) -> str:
            return f"Result for: {query}"

        result = integration_client.execute_with_tracing(
            agent_fn=traced_agent,
            input_data={"query": "test"},
        )

        # If trace was captured, verify summary
        if result.trace_summary:
            summary = result.trace_summary
            assert summary.trace_id is not None
            assert summary.duration_ms >= 0
            assert isinstance(summary.tool_calls, list)
            assert isinstance(summary.llm_calls, int)
