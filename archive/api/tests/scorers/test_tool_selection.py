"""Tests for ToolSelectionScorer.

Tests cover all acceptance criteria:
- Exact match: all expected tools called, no extras
- Partial match: some expected tools called
- Sequence order: correct sequence vs incorrect sequence
- No tools expected: verifying no tools were called
- Extra tools: penalty for unnecessary tool calls
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from src.scorers.base import ScorerResult
from src.scorers.tool_selection import ToolSelectionScorer

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def scorer() -> ToolSelectionScorer:
    """Create a ToolSelectionScorer instance."""
    return ToolSelectionScorer()


@pytest.fixture
def mock_case() -> MagicMock:
    """Create a mock EvalCaseModel."""
    case = MagicMock()
    case.id = uuid4()
    case.name = "test_case"
    case.expected_tools = None
    case.expected_tool_sequence = None
    return case


def make_output(tools_called: list[str]) -> dict[str, Any]:
    """Helper to create output dict with tools_called."""
    return {"tools_called": tools_called, "output": "test output"}


# =============================================================================
# Test: Exact Match
# =============================================================================


class TestExactMatch:
    """Tests for exact tool matching scenarios."""

    @pytest.mark.asyncio
    async def test_exact_match_single_tool(self, scorer: ToolSelectionScorer, mock_case: MagicMock):
        """Single expected tool, single actual tool - exact match."""
        mock_case.expected_tools = ["search"]
        output = make_output(["search"])

        result = await scorer.score(mock_case, output)

        assert isinstance(result, ScorerResult)
        assert result.score == 1.0
        assert "All expected tools called correctly" in result.evidence

    @pytest.mark.asyncio
    async def test_exact_match_multiple_tools(
        self, scorer: ToolSelectionScorer, mock_case: MagicMock
    ):
        """Multiple expected tools, all called - exact match."""
        mock_case.expected_tools = ["search", "calculator", "fetch"]
        output = make_output(["search", "calculator", "fetch"])

        result = await scorer.score(mock_case, output)

        assert result.score == 1.0
        assert "All expected tools called correctly" in result.evidence

    @pytest.mark.asyncio
    async def test_exact_match_order_independent(
        self, scorer: ToolSelectionScorer, mock_case: MagicMock
    ):
        """Order shouldn't matter for expected_tools (non-sequence)."""
        mock_case.expected_tools = ["search", "calculator", "fetch"]
        output = make_output(["fetch", "search", "calculator"])

        result = await scorer.score(mock_case, output)

        assert result.score == 1.0


# =============================================================================
# Test: Partial Match
# =============================================================================


class TestPartialMatch:
    """Tests for partial tool matching scenarios."""

    @pytest.mark.asyncio
    async def test_partial_match_missing_one(
        self, scorer: ToolSelectionScorer, mock_case: MagicMock
    ):
        """One expected tool missing - partial score."""
        mock_case.expected_tools = ["search", "calculator"]
        output = make_output(["search"])

        result = await scorer.score(mock_case, output)

        # Jaccard: intersection=1, union=2, score=0.5
        assert result.score == 0.5
        assert any("Missing expected tools" in e for e in result.evidence)

    @pytest.mark.asyncio
    async def test_partial_match_missing_multiple(
        self, scorer: ToolSelectionScorer, mock_case: MagicMock
    ):
        """Multiple expected tools missing."""
        mock_case.expected_tools = ["search", "calculator", "fetch"]
        output = make_output(["search"])

        result = await scorer.score(mock_case, output)

        # Jaccard: intersection=1, union=3, score=0.333...
        assert 0.3 < result.score < 0.4

    @pytest.mark.asyncio
    async def test_partial_match_with_extra(
        self, scorer: ToolSelectionScorer, mock_case: MagicMock
    ):
        """Some expected, some missing, some extra."""
        mock_case.expected_tools = ["search", "calculator"]
        output = make_output(["search", "weather"])

        result = await scorer.score(mock_case, output)

        # Jaccard: intersection={search}=1, union={search,calculator,weather}=3, score=0.333...
        assert 0.3 < result.score < 0.4
        assert any("Missing expected tools" in e for e in result.evidence)
        assert any("Unexpected tools" in e for e in result.evidence)


# =============================================================================
# Test: Sequence Order
# =============================================================================


class TestSequenceOrder:
    """Tests for tool sequence evaluation."""

    @pytest.mark.asyncio
    async def test_sequence_exact_match(self, scorer: ToolSelectionScorer, mock_case: MagicMock):
        """Exact sequence match - full score."""
        mock_case.expected_tools = ["search", "calculate", "summarize"]
        mock_case.expected_tool_sequence = ["search", "calculate", "summarize"]
        output = make_output(["search", "calculate", "summarize"])

        result = await scorer.score(mock_case, output)

        assert result.score == 1.0
        assert "Tool sequence matches exactly" in result.evidence

    @pytest.mark.asyncio
    async def test_sequence_wrong_order(self, scorer: ToolSelectionScorer, mock_case: MagicMock):
        """Wrong sequence order - reduced score."""
        mock_case.expected_tools = ["search", "calculate"]
        mock_case.expected_tool_sequence = ["search", "calculate"]
        output = make_output(["calculate", "search"])

        result = await scorer.score(mock_case, output)

        # Tool match: 1.0 (same tools), Sequence: LCS=1/2=0.5
        # Combined: (1.0 + 0.5) / 2 = 0.75
        assert result.score == 0.75
        assert any("Tool sequence differs" in e for e in result.evidence)

    @pytest.mark.asyncio
    async def test_sequence_partial_match(
        self, scorer: ToolSelectionScorer, mock_case: MagicMock
    ):
        """Partial sequence match using LCS."""
        mock_case.expected_tools = ["a", "b", "c", "d"]
        mock_case.expected_tool_sequence = ["a", "b", "c", "d"]
        output = make_output(["a", "c", "d"])  # Missing 'b', but a-c-d is LCS of length 3

        result = await scorer.score(mock_case, output)

        # Tool match: Jaccard intersection=3, union=4, tool_score=0.75
        # Sequence: LCS length = 3 (a,c,d), max_length = 4, seq_score = 0.75
        # Combined: (0.75 + 0.75) / 2 = 0.75
        assert result.score == 0.75

    @pytest.mark.asyncio
    async def test_sequence_completely_different(
        self, scorer: ToolSelectionScorer, mock_case: MagicMock
    ):
        """Completely different sequence - low score."""
        mock_case.expected_tools = ["search", "calculate"]
        mock_case.expected_tool_sequence = ["search", "calculate"]
        output = make_output(["weather", "news"])

        result = await scorer.score(mock_case, output)

        # Tool match: 0 (no overlap), Sequence: 0 (no common subsequence)
        assert result.score == 0.0


# =============================================================================
# Test: No Tools Expected
# =============================================================================


class TestNoToolsExpected:
    """Tests for cases where no tools should be called."""

    @pytest.mark.asyncio
    async def test_no_tools_expected_none_called(
        self, scorer: ToolSelectionScorer, mock_case: MagicMock
    ):
        """No tools expected, none called - perfect score."""
        mock_case.expected_tools = []
        output = make_output([])

        result = await scorer.score(mock_case, output)

        assert result.score == 1.0
        assert "Correctly called no tools" in result.evidence

    @pytest.mark.asyncio
    async def test_no_tools_expected_but_called(
        self, scorer: ToolSelectionScorer, mock_case: MagicMock
    ):
        """No tools expected, but some called - zero score."""
        mock_case.expected_tools = []
        output = make_output(["search", "calculate"])

        result = await scorer.score(mock_case, output)

        assert result.score == 0.0
        assert any("Expected no tools" in e for e in result.evidence)


# =============================================================================
# Test: Extra Tools Called
# =============================================================================


class TestExtraTools:
    """Tests for penalty when extra tools are called."""

    @pytest.mark.asyncio
    async def test_extra_tools_reduce_score(
        self, scorer: ToolSelectionScorer, mock_case: MagicMock
    ):
        """Extra tools should reduce the score via Jaccard similarity."""
        mock_case.expected_tools = ["search"]
        output = make_output(["search", "unnecessary_tool"])

        result = await scorer.score(mock_case, output)

        # Jaccard: intersection=1, union=2, score=0.5
        assert result.score == 0.5
        assert any("Unexpected tools" in e for e in result.evidence)

    @pytest.mark.asyncio
    async def test_many_extra_tools(self, scorer: ToolSelectionScorer, mock_case: MagicMock):
        """Many extra tools heavily penalize score."""
        mock_case.expected_tools = ["search"]
        output = make_output(["search", "tool1", "tool2", "tool3", "tool4"])

        result = await scorer.score(mock_case, output)

        # Jaccard: intersection=1, union=5, score=0.2
        assert result.score == 0.2


# =============================================================================
# Test: Edge Cases
# =============================================================================


class TestEdgeCases:
    """Tests for edge cases and special scenarios."""

    @pytest.mark.asyncio
    async def test_no_expected_tools_specified(
        self, scorer: ToolSelectionScorer, mock_case: MagicMock
    ):
        """When expected_tools is None, use neutral score."""
        mock_case.expected_tools = None
        output = make_output(["some_tool"])

        result = await scorer.score(mock_case, output)

        assert result.score == 0.8
        assert "No expected tools specified" in result.evidence

    @pytest.mark.asyncio
    async def test_tools_called_as_string(
        self, scorer: ToolSelectionScorer, mock_case: MagicMock
    ):
        """Handle tools_called as string instead of list."""
        mock_case.expected_tools = ["search"]
        output = {"tools_called": "search", "output": "test"}

        result = await scorer.score(mock_case, output)

        assert result.score == 1.0

    @pytest.mark.asyncio
    async def test_empty_tools_called(self, scorer: ToolSelectionScorer, mock_case: MagicMock):
        """Empty tools_called list when tools expected - zero score."""
        mock_case.expected_tools = ["search", "calculate"]
        output = make_output([])

        result = await scorer.score(mock_case, output)

        assert result.score == 0.0
        assert any("Missing expected tools" in e for e in result.evidence)

    @pytest.mark.asyncio
    async def test_missing_tools_called_key(
        self, scorer: ToolSelectionScorer, mock_case: MagicMock
    ):
        """Handle output without tools_called key."""
        mock_case.expected_tools = ["search"]
        output = {"output": "test"}

        result = await scorer.score(mock_case, output)

        # tools_called defaults to [], so this is a miss
        assert result.score == 0.0

    @pytest.mark.asyncio
    async def test_duplicate_tools_in_expected(
        self, scorer: ToolSelectionScorer, mock_case: MagicMock
    ):
        """Duplicate tools in expected_tools (uses set, so deduped)."""
        mock_case.expected_tools = ["search", "search", "calculate"]
        output = make_output(["search", "calculate"])

        result = await scorer.score(mock_case, output)

        # Set deduplication: expected={search, calculate}, actual={search, calculate}
        assert result.score == 1.0

    @pytest.mark.asyncio
    async def test_duplicate_tools_in_actual(
        self, scorer: ToolSelectionScorer, mock_case: MagicMock
    ):
        """Duplicate tools in actual calls (uses set, so deduped)."""
        mock_case.expected_tools = ["search", "calculate"]
        output = make_output(["search", "search", "calculate", "calculate"])

        result = await scorer.score(mock_case, output)

        # Set deduplication: expected={search, calculate}, actual={search, calculate}
        assert result.score == 1.0


# =============================================================================
# Test: Reason Messages
# =============================================================================


class TestReasonMessages:
    """Tests for appropriate reason messages."""

    @pytest.mark.asyncio
    async def test_excellent_reason(self, scorer: ToolSelectionScorer, mock_case: MagicMock):
        """Score >= 0.9 should give 'Excellent' reason."""
        mock_case.expected_tools = ["search"]
        output = make_output(["search"])

        result = await scorer.score(mock_case, output)

        assert "Excellent" in result.reason

    @pytest.mark.asyncio
    async def test_good_reason(self, scorer: ToolSelectionScorer, mock_case: MagicMock):
        """Score 0.7-0.9 should give 'Good' reason."""
        mock_case.expected_tools = ["search", "calculate"]
        mock_case.expected_tool_sequence = ["search", "calculate"]
        output = make_output(["calculate", "search"])  # Wrong order

        result = await scorer.score(mock_case, output)

        assert result.score == 0.75
        assert "Good" in result.reason

    @pytest.mark.asyncio
    async def test_partial_reason(self, scorer: ToolSelectionScorer, mock_case: MagicMock):
        """Score 0.5-0.7 should give 'Partial' reason."""
        mock_case.expected_tools = ["search", "calculate"]
        output = make_output(["search"])

        result = await scorer.score(mock_case, output)

        assert result.score == 0.5
        assert "Partial" in result.reason

    @pytest.mark.asyncio
    async def test_poor_reason(self, scorer: ToolSelectionScorer, mock_case: MagicMock):
        """Score < 0.5 should give 'Poor' reason."""
        mock_case.expected_tools = ["search", "calculate", "fetch"]
        output = make_output(["weather"])

        result = await scorer.score(mock_case, output)

        assert result.score < 0.5
        assert "Poor" in result.reason


# =============================================================================
# Test: LCS Algorithm
# =============================================================================


class TestLCSAlgorithm:
    """Tests for the _lcs_length helper method."""

    def test_lcs_identical_sequences(self, scorer: ToolSelectionScorer):
        """Identical sequences - LCS equals length."""
        result = scorer._lcs_length(["a", "b", "c"], ["a", "b", "c"])
        assert result == 3

    def test_lcs_empty_sequences(self, scorer: ToolSelectionScorer):
        """Empty sequences - LCS is 0."""
        result = scorer._lcs_length([], [])
        assert result == 0

    def test_lcs_one_empty(self, scorer: ToolSelectionScorer):
        """One empty sequence - LCS is 0."""
        assert scorer._lcs_length(["a", "b"], []) == 0
        assert scorer._lcs_length([], ["a", "b"]) == 0

    def test_lcs_no_common(self, scorer: ToolSelectionScorer):
        """No common elements - LCS is 0."""
        result = scorer._lcs_length(["a", "b", "c"], ["x", "y", "z"])
        assert result == 0

    def test_lcs_partial_overlap(self, scorer: ToolSelectionScorer):
        """Partial overlap - correct LCS length."""
        result = scorer._lcs_length(["a", "b", "c", "d"], ["a", "c", "d"])
        assert result == 3  # "a", "c", "d"

    def test_lcs_interleaved(self, scorer: ToolSelectionScorer):
        """Interleaved sequences."""
        result = scorer._lcs_length(["a", "b", "c"], ["x", "a", "y", "b", "z", "c"])
        assert result == 3  # "a", "b", "c"


# =============================================================================
# Test: Scorer Metadata
# =============================================================================


class TestScorerMetadata:
    """Tests for scorer class attributes."""

    def test_scorer_name(self, scorer: ToolSelectionScorer):
        """Scorer should have correct name."""
        assert scorer.name == "tool_selection"

    def test_scorer_description(self, scorer: ToolSelectionScorer):
        """Scorer should have a description."""
        assert scorer.description is not None
        assert len(scorer.description) > 0
