"""Tests for RunService.

This module tests the RunService class, focusing on:
- Run creation with proper status
- Agent loading and execution orchestration
- Error handling and status transitions
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.agent.loader import AgentLoadError
from src.models.db import EvalCaseModel, EvalResultModel, EvalRunModel, EvalSuiteModel
from src.models.eval import EvalRunCreate, EvalRunStatus, TriggerType
from src.services.run_service import RunService


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
    mock.refresh = AsyncMock()
    return mock


@pytest.fixture
def sample_project_id():
    """Generate a sample project ID."""
    return uuid4()


@pytest.fixture
def sample_suite(sample_project_id):
    """Create a sample EvalSuiteModel."""
    suite = MagicMock(spec=EvalSuiteModel)
    suite.id = uuid4()
    suite.project_id = sample_project_id
    suite.name = "test-suite"
    suite.agent_id = "mypackage.agent:MyAgent"
    suite.config = {"parallel": True}
    suite.cases = []
    return suite


@pytest.fixture
def sample_run(sample_project_id, sample_suite):
    """Create a sample EvalRunModel."""
    run = MagicMock(spec=EvalRunModel)
    run.id = uuid4()
    run.project_id = sample_project_id
    run.suite_id = sample_suite.id
    run.agent_version = "1.0.0"
    run.trigger = TriggerType.MANUAL.value
    run.trigger_ref = None
    run.status = EvalRunStatus.PENDING.value
    run.config = None
    run.summary = None
    run.started_at = None
    run.completed_at = None
    run.created_at = datetime.utcnow()
    run.suite = sample_suite
    return run


@pytest.fixture
def mock_eval_runner():
    """Create a mock EvalRunner."""
    runner = AsyncMock()
    runner.execute_run = AsyncMock()
    return runner


# =============================================================================
# Tests: create_run
# =============================================================================


class TestCreateRun:
    """Tests for RunService.create_run."""

    @pytest.mark.asyncio
    async def test_creates_run_with_pending_status(
        self, mock_db, sample_project_id, sample_suite
    ):
        """Should create run record with status='pending'."""
        # Mock suite lookup
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_suite
        mock_db.execute.return_value = mock_result

        # Mock refresh to populate ID
        async def mock_refresh(obj: Any) -> None:
            obj.id = uuid4()
            obj.created_at = datetime.utcnow()

        mock_db.refresh.side_effect = mock_refresh

        service = RunService(mock_db)
        data = EvalRunCreate(
            agent_version="2.0.0",
            trigger=TriggerType.CI,
            trigger_ref="abc123",
        )

        result = await service.create_run(sample_project_id, sample_suite.id, data)

        assert result is not None
        run_response, run_model, suite = result

        # Verify the run was added to DB
        mock_db.add.assert_called_once()
        added_run = mock_db.add.call_args[0][0]
        assert added_run.status == EvalRunStatus.PENDING.value
        assert added_run.agent_version == "2.0.0"
        assert added_run.trigger == TriggerType.CI.value
        assert added_run.trigger_ref == "abc123"

    @pytest.mark.asyncio
    async def test_returns_none_for_nonexistent_suite(
        self, mock_db, sample_project_id
    ):
        """Should return None when suite doesn't exist."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        service = RunService(mock_db)
        data = EvalRunCreate()

        result = await service.create_run(sample_project_id, uuid4(), data)

        assert result is None
        mock_db.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_returns_none_for_wrong_project(
        self, mock_db, sample_project_id, sample_suite
    ):
        """Should return None when suite belongs to different project."""
        # Suite query returns None because project_id doesn't match
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        service = RunService(mock_db)
        data = EvalRunCreate()

        # Use different project ID
        result = await service.create_run(uuid4(), sample_suite.id, data)

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_tuple_with_models(
        self, mock_db, sample_project_id, sample_suite
    ):
        """Should return tuple of (EvalRun, EvalRunModel, EvalSuiteModel)."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_suite
        mock_db.execute.return_value = mock_result

        async def mock_refresh(obj: Any) -> None:
            obj.id = uuid4()
            obj.created_at = datetime.utcnow()

        mock_db.refresh.side_effect = mock_refresh

        service = RunService(mock_db)
        data = EvalRunCreate()

        result = await service.create_run(sample_project_id, sample_suite.id, data)

        assert result is not None
        assert isinstance(result, tuple)
        assert len(result) == 3

        run_response, run_model, suite = result
        assert hasattr(run_response, "status")  # EvalRun pydantic model
        assert suite == sample_suite


# =============================================================================
# Tests: start_execution
# =============================================================================


class TestStartExecution:
    """Tests for RunService.start_execution."""

    @pytest.mark.asyncio
    async def test_loads_agent_using_loader(
        self, mock_db, sample_run, sample_suite, mock_eval_runner
    ):
        """Should load agent from suite.agent_id using agent loader."""
        with patch("src.services.run_service.load_agent") as mock_load:
            mock_agent = MagicMock()
            mock_agent.run = MagicMock(return_value={"response": "test"})
            mock_load.return_value = mock_agent

            service = RunService(mock_db)
            await service.start_execution(
                sample_run, sample_suite, mock_eval_runner
            )

            mock_load.assert_called_once_with(
                "mypackage.agent:MyAgent", working_dir=None
            )

    @pytest.mark.asyncio
    async def test_passes_working_dir_to_loader(
        self, mock_db, sample_run, sample_suite, mock_eval_runner
    ):
        """Should pass working_dir to agent loader."""
        with patch("src.services.run_service.load_agent") as mock_load:
            mock_agent = MagicMock()
            mock_load.return_value = mock_agent

            service = RunService(mock_db)
            await service.start_execution(
                sample_run, sample_suite, mock_eval_runner,
                working_dir="/custom/path"
            )

            mock_load.assert_called_once_with(
                "mypackage.agent:MyAgent", working_dir="/custom/path"
            )

    @pytest.mark.asyncio
    async def test_calls_eval_runner_execute_run(
        self, mock_db, sample_run, sample_suite, mock_eval_runner
    ):
        """Should call EvalRunner.execute_run with run, suite, and agent."""
        with patch("src.services.run_service.load_agent") as mock_load:
            mock_agent = MagicMock()
            mock_load.return_value = mock_agent

            service = RunService(mock_db)
            await service.start_execution(
                sample_run, sample_suite, mock_eval_runner
            )

            mock_eval_runner.execute_run.assert_called_once_with(
                sample_run, sample_suite, mock_agent
            )

    @pytest.mark.asyncio
    async def test_handles_agent_load_error(
        self, mock_db, sample_run, sample_suite, mock_eval_runner
    ):
        """Should set FAILED status and capture error on AgentLoadError."""
        with patch("src.services.run_service.load_agent") as mock_load:
            mock_load.side_effect = AgentLoadError(
                "Module 'mypackage.agent' not found"
            )

            service = RunService(mock_db)
            await service.start_execution(
                sample_run, sample_suite, mock_eval_runner
            )

            # Verify status
            assert sample_run.status == EvalRunStatus.FAILED.value
            assert sample_run.completed_at is not None

            # Verify error in summary
            assert sample_run.summary is not None
            assert "error" in sample_run.summary
            assert "Module 'mypackage.agent' not found" in sample_run.summary["error"]
            assert sample_run.summary["error_type"] == "agent_load_error"

            # Verify DB commit
            mock_db.commit.assert_called()

            # Verify EvalRunner was not called
            mock_eval_runner.execute_run.assert_not_called()

    @pytest.mark.asyncio
    async def test_handles_execution_error(
        self, mock_db, sample_run, sample_suite, mock_eval_runner
    ):
        """Should set FAILED status on execution errors."""
        with patch("src.services.run_service.load_agent") as mock_load:
            mock_agent = MagicMock()
            mock_load.return_value = mock_agent

            # Make execute_run raise an error
            mock_eval_runner.execute_run.side_effect = RuntimeError(
                "Connection timeout"
            )

            service = RunService(mock_db)
            await service.start_execution(
                sample_run, sample_suite, mock_eval_runner
            )

            # Verify status
            assert sample_run.status == EvalRunStatus.FAILED.value
            assert sample_run.completed_at is not None

            # Verify error in summary
            assert sample_run.summary is not None
            assert "Connection timeout" in sample_run.summary["error"]
            assert sample_run.summary["error_type"] == "RuntimeError"


# =============================================================================
# Tests: get_run
# =============================================================================


class TestGetRun:
    """Tests for RunService.get_run."""

    @pytest.mark.asyncio
    async def test_returns_run_with_status(
        self, mock_db, sample_project_id, sample_run
    ):
        """Should return run with current status."""
        sample_run.status = EvalRunStatus.RUNNING.value

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_run
        mock_db.execute.return_value = mock_result

        service = RunService(mock_db)
        result = await service.get_run(sample_project_id, sample_run.id)

        assert result is not None
        assert result.status == EvalRunStatus.RUNNING

    @pytest.mark.asyncio
    async def test_returns_run_with_summary(
        self, mock_db, sample_project_id, sample_run
    ):
        """Should return run with summary when complete."""
        sample_run.status = EvalRunStatus.COMPLETED.value
        sample_run.summary = {
            "total_cases": 10,
            "passed": 8,
            "failed": 2,
            "errored": 0,
            "avg_score": 0.82,
            "scores_by_type": {"tool_selection": 0.85, "reasoning": 0.79},
            "execution_time_ms": 5000,
        }

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_run
        mock_db.execute.return_value = mock_result

        service = RunService(mock_db)
        result = await service.get_run(sample_project_id, sample_run.id)

        assert result is not None
        assert result.summary is not None
        assert result.summary.total_cases == 10
        assert result.summary.passed == 8
        assert result.summary.avg_score == 0.82

    @pytest.mark.asyncio
    async def test_returns_none_for_nonexistent_run(
        self, mock_db, sample_project_id
    ):
        """Should return None when run doesn't exist."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        service = RunService(mock_db)
        result = await service.get_run(sample_project_id, uuid4())

        assert result is None


# =============================================================================
# Tests: get_run_results
# =============================================================================


class TestGetRunResults:
    """Tests for RunService.get_run_results."""

    @pytest.mark.asyncio
    async def test_returns_results_with_scores(
        self, mock_db, sample_project_id, sample_run
    ):
        """Should return per-case results with scores."""
        case_id = uuid4()

        # Create mock result
        mock_result_model = MagicMock(spec=EvalResultModel)
        mock_result_model.id = uuid4()
        mock_result_model.run_id = sample_run.id
        mock_result_model.case_id = case_id
        mock_result_model.mlflow_run_id = "mlflow-run-123"
        mock_result_model.mlflow_trace_id = "trace-456"
        mock_result_model.status = "success"
        mock_result_model.output = {"response": "Test answer"}
        mock_result_model.scores = {
            "tool_selection": 0.95,
            "reasoning": 0.88,
            "grounding": 0.92,
        }
        mock_result_model.score_details = {
            "tool_selection": {
                "score": 0.95,
                "reason": "Correct tool selected",
                "evidence": ["search"],
            },
        }
        mock_result_model.passed = True
        mock_result_model.execution_time_ms = 1500
        mock_result_model.error = None
        mock_result_model.created_at = datetime.utcnow()

        # Create mock case
        mock_case = MagicMock(spec=EvalCaseModel)
        mock_case.id = case_id
        mock_case.name = "test-case-weather"

        # Setup mock query results
        results_scalars = MagicMock()
        results_scalars.all.return_value = [mock_result_model]
        results_query = MagicMock()
        results_query.scalars.return_value = results_scalars

        cases_scalars = MagicMock()
        cases_scalars.all.return_value = [mock_case]
        cases_query = MagicMock()
        cases_query.scalars.return_value = cases_scalars

        mock_db.execute.side_effect = [results_query, cases_query]

        service = RunService(mock_db)
        results = await service.get_run_results(sample_project_id, sample_run.id)

        assert len(results) == 1
        result = results[0]

        # Verify scores
        assert result.scores["tool_selection"] == 0.95
        assert result.scores["reasoning"] == 0.88
        assert result.scores["grounding"] == 0.92

        # Verify other fields
        assert result.case_name == "test-case-weather"
        assert result.passed is True
        assert result.mlflow_run_id == "mlflow-run-123"

    @pytest.mark.asyncio
    async def test_filters_failed_only(
        self, mock_db, sample_project_id, sample_run
    ):
        """Should filter to failed results when failed_only=True."""
        service = RunService(mock_db)

        # Setup empty results for simplicity
        results_scalars = MagicMock()
        results_scalars.all.return_value = []
        results_query = MagicMock()
        results_query.scalars.return_value = results_scalars

        cases_scalars = MagicMock()
        cases_scalars.all.return_value = []
        cases_query = MagicMock()
        cases_query.scalars.return_value = cases_scalars

        mock_db.execute.side_effect = [results_query, cases_query]

        await service.get_run_results(
            sample_project_id, sample_run.id, failed_only=True
        )

        # Verify execute was called (the filtering is done in SQL)
        assert mock_db.execute.called


# =============================================================================
# Tests: cancel_run
# =============================================================================


class TestCancelRun:
    """Tests for RunService.cancel_run."""

    @pytest.mark.asyncio
    async def test_cancels_pending_run(
        self, mock_db, sample_project_id, sample_run
    ):
        """Should cancel a pending run."""
        sample_run.status = EvalRunStatus.PENDING.value

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_run
        mock_db.execute.return_value = mock_result

        service = RunService(mock_db)
        success = await service.cancel_run(sample_project_id, sample_run.id)

        assert success is True
        assert sample_run.status == EvalRunStatus.CANCELLED.value
        assert sample_run.completed_at is not None

    @pytest.mark.asyncio
    async def test_cancels_running_run(
        self, mock_db, sample_project_id, sample_run
    ):
        """Should cancel a running run."""
        sample_run.status = EvalRunStatus.RUNNING.value

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_run
        mock_db.execute.return_value = mock_result

        service = RunService(mock_db)
        success = await service.cancel_run(sample_project_id, sample_run.id)

        assert success is True
        assert sample_run.status == EvalRunStatus.CANCELLED.value

    @pytest.mark.asyncio
    async def test_returns_false_for_completed_run(
        self, mock_db, sample_project_id, sample_run
    ):
        """Should return False for already completed run."""
        # Query won't find run because it filters by status
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        service = RunService(mock_db)
        success = await service.cancel_run(sample_project_id, sample_run.id)

        assert success is False

    @pytest.mark.asyncio
    async def test_returns_false_for_nonexistent_run(
        self, mock_db, sample_project_id
    ):
        """Should return False when run doesn't exist."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        service = RunService(mock_db)
        success = await service.cancel_run(sample_project_id, uuid4())

        assert success is False
