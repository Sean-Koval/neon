"""Grounding scorer - evaluates whether the agent's response is grounded in evidence."""

import re
from typing import Any

from src.models.db import EvalCaseModel
from src.scorers.base import Scorer, ScorerResult
from src.scorers.llm_judge import LLMJudge


class GroundingScorer(Scorer):
    """Evaluates grounding quality.

    Assesses:
    - Are claims supported by retrieved evidence?
    - Are there hallucinated facts?
    - Does the response match expected content?
    """

    name = "grounding"
    description = "Evaluates whether the response is grounded in evidence"

    EVALUATION_PROMPT = """You are evaluating whether an AI agent's response is properly grounded in evidence.

## Task
The agent was given this query: {query}

## Agent's Response
{response}

## Available Context/Evidence
{context}

## Expected Content
The response should contain: {expected_content}

## Evaluation Criteria
Rate the grounding quality on a scale of 0-10:

1. **Factual Accuracy (0-4 points)**
   - Are all factual claims accurate?
   - Are there any hallucinated facts?

2. **Evidence Support (0-4 points)**
   - Are claims supported by the available context?
   - Does the agent cite or reference its sources appropriately?

3. **Expected Content Match (0-2 points)**
   - Does the response include the expected key information?

## Response Format
Respond with a JSON object:
{{
    "score": <0-10>,
    "factual_accuracy": <0-4>,
    "evidence_support": <0-4>,
    "content_match": <0-2>,
    "grounded_claims": ["list of properly grounded claims"],
    "ungrounded_claims": ["list of potentially hallucinated or unsupported claims"],
    "reason": "One sentence summary"
}}
"""

    def __init__(self):
        self.llm_judge = LLMJudge()

    async def score(
        self,
        case: EvalCaseModel,
        output: dict[str, Any],
        config: dict[str, Any] | None = None,
    ) -> ScorerResult:
        """Score grounding quality."""
        config = config or {}

        query = case.input.get("query", "")
        context = case.input.get("context", {})
        response = output.get("output", "")

        expected_content = case.expected_output_contains or []
        expected_pattern = case.expected_output_pattern

        evidence: list[str] = []

        # Check expected content presence (deterministic)
        content_match_score = self._check_expected_content(
            response, expected_content, expected_pattern, evidence
        )

        # Use LLM judge for deeper grounding analysis
        try:
            prompt = self.EVALUATION_PROMPT.format(
                query=query,
                response=response,
                context=str(context) if context else "No context provided",
                expected_content=expected_content or "None specified",
            )

            evaluation = await self.llm_judge.evaluate(prompt)

            llm_score = evaluation.get("score", 5) / 10.0

            if evaluation.get("grounded_claims"):
                evidence.extend(
                    [f"Grounded: {c}" for c in evaluation["grounded_claims"][:3]]
                )
            if evaluation.get("ungrounded_claims"):
                evidence.extend(
                    [f"Ungrounded: {c}" for c in evaluation["ungrounded_claims"][:3]]
                )

            evidence.append(
                f"Factual accuracy: {evaluation.get('factual_accuracy', 'N/A')}/4"
            )
            evidence.append(
                f"Evidence support: {evaluation.get('evidence_support', 'N/A')}/4"
            )

            reason = evaluation.get("reason", "Grounding evaluation complete")

            # Combine scores (weight deterministic check slightly)
            final_score = (content_match_score * 0.3) + (llm_score * 0.7)

        except Exception as e:
            # Fallback to content matching only
            final_score = content_match_score
            reason = f"LLM evaluation failed, using content matching: {e}"
            evidence.append("Fallback to content matching only")

        return ScorerResult(
            score=self._normalize_score(final_score),
            reason=reason,
            evidence=evidence,
        )

    def _check_expected_content(
        self,
        response: str,
        expected_contains: list[str],
        expected_pattern: str | None,
        evidence: list[str],
    ) -> float:
        """Check if response contains expected content."""
        if not expected_contains and not expected_pattern:
            return 0.8  # Neutral score if no expectations

        matches = 0
        total = 0

        # Check string contains
        if expected_contains:
            total += len(expected_contains)
            response_lower = response.lower()
            for expected in expected_contains:
                if expected.lower() in response_lower:
                    matches += 1
                    evidence.append(f"Found expected: '{expected}'")
                else:
                    evidence.append(f"Missing expected: '{expected}'")

        # Check pattern
        if expected_pattern:
            total += 1
            try:
                if re.search(expected_pattern, response, re.IGNORECASE):
                    matches += 1
                    evidence.append(f"Pattern matched: {expected_pattern}")
                else:
                    evidence.append(f"Pattern not matched: {expected_pattern}")
            except re.error:
                evidence.append(f"Invalid pattern: {expected_pattern}")

        return matches / total if total > 0 else 0.8
