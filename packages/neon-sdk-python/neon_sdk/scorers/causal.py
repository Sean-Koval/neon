"""
Causal Failure Analysis Scorer

Analyzes trace spans to identify causal chains in failed executions.
Traces error propagation paths and identifies root cause components.

Example: "The retrieval returned irrelevant docs → agent hallucinated → tool call failed"
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from neon_sdk.types import ComponentType, ScoreDataType, SpanStatus, SpanWithChildren

from .base import EvalContext, ScorerConfig, ScoreResult, ScorerImpl, define_scorer

# =============================================================================
# Causal Analysis Types
# =============================================================================


@dataclass
class CausalNode:
    """Represents a node in the causal failure chain."""

    span_id: str
    span_name: str
    component_type: ComponentType | None
    span_type: str
    status_message: str | None
    depth: int


@dataclass
class CausalAnalysisResult:
    """Result of causal analysis."""

    has_errors: bool
    root_cause: CausalNode | None
    causal_chain: list[CausalNode]
    explanation: str
    error_count: int
    total_spans: int


@dataclass
class CausalAnalysisConfig:
    """Configuration for causal analysis scorer."""

    name: str = "causal_analysis"
    description: str = "Analyzes error propagation and identifies root cause"
    root_cause_weight: float = 0.5
    chain_completeness_weight: float = 0.3
    error_rate_weight: float = 0.2


# =============================================================================
# Utility Functions
# =============================================================================


def _flatten_spans(spans: list[SpanWithChildren]) -> list[SpanWithChildren]:
    """Flatten a span tree into a flat array."""
    result: list[SpanWithChildren] = []

    def traverse(span: SpanWithChildren) -> None:
        result.append(span)
        for child in span.children:
            traverse(child)

    for s in spans:
        traverse(s)
    return result


def _build_span_map(spans: list[SpanWithChildren]) -> dict[str, SpanWithChildren]:
    """Build a map from spanId to span for quick lookup."""
    flat = _flatten_spans(spans)
    return {span.span_id: span for span in flat}


def _find_error_spans(spans: list[SpanWithChildren]) -> list[SpanWithChildren]:
    """Find all error spans in the trace."""
    flat = _flatten_spans(spans)
    return [span for span in flat if span.status == SpanStatus.ERROR]


def _has_failed_descendants(span: SpanWithChildren) -> bool:
    """Check if a span has any failed children (recursively)."""
    for child in span.children:
        if child.status == SpanStatus.ERROR or _has_failed_descendants(child):
            return True
    return False


def _find_root_cause(
    error_spans: list[SpanWithChildren],
    span_map: dict[str, SpanWithChildren],
) -> SpanWithChildren | None:
    """Find the root cause span - the earliest error that doesn't have a failed parent."""
    if not error_spans:
        return None

    # Sort by timestamp to find earliest errors
    sorted_errors = sorted(error_spans, key=lambda s: s.timestamp)

    # Find errors that don't have a failed parent (true root causes)
    root_causes = []
    for span in sorted_errors:
        if not span.parent_span_id:
            root_causes.append(span)
            continue
        parent = span_map.get(span.parent_span_id)
        # If parent exists and is not an error, this could be the root cause
        if not parent or parent.status != SpanStatus.ERROR:
            root_causes.append(span)

    # Return the earliest root cause, or earliest error if no clear root cause
    return root_causes[0] if root_causes else sorted_errors[0]


def _build_causal_chain(
    root_cause: SpanWithChildren,
    error_spans: list[SpanWithChildren],
    span_map: dict[str, SpanWithChildren],
) -> list[CausalNode]:
    """Build the causal chain from root cause to downstream failures."""
    chain: list[CausalNode] = []
    visited: set[str] = set()

    def add_to_chain(span: SpanWithChildren, depth: int) -> None:
        if span.span_id in visited:
            return
        visited.add(span.span_id)

        chain.append(
            CausalNode(
                span_id=span.span_id,
                span_name=span.name,
                component_type=span.component_type,
                span_type=span.span_type.value,
                status_message=span.status_message,
                depth=depth,
            )
        )

        # Find failed children and add them
        failed_children = [child for child in span.children if child.status == SpanStatus.ERROR]
        for child in failed_children:
            add_to_chain(child, depth + 1)

    add_to_chain(root_cause, 0)

    # Sort by depth to show causality order
    return sorted(chain, key=lambda n: n.depth)


def _get_component_label(node: CausalNode) -> str:
    """Generate a human-readable component label."""
    if node.component_type and node.component_type != ComponentType.OTHER:
        return node.component_type.value
    if node.span_type != "span":
        return node.span_type
    return node.span_name


def _generate_explanation(result: CausalAnalysisResult) -> str:
    """Generate human-readable explanation of the causal chain."""
    if not result.has_errors:
        return "No errors detected in trace"

    if not result.root_cause:
        return "Errors detected but root cause could not be determined"

    if len(result.causal_chain) == 1:
        root = result.root_cause
        label = _get_component_label(root)
        message = f": {root.status_message}" if root.status_message else ""
        return f"Single point of failure in {label}{message}"

    # Build chain description: "retrieval failed → reasoning failed → tool call failed"
    chain_parts = []
    for node in result.causal_chain:
        label = _get_component_label(node)
        status = f" ({node.status_message})" if node.status_message else " failed"
        chain_parts.append(f"{label}{status}")

    chain_description = " → ".join(chain_parts)
    return f"Causal chain: {chain_description}"


# =============================================================================
# Core Analysis Function
# =============================================================================


def analyze_causality(context: EvalContext) -> CausalAnalysisResult:
    """Perform causal analysis on a trace."""
    spans = context.trace.spans
    flat_spans = _flatten_spans(spans)
    span_map = _build_span_map(spans)
    error_spans = _find_error_spans(spans)

    if not error_spans:
        return CausalAnalysisResult(
            has_errors=False,
            root_cause=None,
            causal_chain=[],
            explanation="No errors detected in trace",
            error_count=0,
            total_spans=len(flat_spans),
        )

    root_cause_span = _find_root_cause(error_spans, span_map)
    causal_chain: list[CausalNode] = []
    root_cause: CausalNode | None = None

    if root_cause_span:
        causal_chain = _build_causal_chain(root_cause_span, error_spans, span_map)
        root_cause = causal_chain[0] if causal_chain else None

    result = CausalAnalysisResult(
        has_errors=True,
        root_cause=root_cause,
        causal_chain=causal_chain,
        explanation="",  # Will be filled below
        error_count=len(error_spans),
        total_spans=len(flat_spans),
    )

    result.explanation = _generate_explanation(result)
    return result


# =============================================================================
# Causal Analysis Scorers
# =============================================================================


def causal_analysis_scorer(config: CausalAnalysisConfig | None = None) -> ScorerImpl:
    """
    Create a causal failure analysis scorer.

    This scorer analyzes error propagation in traces to:
    1. Identify the root cause of failures
    2. Build causal chains showing error propagation
    3. Provide human-readable explanations

    Example:
        ```python
        # Basic usage
        scorer = causal_analysis_scorer()

        # With custom weights
        scorer = causal_analysis_scorer(CausalAnalysisConfig(
            root_cause_weight=0.6,
            chain_completeness_weight=0.3,
            error_rate_weight=0.1,
        ))
        ```

    Score interpretation:
    - 1.0: No errors in trace (perfect execution)
    - 0.7-0.9: Errors present but clear root cause identified
    - 0.4-0.6: Errors with partial causal chain
    - 0.0-0.3: Many errors, unclear causality
    """
    cfg = config or CausalAnalysisConfig()

    def evaluate(context: EvalContext) -> ScoreResult:
        analysis = analyze_causality(context)

        # Perfect score if no errors
        if not analysis.has_errors:
            return ScoreResult(value=1.0, reason=analysis.explanation)

        # Calculate component scores
        error_rate = (
            1.0 - (analysis.error_count / analysis.total_spans)
            if analysis.total_spans > 0
            else 0.0
        )

        root_cause_score = 1.0 if analysis.root_cause else 0.0

        # Chain completeness: how well can we trace the error propagation
        # Higher score if causal chain covers most error spans
        chain_completeness = (
            min(1.0, len(analysis.causal_chain) / analysis.error_count)
            if analysis.error_count > 0
            else 0.0
        )

        # Weighted combination
        value = (
            cfg.root_cause_weight * root_cause_score
            + cfg.chain_completeness_weight * chain_completeness
            + cfg.error_rate_weight * error_rate
        )

        # Clamp to 0-1 range
        clamped_value = max(0.0, min(1.0, value))

        return ScoreResult(value=clamped_value, reason=analysis.explanation)

    return define_scorer(
        ScorerConfig(
            name=cfg.name,
            description=cfg.description,
            data_type=ScoreDataType.NUMERIC,
            evaluate=evaluate,
        )
    )


def causal_analysis_detailed_scorer(
    config: CausalAnalysisConfig | None = None,
) -> ScorerImpl:
    """
    Get detailed causal analysis for a trace.

    Use this when you need the full analysis result, not just a score.

    Example:
        ```python
        scorer = causal_analysis_detailed_scorer()
        result = scorer.evaluate(context)
        # result.reason contains JSON with full CausalAnalysisResult
        ```
    """
    cfg = config or CausalAnalysisConfig()

    def evaluate(context: EvalContext) -> ScoreResult:
        analysis = analyze_causality(context)

        # Calculate score same as basic scorer
        if not analysis.has_errors:
            return ScoreResult(
                value=1.0,
                reason=_result_to_json(analysis),
            )

        error_rate = (
            1.0 - (analysis.error_count / analysis.total_spans)
            if analysis.total_spans > 0
            else 0.0
        )

        root_cause_score = 1.0 if analysis.root_cause else 0.0

        chain_completeness = (
            min(1.0, len(analysis.causal_chain) / analysis.error_count)
            if analysis.error_count > 0
            else 0.0
        )

        value = (
            cfg.root_cause_weight * root_cause_score
            + cfg.chain_completeness_weight * chain_completeness
            + cfg.error_rate_weight * error_rate
        )

        clamped_value = max(0.0, min(1.0, value))

        return ScoreResult(
            value=clamped_value,
            reason=_result_to_json(analysis),
        )

    return define_scorer(
        ScorerConfig(
            name="causal_analysis_detailed",
            description="Detailed causal analysis with full chain information",
            data_type=ScoreDataType.NUMERIC,
            evaluate=evaluate,
        )
    )


def root_cause_scorer() -> ScorerImpl:
    """
    Scorer that only checks if root cause can be identified.

    Returns 1 if root cause is identified, 0 otherwise.

    Example:
        ```python
        scorer = root_cause_scorer()
        ```
    """

    def evaluate(context: EvalContext) -> ScoreResult:
        analysis = analyze_causality(context)

        if not analysis.has_errors:
            return ScoreResult(value=1.0, reason="No errors to analyze")

        if analysis.root_cause:
            label = _get_component_label(analysis.root_cause)
            return ScoreResult(value=1.0, reason=f"Root cause identified: {label}")

        return ScoreResult(value=0.0, reason="Could not identify root cause")

    return define_scorer(
        ScorerConfig(
            name="root_cause_identified",
            description="Checks if root cause of failure can be identified",
            data_type=ScoreDataType.BOOLEAN,
            evaluate=evaluate,
        )
    )


# =============================================================================
# JSON Serialization
# =============================================================================


def _node_to_dict(node: CausalNode) -> dict[str, Any]:
    """Convert CausalNode to dict."""
    return {
        "span_id": node.span_id,
        "span_name": node.span_name,
        "component_type": node.component_type.value if node.component_type else None,
        "span_type": node.span_type,
        "status_message": node.status_message,
        "depth": node.depth,
    }


def _result_to_json(result: CausalAnalysisResult) -> str:
    """Convert CausalAnalysisResult to JSON string."""
    return json.dumps(
        {
            "has_errors": result.has_errors,
            "root_cause": _node_to_dict(result.root_cause) if result.root_cause else None,
            "causal_chain": [_node_to_dict(n) for n in result.causal_chain],
            "explanation": result.explanation,
            "error_count": result.error_count,
            "total_spans": result.total_spans,
        },
        indent=2,
    )


__all__ = [
    "CausalNode",
    "CausalAnalysisResult",
    "CausalAnalysisConfig",
    "analyze_causality",
    "causal_analysis_scorer",
    "causal_analysis_detailed_scorer",
    "root_cause_scorer",
]
