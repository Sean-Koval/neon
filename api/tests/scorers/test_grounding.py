"""Tests for GroundingScorer."""

from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from src.scorers.base import ScorerResult
from src.scorers.grounding import GroundingScorer


class TestGroundingScorer:
    """Test suite for GroundingScorer."""

    @pytest.fixture
    def scorer(self) -> GroundingScorer:
        """Create a GroundingScorer instance."""
        return GroundingScorer()

    # =========================================================================
    # Basic Functionality Tests
    # =========================================================================

    async def test_scorer_has_correct_name_and_description(
        self, scorer: GroundingScorer
    ) -> None:
        """Test that scorer has the expected name and description."""
        assert scorer.name == "grounding"
        assert "grounded" in scorer.description.lower()

    async def test_scorer_returns_scorer_result(
        self, scorer: GroundingScorer, make_eval_case, mock_llm_judge_response
    ) -> None:
        """Test that scorer returns a ScorerResult object."""
        case = make_eval_case(
            input_data={"query": "What is Python?"},
            expected_output_contains=["programming language"],
        )
        output = {"output": "Python is a programming language used for development."}

        with patch.object(
            scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_eval:
            mock_eval.return_value = mock_llm_judge_response()
            result = await scorer.score(case, output)

        assert isinstance(result, ScorerResult)
        assert 0.0 <= result.score <= 1.0
        assert isinstance(result.reason, str)
        assert isinstance(result.evidence, list)

    # =========================================================================
    # Output Grounded in Context Tests
    # =========================================================================

    async def test_output_fully_grounded_in_context(
        self, scorer: GroundingScorer, make_eval_case, mock_llm_judge_response
    ) -> None:
        """Test scoring when output is fully grounded in provided context."""
        case = make_eval_case(
            input_data={
                "query": "What is the capital of France?",
                "context": {
                    "document": "France is a country in Europe. Paris is the capital of France."
                },
            },
            expected_output_contains=["Paris"],
        )
        output = {"output": "The capital of France is Paris."}

        with patch.object(
            scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_eval:
            mock_eval.return_value = mock_llm_judge_response(
                score=10,
                factual_accuracy=4,
                evidence_support=4,
                content_match=2,
                grounded_claims=["Paris is the capital of France"],
                ungrounded_claims=[],
                reason="Response is fully grounded in the provided context",
            )
            result = await scorer.score(case, output)

        assert result.score >= 0.9
        assert any("Paris" in e for e in result.evidence)

    async def test_output_with_rich_context(
        self, scorer: GroundingScorer, make_eval_case, mock_llm_judge_response
    ) -> None:
        """Test scoring with rich context data."""
        case = make_eval_case(
            input_data={
                "query": "What are the product specifications?",
                "context": {
                    "product_name": "Widget Pro",
                    "specs": {"weight": "2.5kg", "dimensions": "10x20x5cm"},
                    "description": "High-quality widget for professional use.",
                },
            },
            expected_output_contains=["Widget Pro", "2.5kg"],
        )
        output = {
            "output": "The Widget Pro weighs 2.5kg and measures 10x20x5cm. "
            "It is a high-quality widget designed for professional use."
        }

        with patch.object(
            scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_eval:
            mock_eval.return_value = mock_llm_judge_response(
                score=9,
                factual_accuracy=4,
                evidence_support=4,
                content_match=2,
                grounded_claims=[
                    "Widget Pro weighs 2.5kg",
                    "Dimensions are 10x20x5cm",
                ],
                ungrounded_claims=[],
            )
            result = await scorer.score(case, output)

        assert result.score >= 0.8
        assert "Found expected: 'Widget Pro'" in result.evidence
        assert "Found expected: '2.5kg'" in result.evidence

    # =========================================================================
    # Hallucination Detection Tests
    # =========================================================================

    async def test_detects_hallucination_not_in_context(
        self, scorer: GroundingScorer, make_eval_case, mock_llm_judge_response
    ) -> None:
        """Test that scorer detects hallucinated information."""
        case = make_eval_case(
            input_data={
                "query": "What is the capital of France?",
                "context": {"document": "France is a country in Western Europe."},
            },
        )
        # Agent hallucinates population data not in context
        output = {
            "output": "Paris is the capital of France with a population of 12 million."
        }

        with patch.object(
            scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_eval:
            mock_eval.return_value = mock_llm_judge_response(
                score=4,
                factual_accuracy=2,
                evidence_support=1,
                content_match=1,
                grounded_claims=["Paris is the capital"],
                ungrounded_claims=["Population of 12 million is not in context"],
                reason="Response contains unsupported claims about population",
            )
            result = await scorer.score(case, output)

        assert result.score < 0.7
        assert any("Ungrounded" in e for e in result.evidence)

    async def test_detects_complete_hallucination(
        self, scorer: GroundingScorer, make_eval_case, mock_llm_judge_response
    ) -> None:
        """Test scoring when output is completely ungrounded."""
        case = make_eval_case(
            input_data={
                "query": "Tell me about the product",
                "context": {"document": "Our product is a software tool."},
            },
            expected_output_contains=["software"],
        )
        # Agent completely ignores context and makes up information
        output = {
            "output": "The product is a hardware device that costs $500 and requires assembly."
        }

        with patch.object(
            scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_eval:
            mock_eval.return_value = mock_llm_judge_response(
                score=1,
                factual_accuracy=0,
                evidence_support=0,
                content_match=0,
                grounded_claims=[],
                ungrounded_claims=[
                    "Product is hardware (context says software)",
                    "Price of $500 not mentioned",
                    "Assembly requirement fabricated",
                ],
                reason="Response contradicts context and contains fabricated information",
            )
            result = await scorer.score(case, output)

        assert result.score < 0.3
        assert "Missing expected: 'software'" in result.evidence

    # =========================================================================
    # Partial Grounding Tests
    # =========================================================================

    async def test_partial_grounding_mixed_claims(
        self, scorer: GroundingScorer, make_eval_case, mock_llm_judge_response
    ) -> None:
        """Test scoring when output has both grounded and ungrounded claims."""
        case = make_eval_case(
            input_data={
                "query": "Describe the company",
                "context": {
                    "document": "Acme Corp was founded in 2010. It is based in San Francisco."
                },
            },
            expected_output_contains=["Acme Corp", "2010"],
        )
        # Some claims are grounded, some are hallucinated
        output = {
            "output": "Acme Corp was founded in 2010 in San Francisco. "
            "The company has 500 employees and annual revenue of $10 million."
        }

        with patch.object(
            scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_eval:
            mock_eval.return_value = mock_llm_judge_response(
                score=5,
                factual_accuracy=2,
                evidence_support=2,
                content_match=2,
                grounded_claims=[
                    "Founded in 2010",
                    "Based in San Francisco",
                ],
                ungrounded_claims=[
                    "500 employees not in context",
                    "$10 million revenue not in context",
                ],
                reason="Response partially grounded with some unsupported claims",
            )
            result = await scorer.score(case, output)

        # Score should be moderate - not high, not low
        assert 0.4 <= result.score <= 0.7
        assert "Found expected: 'Acme Corp'" in result.evidence
        assert "Found expected: '2010'" in result.evidence

    async def test_partial_expected_content_match(
        self, scorer: GroundingScorer, make_eval_case, mock_llm_judge_response
    ) -> None:
        """Test scoring when only some expected content is found."""
        case = make_eval_case(
            input_data={"query": "List the features"},
            expected_output_contains=["feature A", "feature B", "feature C"],
        )
        # Only mentions some expected features
        output = {"output": "The product has feature A and feature B."}

        with patch.object(
            scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_eval:
            mock_eval.return_value = mock_llm_judge_response(
                score=6,
                content_match=1,
                reason="Some expected content missing",
            )
            result = await scorer.score(case, output)

        assert "Found expected: 'feature A'" in result.evidence
        assert "Found expected: 'feature B'" in result.evidence
        assert "Missing expected: 'feature C'" in result.evidence

    # =========================================================================
    # Edge Cases Tests
    # =========================================================================

    async def test_no_context_provided(
        self, scorer: GroundingScorer, make_eval_case, mock_llm_judge_response
    ) -> None:
        """Test scoring when no context is provided in the case."""
        case = make_eval_case(
            input_data={"query": "What time is it?"},
            expected_output_contains=["time"],
        )
        output = {"output": "I don't have access to the current time."}

        with patch.object(
            scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_eval:
            mock_eval.return_value = mock_llm_judge_response(
                score=7,
                reason="Response appropriately indicates lack of context",
            )
            result = await scorer.score(case, output)

        assert isinstance(result, ScorerResult)
        assert result.score > 0

    async def test_empty_output(
        self, scorer: GroundingScorer, make_eval_case, mock_llm_judge_response
    ) -> None:
        """Test scoring when agent output is empty."""
        case = make_eval_case(
            input_data={"query": "Tell me about X"},
            expected_output_contains=["X"],
        )
        output = {"output": ""}

        with patch.object(
            scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_eval:
            mock_eval.return_value = mock_llm_judge_response(
                score=0,
                factual_accuracy=0,
                evidence_support=0,
                content_match=0,
                reason="Empty response provides no grounded information",
            )
            result = await scorer.score(case, output)

        assert result.score < 0.3
        assert "Missing expected: 'X'" in result.evidence

    async def test_empty_context(
        self, scorer: GroundingScorer, make_eval_case, mock_llm_judge_response
    ) -> None:
        """Test scoring when context is explicitly empty."""
        case = make_eval_case(
            input_data={
                "query": "What is in the context?",
                "context": {},
            },
        )
        output = {"output": "No specific information is available in the context."}

        with patch.object(
            scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_eval:
            mock_eval.return_value = mock_llm_judge_response(
                score=8,
                reason="Response appropriately handles empty context",
            )
            result = await scorer.score(case, output)

        assert isinstance(result, ScorerResult)

    async def test_no_expected_content_or_pattern(
        self, scorer: GroundingScorer, make_eval_case, mock_llm_judge_response
    ) -> None:
        """Test scoring when no expected content or pattern is specified."""
        case = make_eval_case(
            input_data={
                "query": "Describe something",
                "context": {"info": "Some information"},
            },
        )
        output = {"output": "Here is the description based on the information."}

        with patch.object(
            scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_eval:
            mock_eval.return_value = mock_llm_judge_response(score=7)
            result = await scorer.score(case, output)

        # Should use neutral score for content matching
        assert isinstance(result, ScorerResult)
        assert result.score > 0.5

    # =========================================================================
    # Expected Output Pattern (Regex) Tests
    # =========================================================================

    async def test_pattern_match_success(
        self, scorer: GroundingScorer, make_eval_case, mock_llm_judge_response
    ) -> None:
        """Test scoring when output matches expected pattern."""
        case = make_eval_case(
            input_data={"query": "What is the order ID?"},
            expected_output_pattern=r"ORD-\d{5,}",
        )
        output = {"output": "Your order ID is ORD-12345."}

        with patch.object(
            scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_eval:
            mock_eval.return_value = mock_llm_judge_response(score=8)
            result = await scorer.score(case, output)

        assert result.score >= 0.7
        assert any("Pattern matched" in e for e in result.evidence)

    async def test_pattern_match_failure(
        self, scorer: GroundingScorer, make_eval_case, mock_llm_judge_response
    ) -> None:
        """Test scoring when output does not match expected pattern."""
        case = make_eval_case(
            input_data={"query": "What is the order ID?"},
            expected_output_pattern=r"ORD-\d{5,}",
        )
        output = {"output": "Your order ID is ABC-123."}

        with patch.object(
            scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_eval:
            mock_eval.return_value = mock_llm_judge_response(score=5)
            result = await scorer.score(case, output)

        assert any("Pattern not matched" in e for e in result.evidence)

    async def test_combined_contains_and_pattern(
        self, scorer: GroundingScorer, make_eval_case, mock_llm_judge_response
    ) -> None:
        """Test scoring with both expected_output_contains and expected_output_pattern."""
        case = make_eval_case(
            input_data={"query": "Give me the order details"},
            expected_output_contains=["confirmed", "shipping"],
            expected_output_pattern=r"ORD-\d{5}",
        )
        output = {
            "output": "Order ORD-54321 is confirmed and ready for shipping."
        }

        with patch.object(
            scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_eval:
            mock_eval.return_value = mock_llm_judge_response(score=9)
            result = await scorer.score(case, output)

        assert result.score >= 0.8
        assert "Found expected: 'confirmed'" in result.evidence
        assert "Found expected: 'shipping'" in result.evidence
        assert any("Pattern matched" in e for e in result.evidence)

    async def test_invalid_regex_pattern(
        self, scorer: GroundingScorer, make_eval_case, mock_llm_judge_response
    ) -> None:
        """Test handling of invalid regex pattern."""
        case = make_eval_case(
            input_data={"query": "Test"},
            expected_output_pattern=r"[invalid(regex",  # Invalid regex
        )
        output = {"output": "Some output"}

        with patch.object(
            scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_eval:
            mock_eval.return_value = mock_llm_judge_response(score=5)
            result = await scorer.score(case, output)

        assert any("Invalid pattern" in e for e in result.evidence)

    async def test_case_insensitive_pattern_matching(
        self, scorer: GroundingScorer, make_eval_case, mock_llm_judge_response
    ) -> None:
        """Test that pattern matching is case insensitive."""
        case = make_eval_case(
            input_data={"query": "Status?"},
            expected_output_pattern=r"success|completed",
        )
        output = {"output": "The operation was COMPLETED successfully."}

        with patch.object(
            scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_eval:
            mock_eval.return_value = mock_llm_judge_response(score=8)
            result = await scorer.score(case, output)

        assert any("Pattern matched" in e for e in result.evidence)

    # =========================================================================
    # LLM Judge Integration Tests
    # =========================================================================

    async def test_llm_judge_error_fallback(
        self, scorer: GroundingScorer, make_eval_case
    ) -> None:
        """Test fallback behavior when LLM judge fails."""
        case = make_eval_case(
            input_data={"query": "Test"},
            expected_output_contains=["expected"],
        )
        output = {"output": "This contains the expected text."}

        with patch.object(
            scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_eval:
            mock_eval.side_effect = Exception("LLM service unavailable")
            result = await scorer.score(case, output)

        assert isinstance(result, ScorerResult)
        assert "LLM evaluation failed" in result.reason
        assert any("Fallback to content matching" in e for e in result.evidence)
        # Score should be based on content matching only
        assert result.score > 0

    async def test_llm_judge_evaluation_details_in_evidence(
        self, scorer: GroundingScorer, make_eval_case, mock_llm_judge_response
    ) -> None:
        """Test that LLM judge details are included in evidence."""
        case = make_eval_case(
            input_data={
                "query": "Explain the concept",
                "context": {"doc": "Concept explanation here."},
            },
        )
        output = {"output": "The concept is explained as follows."}

        with patch.object(
            scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_eval:
            mock_eval.return_value = mock_llm_judge_response(
                factual_accuracy=3,
                evidence_support=4,
                grounded_claims=["Claim A", "Claim B"],
            )
            result = await scorer.score(case, output)

        assert any("Factual accuracy: 3/4" in e for e in result.evidence)
        assert any("Evidence support: 4/4" in e for e in result.evidence)
        assert any("Grounded: Claim A" in e for e in result.evidence)

    # =========================================================================
    # Score Calculation Tests
    # =========================================================================

    async def test_score_normalization(
        self, scorer: GroundingScorer, make_eval_case, mock_llm_judge_response
    ) -> None:
        """Test that scores are properly normalized to 0-1 range."""
        case = make_eval_case(input_data={"query": "Test"})
        output = {"output": "Test output"}

        # Test with various LLM scores
        for llm_score in [0, 5, 10]:
            with patch.object(
                scorer.llm_judge, "evaluate", new_callable=AsyncMock
            ) as mock_eval:
                mock_eval.return_value = mock_llm_judge_response(score=llm_score)
                result = await scorer.score(case, output)

            assert 0.0 <= result.score <= 1.0

    async def test_combined_score_weighting(
        self, scorer: GroundingScorer, make_eval_case, mock_llm_judge_response
    ) -> None:
        """Test that content match and LLM scores are properly weighted."""
        case = make_eval_case(
            input_data={"query": "Test"},
            expected_output_contains=["exact"],
        )
        output = {"output": "Contains exact match."}

        with patch.object(
            scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_eval:
            # LLM gives perfect score
            mock_eval.return_value = mock_llm_judge_response(score=10)
            result = await scorer.score(case, output)

        # With perfect content match (1.0) and perfect LLM score (1.0)
        # Expected: (1.0 * 0.3) + (1.0 * 0.7) = 1.0
        assert result.score >= 0.95

    # =========================================================================
    # Configuration Tests
    # =========================================================================

    async def test_scorer_with_config(
        self, scorer: GroundingScorer, make_eval_case, mock_llm_judge_response
    ) -> None:
        """Test that scorer accepts optional config parameter."""
        case = make_eval_case(input_data={"query": "Test"})
        output = {"output": "Test output"}
        config = {"strict_mode": True, "threshold": 0.8}

        with patch.object(
            scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_eval:
            mock_eval.return_value = mock_llm_judge_response()
            result = await scorer.score(case, output, config=config)

        assert isinstance(result, ScorerResult)

    async def test_scorer_with_none_config(
        self, scorer: GroundingScorer, make_eval_case, mock_llm_judge_response
    ) -> None:
        """Test that scorer handles None config gracefully."""
        case = make_eval_case(input_data={"query": "Test"})
        output = {"output": "Test output"}

        with patch.object(
            scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_eval:
            mock_eval.return_value = mock_llm_judge_response()
            result = await scorer.score(case, output, config=None)

        assert isinstance(result, ScorerResult)

    # =========================================================================
    # Case-Insensitive Contains Matching Tests
    # =========================================================================

    async def test_case_insensitive_contains_matching(
        self, scorer: GroundingScorer, make_eval_case, mock_llm_judge_response
    ) -> None:
        """Test that expected_output_contains matching is case insensitive."""
        case = make_eval_case(
            input_data={"query": "Test"},
            expected_output_contains=["Python", "PROGRAMMING"],
        )
        output = {"output": "python is a great programming language."}

        with patch.object(
            scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_eval:
            mock_eval.return_value = mock_llm_judge_response()
            result = await scorer.score(case, output)

        assert "Found expected: 'Python'" in result.evidence
        assert "Found expected: 'PROGRAMMING'" in result.evidence

    # =========================================================================
    # Missing Output Field Tests
    # =========================================================================

    async def test_missing_output_field(
        self, scorer: GroundingScorer, make_eval_case, mock_llm_judge_response
    ) -> None:
        """Test handling when output dict is missing 'output' key."""
        case = make_eval_case(
            input_data={"query": "Test"},
            expected_output_contains=["test"],
        )
        output: dict[str, Any] = {}  # No 'output' key

        with patch.object(
            scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_eval:
            mock_eval.return_value = mock_llm_judge_response(score=0)
            result = await scorer.score(case, output)

        assert isinstance(result, ScorerResult)
        assert "Missing expected: 'test'" in result.evidence

    async def test_output_with_other_fields(
        self, scorer: GroundingScorer, make_eval_case, mock_llm_judge_response
    ) -> None:
        """Test that scorer only evaluates the 'output' field."""
        case = make_eval_case(
            input_data={"query": "Test"},
            expected_output_contains=["expected"],
        )
        output = {
            "output": "Main expected content here.",
            "metadata": "This should not be evaluated",
            "tools_called": ["tool1"],
        }

        with patch.object(
            scorer.llm_judge, "evaluate", new_callable=AsyncMock
        ) as mock_eval:
            mock_eval.return_value = mock_llm_judge_response()
            result = await scorer.score(case, output)

        assert "Found expected: 'expected'" in result.evidence
