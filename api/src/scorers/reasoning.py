"""Reasoning quality scorer - evaluates the agent's reasoning process."""

from typing import Any

from src.models.db import EvalCaseModel
from src.scorers.base import Scorer, ScorerResult
from src.scorers.llm_judge import LLMJudge


class ReasoningScorer(Scorer):
    """Evaluates reasoning quality using an LLM judge.

    Assesses:
    - Logical coherence of the reasoning chain
    - Appropriate use of retrieved/tool information
    - Step-by-step problem decomposition
    - Correct conclusions from evidence
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

## Evaluation Criteria
Rate the reasoning quality on a scale of 0-10 based on:

1. **Logical Coherence (0-3 points)**
   - Does the reasoning follow a logical flow?
   - Are conclusions supported by the evidence?

2. **Information Usage (0-3 points)**
   - Did the agent appropriately use the tools/information available?
   - Was the information correctly interpreted?

3. **Problem Decomposition (0-2 points)**
   - Did the agent break down the problem appropriately?
   - Were intermediate steps reasonable?

4. **Completeness (0-2 points)**
   - Did the agent address all aspects of the query?
   - Were there any obvious gaps in reasoning?

## Response Format
Respond with a JSON object:
{{
    "score": <0-10>,
    "logical_coherence": <0-3>,
    "information_usage": <0-3>,
    "problem_decomposition": <0-2>,
    "completeness": <0-2>,
    "strengths": ["list of reasoning strengths"],
    "weaknesses": ["list of reasoning weaknesses"],
    "reason": "One sentence summary of the evaluation"
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
        """Score reasoning quality using LLM judge."""
        config = config or {}

        query = case.input.get("query", "")
        response = output.get("output", "")
        tools_called = output.get("tools_called", [])

        # Format prompt
        prompt = self.EVALUATION_PROMPT.format(
            query=query,
            response=response,
            tools_called=tools_called,
        )

        # Get LLM evaluation
        try:
            evaluation = await self.llm_judge.evaluate(prompt)

            score = evaluation.get("score", 5) / 10.0  # Normalize to 0-1
            reason = evaluation.get("reason", "Unable to evaluate reasoning")

            evidence = []
            if evaluation.get("strengths"):
                evidence.extend([f"Strength: {s}" for s in evaluation["strengths"]])
            if evaluation.get("weaknesses"):
                evidence.extend([f"Weakness: {w}" for w in evaluation["weaknesses"]])

            # Add sub-scores
            evidence.append(
                f"Logical coherence: {evaluation.get('logical_coherence', 'N/A')}/3"
            )
            evidence.append(
                f"Information usage: {evaluation.get('information_usage', 'N/A')}/3"
            )
            evidence.append(
                f"Problem decomposition: {evaluation.get('problem_decomposition', 'N/A')}/2"
            )
            evidence.append(f"Completeness: {evaluation.get('completeness', 'N/A')}/2")

        except Exception as e:
            # Fallback to heuristic scoring if LLM fails
            score = self._heuristic_score(response, tools_called)
            reason = f"LLM evaluation failed, using heuristics: {e}"
            evidence = ["Fallback to heuristic scoring"]

        return ScorerResult(
            score=self._normalize_score(score),
            reason=reason,
            evidence=evidence,
        )

    def _heuristic_score(
        self, response: str, tools_called: list[str]
    ) -> float:
        """Fallback heuristic scoring when LLM is unavailable."""
        score = 0.5  # Base score

        # Check response length (very short = likely poor reasoning)
        if len(response) < 50:
            score -= 0.2
        elif len(response) > 200:
            score += 0.1

        # Check if tools were used and mentioned
        if tools_called:
            score += 0.1

        return max(0.0, min(1.0, score))
