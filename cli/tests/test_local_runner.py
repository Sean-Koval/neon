"""Tests for local runner module."""

import json
import os
import sqlite3
import sys
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Add the cli/src to path
cli_src_path = str(Path(__file__).parent.parent / "src")
if cli_src_path not in sys.path:
    sys.path.insert(0, cli_src_path)

# Add api/src to path for agent loader and scorers
api_src_path = str(Path(__file__).parent.parent.parent / "api" / "src")
if api_src_path not in sys.path:
    sys.path.insert(0, api_src_path)


class TestLocalDatabase:
    """Tests for LocalDatabase class."""

    def test_init_creates_db(self, tmp_path):
        """Test database initialization creates schema."""
        from local_runner import LocalDatabase

        db_path = tmp_path / "test.db"
        db = LocalDatabase(db_path)

        # Verify tables exist
        with sqlite3.connect(db_path) as conn:
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            )
            tables = [row[0] for row in cursor]

        assert "runs" in tables
        assert "results" in tables

    def test_save_and_get_run(self, tmp_path):
        """Test saving and retrieving a run."""
        from local_runner import LocalDatabase, LocalRun

        db = LocalDatabase(tmp_path / "test.db")

        run = LocalRun(
            id="test-run-123",
            suite_id="suite-456",
            suite_name="test-suite",
            agent_version="v1.0.0",
            trigger="cli-local",
            status="completed",
            config={"parallel": True},
            summary={"total_cases": 2, "passed": 2, "failed": 0, "avg_score": 0.95},
            started_at="2026-01-22T10:00:00",
            completed_at="2026-01-22T10:05:00",
            created_at="2026-01-22T10:00:00",
        )

        db.save_run(run)

        # Retrieve and verify
        retrieved = db.get_run("test-run-123")
        assert retrieved is not None
        assert retrieved.id == "test-run-123"
        assert retrieved.suite_name == "test-suite"
        assert retrieved.agent_version == "v1.0.0"
        assert retrieved.status == "completed"
        assert retrieved.config == {"parallel": True}
        assert retrieved.summary["total_cases"] == 2

    def test_save_and_get_result(self, tmp_path):
        """Test saving and retrieving results."""
        from local_runner import LocalDatabase, LocalResult, LocalRun

        db = LocalDatabase(tmp_path / "test.db")

        # First save a run
        run = LocalRun(
            id="test-run-123",
            suite_id="suite-456",
            suite_name="test-suite",
            agent_version="v1.0.0",
            trigger="cli-local",
            status="completed",
            config=None,
            summary=None,
            started_at="2026-01-22T10:00:00",
            completed_at="2026-01-22T10:05:00",
            created_at="2026-01-22T10:00:00",
        )
        db.save_run(run)

        # Save results
        result = LocalResult(
            id="result-1",
            run_id="test-run-123",
            case_id="case-1",
            case_name="test_case_1",
            mlflow_run_id="mlflow-123",
            mlflow_trace_id="trace-456",
            status="success",
            output={"response": "Test output"},
            scores={"tool_selection": 0.9, "reasoning": 0.85},
            score_details={"tool_selection": {"score": 0.9, "reason": "Good"}},
            passed=True,
            execution_time_ms=1500,
            error=None,
            created_at="2026-01-22T10:01:00",
        )
        db.save_result(result)

        # Retrieve and verify
        results = db.get_results_for_run("test-run-123")
        assert len(results) == 1
        assert results[0].case_name == "test_case_1"
        assert results[0].passed is True
        assert results[0].scores["tool_selection"] == 0.9

    def test_list_runs(self, tmp_path):
        """Test listing runs with filters."""
        from local_runner import LocalDatabase, LocalRun

        db = LocalDatabase(tmp_path / "test.db")

        # Create multiple runs
        for i in range(5):
            run = LocalRun(
                id=f"run-{i}",
                suite_id="suite-1",
                suite_name="suite-a" if i < 3 else "suite-b",
                agent_version=f"v{i}",
                trigger="cli-local",
                status="completed" if i % 2 == 0 else "failed",
                config=None,
                summary=None,
                started_at=f"2026-01-22T1{i}:00:00",
                completed_at=f"2026-01-22T1{i}:05:00",
                created_at=f"2026-01-22T1{i}:00:00",
            )
            db.save_run(run)

        # Test unfiltered list
        all_runs = db.list_runs()
        assert len(all_runs) == 5

        # Test filter by suite name
        suite_a_runs = db.list_runs(suite_name="suite-a")
        assert len(suite_a_runs) == 3

        # Test filter by status
        completed_runs = db.list_runs(status="completed")
        assert len(completed_runs) == 3

        # Test limit
        limited_runs = db.list_runs(limit=2)
        assert len(limited_runs) == 2

    def test_get_results_failed_only(self, tmp_path):
        """Test filtering results by passed status."""
        from local_runner import LocalDatabase, LocalResult, LocalRun

        db = LocalDatabase(tmp_path / "test.db")

        run = LocalRun(
            id="test-run-123",
            suite_id="suite-456",
            suite_name="test-suite",
            agent_version="v1.0.0",
            trigger="cli-local",
            status="completed",
            config=None,
            summary=None,
            started_at="2026-01-22T10:00:00",
            completed_at="2026-01-22T10:05:00",
            created_at="2026-01-22T10:00:00",
        )
        db.save_run(run)

        # Add passed and failed results
        for i, passed in enumerate([True, False, True, False]):
            result = LocalResult(
                id=f"result-{i}",
                run_id="test-run-123",
                case_id=f"case-{i}",
                case_name=f"test_case_{i}",
                mlflow_run_id=None,
                mlflow_trace_id=None,
                status="success",
                output=None,
                scores={"tool_selection": 0.9 if passed else 0.3},
                score_details=None,
                passed=passed,
                execution_time_ms=1000,
                error=None,
                created_at="2026-01-22T10:01:00",
            )
            db.save_result(result)

        # Get all results
        all_results = db.get_results_for_run("test-run-123")
        assert len(all_results) == 4

        # Get failed only
        failed_results = db.get_results_for_run("test-run-123", failed_only=True)
        assert len(failed_results) == 2
        assert all(not r.passed for r in failed_results)


class TestLocalSuite:
    """Tests for suite loading."""

    def test_load_suite_from_file(self, tmp_path):
        """Test loading a suite from YAML file."""
        from local_runner import LocalRunner

        # Create a test suite file
        suite_content = """
name: test-suite
description: A test suite
agent_id: test-agent

default_scorers:
  - tool_selection
  - reasoning

default_min_score: 0.7

cases:
  - name: simple_query
    description: Test basic query
    input:
      query: "What is 2+2?"
    expected_output_contains:
      - "4"
    min_score: 0.8
    tags:
      - math

  - name: tool_usage
    description: Test tool usage
    input:
      query: "Search for weather"
    expected_tools:
      - search
"""
        suite_path = tmp_path / "test-suite.yaml"
        suite_path.write_text(suite_content)

        runner = LocalRunner(db=MagicMock())
        suite = runner.load_suite_from_file(suite_path)

        assert suite.name == "test-suite"
        assert suite.description == "A test suite"
        assert len(suite.cases) == 2
        assert suite.cases[0].name == "simple_query"
        assert suite.cases[0].min_score == 0.8
        assert suite.cases[1].expected_tools == ["search"]


class TestCaseModelAdapter:
    """Tests for CaseModelAdapter."""

    def test_adapter_properties(self):
        """Test adapter exposes case properties correctly."""
        from local_runner import CaseModelAdapter, LocalCase

        case = LocalCase(
            id="case-123",
            name="test_case",
            description="A test case",
            input={"query": "test"},
            expected_tools=["search", "calculate"],
            expected_tool_sequence=None,
            expected_output_contains=["result"],
            expected_output_pattern=None,
            scorers=["tool_selection"],
            scorer_config={"strict": True},
            min_score=0.8,
            timeout_seconds=60,
            tags=["test"],
        )

        adapter = CaseModelAdapter(case)

        assert adapter.id == "case-123"
        assert adapter.name == "test_case"
        assert adapter.description == "A test case"
        assert adapter.input == {"query": "test"}
        assert adapter.expected_tools == ["search", "calculate"]
        assert adapter.expected_output_contains == ["result"]
        assert adapter.scorers == ["tool_selection"]
        assert adapter.scorer_config == {"strict": True}
        assert adapter.min_score == 0.8
        assert adapter.timeout_seconds == 60
        assert adapter.tags == ["test"]


class TestCompareLocalRuns:
    """Tests for compare_local_runs function."""

    def test_compare_runs_no_regression(self, tmp_path):
        """Test comparing runs with no regressions."""
        from local_runner import (
            LocalDatabase,
            LocalResult,
            LocalRun,
            compare_local_runs,
        )

        db = LocalDatabase(tmp_path / "test.db")

        # Create baseline run
        baseline_run = LocalRun(
            id="baseline-run",
            suite_id="suite-1",
            suite_name="test-suite",
            agent_version="v1.0.0",
            trigger="cli-local",
            status="completed",
            config=None,
            summary={"avg_score": 0.8},
            started_at="2026-01-22T10:00:00",
            completed_at="2026-01-22T10:05:00",
            created_at="2026-01-22T10:00:00",
        )
        db.save_run(baseline_run)

        # Create candidate run (improved)
        candidate_run = LocalRun(
            id="candidate-run",
            suite_id="suite-1",
            suite_name="test-suite",
            agent_version="v1.1.0",
            trigger="cli-local",
            status="completed",
            config=None,
            summary={"avg_score": 0.9},
            started_at="2026-01-22T11:00:00",
            completed_at="2026-01-22T11:05:00",
            created_at="2026-01-22T11:00:00",
        )
        db.save_run(candidate_run)

        # Add results
        baseline_result = LocalResult(
            id="baseline-result",
            run_id="baseline-run",
            case_id="case-1",
            case_name="test_case_1",
            mlflow_run_id=None,
            mlflow_trace_id=None,
            status="success",
            output=None,
            scores={"tool_selection": 0.8},
            score_details=None,
            passed=True,
            execution_time_ms=1000,
            error=None,
            created_at="2026-01-22T10:01:00",
        )
        db.save_result(baseline_result)

        candidate_result = LocalResult(
            id="candidate-result",
            run_id="candidate-run",
            case_id="case-1",
            case_name="test_case_1",
            mlflow_run_id=None,
            mlflow_trace_id=None,
            status="success",
            output=None,
            scores={"tool_selection": 0.9},  # Improved
            score_details=None,
            passed=True,
            execution_time_ms=1000,
            error=None,
            created_at="2026-01-22T11:01:00",
        )
        db.save_result(candidate_result)

        # Compare
        result = compare_local_runs("baseline-run", "candidate-run", threshold=0.05, db=db)

        assert result["passed"] is True
        assert len(result["regressions"]) == 0
        assert len(result["improvements"]) == 1
        assert result["improvements"][0]["case_name"] == "test_case_1"
        assert abs(result["overall_delta"] - 0.1) < 0.0001  # 0.9 - 0.8

    def test_compare_runs_with_regression(self, tmp_path):
        """Test comparing runs with regressions."""
        from local_runner import (
            LocalDatabase,
            LocalResult,
            LocalRun,
            compare_local_runs,
        )

        db = LocalDatabase(tmp_path / "test.db")

        # Create baseline and candidate runs
        baseline_run = LocalRun(
            id="baseline-run",
            suite_id="suite-1",
            suite_name="test-suite",
            agent_version="v1.0.0",
            trigger="cli-local",
            status="completed",
            config=None,
            summary={"avg_score": 0.9},
            started_at="2026-01-22T10:00:00",
            completed_at="2026-01-22T10:05:00",
            created_at="2026-01-22T10:00:00",
        )
        db.save_run(baseline_run)

        candidate_run = LocalRun(
            id="candidate-run",
            suite_id="suite-1",
            suite_name="test-suite",
            agent_version="v1.1.0",
            trigger="cli-local",
            status="completed",
            config=None,
            summary={"avg_score": 0.7},  # Worse
            started_at="2026-01-22T11:00:00",
            completed_at="2026-01-22T11:05:00",
            created_at="2026-01-22T11:00:00",
        )
        db.save_run(candidate_run)

        # Add results
        baseline_result = LocalResult(
            id="baseline-result",
            run_id="baseline-run",
            case_id="case-1",
            case_name="test_case_1",
            mlflow_run_id=None,
            mlflow_trace_id=None,
            status="success",
            output=None,
            scores={"tool_selection": 0.9},
            score_details=None,
            passed=True,
            execution_time_ms=1000,
            error=None,
            created_at="2026-01-22T10:01:00",
        )
        db.save_result(baseline_result)

        candidate_result = LocalResult(
            id="candidate-result",
            run_id="candidate-run",
            case_id="case-1",
            case_name="test_case_1",
            mlflow_run_id=None,
            mlflow_trace_id=None,
            status="success",
            output=None,
            scores={"tool_selection": 0.7},  # Regressed
            score_details=None,
            passed=True,
            execution_time_ms=1000,
            error=None,
            created_at="2026-01-22T11:01:00",
        )
        db.save_result(candidate_result)

        # Compare
        result = compare_local_runs("baseline-run", "candidate-run", threshold=0.05, db=db)

        assert result["passed"] is False
        assert len(result["regressions"]) == 1
        assert result["regressions"][0]["case_name"] == "test_case_1"
        assert abs(result["regressions"][0]["delta"] - (-0.2)) < 0.0001

    def test_compare_runs_not_found(self, tmp_path):
        """Test compare with missing run."""
        from local_runner import LocalDatabase, compare_local_runs

        db = LocalDatabase(tmp_path / "test.db")

        with pytest.raises(ValueError, match="Baseline run not found"):
            compare_local_runs("nonexistent", "also-nonexistent", db=db)


class TestLocalMLflowClient:
    """Tests for LocalMLflowClient."""

    @patch("local_runner.mlflow")
    @patch("local_runner.MlflowClient")
    def test_init_with_env_var(self, mock_client, mock_mlflow):
        """Test client initialization uses env var."""
        from local_runner import LocalMLflowClient

        with patch.dict(os.environ, {"MLFLOW_TRACKING_URI": "http://custom:5000"}):
            client = LocalMLflowClient()

        assert client.tracking_uri == "http://custom:5000"
        mock_mlflow.set_tracking_uri.assert_called_with("http://custom:5000")

    @patch("local_runner.mlflow")
    @patch("local_runner.MlflowClient")
    def test_init_with_explicit_uri(self, mock_client, mock_mlflow):
        """Test client initialization with explicit URI."""
        from local_runner import LocalMLflowClient

        client = LocalMLflowClient(tracking_uri="http://explicit:8080")

        assert client.tracking_uri == "http://explicit:8080"
        mock_mlflow.set_tracking_uri.assert_called_with("http://explicit:8080")

    @patch("local_runner.mlflow")
    @patch("local_runner.MlflowClient")
    def test_set_experiment(self, mock_client, mock_mlflow):
        """Test set_experiment prefixes name."""
        from local_runner import LocalMLflowClient

        mock_experiment = MagicMock()
        mock_experiment.experiment_id = "exp-123"
        mock_mlflow.set_experiment.return_value = mock_experiment

        client = LocalMLflowClient()
        exp_id = client.set_experiment("test-suite")

        mock_mlflow.set_experiment.assert_called_with("neon-local-test-suite")
        assert exp_id == "exp-123"


class TestLocalRunnerExecution:
    """Tests for LocalRunner execution."""

    def test_calculate_summary(self, tmp_path):
        """Test summary calculation."""
        from local_runner import LocalDatabase, LocalResult, LocalRunner

        db = LocalDatabase(tmp_path / "test.db")
        runner = LocalRunner(db=db)

        results = [
            LocalResult(
                id="result-1",
                run_id="run-1",
                case_id="case-1",
                case_name="case_1",
                mlflow_run_id=None,
                mlflow_trace_id=None,
                status="success",
                output=None,
                scores={"tool_selection": 0.9, "reasoning": 0.8},
                score_details=None,
                passed=True,
                execution_time_ms=1000,
                error=None,
                created_at="2026-01-22T10:01:00",
            ),
            LocalResult(
                id="result-2",
                run_id="run-1",
                case_id="case-2",
                case_name="case_2",
                mlflow_run_id=None,
                mlflow_trace_id=None,
                status="success",
                output=None,
                scores={"tool_selection": 0.7, "reasoning": 0.6},
                score_details=None,
                passed=False,
                execution_time_ms=2000,
                error=None,
                created_at="2026-01-22T10:02:00",
            ),
            LocalResult(
                id="result-3",
                run_id="run-1",
                case_id="case-3",
                case_name="case_3",
                mlflow_run_id=None,
                mlflow_trace_id=None,
                status="error",
                output=None,
                scores={},
                score_details=None,
                passed=False,
                execution_time_ms=500,
                error="Test error",
                created_at="2026-01-22T10:03:00",
            ),
        ]

        summary = runner._calculate_summary(results)

        assert summary["total_cases"] == 3
        assert summary["passed"] == 1
        assert summary["failed"] == 1
        assert summary["errored"] == 1
        assert summary["execution_time_ms"] == 3500
        assert "avg_score" in summary
        assert "scores_by_type" in summary


class TestIntegrationWorkflow:
    """Integration tests for full local workflow."""

    def test_full_local_workflow(self, tmp_path):
        """Test complete local execution workflow."""
        from local_runner import LocalDatabase, LocalRunner, LocalSuite, LocalCase

        # Create mock components
        db = LocalDatabase(tmp_path / "test.db")

        # Create a mock MLflow client
        mock_mlflow_client = MagicMock()
        mock_mlflow_client.tracking_uri = "http://localhost:5000"
        mock_mlflow_client.execute_with_tracing.return_value = {
            "mlflow_run_id": "mlflow-123",
            "mlflow_trace_id": "trace-456",
            "output": {"response": "The answer is 4"},
            "status": "success",
            "error": None,
            "execution_time_ms": 100,
            "trace_summary": None,
        }

        runner = LocalRunner(db=db, mlflow_client=mock_mlflow_client)

        # Create a mock scorer that always returns 0.9
        mock_scorer = MagicMock()
        mock_scorer_result = MagicMock()
        mock_scorer_result.score = 0.9
        mock_scorer_result.reason = "Good"
        mock_scorer_result.evidence = []

        # Make the async score method return properly
        import asyncio

        async def mock_score(*args, **kwargs):
            return mock_scorer_result

        mock_scorer.score = mock_score
        runner.scorers = {"tool_selection": mock_scorer}

        # Create suite and case
        suite = LocalSuite(
            id="suite-1",
            name="test-suite",
            description="Test",
            agent_id="test-agent",
            config={"parallel": False},
            cases=[
                LocalCase(
                    id="case-1",
                    name="test_case",
                    description="Test case",
                    input={"query": "What is 2+2?"},
                    expected_tools=None,
                    expected_tool_sequence=None,
                    expected_output_contains=["4"],
                    expected_output_pattern=None,
                    scorers=["tool_selection"],
                    scorer_config=None,
                    min_score=0.7,
                    timeout_seconds=60,
                    tags=[],
                )
            ],
        )

        # Create mock agent
        mock_agent = MagicMock()
        mock_agent.run.return_value = {"response": "The answer is 4"}

        # Execute
        run = runner.execute_run(
            suite=suite,
            agent=mock_agent,
            agent_version="v1.0.0",
            parallel=False,
        )

        # Verify run
        assert run.status == "completed"
        assert run.suite_name == "test-suite"
        assert run.agent_version == "v1.0.0"
        assert len(run.results) == 1
        assert run.results[0].passed is True
        assert run.results[0].scores.get("tool_selection") == 0.9

        # Verify run was saved to database
        saved_run = db.get_run(run.id)
        assert saved_run is not None
        assert saved_run.status == "completed"

        # Verify results were saved
        saved_results = db.get_results_for_run(run.id)
        assert len(saved_results) == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
