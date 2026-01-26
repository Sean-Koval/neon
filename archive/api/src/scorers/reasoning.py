"""Reasoning quality scorer - evaluates the agent's reasoning process."""

from typing import Any

from src.models.db import EvalCaseModel
from src.scorers.base import Scorer, ScorerResult
from src.scorers.llm_judge import LLMJudge

# Default rubric weights for reasoning evaluation
DEFAULT_RUBRIC = {
    "logical_coherence": {
        "weight": 0.30,
        "max_points": 3,
        "description": "Does the reasoning follow a logical flow with supported conclusions?",
    },
    "information_usage": {
        "weight": 0.30,
        "max_points": 3,
        "description": "Did the agent appropriately use and interpret available information?",
    },
    "problem_decomposition": {
        "weight": 0.20,
        "max_points": 2,
        "description": "Did the agent break down the problem into reasonable steps?",
    },
    "completeness": {
        "weight": 0.20,
        "max_points": 2,
        "description": "Did the agent address all aspects without obvious gaps?",
    },
}

# Reasoning indicators for heuristic scoring
REASONING_INDICATORS = [
    "because",
    "therefore",
    "thus",
    "since",
    "as a result",
    "consequently",
    "this means",
    "given that",
    "based on",
    "considering",
    "first",
    "second",
    "finally",
    "step",
    "in order to",
    "the reason",
    "evidence",
    "indicates",
    "suggests",
    "shows that",
]

# Logical fallacy patterns (simplified detection)
FALLACY_PATTERNS = [
    "obviously",  # Appeal to obviousness
    "everyone knows",  # Bandwagon
    "always",  # Overgeneralization
    "never",  # Overgeneralization
    "clearly",  # Assumption without evidence
]


class ReasoningScorer(Scorer):
    """Evaluates reasoning quality using an LLM judge.

    Assesses:
    - Logical coherence of the reasoning chain
    - Appropriate use of retrieved/tool information
    - Step-by-step problem decomposition
    - Correct conclusions from evidence
    - Absence of logical fallacies or gaps
    """

    name = "reasoning"
    description = "Evaluates the quality of the agent's reasoning process"

    EVALUATION_PROMPT = """You are evaluating the reasoning quality of an AI agent's response.

## Task
The agent was given this query: {query}

## Agent's Response
{response}

## Tools Called
{tools_called}

## Custom Criteria
{custom_criteria}

## Evaluation Rubric
Rate the reasoning quality on a scale of 0-10 based on the following criteria:

1. **Logical Coherence ({logical_coherence_max} points)**
   - Does the reasoning follow a logical flow?
   - Are conclusions supported by the evidence?
   - Are there any logical fallacies or unjustified leaps?

2. **Information Usage ({information_usage_max} points)**
   - Did the agent appropriately use the tools/information available?
   - Was the information correctly interpreted?
   - Were tool results properly incorporated into the reasoning?

3. **Problem Decomposition ({problem_decomposition_max} points)**
   - Did the agent break down the problem appropriately?
   - Were intermediate steps reasonable and necessary?
   - Is there a clear reasoning chain from input to output?

4. **Completeness ({completeness_max} points)**
   - Did the agent address all aspects of the query?
   - Were there any obvious gaps in reasoning?
   - Are there unaddressed edge cases or considerations?

## Response Format
Respond with a JSON object:
{{
    "score": <0-10>,
    "logical_coherence": <0-{logical_coherence_max}>,
    "information_usage": <0-{information_usage_max}>,
    "problem_decomposition": <0-{problem_decomposition_max}>,
    "completeness": <0-{completeness_max}>,
    "strengths": ["list of reasoning strengths"],
    "weaknesses": ["list of reasoning weaknesses or logical gaps"],
    "fallacies_detected": ["any logical fallacies or unsupported claims"],
    "reason": "One sentence summary of the evaluation"
}}
"""

    NO_REASONING_PROMPT = """You are evaluating whether an AI agent's response contains explicit reasoning.

## Task
The agent was given this query: {query}

## Agent's Response
{response}

## Evaluation
Determine if the response contains any explicit reasoning process (explaining how/why the answer was reached).

Respond with a JSON object:
{{
    "has_reasoning": <true/false>,
    "reasoning_type": "<none|implicit|explicit>",
    "explanation": "Brief explanation of assessment",
    "suggested_score": <0-10>
}}
"""

    def __init__(
        self,
        rubric: dict[str, dict[str, Any]] | None = None,
        model: str | None = None,
    ) -> None:
        """Initialize the reasoning scorer.

        Args:
            rubric: Custom rubric configuration with criteria weights and max points.
                    If None, uses DEFAULT_RUBRIC.
            model: Override the default LLM model for evaluation.
        """
        self.rubric = rubric or DEFAULT_RUBRIC
        self.llm_judge = LLMJudge(model=model)

    async def score(
        self,
        case: EvalCaseModel,
        output: dict[str, Any],
        config: dict[str, Any] | None = None,
    ) -> ScorerResult:
        """Score reasoning quality using LLM judge.

        Args:
            case: The eval case with input and expected behavior.
            output: The agent's output including response and tools_called.
            config: Optional configuration including:
                - custom_criteria: Additional evaluation criteria string
                - require_explicit_reasoning: If True, penalize responses without
                  explicit reasoning chains (default: False)
                - rubric: Override the default rubric for this case

        Returns:
            ScorerResult with score 0-1, reason, and evidence list.
        """
        config = config or {}

        query = case.input.get("query", "")
        response = output.get("output", "")
        tools_called = output.get("tools_called", [])

        # Allow per-case rubric override
        rubric = config.get("rubric", self.rubric)
        custom_criteria = config.get("custom_criteria", "None specified")
        require_explicit = config.get("require_explicit_reasoning", False)

        evidence: list[str] = []

        # Check for explicit reasoning if required
        if require_explicit:
            has_reasoning = self._has_explicit_reasoning(response)
            if not has_reasoning:
                evidence.append("No explicit reasoning chain detected")
                # Try LLM assessment for implicit reasoning
                try:
                    reasoning_check = await self._check_reasoning_presence(
                        query, response
                    )
                    if not reasoning_check.get("has_reasoning", False):
                        return ScorerResult(
                            score=0.3,
                            reason="Response lacks explicit reasoning process",
                            evidence=[
                                "No explicit reasoning chain detected",
                                f"Reasoning type: {reasoning_check.get('reasoning_type', 'none')}",
                                reasoning_check.get("explanation", ""),
                            ],
                        )
                except Exception:
                    # Continue with main evaluation if check fails
                    pass

        # Format the evaluation prompt with rubric values
        prompt = self.EVALUATION_PROMPT.format(
            query=query,
            response=response,
            tools_called=self._format_tools(tools_called),
            custom_criteria=custom_criteria,
            logical_coherence_max=rubric.get("logical_coherence", {}).get(
                "max_points", 3
            ),
            information_usage_max=rubric.get("information_usage", {}).get(
                "max_points", 3
            ),
            problem_decomposition_max=rubric.get("problem_decomposition", {}).get(
                "max_points", 2
            ),
            completeness_max=rubric.get("completeness", {}).get("max_points", 2),
        )

        # Get LLM evaluation
        try:
            evaluation = await self.llm_judge.evaluate(prompt)

            # Calculate weighted score from rubric
            score = self._calculate_weighted_score(evaluation, rubric)
            reason = evaluation.get("reason", "Unable to evaluate reasoning")

            # Build evidence list
            if evaluation.get("strengths"):
                for strength in evaluation["strengths"][:3]:
                    evidence.append(f"Strength: {strength}")

            if evaluation.get("weaknesses"):
                for weakness in evaluation["weaknesses"][:3]:
                    evidence.append(f"Weakness: {weakness}")

            if evaluation.get("fallacies_detected"):
                for fallacy in evaluation["fallacies_detected"][:2]:
                    evidence.append(f"Logical issue: {fallacy}")

            # Add sub-scores with rubric context
            evidence.append(
                f"Logical coherence: {evaluation.get('logical_coherence', 'N/A')}/"
                f"{rubric.get('logical_coherence', {}).get('max_points', 3)}"
            )
            evidence.append(
                f"Information usage: {evaluation.get('information_usage', 'N/A')}/"
                f"{rubric.get('information_usage', {}).get('max_points', 3)}"
            )
            evidence.append(
                f"Problem decomposition: "
                f"{evaluation.get('problem_decomposition', 'N/A')}/"
                f"{rubric.get('problem_decomposition', {}).get('max_points', 2)}"
            )
            evidence.append(
                f"Completeness: {evaluation.get('completeness', 'N/A')}/"
                f"{rubric.get('completeness', {}).get('max_points', 2)}"
            )

        except Exception as e:
            # Fallback to heuristic scoring if LLM fails
            score = self._heuristic_score(response, tools_called)
            reason = f"LLM evaluation failed, using heuristics: {e}"
            evidence = self._build_heuristic_evidence(response, tools_called)

        return ScorerResult(
            score=self._normalize_score(score),
            reason=reason,
            evidence=evidence,
        )

    def _calculate_weighted_score(
        self,
        evaluation: dict[str, Any],
        rubric: dict[str, dict[str, Any]],
    ) -> float:
        """Calculate weighted score from evaluation results using rubric.

        Args:
            evaluation: LLM evaluation results with sub-scores.
            rubric: Rubric configuration with weights and max points.

        Returns:
            Weighted score normalized to 0-1 range.
        """
        total_weight = 0.0
        weighted_sum = 0.0

        for criterion, config in rubric.items():
            weight = config.get("weight", 0.25)
            max_points = config.get("max_points", 3)
            raw_score = evaluation.get(criterion)

            if raw_score is not None:
                try:
                    normalized = float(raw_score) / max_points
                    weighted_sum += normalized * weight
                    total_weight += weight
                except (TypeError, ValueError):
                    pass

        if total_weight > 0:
            return weighted_sum / total_weight

        # Fallback to raw score if sub-scores missing
        raw = evaluation.get("score", 5)
        try:
            return float(raw) / 10.0
        except (TypeError, ValueError):
            return 0.5

    def _has_explicit_reasoning(self, response: str) -> bool:
        """Check if response contains explicit reasoning indicators.

        Args:
            response: The agent's response text.

        Returns:
            True if reasoning indicators are present.
        """
        response_lower = response.lower()
        indicator_count = sum(
            1 for indicator in REASONING_INDICATORS if indicator in response_lower
        )
        # Require at least 2 indicators for explicit reasoning
        return indicator_count >= 2

    async def _check_reasoning_presence(
        self, query: str, response: str
    ) -> dict[str, Any]:
        """Use LLM to check if response contains reasoning.

        Args:
            query: The original query.
            response: The agent's response.

        Returns:
            Dict with has_reasoning, reasoning_type, explanation, suggested_score.
        """
        prompt = self.NO_REASONING_PROMPT.format(query=query, response=response)
        return await self.llm_judge.evaluate(prompt)

    def _format_tools(self, tools_called: list[str] | str | Any) -> str:
        """Format tools called for the prompt.

        Args:
            tools_called: List of tool names or string.

        Returns:
            Formatted string representation of tools called.
        """
        if isinstance(tools_called, list):
            if not tools_called:
                return "No tools called"
            return ", ".join(str(t) for t in tools_called)
        if tools_called:
            return str(tools_called)
        return "No tools called"

    def _heuristic_score(
        self,
        response: str,
        tools_called: list[str] | str | Any,
    ) -> float:
        """Fallback heuristic scoring when LLM is unavailable.

        Evaluates based on:
        - Response length (very short = likely poor reasoning)
        - Presence of reasoning indicators
        - Tool usage and mention
        - Potential fallacy patterns

        Args:
            response: The agent's response text.
            tools_called: Tools that were called.

        Returns:
            Heuristic score between 0.0 and 1.0.
        """
        score = 0.5  # Base score
        response_lower = response.lower()

        # Check response length
        if len(response) < 50:
            score -= 0.2
        elif len(response) > 200:
            score += 0.1

        # Check for reasoning indicators
        indicator_count = sum(
            1 for indicator in REASONING_INDICATORS if indicator in response_lower
        )
        if indicator_count >= 3:
            score += 0.15
        elif indicator_count >= 1:
            score += 0.05

        # Check for potential fallacies (minor penalty)
        fallacy_count = sum(
            1 for pattern in FALLACY_PATTERNS if pattern in response_lower
        )
        if fallacy_count >= 2:
            score -= 0.1
        elif fallacy_count >= 1:
            score -= 0.05

        # Check if tools were used
        if (isinstance(tools_called, list) and len(tools_called) > 0) or (
            isinstance(tools_called, str) and tools_called
        ):
            score += 0.1

        return max(0.0, min(1.0, score))

    def _build_heuristic_evidence(
        self,
        response: str,
        tools_called: list[str] | str | Any,
    ) -> list[str]:
        """Build evidence list for heuristic scoring.

        Args:
            response: The agent's response text.
            tools_called: Tools that were called.

        Returns:
            List of evidence strings.
        """
        evidence = ["Fallback to heuristic scoring"]
        response_lower = response.lower()

        # Response length
        if len(response) < 50:
            evidence.append("Short response (< 50 chars)")
        elif len(response) > 200:
            evidence.append("Substantial response (> 200 chars)")

        # Reasoning indicators
        found_indicators = [
            ind for ind in REASONING_INDICATORS if ind in response_lower
        ]
        if found_indicators:
            evidence.append(
                f"Reasoning indicators found: {', '.join(found_indicators[:5])}"
            )
        else:
            evidence.append("No explicit reasoning indicators found")

        # Potential fallacies
        found_fallacies = [
            pattern for pattern in FALLACY_PATTERNS if pattern in response_lower
        ]
        if found_fallacies:
            evidence.append(
                f"Potential fallacy patterns: {', '.join(found_fallacies[:3])}"
            )

        # Tools
        if tools_called:
            if isinstance(tools_called, list):
                evidence.append(f"Tools used: {len(tools_called)}")
            else:
                evidence.append(f"Tools used: {tools_called}")
        else:
            evidence.append("No tools used")

        return evidence
