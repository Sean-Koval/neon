"""Tests for stats service.

This module tests the StatsService SQL aggregation logic including:
- Edge cases: no runs, all passed, all failed
- Pass/fail counting logic
- Average score computation (only completed runs with summaries)
- Date filtering
- Runs this week calculation
"""

from __future__ import annotations

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.services.stats_service import StatsService

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_db():
    """Create a mock async database session."""
    mock = AsyncMock()
    mock.execute = AsyncMock()
    return mock


@pytest.fixture
def sample_project_id():
    """Generate a sample project ID."""
    return uuid4()


# =============================================================================
# Helper Functions
# =============================================================================


def create_mock_stats_row(
    total_runs: int = 0,
    passed_runs: int = 0,
    failed_runs: int = 0,
    avg_score: float | None = None,
):
    """Create a mock database row for stats query."""
    row = MagicMock()
    row.total_runs = total_runs
    row.passed_runs = passed_runs
    row.failed_runs = failed_runs
    row.avg_score = avg_score
    return row


def create_mock_week_result(count: int):
    """Create a mock database result for week query."""
    result = MagicMock()
    result.scalar.return_value = count
    return result


# =============================================================================
# Unit Tests: Edge Cases
# =============================================================================


class TestEdgeCases:
    """Tests for edge cases in stats computation."""

    @pytest.mark.asyncio
    async def test_no_runs_returns_zero_stats(self, mock_db, sample_project_id):
        """When there are no runs, all stats should be zero."""
        # Mock stats query result
        stats_row = create_mock_stats_row(total_runs=0)
        stats_result = MagicMock()
        stats_result.one.return_value = stats_row

        # Mock week query result
        week_result = create_mock_week_result(0)

        mock_db.execute.side_effect = [stats_result, week_result]

        service = StatsService(mock_db)
        stats = await service.get_dashboard_stats(sample_project_id)

        assert stats["total_runs"] == 0
        assert stats["passed_runs"] == 0
        assert stats["failed_runs"] == 0
        assert stats["pass_rate"] == 0.0
        assert stats["fail_rate"] == 0.0
        assert stats["avg_score"] == 0.0
        assert stats["runs_this_week"] == 0

    @pytest.mark.asyncio
    async def test_all_passed_returns_100_percent_pass_rate(
        self, mock_db, sample_project_id
    ):
        """When all runs pass, pass_rate should be 100%."""
        stats_row = create_mock_stats_row(
            total_runs=10,
            passed_runs=10,
            failed_runs=0,
            avg_score=0.95,
        )
        stats_result = MagicMock()
        stats_result.one.return_value = stats_row

        week_result = create_mock_week_result(5)
        mock_db.execute.side_effect = [stats_result, week_result]

        service = StatsService(mock_db)
        stats = await service.get_dashboard_stats(sample_project_id)

        assert stats["total_runs"] == 10
        assert stats["passed_runs"] == 10
        assert stats["failed_runs"] == 0
        assert stats["pass_rate"] == 100.0
        assert stats["fail_rate"] == 0.0
        assert stats["avg_score"] == 0.95

    @pytest.mark.asyncio
    async def test_all_failed_returns_100_percent_fail_rate(
        self, mock_db, sample_project_id
    ):
        """When all runs fail, fail_rate should be 100%."""
        stats_row = create_mock_stats_row(
            total_runs=5,
            passed_runs=0,
            failed_runs=5,
            avg_score=0.3,
        )
        stats_result = MagicMock()
        stats_result.one.return_value = stats_row

        week_result = create_mock_week_result(2)
        mock_db.execute.side_effect = [stats_result, week_result]

        service = StatsService(mock_db)
        stats = await service.get_dashboard_stats(sample_project_id)

        assert stats["total_runs"] == 5
        assert stats["passed_runs"] == 0
        assert stats["failed_runs"] == 5
        assert stats["pass_rate"] == 0.0
        assert stats["fail_rate"] == 100.0
        assert stats["avg_score"] == 0.3


# =============================================================================
# Unit Tests: Rate Calculations
# =============================================================================


class TestRateCalculations:
    """Tests for pass/fail rate calculations."""

    @pytest.mark.asyncio
    async def test_mixed_results_calculates_correct_rates(
        self, mock_db, sample_project_id
    ):
        """Mixed pass/fail results should have correct percentages."""
        # 142 passed out of 156 = 91.0% (rounded to 1 decimal)
        stats_row = create_mock_stats_row(
            total_runs=156,
            passed_runs=142,
            failed_runs=14,
            avg_score=0.84,
        )
        stats_result = MagicMock()
        stats_result.one.return_value = stats_row

        week_result = create_mock_week_result(12)
        mock_db.execute.side_effect = [stats_result, week_result]

        service = StatsService(mock_db)
        stats = await service.get_dashboard_stats(sample_project_id)

        assert stats["total_runs"] == 156
        assert stats["passed_runs"] == 142
        assert stats["failed_runs"] == 14
        assert stats["pass_rate"] == 91.0  # 142/156 * 100 = 91.025...
        assert stats["fail_rate"] == 9.0   # 14/156 * 100 = 8.974...
        assert stats["avg_score"] == 0.84
        assert stats["runs_this_week"] == 12

    @pytest.mark.asyncio
    async def test_rate_rounding(self, mock_db, sample_project_id):
        """Rates should be rounded to 1 decimal place."""
        # 7 passed out of 9 = 77.777...% should round to 77.8%
        stats_row = create_mock_stats_row(
            total_runs=9,
            passed_runs=7,
            failed_runs=2,
            avg_score=0.756,
        )
        stats_result = MagicMock()
        stats_result.one.return_value = stats_row

        week_result = create_mock_week_result(3)
        mock_db.execute.side_effect = [stats_result, week_result]

        service = StatsService(mock_db)
        stats = await service.get_dashboard_stats(sample_project_id)

        assert stats["pass_rate"] == 77.8
        assert stats["fail_rate"] == 22.2


# =============================================================================
# Unit Tests: Average Score
# =============================================================================


class TestAverageScore:
    """Tests for average score computation."""

    @pytest.mark.asyncio
    async def test_avg_score_rounded_to_two_decimals(
        self, mock_db, sample_project_id
    ):
        """Average score should be rounded to 2 decimal places."""
        stats_row = create_mock_stats_row(
            total_runs=10,
            passed_runs=8,
            failed_runs=2,
            avg_score=0.8567,
        )
        stats_result = MagicMock()
        stats_result.one.return_value = stats_row

        week_result = create_mock_week_result(5)
        mock_db.execute.side_effect = [stats_result, week_result]

        service = StatsService(mock_db)
        stats = await service.get_dashboard_stats(sample_project_id)

        assert stats["avg_score"] == 0.86

    @pytest.mark.asyncio
    async def test_null_avg_score_returns_zero(self, mock_db, sample_project_id):
        """When no runs have scores, avg_score should be 0.0."""
        # All runs are pending/running with no summary
        stats_row = create_mock_stats_row(
            total_runs=5,
            passed_runs=0,
            failed_runs=0,
            avg_score=None,
        )
        stats_result = MagicMock()
        stats_result.one.return_value = stats_row

        week_result = create_mock_week_result(5)
        mock_db.execute.side_effect = [stats_result, week_result]

        service = StatsService(mock_db)
        stats = await service.get_dashboard_stats(sample_project_id)

        assert stats["avg_score"] == 0.0


# =============================================================================
# Unit Tests: Date Filtering
# =============================================================================


class TestDateFiltering:
    """Tests for date-based filtering."""

    @pytest.mark.asyncio
    async def test_date_from_filter(self, mock_db, sample_project_id):
        """Stats should only include runs from date_from onwards."""
        stats_row = create_mock_stats_row(
            total_runs=50,
            passed_runs=45,
            failed_runs=5,
            avg_score=0.9,
        )
        stats_result = MagicMock()
        stats_result.one.return_value = stats_row

        week_result = create_mock_week_result(10)
        mock_db.execute.side_effect = [stats_result, week_result]

        service = StatsService(mock_db)
        date_from = datetime(2024, 1, 1)
        stats = await service.get_dashboard_stats(sample_project_id, date_from=date_from)

        # Verify execute was called (filter is in the query)
        assert mock_db.execute.call_count == 2
        assert stats["total_runs"] == 50

    @pytest.mark.asyncio
    async def test_date_to_filter(self, mock_db, sample_project_id):
        """Stats should only include runs up to date_to."""
        stats_row = create_mock_stats_row(
            total_runs=30,
            passed_runs=28,
            failed_runs=2,
            avg_score=0.88,
        )
        stats_result = MagicMock()
        stats_result.one.return_value = stats_row

        week_result = create_mock_week_result(8)
        mock_db.execute.side_effect = [stats_result, week_result]

        service = StatsService(mock_db)
        date_to = datetime(2024, 6, 30)
        stats = await service.get_dashboard_stats(sample_project_id, date_to=date_to)

        assert mock_db.execute.call_count == 2
        assert stats["total_runs"] == 30

    @pytest.mark.asyncio
    async def test_date_range_filter(self, mock_db, sample_project_id):
        """Stats should only include runs within date range."""
        stats_row = create_mock_stats_row(
            total_runs=25,
            passed_runs=20,
            failed_runs=5,
            avg_score=0.82,
        )
        stats_result = MagicMock()
        stats_result.one.return_value = stats_row

        week_result = create_mock_week_result(6)
        mock_db.execute.side_effect = [stats_result, week_result]

        service = StatsService(mock_db)
        date_from = datetime(2024, 3, 1)
        date_to = datetime(2024, 6, 30)
        stats = await service.get_dashboard_stats(
            sample_project_id, date_from=date_from, date_to=date_to
        )

        assert mock_db.execute.call_count == 2
        assert stats["total_runs"] == 25


# =============================================================================
# Unit Tests: Runs This Week
# =============================================================================


class TestRunsThisWeek:
    """Tests for runs_this_week calculation."""

    @pytest.mark.asyncio
    async def test_runs_this_week_is_separate_from_date_filter(
        self, mock_db, sample_project_id
    ):
        """runs_this_week should always reflect last 7 days, ignoring date filters."""
        # Stats filtered to January
        stats_row = create_mock_stats_row(
            total_runs=100,
            passed_runs=90,
            failed_runs=10,
            avg_score=0.85,
        )
        stats_result = MagicMock()
        stats_result.one.return_value = stats_row

        # But runs_this_week is always current week
        week_result = create_mock_week_result(15)
        mock_db.execute.side_effect = [stats_result, week_result]

        service = StatsService(mock_db)
        # Filter to January 2024
        date_from = datetime(2024, 1, 1)
        date_to = datetime(2024, 1, 31)
        stats = await service.get_dashboard_stats(
            sample_project_id, date_from=date_from, date_to=date_to
        )

        # total_runs reflects the filtered period
        assert stats["total_runs"] == 100
        # runs_this_week is independent of the date filter
        assert stats["runs_this_week"] == 15

    @pytest.mark.asyncio
    async def test_runs_this_week_zero_when_no_recent_runs(
        self, mock_db, sample_project_id
    ):
        """runs_this_week should be 0 when no runs in last 7 days."""
        stats_row = create_mock_stats_row(
            total_runs=500,  # Many historical runs
            passed_runs=450,
            failed_runs=50,
            avg_score=0.92,
        )
        stats_result = MagicMock()
        stats_result.one.return_value = stats_row

        week_result = create_mock_week_result(0)  # No runs this week
        mock_db.execute.side_effect = [stats_result, week_result]

        service = StatsService(mock_db)
        stats = await service.get_dashboard_stats(sample_project_id)

        assert stats["total_runs"] == 500
        assert stats["runs_this_week"] == 0


# =============================================================================
# Unit Tests: Return Type Consistency
# =============================================================================


class TestReturnTypes:
    """Tests for consistent return types."""

    @pytest.mark.asyncio
    async def test_return_types_are_correct(self, mock_db, sample_project_id):
        """All return values should have the expected types."""
        stats_row = create_mock_stats_row(
            total_runs=100,
            passed_runs=85,
            failed_runs=15,
            avg_score=0.87,
        )
        stats_result = MagicMock()
        stats_result.one.return_value = stats_row

        week_result = create_mock_week_result(20)
        mock_db.execute.side_effect = [stats_result, week_result]

        service = StatsService(mock_db)
        stats = await service.get_dashboard_stats(sample_project_id)

        assert isinstance(stats["total_runs"], int)
        assert isinstance(stats["passed_runs"], int)
        assert isinstance(stats["failed_runs"], int)
        assert isinstance(stats["pass_rate"], float)
        assert isinstance(stats["fail_rate"], float)
        assert isinstance(stats["avg_score"], float)
        assert isinstance(stats["runs_this_week"], int)
