"""
Rule-Based Scorers

Deterministic scorers that don't require LLM calls.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from neon_sdk.types import ScoreDataType, SpanType, SpanWithChildren

from .base import EvalContext, ScorerConfig, ScoreResult, ScorerImpl, define_scorer

# =============================================================================
# Rule-Based Scorer Factory
# =============================================================================


@dataclass
class RuleBasedConfig:
    """Rule-based scorer configuration."""

    check: Callable[[EvalContext], bool | float]
    name: str = "rule_based"
    description: str | None = None
    threshold: float | None = None


def rule_based_scorer(config: RuleBasedConfig) -> ScorerImpl:
    """
    Create a rule-based scorer.

    Example:
        ```python
        tool_used_scorer = rule_based_scorer(RuleBasedConfig(
            check=lambda ctx: any(s.span_type == SpanType.TOOL for s in ctx.trace.spans),
            name='tool_used',
        ))
        ```
    """

    def evaluate(context: EvalContext) -> ScoreResult:
        result = config.check(context)
        value = 1.0 if result is True else (0.0 if result is False else float(result))
        return ScoreResult(
            value=max(0.0, min(1.0, value)),
            reason=f"Rule check returned {value}",
        )

    return define_scorer(
        ScorerConfig(
            name=config.name,
            description=config.description,
            data_type=ScoreDataType.NUMERIC,
            evaluate=evaluate,
        )
    )


# =============================================================================
# Utility Functions
# =============================================================================


def _flatten_spans(spans: list[SpanWithChildren]) -> list[SpanWithChildren]:
    """Flatten a span tree into a flat list."""
    result: list[SpanWithChildren] = []

    def traverse(span: SpanWithChildren) -> None:
        result.append(span)
        for child in span.children:
            traverse(child)

    for s in spans:
        traverse(s)
    return result


def _get_last_output(context: EvalContext) -> str:
    """Get the last output from the trace."""
    flat = _flatten_spans(context.trace.spans)
    generations = [s for s in flat if s.span_type == SpanType.GENERATION]
    if generations:
        return generations[-1].output or ""
    return ""


def _normalize_to_list(value: str | list[str] | None) -> list[str]:
    """Normalize a value to a list."""
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    return list(value)


def _deep_match(actual: Any, expected: Any) -> bool:
    """Deep match two objects."""
    if expected is None:
        return True
    if not isinstance(actual, type(expected)):
        return False

    if isinstance(expected, dict):
        if not isinstance(actual, dict):
            return False
        return all(
            _deep_match(actual.get(key), expected[key]) for key in expected
        )

    if isinstance(expected, list):
        if not isinstance(actual, list):
            return False
        return all(_deep_match(actual[i], item) for i, item in enumerate(expected))

    return bool(actual == expected)


# =============================================================================
# Built-in Rule-Based Scorers
# =============================================================================


def tool_selection_scorer(expected_tools: list[str] | None = None) -> ScorerImpl:
    """
    Check if expected tools were called.

    Example:
        ```python
        scorer = tool_selection_scorer(['search', 'calculate'])
        ```
    """

    def check(context: EvalContext) -> float:
        flat = _flatten_spans(context.trace.spans)
        actual_tools = [s.tool_name for s in flat if s.span_type == SpanType.TOOL and s.tool_name]

        expected = expected_tools
        if expected is None and context.expected:
            expected = context.expected.get("toolCalls", [])
        if not expected:
            return 1.0 if actual_tools else 0.5

        matches = [t for t in expected if t in actual_tools]
        return len(matches) / len(expected)

    return rule_based_scorer(
        RuleBasedConfig(
            name="tool_selection",
            description="Checks if the expected tools were called",
            check=check,
        )
    )


# =============================================================================
# Contains Scorer
# =============================================================================


@dataclass
class ContainsConfig:
    """Configuration for contains scorer."""

    expected: str | list[str] | None = None
    case_sensitive: bool = False
    match_all: bool = True


def contains(config: str | list[str] | ContainsConfig | None = None) -> ScorerImpl:
    """
    Check if output contains expected string(s).

    Example:
        ```python
        # Simple usage
        contains('hello')
        contains(['hello', 'world'])

        # With options
        contains(ContainsConfig(expected=['error', 'warning'], match_all=False))
        contains(ContainsConfig(expected='SUCCESS', case_sensitive=True))
        ```
    """
    # Normalize config
    if config is None:
        normalized = ContainsConfig()
    elif isinstance(config, str):
        normalized = ContainsConfig(expected=[config])
    elif isinstance(config, list):
        normalized = ContainsConfig(expected=config)
    else:
        normalized = config

    def evaluate(context: EvalContext) -> ScoreResult:
        output = _get_last_output(context)

        # Get expected strings from config or context
        raw_expected = normalized.expected
        if raw_expected is None and context.expected:
            raw_expected = context.expected.get("outputContains")
        strings = _normalize_to_list(raw_expected)

        # Handle edge cases
        if not strings:
            return ScoreResult(value=1.0, reason="No expected strings specified")
        if not output:
            return ScoreResult(value=0.0, reason="Output is empty")

        normalized_output = output if normalized.case_sensitive else output.lower()
        matches = []
        for s in strings:
            if s is None:
                continue
            normalized_search = str(s) if normalized.case_sensitive else str(s).lower()
            if normalized_search in normalized_output:
                matches.append(s)

        match_count = len(matches)
        total = len(strings)

        if normalized.match_all:
            # AND mode: score is ratio of matches
            value = match_count / total
            if value == 1.0:
                reason = f"All {total} expected string(s) found"
            else:
                missing = [s for s in strings if s not in matches]
                reason = f"Found {match_count}/{total} expected strings: missing {missing}"
            return ScoreResult(value=value, reason=reason)
        else:
            # OR mode: 1 if any match, 0 otherwise
            value = 1.0 if match_count > 0 else 0.0
            if value == 1.0:
                reason = f'Found matching string: "{matches[0]}"'
            else:
                reason = f"None of the expected strings found: {strings}"
            return ScoreResult(value=value, reason=reason)

    return define_scorer(
        ScorerConfig(
            name="contains",
            description="Checks if output contains expected string(s)",
            data_type=ScoreDataType.NUMERIC,
            evaluate=evaluate,
        )
    )


# Legacy alias
def contains_scorer(expected: list[str] | None = None) -> ScorerImpl:
    """
    Deprecated: Use `contains()` instead.
    """
    return contains(expected)


# =============================================================================
# Exact Match Scorer
# =============================================================================


@dataclass
class ExactMatchConfig:
    """Configuration for exact match scorer."""

    expected: str | None = None
    trim: bool = True
    normalize_whitespace: bool = False
    case_sensitive: bool = True


def exact_match(config: str | ExactMatchConfig | None = None) -> ScorerImpl:
    """
    Check for exact output match.

    Example:
        ```python
        # Simple usage - expects exact string
        exact_match('hello world')

        # With options
        exact_match(ExactMatchConfig(expected='Hello World', case_sensitive=False))
        exact_match(ExactMatchConfig(expected='result', normalize_whitespace=True))
        ```
    """
    # Normalize config
    if config is None:
        normalized = ExactMatchConfig()
    elif isinstance(config, str):
        normalized = ExactMatchConfig(expected=config)
    else:
        normalized = config

    def evaluate(context: EvalContext) -> ScoreResult:
        raw_output = _get_last_output(context)
        raw_expected = normalized.expected
        if raw_expected is None and context.expected:
            raw_expected = context.expected.get("output")

        # Handle null/undefined expected
        if raw_expected is None:
            return ScoreResult(value=1.0, reason="No expected output specified")

        # Handle null/undefined output
        if raw_output is None:
            return ScoreResult(value=0.0, reason="Output is null or undefined")

        # Normalize strings
        output = str(raw_output)
        expected_str = str(raw_expected)

        if normalized.trim:
            output = output.strip()
            expected_str = expected_str.strip()

        if normalized.normalize_whitespace:
            output = re.sub(r"\s+", " ", output)
            expected_str = re.sub(r"\s+", " ", expected_str)

        if not normalized.case_sensitive:
            output = output.lower()
            expected_str = expected_str.lower()

        matches = output == expected_str

        if matches:
            return ScoreResult(value=1.0, reason="Output matches expected exactly")

        # Provide helpful diff info for debugging
        output_preview = output[:50] + "..." if len(output) > 50 else output
        expected_preview = expected_str[:50] + "..." if len(expected_str) > 50 else expected_str

        return ScoreResult(
            value=0.0,
            reason=f'Output "{output_preview}" does not match expected "{expected_preview}"',
        )

    return define_scorer(
        ScorerConfig(
            name="exact_match",
            description="Checks for exact output match",
            data_type=ScoreDataType.NUMERIC,
            evaluate=evaluate,
        )
    )


# Legacy alias
def exact_match_scorer(expected: str | None = None) -> ScorerImpl:
    """
    Deprecated: Use `exact_match()` instead.
    """
    return exact_match(expected)


# =============================================================================
# JSON Match Scorer
# =============================================================================


def json_match_scorer(expected: dict[str, Any] | None = None) -> ScorerImpl:
    """
    Check if output matches JSON structure.

    Example:
        ```python
        scorer = json_match_scorer({'status': 'success', 'count': 5})
        ```
    """

    def check(context: EvalContext) -> float:
        output = _get_last_output(context)
        expected_obj = expected or context.expected

        try:
            parsed = json.loads(output)
            return 1.0 if _deep_match(parsed, expected_obj) else 0.0
        except (json.JSONDecodeError, TypeError):
            return 0.0

    return rule_based_scorer(
        RuleBasedConfig(
            name="json_match",
            description="Checks if output matches expected JSON structure",
            check=check,
        )
    )


# =============================================================================
# Latency Scorer
# =============================================================================


@dataclass
class LatencyThresholds:
    """Latency thresholds for scoring."""

    excellent: int = 1000
    good: int = 5000
    acceptable: int = 10000


def latency_scorer(thresholds: LatencyThresholds | None = None) -> ScorerImpl:
    """
    Score based on latency.

    Example:
        ```python
        scorer = latency_scorer(LatencyThresholds(excellent=500, good=2000, acceptable=5000))
        ```
    """
    t = thresholds or LatencyThresholds()

    def check(context: EvalContext) -> float:
        duration = context.trace.trace.duration_ms

        if duration <= t.excellent:
            return 1.0
        if duration <= t.good:
            return 0.8
        if duration <= t.acceptable:
            return 0.6
        return 0.4

    return rule_based_scorer(
        RuleBasedConfig(
            name="latency",
            description="Scores based on execution latency",
            check=check,
        )
    )


# =============================================================================
# Error Rate Scorer
# =============================================================================


def error_rate_scorer() -> ScorerImpl:
    """
    Score based on span error rate.

    Example:
        ```python
        scorer = error_rate_scorer()
        ```
    """

    def check(context: EvalContext) -> float:
        flat = _flatten_spans(context.trace.spans)
        if not flat:
            return 1.0

        errors = sum(1 for s in flat if s.status.value == "error")
        return 1.0 - errors / len(flat)

    return rule_based_scorer(
        RuleBasedConfig(
            name="error_rate",
            description="Scores based on span error rate",
            check=check,
        )
    )


# =============================================================================
# Token Efficiency Scorer
# =============================================================================


@dataclass
class TokenThresholds:
    """Token usage thresholds for scoring."""

    excellent: int = 1000
    good: int = 5000
    acceptable: int = 10000


def token_efficiency_scorer(thresholds: TokenThresholds | None = None) -> ScorerImpl:
    """
    Score based on token efficiency.

    Example:
        ```python
        scorer = token_efficiency_scorer(TokenThresholds(excellent=500, good=2000))
        ```
    """
    t = thresholds or TokenThresholds()

    def check(context: EvalContext) -> float:
        flat = _flatten_spans(context.trace.spans)
        generations = [s for s in flat if s.span_type == SpanType.GENERATION]
        total_tokens = sum(s.total_tokens or 0 for s in generations)

        if total_tokens <= t.excellent:
            return 1.0
        if total_tokens <= t.good:
            return 0.8
        if total_tokens <= t.acceptable:
            return 0.6
        return 0.4

    return rule_based_scorer(
        RuleBasedConfig(
            name="token_efficiency",
            description="Scores based on total token usage",
            check=check,
        )
    )


# =============================================================================
# Success Scorer
# =============================================================================


def success_scorer() -> ScorerImpl:
    """
    Check if trace completed successfully.

    Example:
        ```python
        scorer = success_scorer()
        ```
    """

    def check(context: EvalContext) -> bool:
        return context.trace.trace.status.value == "ok"

    return rule_based_scorer(
        RuleBasedConfig(
            name="success",
            description="Checks if trace completed successfully",
            check=check,
        )
    )


# =============================================================================
# Iteration Scorer
# =============================================================================


def iteration_scorer(max_iterations: int = 10) -> ScorerImpl:
    """
    Score based on iteration count.

    Example:
        ```python
        scorer = iteration_scorer(max_iterations=5)
        ```
    """

    def check(context: EvalContext) -> float:
        flat = _flatten_spans(context.trace.spans)
        iterations = sum(1 for s in flat if s.span_type == SpanType.GENERATION)

        if iterations <= 1:
            return 1.0
        if iterations <= 3:
            return 0.9
        if iterations <= 5:
            return 0.7
        if iterations <= max_iterations:
            return 0.5
        return 0.3

    return rule_based_scorer(
        RuleBasedConfig(
            name="iterations",
            description="Scores based on number of iterations",
            check=check,
        )
    )


__all__ = [
    # Factory
    "RuleBasedConfig",
    "rule_based_scorer",
    # Contains
    "ContainsConfig",
    "contains",
    "contains_scorer",
    # Exact match
    "ExactMatchConfig",
    "exact_match",
    "exact_match_scorer",
    # Other scorers
    "tool_selection_scorer",
    "json_match_scorer",
    "LatencyThresholds",
    "latency_scorer",
    "error_rate_scorer",
    "TokenThresholds",
    "token_efficiency_scorer",
    "success_scorer",
    "iteration_scorer",
]
