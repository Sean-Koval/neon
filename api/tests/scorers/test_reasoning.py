"""Tests for the ReasoningScorer."""

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.models.db import EvalCaseModel
from src.scorers.base import ScorerResult
from src.scorers.reasoning import (
    DEFAULT_RUBRIC,
    FALLACY_PATTERNS,
    REASONING_INDICATORS,
    ReasoningScorer,
)

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_eval_case() -> EvalCaseModel:
    """Create a mock EvalCaseModel for testing."""
    case = MagicMock(spec=EvalCaseModel)
    case.id = uuid4()
    case.name = "test_case"
    case.input = {"query": "What is the capital of France?"}
    case.expected_tools = None
    case.expected_tool_sequence = None
    case.expected_output_contains = None
    case.expected_output_pattern = None
    return case


@pytest.fixture
def reasoning_scorer() -> ReasoningScorer:
    """Create a ReasoningScorer instance."""
    return ReasoningScorer()


@pytest.fixture
def custom_rubric() -> dict[str, dict[str, Any]]:
    """Create a custom rubric for testing configurable criteria."""
    return {
        "logical_coherence": {
            "weight": 0.40,
            "max_points": 5,
            "description": "Custom logical coherence criteria",
        },
        "information_usage": {
            "weight": 0.30,
            "max_points": 5,
            "description": "Custom information usage criteria",
        },
        "problem_decomposition": {
            "weight": 0.15,
            "max_points": 3,
            "description": "Custom decomposition criteria",
        },
        "completeness": {
            "weight": 0.15,
            "max_points": 3,
            "description": "Custom completeness criteria",
        },
    }


# =============================================================================
# Basic Scorer Tests
# =============================================================================


class TestReasoningScorerBasics:
    """Basic tests for ReasoningScorer initialization and properties."""

    def test_scorer_has_correct_name(self, reasoning_scorer: ReasoningScorer) -> None:
        """Scorer should have the correct name attribute."""
        assert reasoning_scorer.name == "reasoning"

    def test_scorer_has_description(self, reasoning_scorer: ReasoningScorer) -> None:
        """Scorer should have a description attribute."""
        assert reasoning_scorer.description
        assert "reasoning" in reasoning_scorer.description.lower()

    def test_scorer_uses_default_rubric(
        self, reasoning_scorer: ReasoningScorer
    ) -> None:
        """Scorer should use DEFAULT_RUBRIC when no custom rubric provided."""
        assert reasoning_scorer.rubric == DEFAULT_RUBRIC

    def test_scorer_accepts_custom_rubric(
        self, custom_rubric: dict[str, dict[str, Any]]
    ) -> None:
        """Scorer should accept a custom rubric configuration."""
        scorer = ReasoningScorer(rubric=custom_rubric)
        assert scorer.rubric == custom_rubric

    def test_scorer_accepts_custom_model(self) -> None:
        """Scorer should accept a custom LLM model."""
        scorer = ReasoningScorer(model="custom-model-v1")
        assert scorer.llm_judge.model == "custom-model-v1"


# =============================================================================
# Clear Reasoning Chain Tests
# =============================================================================


class TestClearReasoningChain:
    """Tests for evaluating clear reasoning chains."""

    @pytest.mark.asyncio
    async def test_high_score_for_clear_reasoning(
        self, reasoning_scorer: ReasoningScorer, mock_eval_case: EvalCaseModel
    ) -> None:
        """Should give high score for response with clear logical reasoning."""
        output = {
            "output": (
                "To answer this question, I need to first consider what defines a "
                "capital city. Based on my search results, Paris is the capital of "
                "France because it serves as the seat of government and is the "
                "largest city. Therefore, the capital of France is Paris."
            ),
            "tools_called": ["web_search"],
        }

        mock_evaluation = {
            "score": 9,
            "logical_coherence": 3,
            "information_usage": 3,
            "problem_decomposition": 2,
            "completeness": 2,
            "strengths": ["Clear logical flow", "Good use of evidence"],
            "weaknesses": [],
            "fallacies_detected": [],
            "reason": "Excellent reasoning with clear evidence-based conclusions",
        }

        with patch.object(
            reasoning_scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_evaluate:
            mock_evaluate.return_value = mock_evaluation
            result = await reasoning_scorer.score(mock_eval_case, output)

        assert isinstance(result, ScorerResult)
        assert result.score >= 0.8
        assert "excellent" in result.reason.lower() or "clear" in result.reason.lower()

    @pytest.mark.asyncio
    async def test_evidence_includes_strengths(
        self, reasoning_scorer: ReasoningScorer, mock_eval_case: EvalCaseModel
    ) -> None:
        """Should include reasoning strengths in evidence."""
        output = {
            "output": "Based on my analysis, the answer is X because of Y.",
            "tools_called": [],
        }

        mock_evaluation = {
            "score": 8,
            "logical_coherence": 2,
            "information_usage": 2,
            "problem_decomposition": 2,
            "completeness": 2,
            "strengths": ["Good logical structure", "Clear conclusion"],
            "weaknesses": [],
            "fallacies_detected": [],
            "reason": "Good reasoning overall",
        }

        with patch.object(
            reasoning_scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_evaluate:
            mock_evaluate.return_value = mock_evaluation
            result = await reasoning_scorer.score(mock_eval_case, output)

        assert any("Strength:" in e for e in result.evidence)


# =============================================================================
# Coherent Logic Flow Tests
# =============================================================================


class TestCoherentLogicFlow:
    """Tests for evaluating logical coherence in responses."""

    @pytest.mark.asyncio
    async def test_penalize_incoherent_response(
        self, reasoning_scorer: ReasoningScorer, mock_eval_case: EvalCaseModel
    ) -> None:
        """Should penalize responses with incoherent logic."""
        output = {
            "output": "Paris is nice. Dogs are mammals. The sky is blue.",
            "tools_called": [],
        }

        mock_evaluation = {
            "score": 2,
            "logical_coherence": 0,
            "information_usage": 1,
            "problem_decomposition": 0,
            "completeness": 1,
            "strengths": [],
            "weaknesses": ["No logical connection between statements"],
            "fallacies_detected": ["Non-sequitur"],
            "reason": "Response lacks coherent reasoning structure",
        }

        with patch.object(
            reasoning_scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_evaluate:
            mock_evaluate.return_value = mock_evaluation
            result = await reasoning_scorer.score(mock_eval_case, output)

        assert result.score < 0.5
        assert any("Weakness:" in e for e in result.evidence)

    @pytest.mark.asyncio
    async def test_step_by_step_reasoning_rewarded(
        self, reasoning_scorer: ReasoningScorer, mock_eval_case: EvalCaseModel
    ) -> None:
        """Should reward step-by-step problem decomposition."""
        mock_eval_case.input = {"query": "Calculate 15% of 80"}
        output = {
            "output": (
                "To calculate 15% of 80, I'll follow these steps: "
                "First, I convert 15% to a decimal: 15/100 = 0.15. "
                "Second, I multiply 80 by 0.15. "
                "Finally, 80 * 0.15 = 12. "
                "Therefore, 15% of 80 is 12."
            ),
            "tools_called": ["calculator"],
        }

        mock_evaluation = {
            "score": 9,
            "logical_coherence": 3,
            "information_usage": 3,
            "problem_decomposition": 2,
            "completeness": 2,
            "strengths": ["Clear step-by-step breakdown", "Correct methodology"],
            "weaknesses": [],
            "fallacies_detected": [],
            "reason": "Excellent problem decomposition with clear steps",
        }

        with patch.object(
            reasoning_scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_evaluate:
            mock_evaluate.return_value = mock_evaluation
            result = await reasoning_scorer.score(mock_eval_case, output)

        assert result.score >= 0.8
        assert "Problem decomposition:" in str(result.evidence)


# =============================================================================
# Evidence-Based Conclusions Tests
# =============================================================================


class TestEvidenceBasedConclusions:
    """Tests for evaluating evidence-based reasoning."""

    @pytest.mark.asyncio
    async def test_tool_information_properly_used(
        self, reasoning_scorer: ReasoningScorer, mock_eval_case: EvalCaseModel
    ) -> None:
        """Should reward proper use of tool information in reasoning."""
        mock_eval_case.input = {"query": "What is the current weather in Tokyo?"}
        output = {
            "output": (
                "Based on the weather data I retrieved, Tokyo is currently "
                "experiencing 22 degrees Celsius with partly cloudy skies. "
                "This indicates mild weather conditions suitable for outdoor activities."
            ),
            "tools_called": ["weather_api", "location_lookup"],
        }

        mock_evaluation = {
            "score": 9,
            "logical_coherence": 3,
            "information_usage": 3,
            "problem_decomposition": 2,
            "completeness": 2,
            "strengths": ["Good integration of tool results"],
            "weaknesses": [],
            "fallacies_detected": [],
            "reason": "Proper use of retrieved information",
        }

        with patch.object(
            reasoning_scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_evaluate:
            mock_evaluate.return_value = mock_evaluation
            result = await reasoning_scorer.score(mock_eval_case, output)

        assert result.score >= 0.8
        assert "Information usage:" in str(result.evidence)

    @pytest.mark.asyncio
    async def test_unsupported_claims_detected(
        self, reasoning_scorer: ReasoningScorer, mock_eval_case: EvalCaseModel
    ) -> None:
        """Should detect and flag unsupported claims."""
        output = {
            "output": (
                "The answer is definitely 42 because everyone knows that. "
                "It's obviously the correct answer."
            ),
            "tools_called": [],
        }

        mock_evaluation = {
            "score": 3,
            "logical_coherence": 1,
            "information_usage": 0,
            "problem_decomposition": 1,
            "completeness": 1,
            "strengths": [],
            "weaknesses": ["No evidence provided for claims"],
            "fallacies_detected": [
                "Appeal to common knowledge",
                "Assertion without evidence",
            ],
            "reason": "Claims lack supporting evidence",
        }

        with patch.object(
            reasoning_scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_evaluate:
            mock_evaluate.return_value = mock_evaluation
            result = await reasoning_scorer.score(mock_eval_case, output)

        assert result.score < 0.5
        assert any("Logical issue:" in e for e in result.evidence)


# =============================================================================
# Logical Fallacy Detection Tests
# =============================================================================


class TestLogicalFallacyDetection:
    """Tests for detecting logical fallacies."""

    @pytest.mark.asyncio
    async def test_fallacies_reported_in_evidence(
        self, reasoning_scorer: ReasoningScorer, mock_eval_case: EvalCaseModel
    ) -> None:
        """Should report detected fallacies in evidence."""
        output = {
            "output": "Obviously this is correct because everyone agrees with it.",
            "tools_called": [],
        }

        mock_evaluation = {
            "score": 2,
            "logical_coherence": 0,
            "information_usage": 0,
            "problem_decomposition": 1,
            "completeness": 1,
            "strengths": [],
            "weaknesses": ["Multiple logical fallacies present"],
            "fallacies_detected": ["Appeal to popularity", "Appeal to obviousness"],
            "reason": "Response contains logical fallacies",
        }

        with patch.object(
            reasoning_scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_evaluate:
            mock_evaluate.return_value = mock_evaluation
            result = await reasoning_scorer.score(mock_eval_case, output)

        # Check that fallacies are in evidence
        fallacy_evidence = [e for e in result.evidence if "Logical issue:" in e]
        assert len(fallacy_evidence) > 0


# =============================================================================
# Edge Cases Tests
# =============================================================================


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    @pytest.mark.asyncio
    async def test_empty_response(
        self, reasoning_scorer: ReasoningScorer, mock_eval_case: EvalCaseModel
    ) -> None:
        """Should handle empty response gracefully."""
        output = {"output": "", "tools_called": []}

        mock_evaluation = {
            "score": 0,
            "logical_coherence": 0,
            "information_usage": 0,
            "problem_decomposition": 0,
            "completeness": 0,
            "strengths": [],
            "weaknesses": ["No response provided"],
            "fallacies_detected": [],
            "reason": "Empty response - no reasoning to evaluate",
        }

        with patch.object(
            reasoning_scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_evaluate:
            mock_evaluate.return_value = mock_evaluation
            result = await reasoning_scorer.score(mock_eval_case, output)

        assert isinstance(result, ScorerResult)
        assert result.score <= 0.2

    @pytest.mark.asyncio
    async def test_missing_query_in_input(
        self, reasoning_scorer: ReasoningScorer
    ) -> None:
        """Should handle missing query in case input."""
        case = MagicMock(spec=EvalCaseModel)
        case.input = {}  # No query
        output = {"output": "Some response", "tools_called": []}

        mock_evaluation = {
            "score": 5,
            "logical_coherence": 2,
            "information_usage": 1,
            "problem_decomposition": 1,
            "completeness": 1,
            "strengths": [],
            "weaknesses": [],
            "fallacies_detected": [],
            "reason": "Evaluation without query context",
        }

        with patch.object(
            reasoning_scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_evaluate:
            mock_evaluate.return_value = mock_evaluation
            result = await reasoning_scorer.score(case, output)

        assert isinstance(result, ScorerResult)

    @pytest.mark.asyncio
    async def test_llm_failure_fallback_to_heuristics(
        self, reasoning_scorer: ReasoningScorer, mock_eval_case: EvalCaseModel
    ) -> None:
        """Should fall back to heuristic scoring when LLM fails."""
        output = {
            "output": (
                "Because of X, therefore Y. This suggests that Z is the answer "
                "based on the evidence provided."
            ),
            "tools_called": ["search"],
        }

        with patch.object(
            reasoning_scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_evaluate:
            mock_evaluate.side_effect = Exception("LLM service unavailable")
            result = await reasoning_scorer.score(mock_eval_case, output)

        assert isinstance(result, ScorerResult)
        assert "heuristics" in result.reason.lower()
        assert any("Fallback" in e for e in result.evidence)

    @pytest.mark.asyncio
    async def test_tools_called_as_string(
        self, reasoning_scorer: ReasoningScorer, mock_eval_case: EvalCaseModel
    ) -> None:
        """Should handle tools_called as string instead of list."""
        output = {
            "output": "Based on my search, the answer is X.",
            "tools_called": "web_search",  # String instead of list
        }

        mock_evaluation = {
            "score": 7,
            "logical_coherence": 2,
            "information_usage": 2,
            "problem_decomposition": 1,
            "completeness": 2,
            "strengths": [],
            "weaknesses": [],
            "fallacies_detected": [],
            "reason": "Good reasoning",
        }

        with patch.object(
            reasoning_scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_evaluate:
            mock_evaluate.return_value = mock_evaluation
            result = await reasoning_scorer.score(mock_eval_case, output)

        assert isinstance(result, ScorerResult)

    @pytest.mark.asyncio
    async def test_very_long_response(
        self, reasoning_scorer: ReasoningScorer, mock_eval_case: EvalCaseModel
    ) -> None:
        """Should handle very long responses."""
        long_response = "This is a detailed analysis. " * 500
        output = {"output": long_response, "tools_called": []}

        mock_evaluation = {
            "score": 6,
            "logical_coherence": 2,
            "information_usage": 1,
            "problem_decomposition": 1,
            "completeness": 2,
            "strengths": ["Comprehensive response"],
            "weaknesses": ["Potentially verbose"],
            "fallacies_detected": [],
            "reason": "Detailed but possibly too verbose",
        }

        with patch.object(
            reasoning_scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_evaluate:
            mock_evaluate.return_value = mock_evaluation
            result = await reasoning_scorer.score(mock_eval_case, output)

        assert isinstance(result, ScorerResult)
        assert 0.0 <= result.score <= 1.0


# =============================================================================
# No Explicit Reasoning Tests
# =============================================================================


class TestNoExplicitReasoning:
    """Tests for handling cases with no explicit reasoning."""

    @pytest.mark.asyncio
    async def test_short_direct_answer_without_reasoning(
        self, reasoning_scorer: ReasoningScorer, mock_eval_case: EvalCaseModel
    ) -> None:
        """Should handle short direct answers without penalizing too harshly."""
        mock_eval_case.input = {"query": "What is 2+2?"}
        output = {"output": "4", "tools_called": []}

        mock_evaluation = {
            "score": 5,
            "logical_coherence": 2,
            "information_usage": 1,
            "problem_decomposition": 1,
            "completeness": 2,
            "strengths": ["Correct answer"],
            "weaknesses": ["No reasoning shown"],
            "fallacies_detected": [],
            "reason": "Correct but no reasoning process shown",
        }

        with patch.object(
            reasoning_scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_evaluate:
            mock_evaluate.return_value = mock_evaluation
            result = await reasoning_scorer.score(mock_eval_case, output)

        # Should give moderate score, not fail completely
        assert 0.3 <= result.score <= 0.7

    @pytest.mark.asyncio
    async def test_require_explicit_reasoning_config(
        self, reasoning_scorer: ReasoningScorer, mock_eval_case: EvalCaseModel
    ) -> None:
        """Should penalize when explicit reasoning is required but missing."""
        output = {"output": "The answer is 42.", "tools_called": []}

        config = {"require_explicit_reasoning": True}

        # Mock the LLM to say there's no reasoning
        mock_no_reasoning = {
            "has_reasoning": False,
            "reasoning_type": "none",
            "explanation": "Direct answer without explanation",
            "suggested_score": 3,
        }

        with patch.object(
            reasoning_scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_evaluate:
            mock_evaluate.return_value = mock_no_reasoning
            result = await reasoning_scorer.score(mock_eval_case, output, config)

        assert result.score <= 0.4
        assert "reasoning" in result.reason.lower()

    @pytest.mark.asyncio
    async def test_implicit_reasoning_detected(
        self, reasoning_scorer: ReasoningScorer, mock_eval_case: EvalCaseModel
    ) -> None:
        """Should handle implicit reasoning appropriately."""
        output = {
            "output": (
                "Since Paris is the largest city and seat of government in France, "
                "it is the capital."
            ),
            "tools_called": [],
        }

        mock_evaluation = {
            "score": 7,
            "logical_coherence": 2,
            "information_usage": 2,
            "problem_decomposition": 1,
            "completeness": 2,
            "strengths": ["Implicit reasoning present"],
            "weaknesses": [],
            "fallacies_detected": [],
            "reason": "Good implicit reasoning",
        }

        with patch.object(
            reasoning_scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_evaluate:
            mock_evaluate.return_value = mock_evaluation
            result = await reasoning_scorer.score(mock_eval_case, output)

        assert result.score >= 0.6


# =============================================================================
# Configurable Rubric Tests
# =============================================================================


class TestConfigurableRubric:
    """Tests for configurable rubric/criteria."""

    @pytest.mark.asyncio
    async def test_custom_rubric_via_init(
        self, custom_rubric: dict[str, dict[str, Any]], mock_eval_case: EvalCaseModel
    ) -> None:
        """Should use custom rubric passed at initialization."""
        scorer = ReasoningScorer(rubric=custom_rubric)

        output = {"output": "Some response with reasoning.", "tools_called": []}

        mock_evaluation = {
            "score": 8,
            "logical_coherence": 4,  # Out of 5 with custom rubric
            "information_usage": 4,
            "problem_decomposition": 2,
            "completeness": 3,
            "strengths": [],
            "weaknesses": [],
            "fallacies_detected": [],
            "reason": "Good reasoning",
        }

        with patch.object(
            scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_evaluate:
            mock_evaluate.return_value = mock_evaluation
            result = await scorer.score(mock_eval_case, output)

        assert isinstance(result, ScorerResult)
        # Evidence should reflect custom max points
        assert "/5" in str(result.evidence) or "/3" in str(result.evidence)

    @pytest.mark.asyncio
    async def test_custom_rubric_via_config(
        self,
        reasoning_scorer: ReasoningScorer,
        custom_rubric: dict[str, dict[str, Any]],
        mock_eval_case: EvalCaseModel,
    ) -> None:
        """Should allow rubric override via score config."""
        output = {"output": "Some response.", "tools_called": []}

        config = {"rubric": custom_rubric}

        mock_evaluation = {
            "score": 8,
            "logical_coherence": 4,
            "information_usage": 4,
            "problem_decomposition": 2,
            "completeness": 3,
            "strengths": [],
            "weaknesses": [],
            "fallacies_detected": [],
            "reason": "Good reasoning",
        }

        with patch.object(
            reasoning_scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_evaluate:
            mock_evaluate.return_value = mock_evaluation
            result = await reasoning_scorer.score(mock_eval_case, output, config)

        assert isinstance(result, ScorerResult)

    @pytest.mark.asyncio
    async def test_custom_criteria_in_prompt(
        self, reasoning_scorer: ReasoningScorer, mock_eval_case: EvalCaseModel
    ) -> None:
        """Should include custom criteria in evaluation prompt."""
        output = {"output": "Some response.", "tools_called": []}

        config = {"custom_criteria": "Must show mathematical proof steps"}

        mock_evaluation = {
            "score": 7,
            "logical_coherence": 2,
            "information_usage": 2,
            "problem_decomposition": 2,
            "completeness": 1,
            "strengths": [],
            "weaknesses": [],
            "fallacies_detected": [],
            "reason": "Good but missing proof steps",
        }

        with patch.object(
            reasoning_scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_evaluate:
            mock_evaluate.return_value = mock_evaluation
            result = await reasoning_scorer.score(mock_eval_case, output, config)

            # Verify custom criteria was passed to LLM
            call_args = mock_evaluate.call_args[0][0]
            assert "mathematical proof steps" in call_args

        assert isinstance(result, ScorerResult)


# =============================================================================
# Weighted Score Calculation Tests
# =============================================================================


class TestWeightedScoreCalculation:
    """Tests for the weighted score calculation logic."""

    def test_calculate_weighted_score_default_rubric(
        self, reasoning_scorer: ReasoningScorer
    ) -> None:
        """Should correctly calculate weighted score with default rubric."""
        evaluation = {
            "score": 8,
            "logical_coherence": 3,  # 3/3 = 1.0
            "information_usage": 3,  # 3/3 = 1.0
            "problem_decomposition": 2,  # 2/2 = 1.0
            "completeness": 2,  # 2/2 = 1.0
        }

        score = reasoning_scorer._calculate_weighted_score(evaluation, DEFAULT_RUBRIC)

        # All max scores should give ~1.0
        assert 0.95 <= score <= 1.0

    def test_calculate_weighted_score_partial(
        self, reasoning_scorer: ReasoningScorer
    ) -> None:
        """Should correctly calculate weighted score with partial scores."""
        evaluation = {
            "score": 5,
            "logical_coherence": 1,  # 1/3 = 0.33
            "information_usage": 2,  # 2/3 = 0.67
            "problem_decomposition": 1,  # 1/2 = 0.50
            "completeness": 1,  # 1/2 = 0.50
        }

        score = reasoning_scorer._calculate_weighted_score(evaluation, DEFAULT_RUBRIC)

        # Expected: 0.33*0.3 + 0.67*0.3 + 0.5*0.2 + 0.5*0.2 = 0.5
        assert 0.45 <= score <= 0.55

    def test_calculate_weighted_score_missing_subscores(
        self, reasoning_scorer: ReasoningScorer
    ) -> None:
        """Should fall back to raw score when sub-scores missing."""
        evaluation = {"score": 7}  # Only raw score, no sub-scores

        score = reasoning_scorer._calculate_weighted_score(evaluation, DEFAULT_RUBRIC)

        # Should fall back to 7/10 = 0.7
        assert 0.65 <= score <= 0.75

    def test_calculate_weighted_score_invalid_subscores(
        self, reasoning_scorer: ReasoningScorer
    ) -> None:
        """Should handle invalid sub-score values gracefully."""
        evaluation = {
            "score": 6,
            "logical_coherence": "invalid",
            "information_usage": None,
            "problem_decomposition": 1,
            "completeness": 1,
        }

        score = reasoning_scorer._calculate_weighted_score(evaluation, DEFAULT_RUBRIC)

        # Should still produce a valid score
        assert 0.0 <= score <= 1.0


# =============================================================================
# Heuristic Scoring Tests
# =============================================================================


class TestHeuristicScoring:
    """Tests for the fallback heuristic scoring."""

    def test_heuristic_short_response_penalty(
        self, reasoning_scorer: ReasoningScorer
    ) -> None:
        """Should penalize very short responses."""
        short_response = "Yes."
        score = reasoning_scorer._heuristic_score(short_response, [])
        assert score < 0.5

    def test_heuristic_long_response_bonus(
        self, reasoning_scorer: ReasoningScorer
    ) -> None:
        """Should give bonus for substantial responses."""
        long_response = "This is a detailed response. " * 20
        score = reasoning_scorer._heuristic_score(long_response, [])
        assert score >= 0.5

    def test_heuristic_reasoning_indicators_bonus(
        self, reasoning_scorer: ReasoningScorer
    ) -> None:
        """Should give bonus for reasoning indicators."""
        response = "Because X is true, therefore Y follows. Based on this evidence, Z."
        score = reasoning_scorer._heuristic_score(response, [])
        assert score > 0.5

    def test_heuristic_fallacy_patterns_penalty(
        self, reasoning_scorer: ReasoningScorer
    ) -> None:
        """Should penalize responses with fallacy patterns."""
        response = "Obviously everyone knows this is always true and never wrong."
        score = reasoning_scorer._heuristic_score(response, [])
        assert score < 0.5

    def test_heuristic_tool_usage_bonus(
        self, reasoning_scorer: ReasoningScorer
    ) -> None:
        """Should give bonus for tool usage."""
        response = "A response of medium length here."
        score_with_tools = reasoning_scorer._heuristic_score(response, ["tool1"])
        score_without_tools = reasoning_scorer._heuristic_score(response, [])
        assert score_with_tools > score_without_tools

    def test_heuristic_score_bounds(self, reasoning_scorer: ReasoningScorer) -> None:
        """Should always return score in [0, 1] range."""
        # Test with extreme cases
        assert 0.0 <= reasoning_scorer._heuristic_score("", []) <= 1.0
        assert (
            0.0
            <= reasoning_scorer._heuristic_score(
                "obviously always never clearly everyone knows " * 100, []
            )
            <= 1.0
        )
        assert (
            0.0
            <= reasoning_scorer._heuristic_score(
                "because therefore thus since based on " * 100,
                ["t1", "t2", "t3"],
            )
            <= 1.0
        )


# =============================================================================
# Heuristic Evidence Tests
# =============================================================================


class TestHeuristicEvidence:
    """Tests for heuristic evidence building."""

    def test_evidence_includes_response_length(
        self, reasoning_scorer: ReasoningScorer
    ) -> None:
        """Should include response length assessment in evidence."""
        evidence = reasoning_scorer._build_heuristic_evidence("Short", [])
        assert any("response" in e.lower() and "char" in e.lower() for e in evidence)

    def test_evidence_includes_reasoning_indicators(
        self, reasoning_scorer: ReasoningScorer
    ) -> None:
        """Should report found reasoning indicators."""
        response = "Because X, therefore Y."
        evidence = reasoning_scorer._build_heuristic_evidence(response, [])
        assert any("indicator" in e.lower() for e in evidence)

    def test_evidence_includes_fallacy_patterns(
        self, reasoning_scorer: ReasoningScorer
    ) -> None:
        """Should report found fallacy patterns."""
        response = "Obviously this is always true."
        evidence = reasoning_scorer._build_heuristic_evidence(response, [])
        assert any("fallacy" in e.lower() for e in evidence)

    def test_evidence_includes_tool_usage(
        self, reasoning_scorer: ReasoningScorer
    ) -> None:
        """Should report tool usage."""
        evidence = reasoning_scorer._build_heuristic_evidence(
            "Response", ["tool1", "tool2"]
        )
        assert any("tool" in e.lower() for e in evidence)


# =============================================================================
# Reasoning Indicator Detection Tests
# =============================================================================


class TestReasoningIndicatorDetection:
    """Tests for explicit reasoning indicator detection."""

    def test_has_explicit_reasoning_positive(
        self, reasoning_scorer: ReasoningScorer
    ) -> None:
        """Should detect explicit reasoning with multiple indicators."""
        response = "Because of A, therefore B follows. Thus, the answer is C."
        assert reasoning_scorer._has_explicit_reasoning(response) is True

    def test_has_explicit_reasoning_negative(
        self, reasoning_scorer: ReasoningScorer
    ) -> None:
        """Should not detect reasoning with insufficient indicators."""
        response = "The answer is 42."
        assert reasoning_scorer._has_explicit_reasoning(response) is False

    def test_has_explicit_reasoning_case_insensitive(
        self, reasoning_scorer: ReasoningScorer
    ) -> None:
        """Should detect indicators regardless of case."""
        response = "BECAUSE of X, THEREFORE Y."
        assert reasoning_scorer._has_explicit_reasoning(response) is True


# =============================================================================
# Tool Formatting Tests
# =============================================================================


class TestToolFormatting:
    """Tests for tool formatting helper."""

    def test_format_tools_list(self, reasoning_scorer: ReasoningScorer) -> None:
        """Should format list of tools correctly."""
        result = reasoning_scorer._format_tools(["tool1", "tool2", "tool3"])
        assert result == "tool1, tool2, tool3"

    def test_format_tools_empty_list(self, reasoning_scorer: ReasoningScorer) -> None:
        """Should handle empty list."""
        result = reasoning_scorer._format_tools([])
        assert result == "No tools called"

    def test_format_tools_string(self, reasoning_scorer: ReasoningScorer) -> None:
        """Should handle string input."""
        result = reasoning_scorer._format_tools("single_tool")
        assert result == "single_tool"

    def test_format_tools_none(self, reasoning_scorer: ReasoningScorer) -> None:
        """Should handle None input."""
        result = reasoning_scorer._format_tools(None)
        assert result == "No tools called"


# =============================================================================
# Score Normalization Tests
# =============================================================================


class TestScoreNormalization:
    """Tests for score normalization."""

    def test_normalize_score_in_range(
        self, reasoning_scorer: ReasoningScorer
    ) -> None:
        """Should keep scores in valid range unchanged."""
        assert reasoning_scorer._normalize_score(0.5) == 0.5
        assert reasoning_scorer._normalize_score(0.0) == 0.0
        assert reasoning_scorer._normalize_score(1.0) == 1.0

    def test_normalize_score_above_max(
        self, reasoning_scorer: ReasoningScorer
    ) -> None:
        """Should clamp scores above 1.0."""
        assert reasoning_scorer._normalize_score(1.5) == 1.0
        assert reasoning_scorer._normalize_score(10.0) == 1.0

    def test_normalize_score_below_min(
        self, reasoning_scorer: ReasoningScorer
    ) -> None:
        """Should clamp scores below 0.0."""
        assert reasoning_scorer._normalize_score(-0.5) == 0.0
        assert reasoning_scorer._normalize_score(-10.0) == 0.0


# =============================================================================
# Module Constants Tests
# =============================================================================


class TestModuleConstants:
    """Tests for module-level constants."""

    def test_default_rubric_has_required_keys(self) -> None:
        """DEFAULT_RUBRIC should have all required criteria."""
        required_keys = [
            "logical_coherence",
            "information_usage",
            "problem_decomposition",
            "completeness",
        ]
        for key in required_keys:
            assert key in DEFAULT_RUBRIC
            assert "weight" in DEFAULT_RUBRIC[key]
            assert "max_points" in DEFAULT_RUBRIC[key]

    def test_rubric_weights_sum_to_one(self) -> None:
        """Rubric weights should sum to 1.0."""
        total_weight = sum(c["weight"] for c in DEFAULT_RUBRIC.values())
        assert abs(total_weight - 1.0) < 0.01

    def test_reasoning_indicators_not_empty(self) -> None:
        """REASONING_INDICATORS should have entries."""
        assert len(REASONING_INDICATORS) > 0
        assert all(isinstance(i, str) for i in REASONING_INDICATORS)

    def test_fallacy_patterns_not_empty(self) -> None:
        """FALLACY_PATTERNS should have entries."""
        assert len(FALLACY_PATTERNS) > 0
        assert all(isinstance(p, str) for p in FALLACY_PATTERNS)
