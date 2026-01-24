"""Integration tests for run comparison functionality.

These tests verify that comparing runs correctly identifies
regressions and improvements.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest

# Ensure imports work
_cli_src = Path(__file__).parent.parent.parent / "cli" / "src"
if str(_cli_src) not in sys.path:
    sys.path.insert(0, str(_cli_src))


# ============================================================================
# Run Comparison Tests
# ============================================================================


@pytest.mark.integration
class TestRunComparison:
    """Test run comparison functionality."""

    def test_compare_identifies_regression(self, local_database):
        """Test that comparison identifies score regressions."""
        from local_runner import LocalResult, LocalRun, compare_local_runs

        # Create baseline run with good scores
        baseline_run = LocalRun(
            id="baseline-run",
            suite_id="suite-1",
            suite_name="test-suite",
            agent_version="v1",
            trigger="cli-local",
            status="completed",
            config={},
            summary={
                "total_cases": 2,
                "passed": 2,
                "failed": 0,
                "avg_score": 0.9,
            },
            started_at="2024-01-01T00:00:00",
            completed_at="2024-01-01T00:00:10",
            created_at="2024-01-01T00:00:00",
        )

        baseline_results = [
            LocalResult(
                id="baseline-result-1",
                run_id="baseline-run",
                case_id="case-1",
                case_name="test_case_1",
                mlflow_run_id="mlf-1",
                mlflow_trace_id="trace-1",
                status="success",
                output={"output": "good"},
                scores={"tool_selection": 0.9, "reasoning": 0.85},
                score_details={},
                passed=True,
                execution_time_ms=100,
                error=None,
                created_at="2024-01-01T00:00:01",
            ),
            LocalResult(
                id="baseline-result-2",
                run_id="baseline-run",
                case_id="case-2",
                case_name="test_case_2",
                mlflow_run_id="mlf-2",
                mlflow_trace_id="trace-2",
                status="success",
                output={"output": "good"},
                scores={"tool_selection": 0.95, "reasoning": 0.9},
                score_details={},
                passed=True,
                execution_time_ms=100,
                error=None,
                created_at="2024-01-01T00:00:02",
            ),
        ]

        # Create candidate run with worse scores (regression)
        candidate_run = LocalRun(
            id="candidate-run",
            suite_id="suite-1",
            suite_name="test-suite",
            agent_version="v2",
            trigger="cli-local",
            status="completed",
            config={},
            summary={
                "total_cases": 2,
                "passed": 1,
                "failed": 1,
                "avg_score": 0.6,
            },
            started_at="2024-01-02T00:00:00",
            completed_at="2024-01-02T00:00:10",
            created_at="2024-01-02T00:00:00",
        )

        candidate_results = [
            LocalResult(
                id="candidate-result-1",
                run_id="candidate-run",
                case_id="case-1",
                case_name="test_case_1",
                mlflow_run_id="mlf-3",
                mlflow_trace_id="trace-3",
                status="success",
                output={"output": "worse"},
                scores={"tool_selection": 0.5, "reasoning": 0.4},  # Regression!
                score_details={},
                passed=False,
                execution_time_ms=100,
                error=None,
                created_at="2024-01-02T00:00:01",
            ),
            LocalResult(
                id="candidate-result-2",
                run_id="candidate-run",
                case_id="case-2",
                case_name="test_case_2",
                mlflow_run_id="mlf-4",
                mlflow_trace_id="trace-4",
                status="success",
                output={"output": "similar"},
                scores={"tool_selection": 0.9, "reasoning": 0.85},
                score_details={},
                passed=True,
                execution_time_ms=100,
                error=None,
                created_at="2024-01-02T00:00:02",
            ),
        ]

        # Save to database
        local_database.save_run(baseline_run)
        for result in baseline_results:
            local_database.save_result(result)

        local_database.save_run(candidate_run)
        for result in candidate_results:
            local_database.save_result(result)

        # Compare runs
        comparison = compare_local_runs(
            baseline_id="baseline-run",
            candidate_id="candidate-run",
            threshold=0.05,
            db=local_database,
        )

        # Should identify regressions
        assert comparison["passed"] is False
        assert len(comparison["regressions"]) > 0

        # Verify regression details
        regression = comparison["regressions"][0]
        assert regression["case_name"] == "test_case_1"
        assert regression["baseline_score"] > regression["candidate_score"]
        assert regression["delta"] < 0

    def test_compare_identifies_improvement(self, local_database):
        """Test that comparison identifies score improvements."""
        from local_runner import LocalResult, LocalRun, compare_local_runs

        # Create baseline run with lower scores
        baseline_run = LocalRun(
            id="baseline-run-2",
            suite_id="suite-1",
            suite_name="test-suite",
            agent_version="v1",
            trigger="cli-local",
            status="completed",
            config={},
            summary={"total_cases": 1, "passed": 0, "avg_score": 0.5},
            started_at="2024-01-01T00:00:00",
            completed_at="2024-01-01T00:00:10",
            created_at="2024-01-01T00:00:00",
        )

        baseline_results = [
            LocalResult(
                id="baseline-result-3",
                run_id="baseline-run-2",
                case_id="case-1",
                case_name="test_case_1",
                mlflow_run_id="mlf-5",
                mlflow_trace_id="trace-5",
                status="success",
                output={"output": "ok"},
                scores={"tool_selection": 0.5},
                score_details={},
                passed=False,
                execution_time_ms=100,
                error=None,
                created_at="2024-01-01T00:00:01",
            ),
        ]

        # Create candidate run with better scores (improvement)
        candidate_run = LocalRun(
            id="candidate-run-2",
            suite_id="suite-1",
            suite_name="test-suite",
            agent_version="v2",
            trigger="cli-local",
            status="completed",
            config={},
            summary={"total_cases": 1, "passed": 1, "avg_score": 0.9},
            started_at="2024-01-02T00:00:00",
            completed_at="2024-01-02T00:00:10",
            created_at="2024-01-02T00:00:00",
        )

        candidate_results = [
            LocalResult(
                id="candidate-result-3",
                run_id="candidate-run-2",
                case_id="case-1",
                case_name="test_case_1",
                mlflow_run_id="mlf-6",
                mlflow_trace_id="trace-6",
                status="success",
                output={"output": "great"},
                scores={"tool_selection": 0.9},  # Improvement!
                score_details={},
                passed=True,
                execution_time_ms=100,
                error=None,
                created_at="2024-01-02T00:00:01",
            ),
        ]

        # Save to database
        local_database.save_run(baseline_run)
        for result in baseline_results:
            local_database.save_result(result)

        local_database.save_run(candidate_run)
        for result in candidate_results:
            local_database.save_result(result)

        # Compare runs
        comparison = compare_local_runs(
            baseline_id="baseline-run-2",
            candidate_id="candidate-run-2",
            threshold=0.05,
            db=local_database,
        )

        # Should pass (no regressions) and show improvements
        assert comparison["passed"] is True
        assert len(comparison["improvements"]) > 0
        assert len(comparison["regressions"]) == 0

        # Verify improvement details
        improvement = comparison["improvements"][0]
        assert improvement["baseline_score"] < improvement["candidate_score"]
        assert improvement["delta"] > 0

    def test_compare_with_no_changes(self, local_database):
        """Test comparison when scores are unchanged."""
        from local_runner import LocalResult, LocalRun, compare_local_runs

        # Create two runs with similar scores
        run1 = LocalRun(
            id="run-same-1",
            suite_id="suite-1",
            suite_name="test-suite",
            agent_version="v1",
            trigger="cli-local",
            status="completed",
            config={},
            summary={"total_cases": 1, "passed": 1, "avg_score": 0.8},
            started_at="2024-01-01T00:00:00",
            completed_at="2024-01-01T00:00:10",
            created_at="2024-01-01T00:00:00",
        )

        run2 = LocalRun(
            id="run-same-2",
            suite_id="suite-1",
            suite_name="test-suite",
            agent_version="v1.1",
            trigger="cli-local",
            status="completed",
            config={},
            summary={"total_cases": 1, "passed": 1, "avg_score": 0.81},
            started_at="2024-01-02T00:00:00",
            completed_at="2024-01-02T00:00:10",
            created_at="2024-01-02T00:00:00",
        )

        # Same scores (within threshold)
        result1 = LocalResult(
            id="result-same-1",
            run_id="run-same-1",
            case_id="case-1",
            case_name="test_case",
            mlflow_run_id="mlf-7",
            mlflow_trace_id="trace-7",
            status="success",
            output={"output": "test"},
            scores={"tool_selection": 0.8},
            score_details={},
            passed=True,
            execution_time_ms=100,
            error=None,
            created_at="2024-01-01T00:00:01",
        )

        result2 = LocalResult(
            id="result-same-2",
            run_id="run-same-2",
            case_id="case-1",
            case_name="test_case",
            mlflow_run_id="mlf-8",
            mlflow_trace_id="trace-8",
            status="success",
            output={"output": "test"},
            scores={"tool_selection": 0.81},  # Within threshold
            score_details={},
            passed=True,
            execution_time_ms=100,
            error=None,
            created_at="2024-01-02T00:00:01",
        )

        local_database.save_run(run1)
        local_database.save_result(result1)
        local_database.save_run(run2)
        local_database.save_result(result2)

        # Compare with 0.05 threshold (0.01 diff is within threshold)
        comparison = compare_local_runs(
            baseline_id="run-same-1",
            candidate_id="run-same-2",
            threshold=0.05,
            db=local_database,
        )

        assert comparison["passed"] is True
        assert len(comparison["regressions"]) == 0
        assert len(comparison["improvements"]) == 0
        assert comparison["unchanged"] == 1

    def test_compare_nonexistent_baseline(self, local_database):
        """Test comparison with non-existent baseline run."""
        from local_runner import LocalRun, compare_local_runs

        # Only create candidate run
        candidate = LocalRun(
            id="candidate-only",
            suite_id="suite-1",
            suite_name="test-suite",
            agent_version="v1",
            trigger="cli-local",
            status="completed",
            config={},
            summary={},
            started_at="2024-01-01T00:00:00",
            completed_at="2024-01-01T00:00:10",
            created_at="2024-01-01T00:00:00",
        )
        local_database.save_run(candidate)

        with pytest.raises(ValueError, match="Baseline run not found"):
            compare_local_runs(
                baseline_id="nonexistent",
                candidate_id="candidate-only",
                db=local_database,
            )

    def test_compare_nonexistent_candidate(self, local_database):
        """Test comparison with non-existent candidate run."""
        from local_runner import LocalRun, compare_local_runs

        # Only create baseline run
        baseline = LocalRun(
            id="baseline-only",
            suite_id="suite-1",
            suite_name="test-suite",
            agent_version="v1",
            trigger="cli-local",
            status="completed",
            config={},
            summary={},
            started_at="2024-01-01T00:00:00",
            completed_at="2024-01-01T00:00:10",
            created_at="2024-01-01T00:00:00",
        )
        local_database.save_run(baseline)

        with pytest.raises(ValueError, match="Candidate run not found"):
            compare_local_runs(
                baseline_id="baseline-only",
                candidate_id="nonexistent",
                db=local_database,
            )

    def test_compare_returns_overall_delta(self, local_database):
        """Test that comparison returns overall score delta."""
        from local_runner import LocalResult, LocalRun, compare_local_runs

        baseline = LocalRun(
            id="delta-baseline",
            suite_id="suite-1",
            suite_name="test-suite",
            agent_version="v1",
            trigger="cli-local",
            status="completed",
            config={},
            summary={"avg_score": 0.7},
            started_at="2024-01-01T00:00:00",
            completed_at="2024-01-01T00:00:10",
            created_at="2024-01-01T00:00:00",
        )

        candidate = LocalRun(
            id="delta-candidate",
            suite_id="suite-1",
            suite_name="test-suite",
            agent_version="v2",
            trigger="cli-local",
            status="completed",
            config={},
            summary={"avg_score": 0.85},
            started_at="2024-01-02T00:00:00",
            completed_at="2024-01-02T00:00:10",
            created_at="2024-01-02T00:00:00",
        )

        # Add results for comparison
        result1 = LocalResult(
            id="delta-result-1",
            run_id="delta-baseline",
            case_id="case-1",
            case_name="test",
            mlflow_run_id="mlf-9",
            mlflow_trace_id="trace-9",
            status="success",
            output={},
            scores={"tool_selection": 0.7},
            score_details={},
            passed=True,
            execution_time_ms=100,
            error=None,
            created_at="2024-01-01T00:00:01",
        )

        result2 = LocalResult(
            id="delta-result-2",
            run_id="delta-candidate",
            case_id="case-1",
            case_name="test",
            mlflow_run_id="mlf-10",
            mlflow_trace_id="trace-10",
            status="success",
            output={},
            scores={"tool_selection": 0.85},
            score_details={},
            passed=True,
            execution_time_ms=100,
            error=None,
            created_at="2024-01-02T00:00:01",
        )

        local_database.save_run(baseline)
        local_database.save_run(candidate)
        local_database.save_result(result1)
        local_database.save_result(result2)

        comparison = compare_local_runs(
            baseline_id="delta-baseline",
            candidate_id="delta-candidate",
            db=local_database,
        )

        # Overall delta should be candidate - baseline
        assert comparison["overall_delta"] == pytest.approx(0.15, rel=0.01)

    def test_compare_includes_metadata(self, local_database):
        """Test that comparison includes run metadata."""
        from local_runner import LocalRun, compare_local_runs

        baseline = LocalRun(
            id="meta-baseline",
            suite_id="suite-1",
            suite_name="test-suite",
            agent_version="v1.0.0",
            trigger="cli-local",
            status="completed",
            config={},
            summary={"avg_score": 0.8},
            started_at="2024-01-01T00:00:00",
            completed_at="2024-01-01T00:00:10",
            created_at="2024-01-01T00:00:00",
        )

        candidate = LocalRun(
            id="meta-candidate",
            suite_id="suite-1",
            suite_name="test-suite",
            agent_version="v2.0.0",
            trigger="cli-local",
            status="completed",
            config={},
            summary={"avg_score": 0.85},
            started_at="2024-01-02T00:00:00",
            completed_at="2024-01-02T00:00:10",
            created_at="2024-01-02T00:00:00",
        )

        local_database.save_run(baseline)
        local_database.save_run(candidate)

        comparison = compare_local_runs(
            baseline_id="meta-baseline",
            candidate_id="meta-candidate",
            db=local_database,
        )

        # Verify metadata is included
        assert "baseline" in comparison
        assert comparison["baseline"]["id"] == "meta-baseline"
        assert comparison["baseline"]["agent_version"] == "v1.0.0"
        assert comparison["baseline"]["suite_name"] == "test-suite"

        assert "candidate" in comparison
        assert comparison["candidate"]["id"] == "meta-candidate"
        assert comparison["candidate"]["agent_version"] == "v2.0.0"


# ============================================================================
# Multiple Scorer Comparison Tests
# ============================================================================


@pytest.mark.integration
class TestMultiScorerComparison:
    """Test comparison with multiple scorers."""

    def test_compare_per_scorer_regression(self, local_database):
        """Test that regressions are tracked per scorer."""
        from local_runner import LocalResult, LocalRun, compare_local_runs

        baseline = LocalRun(
            id="multi-baseline",
            suite_id="suite-1",
            suite_name="test-suite",
            agent_version="v1",
            trigger="cli-local",
            status="completed",
            config={},
            summary={"avg_score": 0.85},
            started_at="2024-01-01T00:00:00",
            completed_at="2024-01-01T00:00:10",
            created_at="2024-01-01T00:00:00",
        )

        candidate = LocalRun(
            id="multi-candidate",
            suite_id="suite-1",
            suite_name="test-suite",
            agent_version="v2",
            trigger="cli-local",
            status="completed",
            config={},
            summary={"avg_score": 0.7},
            started_at="2024-01-02T00:00:00",
            completed_at="2024-01-02T00:00:10",
            created_at="2024-01-02T00:00:00",
        )

        # Baseline has good scores across all scorers
        baseline_result = LocalResult(
            id="multi-baseline-result",
            run_id="multi-baseline",
            case_id="case-1",
            case_name="multi_scorer_case",
            mlflow_run_id="mlf-11",
            mlflow_trace_id="trace-11",
            status="success",
            output={},
            scores={
                "tool_selection": 0.9,
                "reasoning": 0.85,
                "grounding": 0.8,
            },
            score_details={},
            passed=True,
            execution_time_ms=100,
            error=None,
            created_at="2024-01-01T00:00:01",
        )

        # Candidate regresses only in reasoning
        candidate_result = LocalResult(
            id="multi-candidate-result",
            run_id="multi-candidate",
            case_id="case-1",
            case_name="multi_scorer_case",
            mlflow_run_id="mlf-12",
            mlflow_trace_id="trace-12",
            status="success",
            output={},
            scores={
                "tool_selection": 0.88,  # Within threshold
                "reasoning": 0.5,  # Regression!
                "grounding": 0.82,  # Slight improvement
            },
            score_details={},
            passed=False,
            execution_time_ms=100,
            error=None,
            created_at="2024-01-02T00:00:01",
        )

        local_database.save_run(baseline)
        local_database.save_run(candidate)
        local_database.save_result(baseline_result)
        local_database.save_result(candidate_result)

        comparison = compare_local_runs(
            baseline_id="multi-baseline",
            candidate_id="multi-candidate",
            threshold=0.05,
            db=local_database,
        )

        # Should identify reasoning regression
        assert comparison["passed"] is False
        assert len(comparison["regressions"]) >= 1

        reasoning_regression = [r for r in comparison["regressions"] if r["scorer"] == "reasoning"]
        assert len(reasoning_regression) == 1
        assert reasoning_regression[0]["delta"] < -0.3  # 0.5 - 0.85 = -0.35


# ============================================================================
# Threshold Configuration Tests
# ============================================================================


@pytest.mark.integration
class TestComparisonThresholds:
    """Test comparison threshold configuration."""

    def test_strict_threshold_catches_small_regression(self, local_database):
        """Test that strict threshold catches small regressions."""
        from local_runner import LocalResult, LocalRun, compare_local_runs

        baseline = LocalRun(
            id="strict-baseline",
            suite_id="suite-1",
            suite_name="test-suite",
            agent_version="v1",
            trigger="cli-local",
            status="completed",
            config={},
            summary={"avg_score": 0.9},
            started_at="2024-01-01T00:00:00",
            completed_at="2024-01-01T00:00:10",
            created_at="2024-01-01T00:00:00",
        )

        candidate = LocalRun(
            id="strict-candidate",
            suite_id="suite-1",
            suite_name="test-suite",
            agent_version="v2",
            trigger="cli-local",
            status="completed",
            config={},
            summary={"avg_score": 0.87},
            started_at="2024-01-02T00:00:00",
            completed_at="2024-01-02T00:00:10",
            created_at="2024-01-02T00:00:00",
        )

        baseline_result = LocalResult(
            id="strict-baseline-result",
            run_id="strict-baseline",
            case_id="case-1",
            case_name="strict_case",
            mlflow_run_id="mlf-13",
            mlflow_trace_id="trace-13",
            status="success",
            output={},
            scores={"tool_selection": 0.9},
            score_details={},
            passed=True,
            execution_time_ms=100,
            error=None,
            created_at="2024-01-01T00:00:01",
        )

        candidate_result = LocalResult(
            id="strict-candidate-result",
            run_id="strict-candidate",
            case_id="case-1",
            case_name="strict_case",
            mlflow_run_id="mlf-14",
            mlflow_trace_id="trace-14",
            status="success",
            output={},
            scores={"tool_selection": 0.87},  # Small drop
            score_details={},
            passed=True,
            execution_time_ms=100,
            error=None,
            created_at="2024-01-02T00:00:01",
        )

        local_database.save_run(baseline)
        local_database.save_run(candidate)
        local_database.save_result(baseline_result)
        local_database.save_result(candidate_result)

        # With loose threshold (0.05), this passes
        loose_comparison = compare_local_runs(
            baseline_id="strict-baseline",
            candidate_id="strict-candidate",
            threshold=0.05,
            db=local_database,
        )
        assert loose_comparison["passed"] is True

        # With strict threshold (0.01), this fails
        strict_comparison = compare_local_runs(
            baseline_id="strict-baseline",
            candidate_id="strict-candidate",
            threshold=0.01,
            db=local_database,
        )
        assert strict_comparison["passed"] is False
        assert len(strict_comparison["regressions"]) == 1
