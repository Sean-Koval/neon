"""Tests for runs router and API-triggered execution.

This module tests the run execution endpoints, including:
- POST /suites/{suite_id}/run creates run with pending status
- Background task spawning for async execution
- Agent loading from suite.agent_id
- Status transitions: pending → running → completed/failed
- GET /runs/{id} returns current status and summary
- GET /runs/{id}/results returns per-case results with scores
- Error handling and capture in run.summary
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.models.db import EvalCaseModel, EvalRunModel, EvalSuiteModel
from src.models.eval import EvalRunStatus, TriggerType
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
def sample_suite_id():
    """Generate a sample suite ID."""
    return uuid4()


@pytest.fixture
def sample_suite(sample_suite_id, sample_project_id):
    """Create a sample EvalSuiteModel."""
    suite = MagicMock(spec=EvalSuiteModel)
    suite.id = sample_suite_id
    suite.project_id = sample_project_id
    suite.name = "test-suite"
    suite.agent_id = "test_agent:run"
    suite.config = {"parallel": False}
    suite.cases = []
    return suite


@pytest.fixture
def sample_case(sample_suite_id):
    """Create a sample EvalCaseModel."""
    case = MagicMock(spec=EvalCaseModel)
    case.id = uuid4()
    case.suite_id = sample_suite_id
    case.name = "test-case"
    case.input = {"query": "test query"}
    case.scorers = ["tool_selection"]
    case.scorer_config = None
    case.min_score = 0.7
    case.timeout_seconds = 300
    return case


@pytest.fixture
def sample_run(sample_project_id, sample_suite_id):
    """Create a sample EvalRunModel."""
    run = MagicMock(spec=EvalRunModel)
    run.id = uuid4()
    run.project_id = sample_project_id
    run.suite_id = sample_suite_id
    run.agent_version = "v1.0.0"
    run.trigger = TriggerType.MANUAL.value
    run.trigger_ref = None
    run.status = EvalRunStatus.PENDING.value
    run.config = None
    run.summary = None
    run.started_at = None
    run.completed_at = None
    run.created_at = datetime.utcnow()
    run.suite = None
    return run


# =============================================================================
# Unit Tests: RunService.create_run
# =============================================================================


class TestCreateRun:
    """Tests for RunService.create_run method."""

    @pytest.mark.asyncio
    async def test_creates_run_with_pending_status(
        self, mock_db, sample_project_id, sample_suite_id, sample_suite
    ):
        """create_run should create a run with status='pending'."""
        # Setup mock to return the suite
        mock_scalars = MagicMock()
        mock_scalars.scalar_one_or_none.return_value = sample_suite
        mock_db.execute.return_value = mock_scalars

        # Make refresh populate the run with expected values
        async def mock_refresh(obj: Any) -> None:
            obj.id = uuid4()
            obj.created_at = datetime.utcnow()

        mock_db.refresh.side_effect = mock_refresh

        service = RunService(mock_db)
        from src.models.eval import EvalRunCreate

        data = EvalRunCreate(agent_version="v1.0.0", trigger=TriggerType.MANUAL)
        result = await service.create_run(sample_project_id, sample_suite_id, data)

        assert result is not None
        run_response, run_model, suite = result
        assert run_response.status == EvalRunStatus.PENDING
        assert suite.id == sample_suite_id

    @pytest.mark.asyncio
    async def test_returns_none_when_suite_not_found(
        self, mock_db, sample_project_id, sample_suite_id
    ):
        """create_run should return None when suite doesn't exist."""
        mock_scalars = MagicMock()
        mock_scalars.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_scalars

        service = RunService(mock_db)
        from src.models.eval import EvalRunCreate

        data = EvalRunCreate()
        result = await service.create_run(sample_project_id, sample_suite_id, data)

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_tuple_with_run_model_and_suite(
        self, mock_db, sample_project_id, sample_suite_id, sample_suite
    ):
        """create_run should return tuple with EvalRun, EvalRunModel, and EvalSuiteModel."""
        mock_scalars = MagicMock()
        mock_scalars.scalar_one_or_none.return_value = sample_suite
        mock_db.execute.return_value = mock_scalars

        async def mock_refresh(obj: Any) -> None:
            obj.id = uuid4()
            obj.created_at = datetime.utcnow()

        mock_db.refresh.side_effect = mock_refresh

        service = RunService(mock_db)
        from src.models.eval import EvalRunCreate

        data = EvalRunCreate(agent_version="v1.0.0")
        result = await service.create_run(sample_project_id, sample_suite_id, data)

        assert result is not None
        assert len(result) == 3
        run_response, run_model, suite = result
        assert hasattr(run_response, "id")  # EvalRun
        assert suite == sample_suite  # EvalSuiteModel


# =============================================================================
# Unit Tests: RunService.start_execution
# =============================================================================


class TestStartExecution:
    """Tests for RunService.start_execution method."""

    @pytest.mark.asyncio
    async def test_loads_agent_from_suite_agent_id(
        self, mock_db, sample_run, sample_suite
    ):
        """start_execution should load agent from suite.agent_id."""
        mock_eval_runner = AsyncMock()
        mock_eval_runner.execute_run = AsyncMock()

        with patch("src.services.run_service.load_agent") as mock_load:
            mock_agent = MagicMock()
            mock_load.return_value = mock_agent

            service = RunService(mock_db)
            await service.start_execution(sample_run, sample_suite, mock_eval_runner)

            mock_load.assert_called_once_with(sample_suite.agent_id, working_dir=None)

    @pytest.mark.asyncio
    async def test_calls_eval_runner_execute_run(
        self, mock_db, sample_run, sample_suite
    ):
        """start_execution should call EvalRunner.execute_run with correct args."""
        mock_eval_runner = AsyncMock()
        mock_eval_runner.execute_run = AsyncMock()

        with patch("src.services.run_service.load_agent") as mock_load:
            mock_agent = MagicMock()
            mock_load.return_value = mock_agent

            service = RunService(mock_db)
            await service.start_execution(sample_run, sample_suite, mock_eval_runner)

            mock_eval_runner.execute_run.assert_called_once_with(
                sample_run, sample_suite, mock_agent
            )

    @pytest.mark.asyncio
    async def test_handles_agent_load_error(
        self, mock_db, sample_run, sample_suite
    ):
        """start_execution should set FAILED status on AgentLoadError."""
        mock_eval_runner = AsyncMock()

        from src.agent.loader import AgentLoadError

        with patch("src.services.run_service.load_agent") as mock_load:
            mock_load.side_effect = AgentLoadError("Module not found")

            service = RunService(mock_db)
            await service.start_execution(sample_run, sample_suite, mock_eval_runner)

            assert sample_run.status == EvalRunStatus.FAILED.value
            assert sample_run.completed_at is not None
            assert "agent_load_error" in sample_run.summary["error_type"]
            assert "Module not found" in sample_run.summary["error"]

    @pytest.mark.asyncio
    async def test_handles_unexpected_error(
        self, mock_db, sample_run, sample_suite
    ):
        """start_execution should set FAILED status on unexpected errors."""
        mock_eval_runner = AsyncMock()
        mock_eval_runner.execute_run = AsyncMock(side_effect=RuntimeError("Unexpected"))

        with patch("src.services.run_service.load_agent") as mock_load:
            mock_agent = MagicMock()
            mock_load.return_value = mock_agent

            service = RunService(mock_db)
            await service.start_execution(sample_run, sample_suite, mock_eval_runner)

            assert sample_run.status == EvalRunStatus.FAILED.value
            assert sample_run.completed_at is not None
            assert "RuntimeError" in sample_run.summary["error_type"]
            assert "Unexpected" in sample_run.summary["error"]


# =============================================================================
# Unit Tests: RunService.get_run
# =============================================================================


class TestGetRun:
    """Tests for RunService.get_run method."""

    @pytest.mark.asyncio
    async def test_returns_run_with_status_and_summary(
        self, mock_db, sample_project_id, sample_run
    ):
        """get_run should return run with current status and summary."""
        sample_run.status = EvalRunStatus.COMPLETED.value
        sample_run.summary = {
            "total_cases": 5,
            "passed": 4,
            "failed": 1,
            "errored": 0,
            "avg_score": 0.85,
            "execution_time_ms": 5000,
        }
        sample_run.suite = MagicMock()
        sample_run.suite.name = "test-suite"

        mock_scalars = MagicMock()
        mock_scalars.scalar_one_or_none.return_value = sample_run
        mock_db.execute.return_value = mock_scalars

        service = RunService(mock_db)
        result = await service.get_run(sample_project_id, sample_run.id)

        assert result is not None
        assert result.status == EvalRunStatus.COMPLETED
        assert result.summary is not None
        assert result.summary.total_cases == 5

    @pytest.mark.asyncio
    async def test_returns_none_when_run_not_found(
        self, mock_db, sample_project_id
    ):
        """get_run should return None when run doesn't exist."""
        mock_scalars = MagicMock()
        mock_scalars.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_scalars

        service = RunService(mock_db)
        result = await service.get_run(sample_project_id, uuid4())

        assert result is None


# =============================================================================
# Unit Tests: RunService.get_run_results
# =============================================================================


class TestGetRunResults:
    """Tests for RunService.get_run_results method."""

    @pytest.mark.asyncio
    async def test_returns_results_with_scores(
        self, mock_db, sample_project_id, sample_run
    ):
        """get_run_results should return per-case results with scores."""
        from src.models.db import EvalResultModel

        # Create mock results
        result1 = MagicMock(spec=EvalResultModel)
        result1.id = uuid4()
        result1.run_id = sample_run.id
        result1.case_id = uuid4()
        result1.mlflow_run_id = "mlflow-1"
        result1.mlflow_trace_id = "trace-1"
        result1.status = "success"
        result1.output = {"response": "test"}
        result1.scores = {"tool_selection": 0.9, "reasoning": 0.85}
        result1.score_details = {
            "tool_selection": {"score": 0.9, "reason": "Good"},
            "reasoning": {"score": 0.85, "reason": "Good"},
        }
        result1.passed = True
        result1.execution_time_ms = 100
        result1.error = None
        result1.created_at = datetime.utcnow()

        # Mock case for name lookup
        case = MagicMock(spec=EvalCaseModel)
        case.id = result1.case_id
        case.name = "test-case-1"

        # Setup mock returns
        results_scalars = MagicMock()
        results_scalars.all.return_value = [result1]
        results_result = MagicMock()
        results_result.scalars.return_value = results_scalars

        cases_scalars = MagicMock()
        cases_scalars.all.return_value = [case]
        cases_result = MagicMock()
        cases_result.scalars.return_value = cases_scalars

        mock_db.execute.side_effect = [results_result, cases_result]

        service = RunService(mock_db)
        results = await service.get_run_results(sample_project_id, sample_run.id)

        assert len(results) == 1
        assert results[0].scores == {"tool_selection": 0.9, "reasoning": 0.85}
        assert results[0].case_name == "test-case-1"
        assert results[0].passed is True


# =============================================================================
# Integration Tests: Background Task Execution
# =============================================================================


class TestBackgroundExecution:
    """Integration tests for background task execution flow."""

    @pytest.mark.asyncio
    async def test_background_task_executes_run(self):
        """Background task should execute run through EvalRunner."""
        from src.routers.runs import _execute_run_background

        run_id = uuid4()
        suite_id = uuid4()

        # Mock the session factory and all database operations
        with patch("src.routers.runs.async_session_factory") as mock_factory:
            mock_session = AsyncMock()
            mock_factory.return_value.__aenter__.return_value = mock_session

            # Mock run fetch
            mock_run = MagicMock(spec=EvalRunModel)
            mock_run.id = run_id
            mock_run_result = MagicMock()
            mock_run_result.scalar_one_or_none.return_value = mock_run

            # Mock suite fetch
            mock_suite = MagicMock(spec=EvalSuiteModel)
            mock_suite.id = suite_id
            mock_suite.agent_id = "test:agent"
            mock_suite.cases = []
            mock_suite_result = MagicMock()
            mock_suite_result.scalar_one_or_none.return_value = mock_suite

            mock_session.execute.side_effect = [mock_run_result, mock_suite_result]

            with patch("src.routers.runs.RunService") as mock_run_service_cls:
                mock_run_service = AsyncMock()
                mock_run_service.start_execution = AsyncMock()
                mock_run_service_cls.return_value = mock_run_service

                with patch("src.routers.runs.EvalRunner") as mock_eval_runner_cls:
                    mock_eval_runner = MagicMock()
                    mock_eval_runner_cls.return_value = mock_eval_runner

                    await _execute_run_background(run_id, suite_id)

                    # Verify start_execution was called
                    mock_run_service.start_execution.assert_called_once_with(
                        mock_run, mock_suite, mock_eval_runner
                    )

    @pytest.mark.asyncio
    async def test_background_task_handles_missing_run(self):
        """Background task should handle case where run is not found."""
        from src.routers.runs import _execute_run_background

        run_id = uuid4()
        suite_id = uuid4()

        with patch("src.routers.runs.async_session_factory") as mock_factory:
            mock_session = AsyncMock()
            mock_factory.return_value.__aenter__.return_value = mock_session

            # Mock run not found
            mock_run_result = MagicMock()
            mock_run_result.scalar_one_or_none.return_value = None
            mock_session.execute.return_value = mock_run_result

            with patch("src.routers.runs.RunService") as mock_run_service_cls:
                mock_run_service = AsyncMock()
                mock_run_service_cls.return_value = mock_run_service

                # Should not raise, just log and return
                await _execute_run_background(run_id, suite_id)

                # start_execution should not be called
                mock_run_service.start_execution.assert_not_called()


# =============================================================================
# Integration Tests: Full API Flow
# =============================================================================


class TestAPITriggeredExecution:
    """Integration tests demonstrating API-triggered execution."""

    @pytest.mark.asyncio
    async def test_start_run_creates_pending_and_spawns_task(self):
        """POST /suites/{suite_id}/run should create pending run and spawn task."""
        from src.routers.runs import start_run, _execute_run_background
        from src.models.eval import EvalRunCreate

        project_id = uuid4()
        suite_id = uuid4()

        # Create mock API key
        mock_key = MagicMock()
        mock_key.project_id = project_id

        # Create mock suite and run
        mock_suite = MagicMock(spec=EvalSuiteModel)
        mock_suite.id = suite_id
        mock_suite.name = "test-suite"
        mock_suite.agent_id = "test:agent"

        mock_run_model = MagicMock(spec=EvalRunModel)
        mock_run_model.id = uuid4()
        mock_run_model.status = EvalRunStatus.PENDING.value

        from src.models.eval import EvalRun

        mock_run_response = MagicMock(spec=EvalRun)
        mock_run_response.status = EvalRunStatus.PENDING

        # Mock service
        mock_db = AsyncMock()

        with patch("src.routers.runs.RunService") as mock_service_cls:
            mock_service = AsyncMock()
            mock_service.create_run.return_value = (
                mock_run_response,
                mock_run_model,
                mock_suite,
            )
            mock_service_cls.return_value = mock_service

            with patch("src.routers.runs.asyncio.create_task") as mock_create_task:
                data = EvalRunCreate()
                result = await start_run(
                    suite_id=suite_id,
                    data=data,
                    key=mock_key,
                    db=mock_db,
                )

                # Verify run was created
                mock_service.create_run.assert_called_once()

                # Verify background task was spawned
                mock_create_task.assert_called_once()

                # Verify response
                assert result == mock_run_response

    @pytest.mark.asyncio
    async def test_status_transitions_pending_to_running_to_completed(
        self, mock_db, sample_run, sample_suite
    ):
        """Run should transition: pending → running → completed."""
        # Start with pending
        assert sample_run.status == EvalRunStatus.PENDING.value

        # Mock EvalRunner to verify status transitions
        class StatusTrackingRunner:
            def __init__(self):
                self.statuses_seen = []

            async def execute_run(self, run, suite, agent):
                # Record transition to running
                run.status = EvalRunStatus.RUNNING.value
                self.statuses_seen.append(run.status)

                # Simulate completion
                run.status = EvalRunStatus.COMPLETED.value
                self.statuses_seen.append(run.status)

        tracker = StatusTrackingRunner()

        with patch("src.services.run_service.load_agent") as mock_load:
            mock_agent = MagicMock()
            mock_load.return_value = mock_agent

            service = RunService(mock_db)
            await service.start_execution(sample_run, sample_suite, tracker)

            # Verify transitions happened
            assert EvalRunStatus.RUNNING.value in tracker.statuses_seen
            assert EvalRunStatus.COMPLETED.value in tracker.statuses_seen

    @pytest.mark.asyncio
    async def test_error_captured_in_summary(
        self, mock_db, sample_run, sample_suite
    ):
        """Execution errors should be captured in run.summary."""
        mock_eval_runner = AsyncMock()
        error_msg = "Database connection failed during execution"
        mock_eval_runner.execute_run = AsyncMock(
            side_effect=RuntimeError(error_msg)
        )

        with patch("src.services.run_service.load_agent") as mock_load:
            mock_agent = MagicMock()
            mock_load.return_value = mock_agent

            service = RunService(mock_db)
            await service.start_execution(sample_run, sample_suite, mock_eval_runner)

            # Verify error is captured
            assert sample_run.status == EvalRunStatus.FAILED.value
            assert sample_run.summary is not None
            assert error_msg in sample_run.summary["error"]
            assert sample_run.summary["error_type"] == "RuntimeError"
