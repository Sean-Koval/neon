"""
Base Scorer Types

Foundation for defining custom scorers.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable

if TYPE_CHECKING:
    from collections.abc import Awaitable

from neon_sdk.types import ScoreDataType, TraceWithSpans


@dataclass
class EvalContext:
    """Evaluation context passed to scorers."""

    trace: TraceWithSpans
    expected: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None


@dataclass
class ScoreResult:
    """Score result from a scorer."""

    value: float
    reason: str | None = None


@runtime_checkable
class Scorer(Protocol):
    """Scorer protocol."""

    name: str
    description: str | None
    data_type: ScoreDataType

    def evaluate(self, context: EvalContext) -> ScoreResult | Awaitable[ScoreResult]:
        """Evaluate the context and return a score."""
        ...


@dataclass
class ScorerImpl:
    """Scorer implementation."""

    name: str
    description: str | None
    data_type: ScoreDataType
    _evaluate: Callable[[EvalContext], ScoreResult | Awaitable[ScoreResult]]

    def evaluate(self, context: EvalContext) -> ScoreResult | Awaitable[ScoreResult]:
        """Evaluate the context and return a score."""
        return self._evaluate(context)


@dataclass
class ScorerConfig:
    """Scorer configuration."""

    name: str
    evaluate: Callable[[EvalContext], ScoreResult | Awaitable[ScoreResult]]
    description: str | None = None
    data_type: ScoreDataType = ScoreDataType.NUMERIC


def define_scorer(config: ScorerConfig) -> ScorerImpl:
    """
    Define a custom scorer.

    Example:
        ```python
        custom_scorer = define_scorer(ScorerConfig(
            name='custom_metric',
            data_type=ScoreDataType.NUMERIC,
            evaluate=lambda ctx: ScoreResult(
                value=calculate_score(ctx.trace),
                reason="Calculated custom metric",
            ),
        ))
        ```
    """
    return ScorerImpl(
        name=config.name,
        description=config.description,
        data_type=config.data_type,
        _evaluate=config.evaluate,
    )


def scorer(
    name: str,
    *,
    description: str | None = None,
    data_type: ScoreDataType = ScoreDataType.NUMERIC,
) -> Callable[
    [Callable[[EvalContext], ScoreResult | Awaitable[ScoreResult]]],
    ScorerImpl,
]:
    """
    Decorator to define a custom scorer.

    Example:
        ```python
        @scorer("custom_metric")
        def custom_scorer(context: EvalContext) -> ScoreResult:
            score = calculate_score(context.trace)
            return ScoreResult(value=score, reason="Custom metric")
        ```
    """

    def decorator(
        fn: Callable[[EvalContext], ScoreResult | Awaitable[ScoreResult]],
    ) -> ScorerImpl:
        return ScorerImpl(
            name=name,
            description=description,
            data_type=data_type,
            _evaluate=fn,
        )

    return decorator


__all__ = [
    "EvalContext",
    "ScoreResult",
    "Scorer",
    "ScorerImpl",
    "ScorerConfig",
    "define_scorer",
    "scorer",
]
