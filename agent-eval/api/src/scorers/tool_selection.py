"""Tool selection scorer - evaluates whether the agent chose appropriate tools."""

from typing import Any

from src.models.db import EvalCaseModel
from src.scorers.base import Scorer, ScorerResult


class ToolSelectionScorer(Scorer):
    """Evaluates tool selection quality.

    Checks:
    - Were the expected tools called?
    - Were unnecessary tools avoided?
    - Was the tool sequence correct (if specified)?
    """

    name = "tool_selection"
    description = "Evaluates whether the agent selected appropriate tools"

    async def score(
        self,
        case: EvalCaseModel,
        output: dict[str, Any],
        config: dict[str, Any] | None = None,
    ) -> ScorerResult:
        """Score tool selection quality."""
        config = config or {}

        # Get actual tools called
        tools_called = output.get("tools_called", [])
        if isinstance(tools_called, str):
            tools_called = [tools_called]

        evidence: list[str] = []
        evidence.append(f"Tools called: {tools_called}")

        # Check expected tools (order-independent)
        if case.expected_tools is not None:
            expected_set = set(case.expected_tools)
            actual_set = set(tools_called)

            # Handle empty expected_tools = no tools should be called
            if len(expected_set) == 0:
                if len(actual_set) == 0:
                    evidence.append("Correctly called no tools")
                    tool_match_score = 1.0
                else:
                    evidence.append(f"Expected no tools, but called: {actual_set}")
                    tool_match_score = 0.0
            else:
                # Calculate Jaccard similarity
                intersection = expected_set & actual_set
                union = expected_set | actual_set

                tool_match_score = len(intersection) / len(union) if union else 1.0

                missing = expected_set - actual_set
                extra = actual_set - expected_set

                if missing:
                    evidence.append(f"Missing expected tools: {missing}")
                if extra:
                    evidence.append(f"Unexpected tools called: {extra}")
                if not missing and not extra:
                    evidence.append("All expected tools called correctly")
        else:
            # No expected tools specified - neutral score
            tool_match_score = 0.8
            evidence.append("No expected tools specified")

        # Check tool sequence (if specified)
        sequence_score = 1.0
        if case.expected_tool_sequence is not None:
            expected_seq = case.expected_tool_sequence
            actual_seq = tools_called

            if expected_seq == actual_seq:
                evidence.append("Tool sequence matches exactly")
                sequence_score = 1.0
            else:
                # Calculate sequence similarity using longest common subsequence
                lcs_length = self._lcs_length(expected_seq, actual_seq)
                max_length = max(len(expected_seq), len(actual_seq))
                sequence_score = lcs_length / max_length if max_length > 0 else 1.0
                evidence.append(
                    f"Tool sequence differs (LCS similarity: {sequence_score:.2f})"
                )

        # Combine scores
        # If sequence is specified, weight it equally with tool match
        if case.expected_tool_sequence is not None:
            final_score = (tool_match_score + sequence_score) / 2
        else:
            final_score = tool_match_score

        # Determine reason
        if final_score >= 0.9:
            reason = "Excellent tool selection"
        elif final_score >= 0.7:
            reason = "Good tool selection with minor issues"
        elif final_score >= 0.5:
            reason = "Partial tool selection - some tools missing or extra"
        else:
            reason = "Poor tool selection - significant mismatch"

        return ScorerResult(
            score=self._normalize_score(final_score),
            reason=reason,
            evidence=evidence,
        )

    def _lcs_length(self, seq1: list[str], seq2: list[str]) -> int:
        """Calculate length of longest common subsequence."""
        m, n = len(seq1), len(seq2)
        dp = [[0] * (n + 1) for _ in range(m + 1)]

        for i in range(1, m + 1):
            for j in range(1, n + 1):
                if seq1[i - 1] == seq2[j - 1]:
                    dp[i][j] = dp[i - 1][j - 1] + 1
                else:
                    dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])

        return dp[m][n]
