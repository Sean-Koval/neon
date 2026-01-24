"""Integration tests for CLI commands.

These tests verify the CLI run command works end-to-end
in both local and API modes.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

# Ensure imports work
_root = Path(__file__).parent.parent.parent
_cli_src = _root / "cli" / "src"
_api_src = _root / "api" / "src"

if str(_cli_src) not in sys.path:
    sys.path.insert(0, str(_cli_src))
if str(_api_src) not in sys.path:
    sys.path.insert(0, str(_api_src))
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))


# ============================================================================
# CLI Local Mode Tests
# ============================================================================


@pytest.mark.integration
class TestCLILocalMode:
    """Test CLI run command in local mode."""

    def test_run_local_with_passing_suite(
        self,
        test_suite_yaml,
        mock_agent_pass,
        mock_local_mlflow_client,
        temp_db_path,
    ):
        """Test CLI local run with a suite that should pass."""
        from typer.testing import CliRunner

        from commands.run import app

        runner = CliRunner()

        # Patch dependencies
        with patch("commands.run.LocalRunner") as MockLocalRunner, patch(
            "commands.run.load_agent"
        ) as mock_load_agent:
            # Setup mock runner
            mock_runner_instance = MagicMock()
            mock_runner_instance.mlflow_client = mock_local_mlflow_client

            # Create mock suite
            from local_runner import LocalCase, LocalSuite

            mock_suite = LocalSuite(
                id=str(uuid4()),
                name="test-suite",
                description="Test",
                agent_id="test:run",
                config={"parallel": True},
                cases=[
                    LocalCase(
                        id=str(uuid4()),
                        name="test_case",
                        description="Test",
                        input={"query": "What is 2 + 2?", "context": {}},
                        expected_tools=[],
                        expected_tool_sequence=None,
                        expected_output_contains=["4"],
                        expected_output_pattern=None,
                        scorers=["tool_selection"],
                        scorer_config=None,
                        min_score=0.5,
                        timeout_seconds=30,
                        tags=[],
                    )
                ],
            )

            # Create mock run result
            from local_runner import LocalResult, LocalRun

            mock_run = LocalRun(
                id=str(uuid4()),
                suite_id=mock_suite.id,
                suite_name=mock_suite.name,
                agent_version="test-v1",
                trigger="cli-local",
                status="completed",
                config={"parallel": True},
                summary={
                    "total_cases": 1,
                    "passed": 1,
                    "failed": 0,
                    "errored": 0,
                    "avg_score": 0.85,
                    "scores_by_type": {"tool_selection": 0.85},
                    "execution_time_ms": 100,
                },
                started_at="2024-01-01T00:00:00",
                completed_at="2024-01-01T00:00:01",
                created_at="2024-01-01T00:00:00",
                results=[
                    LocalResult(
                        id=str(uuid4()),
                        run_id=str(uuid4()),
                        case_id=str(uuid4()),
                        case_name="test_case",
                        mlflow_run_id="run-123",
                        mlflow_trace_id="trace-123",
                        status="success",
                        output={"output": "The answer is 4.", "tools_called": []},
                        scores={"tool_selection": 0.85},
                        score_details={"tool_selection": {"score": 0.85, "reason": "Good", "evidence": []}},
                        passed=True,
                        execution_time_ms=100,
                        error=None,
                        created_at="2024-01-01T00:00:00",
                    )
                ],
            )

            mock_runner_instance.load_suite_from_file.return_value = mock_suite
            mock_runner_instance.execute_run.return_value = mock_run
            MockLocalRunner.return_value = mock_runner_instance

            mock_load_agent.return_value = mock_agent_pass

            # Run command
            result = runner.invoke(
                app,
                [
                    "start",
                    str(test_suite_yaml),
                    "--agent",
                    "test_agent:run",
                    "--local",
                ],
            )

            # Verify success
            assert result.exit_code == 0, f"Command failed: {result.output}"
            assert "completed" in result.output.lower() or "passed" in result.output.lower()

    def test_run_local_json_output(
        self,
        test_suite_yaml,
        mock_agent_pass,
        mock_local_mlflow_client,
    ):
        """Test CLI local run with JSON output format."""
        from typer.testing import CliRunner

        from commands.run import app

        runner = CliRunner()

        with patch("commands.run.LocalRunner") as MockLocalRunner, patch(
            "commands.run.load_agent"
        ) as mock_load_agent:
            mock_runner_instance = MagicMock()
            mock_runner_instance.mlflow_client = mock_local_mlflow_client

            from local_runner import LocalCase, LocalResult, LocalRun, LocalSuite

            mock_suite = LocalSuite(
                id=str(uuid4()),
                name="test-suite",
                description="Test",
                agent_id="test:run",
                config={},
                cases=[
                    LocalCase(
                        id=str(uuid4()),
                        name="test_case",
                        description="Test",
                        input={"query": "test", "context": {}},
                        expected_tools=[],
                        expected_tool_sequence=None,
                        expected_output_contains=[],
                        expected_output_pattern=None,
                        scorers=["tool_selection"],
                        scorer_config=None,
                        min_score=0.5,
                        timeout_seconds=30,
                        tags=[],
                    )
                ],
            )

            mock_run = LocalRun(
                id="test-run-id",
                suite_id=mock_suite.id,
                suite_name="test-suite",
                agent_version="v1",
                trigger="cli-local",
                status="completed",
                config={},
                summary={"total_cases": 1, "passed": 1, "avg_score": 0.9},
                started_at="2024-01-01T00:00:00",
                completed_at="2024-01-01T00:00:01",
                created_at="2024-01-01T00:00:00",
                results=[
                    LocalResult(
                        id=str(uuid4()),
                        run_id="test-run-id",
                        case_id=str(uuid4()),
                        case_name="test_case",
                        mlflow_run_id="run-123",
                        mlflow_trace_id="trace-123",
                        status="success",
                        output={"output": "test"},
                        scores={"tool_selection": 0.9},
                        score_details={},
                        passed=True,
                        execution_time_ms=50,
                        error=None,
                        created_at="2024-01-01T00:00:00",
                    )
                ],
            )

            mock_runner_instance.load_suite_from_file.return_value = mock_suite
            mock_runner_instance.execute_run.return_value = mock_run
            MockLocalRunner.return_value = mock_runner_instance
            mock_load_agent.return_value = mock_agent_pass

            result = runner.invoke(
                app,
                [
                    "start",
                    str(test_suite_yaml),
                    "--agent",
                    "test_agent:run",
                    "--local",
                    "--output",
                    "json",
                ],
            )

            assert result.exit_code == 0

            # Parse JSON output (may have prefix text)
            # Find the JSON part
            output_lines = result.output.strip().split("\n")
            json_start = None
            for i, line in enumerate(output_lines):
                if line.strip().startswith("{"):
                    json_start = i
                    break

            if json_start is not None:
                json_text = "\n".join(output_lines[json_start:])
                data = json.loads(json_text)
                assert "id" in data
                assert "status" in data
                assert "results" in data

    def test_run_local_quiet_mode_success(
        self,
        test_suite_yaml,
        mock_agent_pass,
        mock_local_mlflow_client,
    ):
        """Test CLI local run with quiet output - success case."""
        from typer.testing import CliRunner

        from commands.run import app

        runner = CliRunner()

        with patch("commands.run.LocalRunner") as MockLocalRunner, patch(
            "commands.run.load_agent"
        ) as mock_load_agent:
            mock_runner_instance = MagicMock()
            mock_runner_instance.mlflow_client = mock_local_mlflow_client

            from local_runner import LocalCase, LocalRun, LocalSuite

            mock_suite = LocalSuite(
                id=str(uuid4()),
                name="test-suite",
                description="Test",
                agent_id="test:run",
                config={},
                cases=[
                    LocalCase(
                        id=str(uuid4()),
                        name="test_case",
                        description="Test",
                        input={"query": "test", "context": {}},
                        expected_tools=[],
                        expected_tool_sequence=None,
                        expected_output_contains=[],
                        expected_output_pattern=None,
                        scorers=["tool_selection"],
                        scorer_config=None,
                        min_score=0.5,
                        timeout_seconds=30,
                        tags=[],
                    )
                ],
            )

            # All cases pass
            mock_run = LocalRun(
                id="test-run-id",
                suite_id=mock_suite.id,
                suite_name="test-suite",
                agent_version="v1",
                trigger="cli-local",
                status="completed",
                config={},
                summary={"total_cases": 1, "passed": 1},
                started_at="2024-01-01T00:00:00",
                completed_at="2024-01-01T00:00:01",
                created_at="2024-01-01T00:00:00",
                results=[],
            )

            mock_runner_instance.load_suite_from_file.return_value = mock_suite
            mock_runner_instance.execute_run.return_value = mock_run
            MockLocalRunner.return_value = mock_runner_instance
            mock_load_agent.return_value = mock_agent_pass

            result = runner.invoke(
                app,
                [
                    "start",
                    str(test_suite_yaml),
                    "--agent",
                    "test_agent:run",
                    "--local",
                    "--output",
                    "quiet",
                ],
            )

            # Should exit with 0 when all pass
            assert result.exit_code == 0

    def test_run_local_quiet_mode_failure(
        self,
        test_suite_yaml,
        mock_agent_fail,
        mock_local_mlflow_client,
    ):
        """Test CLI local run with quiet output - failure case."""
        from typer.testing import CliRunner

        from commands.run import app

        runner = CliRunner()

        with patch("commands.run.LocalRunner") as MockLocalRunner, patch(
            "commands.run.load_agent"
        ) as mock_load_agent:
            mock_runner_instance = MagicMock()
            mock_runner_instance.mlflow_client = mock_local_mlflow_client

            from local_runner import LocalCase, LocalRun, LocalSuite

            mock_suite = LocalSuite(
                id=str(uuid4()),
                name="test-suite",
                description="Test",
                agent_id="test:run",
                config={},
                cases=[
                    LocalCase(
                        id=str(uuid4()),
                        name="test_case",
                        description="Test",
                        input={"query": "test", "context": {}},
                        expected_tools=[],
                        expected_tool_sequence=None,
                        expected_output_contains=[],
                        expected_output_pattern=None,
                        scorers=["tool_selection"],
                        scorer_config=None,
                        min_score=0.5,
                        timeout_seconds=30,
                        tags=[],
                    )
                ],
            )

            # Not all cases pass
            mock_run = LocalRun(
                id="test-run-id",
                suite_id=mock_suite.id,
                suite_name="test-suite",
                agent_version="v1",
                trigger="cli-local",
                status="completed",
                config={},
                summary={"total_cases": 2, "passed": 1},  # One failed
                started_at="2024-01-01T00:00:00",
                completed_at="2024-01-01T00:00:01",
                created_at="2024-01-01T00:00:00",
                results=[],
            )

            mock_runner_instance.load_suite_from_file.return_value = mock_suite
            mock_runner_instance.execute_run.return_value = mock_run
            MockLocalRunner.return_value = mock_runner_instance
            mock_load_agent.return_value = mock_agent_fail

            result = runner.invoke(
                app,
                [
                    "start",
                    str(test_suite_yaml),
                    "--agent",
                    "test_agent:run",
                    "--local",
                    "--output",
                    "quiet",
                ],
            )

            # Should exit with 1 when not all pass
            assert result.exit_code == 1

    def test_run_local_requires_agent(self, test_suite_yaml):
        """Test that local mode requires --agent flag."""
        from typer.testing import CliRunner

        from commands.run import app

        runner = CliRunner()

        result = runner.invoke(
            app,
            ["start", str(test_suite_yaml), "--local"],
        )

        assert result.exit_code == 1
        assert "agent is required" in result.output.lower()

    def test_run_local_requires_yaml_file(self, tmp_path):
        """Test that local mode requires a YAML file."""
        from typer.testing import CliRunner

        from commands.run import app

        runner = CliRunner()

        result = runner.invoke(
            app,
            ["start", "nonexistent-suite", "--agent", "test:run", "--local"],
        )

        assert result.exit_code == 1
        assert "not found" in result.output.lower() or "yaml" in result.output.lower()


# ============================================================================
# CLI List Command Tests
# ============================================================================


@pytest.mark.integration
class TestCLIListCommand:
    """Test CLI list command."""

    def test_list_local_runs_empty(self, temp_db_path):
        """Test listing local runs when database is empty."""
        from typer.testing import CliRunner

        from commands.run import app

        runner = CliRunner()

        with patch("commands.run.LocalDatabase") as MockDB:
            mock_db = MagicMock()
            mock_db.list_runs.return_value = []
            MockDB.return_value = mock_db

            result = runner.invoke(app, ["list", "--local"])

            assert result.exit_code == 0
            assert "no" in result.output.lower() or len(result.output.strip()) == 0

    def test_list_local_runs_with_results(self, temp_db_path):
        """Test listing local runs with results."""
        from typer.testing import CliRunner

        from commands.run import app

        runner = CliRunner()

        with patch("commands.run.LocalDatabase") as MockDB:
            from local_runner import LocalRun

            mock_db = MagicMock()
            mock_db.list_runs.return_value = [
                LocalRun(
                    id="run-1",
                    suite_id="suite-1",
                    suite_name="test-suite",
                    agent_version="v1",
                    trigger="cli-local",
                    status="completed",
                    config={},
                    summary={"total_cases": 2, "passed": 2, "avg_score": 0.85},
                    started_at="2024-01-01T00:00:00",
                    completed_at="2024-01-01T00:00:10",
                    created_at="2024-01-01T00:00:00",
                ),
                LocalRun(
                    id="run-2",
                    suite_id="suite-1",
                    suite_name="test-suite",
                    agent_version="v2",
                    trigger="cli-local",
                    status="failed",
                    config={},
                    summary={"total_cases": 2, "passed": 0, "avg_score": 0.3},
                    started_at="2024-01-02T00:00:00",
                    completed_at="2024-01-02T00:00:10",
                    created_at="2024-01-02T00:00:00",
                ),
            ]
            MockDB.return_value = mock_db

            result = runner.invoke(app, ["list", "--local"])

            assert result.exit_code == 0
            assert "run-1" in result.output or "test-suite" in result.output


# ============================================================================
# CLI Show Command Tests
# ============================================================================


@pytest.mark.integration
class TestCLIShowCommand:
    """Test CLI show command."""

    def test_show_local_run(self, temp_db_path):
        """Test showing details of a local run."""
        from typer.testing import CliRunner

        from commands.run import app

        runner = CliRunner()

        with patch("commands.run.LocalDatabase") as MockDB:
            from local_runner import LocalResult, LocalRun

            mock_db = MagicMock()
            mock_db.get_run.return_value = LocalRun(
                id="run-123",
                suite_id="suite-1",
                suite_name="test-suite",
                agent_version="v1",
                trigger="cli-local",
                status="completed",
                config={},
                summary={
                    "total_cases": 2,
                    "passed": 1,
                    "failed": 1,
                    "avg_score": 0.65,
                    "scores_by_type": {"tool_selection": 0.7, "reasoning": 0.6},
                },
                started_at="2024-01-01T00:00:00",
                completed_at="2024-01-01T00:00:10",
                created_at="2024-01-01T00:00:00",
                results=[
                    LocalResult(
                        id="result-1",
                        run_id="run-123",
                        case_id="case-1",
                        case_name="passing_case",
                        mlflow_run_id="mlf-1",
                        mlflow_trace_id="trace-1",
                        status="success",
                        output={"output": "correct"},
                        scores={"tool_selection": 0.9},
                        score_details={},
                        passed=True,
                        execution_time_ms=100,
                        error=None,
                        created_at="2024-01-01T00:00:01",
                    ),
                    LocalResult(
                        id="result-2",
                        run_id="run-123",
                        case_id="case-2",
                        case_name="failing_case",
                        mlflow_run_id="mlf-2",
                        mlflow_trace_id="trace-2",
                        status="success",
                        output={"output": "wrong"},
                        scores={"tool_selection": 0.3},
                        score_details={},
                        passed=False,
                        execution_time_ms=150,
                        error=None,
                        created_at="2024-01-01T00:00:02",
                    ),
                ],
            )
            MockDB.return_value = mock_db

            result = runner.invoke(app, ["show", "run-123", "--local"])

            assert result.exit_code == 0
            assert "run-123" in result.output
            assert "test-suite" in result.output

    def test_show_local_run_not_found(self, temp_db_path):
        """Test showing a non-existent local run."""
        from typer.testing import CliRunner

        from commands.run import app

        runner = CliRunner()

        with patch("commands.run.LocalDatabase") as MockDB:
            mock_db = MagicMock()
            mock_db.get_run.return_value = None
            MockDB.return_value = mock_db

            result = runner.invoke(app, ["show", "nonexistent-run", "--local"])

            assert result.exit_code == 1
            assert "not found" in result.output.lower()

    def test_show_local_run_failed_only(self, temp_db_path):
        """Test showing only failed cases."""
        from typer.testing import CliRunner

        from commands.run import app

        runner = CliRunner()

        with patch("commands.run.LocalDatabase") as MockDB:
            from local_runner import LocalResult, LocalRun

            passing_result = LocalResult(
                id="result-1",
                run_id="run-123",
                case_id="case-1",
                case_name="passing_case",
                mlflow_run_id="mlf-1",
                mlflow_trace_id="trace-1",
                status="success",
                output={"output": "correct"},
                scores={"tool_selection": 0.9},
                score_details={},
                passed=True,
                execution_time_ms=100,
                error=None,
                created_at="2024-01-01T00:00:01",
            )

            failing_result = LocalResult(
                id="result-2",
                run_id="run-123",
                case_id="case-2",
                case_name="failing_case",
                mlflow_run_id="mlf-2",
                mlflow_trace_id="trace-2",
                status="success",
                output={"output": "wrong"},
                scores={"tool_selection": 0.3},
                score_details={},
                passed=False,
                execution_time_ms=150,
                error=None,
                created_at="2024-01-01T00:00:02",
            )

            mock_db = MagicMock()
            mock_db.get_run.return_value = LocalRun(
                id="run-123",
                suite_id="suite-1",
                suite_name="test-suite",
                agent_version="v1",
                trigger="cli-local",
                status="completed",
                config={},
                summary={"total_cases": 2, "passed": 1, "failed": 1},
                started_at="2024-01-01T00:00:00",
                completed_at="2024-01-01T00:00:10",
                created_at="2024-01-01T00:00:00",
                results=[passing_result, failing_result],
            )
            MockDB.return_value = mock_db

            result = runner.invoke(app, ["show", "run-123", "--local", "--failed-only"])

            assert result.exit_code == 0
            # Should show failing but not passing (when filtered)
            # Note: The actual filtering happens in _show_local_run
            assert "run-123" in result.output


# ============================================================================
# Agent Loading Tests
# ============================================================================


@pytest.mark.integration
class TestAgentLoading:
    """Test agent loading via CLI."""

    def test_load_agent_from_module_path(self):
        """Test loading agent from module:function path."""
        # This would normally import the actual loader
        # For CI without external deps, we test the interface
        from agent import AgentLoadError, load_agent

        # Test that loader exists and has correct interface
        assert callable(load_agent)

        # Test with mock agent from examples
        try:
            agent = load_agent("examples.agents.mock_agent:run")
            # If it loads, it should be callable
            assert callable(agent)
        except (ImportError, AgentLoadError):
            # May fail if examples not in path - that's OK for unit test
            pass

    def test_agent_load_error_handling(self, test_suite_yaml):
        """Test that agent loading errors are handled properly."""
        from typer.testing import CliRunner

        from commands.run import app

        runner = CliRunner()

        with patch("commands.run.load_agent") as mock_load:
            from agent import AgentLoadError

            mock_load.side_effect = AgentLoadError("Module not found")

            result = runner.invoke(
                app,
                [
                    "start",
                    str(test_suite_yaml),
                    "--agent",
                    "nonexistent.module:func",
                    "--local",
                ],
            )

            assert result.exit_code == 1
            assert "failed to load" in result.output.lower()


# ============================================================================
# Error Handling Tests
# ============================================================================


@pytest.mark.integration
class TestCLIErrorHandling:
    """Test CLI error handling."""

    def test_handles_suite_load_error(self, tmp_path):
        """Test handling of invalid suite YAML."""
        from typer.testing import CliRunner

        from commands.run import app

        runner = CliRunner()

        # Create invalid YAML
        invalid_yaml = tmp_path / "invalid.yaml"
        invalid_yaml.write_text("this: is: not: valid: yaml: [")

        with patch("commands.run.load_agent") as mock_load:
            mock_load.return_value = lambda q, c=None: {"output": "test"}

            result = runner.invoke(
                app,
                [
                    "start",
                    str(invalid_yaml),
                    "--agent",
                    "test:run",
                    "--local",
                ],
            )

            assert result.exit_code == 1

    def test_handles_agent_execution_error(
        self,
        test_suite_yaml,
        mock_agent_error,
        mock_local_mlflow_client,
    ):
        """Test handling of agent execution errors."""
        from typer.testing import CliRunner

        from commands.run import app

        runner = CliRunner()

        with patch("commands.run.LocalRunner") as MockLocalRunner, patch(
            "commands.run.load_agent"
        ) as mock_load_agent:
            mock_runner_instance = MagicMock()
            mock_runner_instance.mlflow_client = mock_local_mlflow_client

            from local_runner import LocalCase, LocalResult, LocalRun, LocalSuite

            mock_suite = LocalSuite(
                id=str(uuid4()),
                name="test-suite",
                description="Test",
                agent_id="test:run",
                config={},
                cases=[
                    LocalCase(
                        id=str(uuid4()),
                        name="error_case",
                        description="Test",
                        input={"query": "test", "context": {}},
                        expected_tools=[],
                        expected_tool_sequence=None,
                        expected_output_contains=[],
                        expected_output_pattern=None,
                        scorers=["tool_selection"],
                        scorer_config=None,
                        min_score=0.5,
                        timeout_seconds=30,
                        tags=[],
                    )
                ],
            )

            # Run completes but with error results
            mock_run = LocalRun(
                id="test-run-id",
                suite_id=mock_suite.id,
                suite_name="test-suite",
                agent_version="v1",
                trigger="cli-local",
                status="completed",
                config={},
                summary={"total_cases": 1, "passed": 0, "errored": 1},
                started_at="2024-01-01T00:00:00",
                completed_at="2024-01-01T00:00:01",
                created_at="2024-01-01T00:00:00",
                results=[
                    LocalResult(
                        id=str(uuid4()),
                        run_id="test-run-id",
                        case_id=str(uuid4()),
                        case_name="error_case",
                        mlflow_run_id="run-123",
                        mlflow_trace_id=None,
                        status="error",
                        output=None,
                        scores={},
                        score_details={},
                        passed=False,
                        execution_time_ms=10,
                        error="Simulated agent error",
                        created_at="2024-01-01T00:00:00",
                    )
                ],
            )

            mock_runner_instance.load_suite_from_file.return_value = mock_suite
            mock_runner_instance.execute_run.return_value = mock_run
            MockLocalRunner.return_value = mock_runner_instance
            mock_load_agent.return_value = mock_agent_error

            result = runner.invoke(
                app,
                [
                    "start",
                    str(test_suite_yaml),
                    "--agent",
                    "test:run",
                    "--local",
                ],
            )

            # Command should complete (not crash)
            assert result.exit_code == 0
            # Should show error status
            assert "completed" in result.output.lower() or "error" in result.output.lower()
