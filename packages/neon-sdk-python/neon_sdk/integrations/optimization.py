"""
Optimization Signal Generation

Generate reward signals from traces for agent optimization and RLHF.
Supports multiple signal types and aggregation from multiple sources.
"""

from __future__ import annotations

import math
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Literal

from neon_sdk.types import ComponentType, SpanWithChildren, TraceWithSpans

# =============================================================================
# Signal Types
# =============================================================================


class SignalType(str, Enum):
    """Signal type categories."""

    REWARD = "reward"  # Scalar reward signal (e.g., 0-1 score)
    PREFERENCE = "preference"  # Pairwise preference (A > B)
    DEMONSTRATION = "demonstration"  # Expert demonstration signal
    FEEDBACK = "feedback"  # Human or automated feedback
    METRIC = "metric"  # Continuous metric values
    EVENT = "event"  # Discrete events of interest


class SignalSource(str, Enum):
    """Source of the signal."""

    TRACE = "trace"  # Derived from trace analysis
    SCORE = "score"  # From evaluation scores
    ANNOTATION = "annotation"  # Human annotation
    EVALUATION = "evaluation"  # Automated evaluation
    COMPARISON = "comparison"  # Pairwise comparison result
    DERIVED = "derived"  # Derived/aggregated from other signals


class SignalGranularity(str, Enum):
    """Granularity of the signal."""

    TRACE = "trace"  # Trace-level signal
    SPAN = "span"  # Span-level signal
    STEP = "step"  # Individual step within execution
    COMPONENT = "component"  # Component-level (e.g., all retrieval spans)


class FeedbackCategory(str, Enum):
    """Feedback categories."""

    QUALITY = "quality"  # Overall quality
    CORRECTNESS = "correctness"  # Factual correctness
    HELPFULNESS = "helpfulness"  # How helpful the response was
    SAFETY = "safety"  # Safety/harmlessness
    EFFICIENCY = "efficiency"  # Resource efficiency
    STYLE = "style"  # Style/format
    OTHER = "other"


# =============================================================================
# Signal Data Classes
# =============================================================================


@dataclass
class Signal:
    """Base signal interface."""

    signal_id: str
    signal_type: SignalType
    source: SignalSource
    granularity: SignalGranularity
    timestamp: datetime
    trace_id: str
    span_id: str | None = None
    component_type: ComponentType | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class RewardSignal(Signal):
    """Reward signal for RLHF-style training."""

    value: float = 0.0
    reason: str | None = None
    terminal: bool = False
    discount: float | None = None

    def __post_init__(self) -> None:
        self.signal_type = SignalType.REWARD


@dataclass
class PreferenceSignal(Signal):
    """Preference signal for pairwise comparisons."""

    preferred_id: str = ""
    rejected_id: str = ""
    confidence: float = 0.0
    reason: str | None = None
    criteria: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.signal_type = SignalType.PREFERENCE


@dataclass
class DemonstrationAction:
    """Action in a demonstration."""

    action_type: Literal["tool_call", "generation", "decision", "other"]
    name: str
    input: str | None = None
    output: str | None = None
    parameters: dict[str, Any] | None = None


@dataclass
class DemonstrationSignal(Signal):
    """Demonstration signal for imitation learning."""

    action: DemonstrationAction | None = None
    state_before: dict[str, Any] | None = None
    state_after: dict[str, Any] | None = None
    is_expert: bool = True
    quality: float | None = None

    def __post_init__(self) -> None:
        self.signal_type = SignalType.DEMONSTRATION


@dataclass
class FeedbackSignal(Signal):
    """Feedback signal from human or automated evaluation."""

    category: FeedbackCategory = FeedbackCategory.OTHER
    rating: float | None = None
    text: str | None = None
    tags: list[str] = field(default_factory=list)
    is_human: bool = False
    author_id: str | None = None

    def __post_init__(self) -> None:
        self.signal_type = SignalType.FEEDBACK


@dataclass
class MetricSignal(Signal):
    """Metric signal for continuous measurements."""

    name: str = ""
    value: float = 0.0
    unit: str | None = None
    higher_is_better: bool = True
    threshold: float | None = None

    def __post_init__(self) -> None:
        self.signal_type = SignalType.METRIC


@dataclass
class EventSignal(Signal):
    """Event signal for discrete occurrences."""

    event_name: str = ""
    severity: Literal["info", "warning", "error", "critical"] = "info"
    data: dict[str, Any] = field(default_factory=dict)
    count: int | None = None

    def __post_init__(self) -> None:
        self.signal_type = SignalType.EVENT


# Union type for all signals
AnySignal = (
    RewardSignal
    | PreferenceSignal
    | DemonstrationSignal
    | FeedbackSignal
    | MetricSignal
    | EventSignal
)


@dataclass
class SignalBatch:
    """Signal batch for efficient processing."""

    batch_id: str
    project_id: str
    signals: list[AnySignal]
    created_at: datetime
    source: str


@dataclass
class SignalAggregation:
    """Aggregated signals summary."""

    signal_type: SignalType
    count: int
    mean: float | None = None
    std_dev: float | None = None
    min: float | None = None
    max: float | None = None
    by_source: dict[SignalSource, int] = field(default_factory=dict)
    by_granularity: dict[SignalGranularity, int] = field(default_factory=dict)
    time_range: tuple[datetime, datetime] | None = None


@dataclass
class SignalGeneratorConfig:
    """Configuration for signal generation."""

    name: str
    granularity: SignalGranularity
    description: str | None = None
    include_terminal_rewards: bool = True
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class SignalFilter:
    """Signal filter options."""

    signal_types: list[SignalType] | None = None
    sources: list[SignalSource] | None = None
    granularities: list[SignalGranularity] | None = None
    trace_ids: list[str] | None = None
    time_range: tuple[datetime | None, datetime | None] | None = None
    min_value: float | None = None
    max_value: float | None = None


@dataclass
class SignalContext:
    """Context for signal generation."""

    trace: TraceWithSpans
    expected: dict[str, Any] | None = None
    scores: list[dict[str, Any]] | None = None
    metadata: dict[str, Any] | None = None


@dataclass
class SignalGenerationResult:
    """Result of signal generation."""

    signals: list[AnySignal]
    warnings: list[str]
    stats: dict[str, Any]


# =============================================================================
# Helper Functions
# =============================================================================


def _generate_signal_id() -> str:
    """Generate a unique signal ID."""
    return f"sig_{uuid.uuid4()}"


def _flatten_spans(spans: list[SpanWithChildren]) -> list[SpanWithChildren]:
    """Flatten a span tree into a flat array."""
    result: list[SpanWithChildren] = []

    def traverse(span: SpanWithChildren) -> None:
        result.append(span)
        for child in span.children:
            traverse(child)

    for span in spans:
        traverse(span)

    return result


def _create_base_signal(
    signal_type: SignalType,
    source: SignalSource,
    granularity: SignalGranularity,
    trace_id: str,
    span_id: str | None = None,
    component_type: ComponentType | None = None,
) -> dict[str, Any]:
    """Create base signal fields."""
    return {
        "signal_id": _generate_signal_id(),
        "signal_type": signal_type,
        "source": source,
        "granularity": granularity,
        "timestamp": datetime.now(),
        "trace_id": trace_id,
        "span_id": span_id,
        "component_type": component_type,
        "metadata": {},
    }


# =============================================================================
# Reward Signal Config
# =============================================================================


@dataclass
class RewardSignalConfig(SignalGeneratorConfig):
    """Configuration for reward signal generation."""

    success_reward: float = 1.0
    failure_penalty: float = 0.0
    discount_factor: float = 0.99
    include_latency_reward: bool = False
    target_latency_ms: int = 5000
    include_token_efficiency: bool = False
    target_tokens: int = 1000


# =============================================================================
# Reward Signal Generation
# =============================================================================


def generate_reward_signals(
    context: SignalContext,
    config: RewardSignalConfig | None = None,
) -> list[RewardSignal]:
    """
    Generate reward signals from a trace.

    Creates reward signals at the configured granularity:
    - trace: Single reward for the entire trace
    - span: Rewards for each span
    - component: Rewards aggregated by component type

    Example:
        ```python
        signals = generate_reward_signals(context, RewardSignalConfig(
            name='task_completion',
            granularity=SignalGranularity.TRACE,
            success_reward=1.0,
            failure_penalty=-0.5,
        ))
        ```
    """
    if config is None:
        config = RewardSignalConfig(name="reward", granularity=SignalGranularity.TRACE)

    trace = context.trace
    signals: list[RewardSignal] = []
    flat_spans = _flatten_spans(trace.spans)

    if config.granularity == SignalGranularity.TRACE:
        # Single trace-level reward
        trace_status = trace.trace.status
        is_success = trace_status.value == "ok"

        value = config.success_reward if is_success else config.failure_penalty

        # Add latency component
        if config.include_latency_reward:
            latency_ratio = min(
                1, config.target_latency_ms / max(1, trace.trace.duration_ms)
            )
            value = value * 0.8 + latency_ratio * 0.2

        # Add token efficiency component
        if config.include_token_efficiency:
            total_tokens = (
                trace.trace.total_input_tokens + trace.trace.total_output_tokens
            )
            token_ratio = min(1, config.target_tokens / max(1, total_tokens))
            value = value * 0.8 + token_ratio * 0.2

        signals.append(
            RewardSignal(
                **_create_base_signal(
                    SignalType.REWARD,
                    SignalSource.TRACE,
                    SignalGranularity.TRACE,
                    trace.trace.trace_id,
                ),
                value=max(-1, min(1, value)),
                reason=(
                    "Trace completed successfully"
                    if is_success
                    else f"Trace failed: {trace_status}"
                ),
                terminal=True,
                discount=1.0,
            )
        )
        signals[-1].metadata = {
            "trace_status": trace_status.value,
            "duration_ms": trace.trace.duration_ms,
            "total_tokens": trace.trace.total_input_tokens
            + trace.trace.total_output_tokens,
        }

    elif config.granularity == SignalGranularity.SPAN:
        # Span-level rewards with discounting
        sorted_spans = sorted(flat_spans, key=lambda s: s.timestamp)

        for idx, span in enumerate(sorted_spans):
            is_last = idx == len(sorted_spans) - 1
            is_success = span.status.value != "error"
            discount = config.discount_factor ** (len(sorted_spans) - 1 - idx)

            value = config.success_reward if is_success else config.failure_penalty

            # Apply latency bonus for fast spans
            if (
                config.include_latency_reward
                and span.duration_ms < config.target_latency_ms / len(sorted_spans)
            ):
                value += 0.1

            signal = RewardSignal(
                **_create_base_signal(
                    SignalType.REWARD,
                    SignalSource.TRACE,
                    SignalGranularity.SPAN,
                    trace.trace.trace_id,
                    span.span_id,
                    span.component_type,
                ),
                value=max(-1, min(1, value * discount)),
                reason=(
                    f"Span {span.name} succeeded"
                    if is_success
                    else f"Span {span.name} failed: {span.status_message}"
                ),
                terminal=is_last,
                discount=discount,
            )
            signal.metadata = {
                "span_name": span.name,
                "span_type": span.span_type.value,
                "component_type": span.component_type.value if span.component_type else None,
                "status": span.status.value,
            }
            signals.append(signal)

    elif config.granularity == SignalGranularity.COMPONENT:
        # Component-level aggregated rewards
        component_spans: dict[str, list[SpanWithChildren]] = {}

        for span in flat_spans:
            comp_type = span.component_type.value if span.component_type else "untyped"
            if comp_type not in component_spans:
                component_spans[comp_type] = []
            component_spans[comp_type].append(span)

        for comp_type, spans in component_spans.items():
            success_count = sum(1 for s in spans if s.status.value != "error")
            success_rate = success_count / len(spans) if spans else 0
            avg_duration = sum(s.duration_ms for s in spans) / max(1, len(spans))

            value = (
                success_rate * config.success_reward
                + (1 - success_rate) * config.failure_penalty
            )

            signal = RewardSignal(
                **_create_base_signal(
                    SignalType.REWARD,
                    SignalSource.TRACE,
                    SignalGranularity.COMPONENT,
                    trace.trace.trace_id,
                    None,
                    ComponentType(comp_type) if comp_type != "untyped" else None,
                ),
                value=max(-1, min(1, value)),
                reason=f"Component {comp_type}: {success_count}/{len(spans)} spans succeeded",
                terminal=False,
            )
            signal.metadata = {
                "component_type": comp_type,
                "span_count": len(spans),
                "success_count": success_count,
                "success_rate": success_rate,
                "avg_duration_ms": avg_duration,
            }
            signals.append(signal)

    return signals


# =============================================================================
# Demonstration Signal Config and Generation
# =============================================================================


@dataclass
class DemonstrationSignalConfig(SignalGeneratorConfig):
    """Configuration for demonstration signal generation."""

    is_expert: bool = True
    span_types: list[str] = field(default_factory=lambda: ["tool", "generation"])
    include_state: bool = False


def generate_demonstration_signals(
    context: SignalContext,
    config: DemonstrationSignalConfig | None = None,
) -> list[DemonstrationSignal]:
    """
    Generate demonstration signals from trace spans.

    Creates demonstration signals for tool calls and generations,
    suitable for imitation learning.

    Example:
        ```python
        demos = generate_demonstration_signals(context, DemonstrationSignalConfig(
            name='expert_demos',
            granularity=SignalGranularity.SPAN,
            is_expert=True,
            span_types=['tool', 'generation'],
        ))
        ```
    """
    if config is None:
        config = DemonstrationSignalConfig(
            name="demonstration", granularity=SignalGranularity.SPAN
        )

    trace = context.trace
    signals: list[DemonstrationSignal] = []
    flat_spans = _flatten_spans(trace.spans)

    # Filter to relevant span types
    demo_spans = [s for s in flat_spans if s.span_type.value in config.span_types]

    for span in demo_spans:
        if span.span_type.value == "tool":
            action = DemonstrationAction(
                action_type="tool_call",
                name=span.tool_name or span.name,
                input=span.tool_input,
                output=span.tool_output,
                parameters=span.attributes,
            )
        elif span.span_type.value == "generation":
            action = DemonstrationAction(
                action_type="generation",
                name=span.model or span.name,
                input=span.input,
                output=span.output,
                parameters=span.model_parameters,
            )
        else:
            action = DemonstrationAction(
                action_type="other",
                name=span.name,
                input=span.input,
                output=span.output,
            )

        # Calculate quality based on status and duration
        if span.status.value == "error":
            quality = 0.0
        elif span.duration_ms < 1000:
            quality = 1.0
        else:
            quality = max(0.5, 1 - (span.duration_ms / 10000))

        signal = DemonstrationSignal(
            **_create_base_signal(
                SignalType.DEMONSTRATION,
                SignalSource.TRACE,
                SignalGranularity.SPAN,
                trace.trace.trace_id,
                span.span_id,
                span.component_type,
            ),
            action=action,
            state_before=(
                {"timestamp": span.timestamp.isoformat()} if config.include_state else None
            ),
            state_after=(
                {"timestamp": span.end_time.isoformat() if span.end_time else None, "status": span.status.value}
                if config.include_state
                else None
            ),
            is_expert=config.is_expert,
            quality=quality if config.is_expert else None,
        )
        signal.metadata = {
            "span_name": span.name,
            "span_type": span.span_type.value,
            "duration_ms": span.duration_ms,
        }
        signals.append(signal)

    return signals


# =============================================================================
# Metric Signal Config and Generation
# =============================================================================


@dataclass
class MetricSignalConfig(SignalGeneratorConfig):
    """Configuration for metric signals."""

    metrics: list[str] = field(
        default_factory=lambda: ["latency", "tokens", "cost", "tool_calls", "error_rate"]
    )


def generate_metric_signals(
    context: SignalContext,
    config: MetricSignalConfig | None = None,
) -> list[MetricSignal]:
    """
    Generate metric signals from trace data.

    Extracts common performance metrics from traces.

    Example:
        ```python
        metrics = generate_metric_signals(context, MetricSignalConfig(
            name='performance_metrics',
            granularity=SignalGranularity.TRACE,
            metrics=['latency', 'tokens', 'error_rate'],
        ))
        ```
    """
    if config is None:
        config = MetricSignalConfig(name="metrics", granularity=SignalGranularity.TRACE)

    trace = context.trace
    signals: list[MetricSignal] = []
    flat_spans = _flatten_spans(trace.spans)

    if config.granularity in (SignalGranularity.TRACE, SignalGranularity.STEP):
        if "latency" in config.metrics:
            signal = MetricSignal(
                **_create_base_signal(
                    SignalType.METRIC,
                    SignalSource.TRACE,
                    SignalGranularity.TRACE,
                    trace.trace.trace_id,
                ),
                name="latency_ms",
                value=float(trace.trace.duration_ms),
                unit="ms",
                higher_is_better=False,
            )
            signals.append(signal)

        if "tokens" in config.metrics:
            total_tokens = (
                trace.trace.total_input_tokens + trace.trace.total_output_tokens
            )
            signal = MetricSignal(
                **_create_base_signal(
                    SignalType.METRIC,
                    SignalSource.TRACE,
                    SignalGranularity.TRACE,
                    trace.trace.trace_id,
                ),
                name="total_tokens",
                value=float(total_tokens),
                unit="tokens",
                higher_is_better=False,
            )
            signal.metadata = {
                "input_tokens": trace.trace.total_input_tokens,
                "output_tokens": trace.trace.total_output_tokens,
            }
            signals.append(signal)

        if "cost" in config.metrics and trace.trace.total_cost_usd is not None:
            signal = MetricSignal(
                **_create_base_signal(
                    SignalType.METRIC,
                    SignalSource.TRACE,
                    SignalGranularity.TRACE,
                    trace.trace.trace_id,
                ),
                name="cost_usd",
                value=trace.trace.total_cost_usd,
                unit="USD",
                higher_is_better=False,
            )
            signals.append(signal)

        if "tool_calls" in config.metrics:
            signal = MetricSignal(
                **_create_base_signal(
                    SignalType.METRIC,
                    SignalSource.TRACE,
                    SignalGranularity.TRACE,
                    trace.trace.trace_id,
                ),
                name="tool_call_count",
                value=float(trace.trace.tool_call_count),
                unit="calls",
                higher_is_better=False,
            )
            signals.append(signal)

        if "error_rate" in config.metrics:
            error_spans = sum(1 for s in flat_spans if s.status.value == "error")
            error_rate = error_spans / len(flat_spans) if flat_spans else 0
            signal = MetricSignal(
                **_create_base_signal(
                    SignalType.METRIC,
                    SignalSource.TRACE,
                    SignalGranularity.TRACE,
                    trace.trace.trace_id,
                ),
                name="error_rate",
                value=error_rate,
                unit="ratio",
                higher_is_better=False,
                threshold=0.1,
            )
            signal.metadata = {
                "error_spans": error_spans,
                "total_spans": len(flat_spans),
            }
            signals.append(signal)

    return signals


# =============================================================================
# Event Signal Config and Generation
# =============================================================================


@dataclass
class EventSignalConfig(SignalGeneratorConfig):
    """Configuration for event signals."""

    event_types: list[str] = field(
        default_factory=lambda: ["error", "timeout", "retry", "fallback", "tool_error"]
    )


def generate_event_signals(
    context: SignalContext,
    config: EventSignalConfig | None = None,
) -> list[EventSignal]:
    """
    Generate event signals from trace spans.

    Detects and reports discrete events of interest.

    Example:
        ```python
        events = generate_event_signals(context, EventSignalConfig(
            name='error_events',
            granularity=SignalGranularity.SPAN,
            event_types=['error', 'timeout'],
        ))
        ```
    """
    if config is None:
        config = EventSignalConfig(name="events", granularity=SignalGranularity.SPAN)

    trace = context.trace
    signals: list[EventSignal] = []
    flat_spans = _flatten_spans(trace.spans)

    for span in flat_spans:
        # Detect error events
        if "error" in config.event_types and span.status.value == "error":
            signal = EventSignal(
                **_create_base_signal(
                    SignalType.EVENT,
                    SignalSource.TRACE,
                    SignalGranularity.SPAN,
                    trace.trace.trace_id,
                    span.span_id,
                    span.component_type,
                ),
                event_name="span_error",
                severity="error",
                data={
                    "span_name": span.name,
                    "status_message": span.status_message,
                    "span_type": span.span_type.value,
                },
            )
            signals.append(signal)

        # Detect tool errors specifically
        if (
            "tool_error" in config.event_types
            and span.span_type.value == "tool"
            and span.status.value == "error"
        ):
            signal = EventSignal(
                **_create_base_signal(
                    SignalType.EVENT,
                    SignalSource.TRACE,
                    SignalGranularity.SPAN,
                    trace.trace.trace_id,
                    span.span_id,
                    span.component_type,
                ),
                event_name="tool_error",
                severity="error",
                data={
                    "tool_name": span.tool_name,
                    "tool_input": span.tool_input,
                    "status_message": span.status_message,
                },
            )
            signals.append(signal)

        # Detect potential timeouts (long-running spans)
        if "timeout" in config.event_types and span.duration_ms > 30000:
            signal = EventSignal(
                **_create_base_signal(
                    SignalType.EVENT,
                    SignalSource.TRACE,
                    SignalGranularity.SPAN,
                    trace.trace.trace_id,
                    span.span_id,
                    span.component_type,
                ),
                event_name="potential_timeout",
                severity="warning",
                data={
                    "span_name": span.name,
                    "duration_ms": span.duration_ms,
                },
            )
            signals.append(signal)

        # Detect retry patterns
        if "retry" in config.event_types and (
            "retry" in span.name.lower()
            or span.attributes.get("retry.count") is not None
        ):
            signal = EventSignal(
                **_create_base_signal(
                    SignalType.EVENT,
                    SignalSource.TRACE,
                    SignalGranularity.SPAN,
                    trace.trace.trace_id,
                    span.span_id,
                    span.component_type,
                ),
                event_name="retry_detected",
                severity="info",
                data={
                    "span_name": span.name,
                    "retry_count": span.attributes.get("retry.count"),
                },
            )
            signals.append(signal)

    return signals


# =============================================================================
# Preference Signal Generation
# =============================================================================


@dataclass
class PreferenceSignalConfig:
    """Configuration for preference signal generation."""

    name: str
    criteria: list[str] = field(
        default_factory=lambda: ["success", "latency", "tokens"]
    )


def generate_preference_signal(
    context_a: SignalContext,
    context_b: SignalContext,
    config: PreferenceSignalConfig | None = None,
) -> PreferenceSignal:
    """
    Generate a preference signal from two traces.

    Compares two traces and generates a preference signal indicating
    which one is better based on the configured criteria.

    Example:
        ```python
        pref = generate_preference_signal(
            context_a,
            context_b,
            PreferenceSignalConfig(
                name='quality_comparison',
                criteria=['success', 'latency']
            )
        )
        ```
    """
    if config is None:
        config = PreferenceSignalConfig(name="preference")

    trace_a = context_a.trace
    trace_b = context_b.trace

    score_a = 0
    score_b = 0
    reasons: list[str] = []

    # Compare based on success
    if "success" in config.criteria:
        if trace_a.trace.status.value == "ok" and trace_b.trace.status.value != "ok":
            score_a += 2
            reasons.append("A succeeded while B failed")
        elif trace_b.trace.status.value == "ok" and trace_a.trace.status.value != "ok":
            score_b += 2
            reasons.append("B succeeded while A failed")

    # Compare based on latency
    if "latency" in config.criteria:
        if trace_a.trace.duration_ms < trace_b.trace.duration_ms * 0.9:
            score_a += 1
            reasons.append("A was faster")
        elif trace_b.trace.duration_ms < trace_a.trace.duration_ms * 0.9:
            score_b += 1
            reasons.append("B was faster")

    # Compare based on tokens
    if "tokens" in config.criteria:
        tokens_a = trace_a.trace.total_input_tokens + trace_a.trace.total_output_tokens
        tokens_b = trace_b.trace.total_input_tokens + trace_b.trace.total_output_tokens
        if tokens_a < tokens_b * 0.9:
            score_a += 1
            reasons.append("A used fewer tokens")
        elif tokens_b < tokens_a * 0.9:
            score_b += 1
            reasons.append("B used fewer tokens")

    # Compare based on cost
    if "cost" in config.criteria:
        cost_a = trace_a.trace.total_cost_usd
        cost_b = trace_b.trace.total_cost_usd
        if cost_a is not None and cost_b is not None:
            if cost_a < cost_b * 0.9:
                score_a += 1
                reasons.append("A was cheaper")
            elif cost_b < cost_a * 0.9:
                score_b += 1
                reasons.append("B was cheaper")

    is_a_preferred = score_a >= score_b
    total_score = score_a + score_b
    confidence = abs(score_a - score_b) / total_score if total_score > 0 else 0.5

    signal = PreferenceSignal(
        **_create_base_signal(
            SignalType.PREFERENCE,
            SignalSource.COMPARISON,
            SignalGranularity.TRACE,
            trace_a.trace.trace_id,
        ),
        preferred_id=(
            trace_a.trace.trace_id if is_a_preferred else trace_b.trace.trace_id
        ),
        rejected_id=(
            trace_b.trace.trace_id if is_a_preferred else trace_a.trace.trace_id
        ),
        confidence=min(1, confidence + 0.5),
        reason="; ".join(reasons) if reasons else "No significant differences",
        criteria=config.criteria,
    )
    signal.metadata = {
        "trace_a_id": trace_a.trace.trace_id,
        "trace_b_id": trace_b.trace.trace_id,
        "score_a": score_a,
        "score_b": score_b,
    }

    return signal


# =============================================================================
# Comprehensive Signal Generation
# =============================================================================


@dataclass
class ComprehensiveSignalConfig:
    """Comprehensive signal generator configuration."""

    include_rewards: bool = True
    reward_config: RewardSignalConfig | None = None
    include_demonstrations: bool = False
    demonstration_config: DemonstrationSignalConfig | None = None
    include_metrics: bool = True
    metric_config: MetricSignalConfig | None = None
    include_events: bool = True
    event_config: EventSignalConfig | None = None


def generate_signals(
    context: SignalContext,
    config: ComprehensiveSignalConfig | None = None,
) -> SignalGenerationResult:
    """
    Generate comprehensive signals from a trace.

    Generates multiple signal types in a single call for convenience.

    Example:
        ```python
        result = generate_signals(context, ComprehensiveSignalConfig(
            include_rewards=True,
            include_metrics=True,
            include_events=True,
            reward_config=RewardSignalConfig(
                name='reward',
                granularity=SignalGranularity.TRACE,
                success_reward=1.0,
            ),
        ))
        ```
    """
    if config is None:
        config = ComprehensiveSignalConfig()

    import time

    start_time = time.time()
    signals: list[AnySignal] = []
    warnings: list[str] = []
    by_type: dict[str, int] = {}
    by_granularity: dict[str, int] = {}

    # Generate reward signals
    if config.include_rewards:
        try:
            reward_signals = generate_reward_signals(context, config.reward_config)
            signals.extend(reward_signals)
            by_type["reward"] = by_type.get("reward", 0) + len(reward_signals)
            for reward_sig in reward_signals:
                by_granularity[reward_sig.granularity.value] = (
                    by_granularity.get(reward_sig.granularity.value, 0) + 1
                )
        except Exception as err:
            warnings.append(f"Failed to generate reward signals: {err}")

    # Generate demonstration signals
    if config.include_demonstrations:
        try:
            demo_signals = generate_demonstration_signals(
                context, config.demonstration_config
            )
            signals.extend(demo_signals)
            by_type["demonstration"] = by_type.get("demonstration", 0) + len(
                demo_signals
            )
            for demo_sig in demo_signals:
                by_granularity[demo_sig.granularity.value] = (
                    by_granularity.get(demo_sig.granularity.value, 0) + 1
                )
        except Exception as err:
            warnings.append(f"Failed to generate demonstration signals: {err}")

    # Generate metric signals
    if config.include_metrics:
        try:
            metric_signals = generate_metric_signals(context, config.metric_config)
            signals.extend(metric_signals)
            by_type["metric"] = by_type.get("metric", 0) + len(metric_signals)
            for metric_sig in metric_signals:
                by_granularity[metric_sig.granularity.value] = (
                    by_granularity.get(metric_sig.granularity.value, 0) + 1
                )
        except Exception as err:
            warnings.append(f"Failed to generate metric signals: {err}")

    # Generate event signals
    if config.include_events:
        try:
            event_signals = generate_event_signals(context, config.event_config)
            signals.extend(event_signals)
            by_type["event"] = by_type.get("event", 0) + len(event_signals)
            for event_sig in event_signals:
                by_granularity[event_sig.granularity.value] = (
                    by_granularity.get(event_sig.granularity.value, 0) + 1
                )
        except Exception as err:
            warnings.append(f"Failed to generate event signals: {err}")

    return SignalGenerationResult(
        signals=signals,
        warnings=warnings,
        stats={
            "total_signals": len(signals),
            "by_type": by_type,
            "by_granularity": by_granularity,
            "generation_time_ms": int((time.time() - start_time) * 1000),
        },
    )


# =============================================================================
# Signal Filtering and Aggregation
# =============================================================================


def filter_signals(signals: list[AnySignal], filter_config: SignalFilter) -> list[AnySignal]:
    """Filter signals based on criteria."""
    result: list[AnySignal] = []

    for signal in signals:
        if (
            filter_config.signal_types
            and signal.signal_type not in filter_config.signal_types
        ):
            continue
        if filter_config.sources and signal.source not in filter_config.sources:
            continue
        if (
            filter_config.granularities
            and signal.granularity not in filter_config.granularities
        ):
            continue
        if filter_config.trace_ids and signal.trace_id not in filter_config.trace_ids:
            continue
        if filter_config.time_range:
            start, end = filter_config.time_range
            ts = signal.timestamp
            if start and ts < start:
                continue
            if end and ts > end:
                continue
        # Filter numeric signals by value
        if (
            (filter_config.min_value is not None or filter_config.max_value is not None)
            and hasattr(signal, "value")
            and isinstance(signal.value, (int, float))
        ):
            if (
                filter_config.min_value is not None
                and signal.value < filter_config.min_value
            ):
                continue
            if (
                filter_config.max_value is not None
                and signal.value > filter_config.max_value
            ):
                continue

        result.append(signal)

    return result


def aggregate_signals(signals: list[AnySignal]) -> list[SignalAggregation]:
    """Aggregate signals by type."""
    grouped: dict[SignalType, list[AnySignal]] = {}

    for signal in signals:
        if signal.signal_type not in grouped:
            grouped[signal.signal_type] = []
        grouped[signal.signal_type].append(signal)

    aggregations: list[SignalAggregation] = []

    for signal_type, type_signals in grouped.items():
        by_source: dict[SignalSource, int] = {}
        by_granularity: dict[SignalGranularity, int] = {}
        timestamps: list[float] = []
        values: list[float] = []

        for signal in type_signals:
            by_source[signal.source] = by_source.get(signal.source, 0) + 1
            by_granularity[signal.granularity] = (
                by_granularity.get(signal.granularity, 0) + 1
            )
            timestamps.append(signal.timestamp.timestamp())

            if hasattr(signal, "value") and isinstance(signal.value, (int, float)):
                values.append(float(signal.value))

        mean: float | None = None
        std_dev: float | None = None
        min_val: float | None = None
        max_val: float | None = None

        if values:
            mean = sum(values) / len(values)
            min_val = min(values)
            max_val = max(values)

            if len(values) > 1:
                variance = sum((v - mean) ** 2 for v in values) / len(values)
                std_dev = math.sqrt(variance)

        time_range = None
        if timestamps:
            time_range = (
                datetime.fromtimestamp(min(timestamps)),
                datetime.fromtimestamp(max(timestamps)),
            )

        aggregations.append(
            SignalAggregation(
                signal_type=signal_type,
                count=len(type_signals),
                mean=mean,
                std_dev=std_dev,
                min=min_val,
                max=max_val,
                by_source=by_source,
                by_granularity=by_granularity,
                time_range=time_range,
            )
        )

    return aggregations


def create_signal_batch(
    project_id: str,
    signals: list[AnySignal],
    source: str = "sdk",
) -> SignalBatch:
    """Create a signal batch from multiple signals."""
    return SignalBatch(
        batch_id=f"batch_{uuid.uuid4()}",
        project_id=project_id,
        signals=signals,
        created_at=datetime.now(),
        source=source,
    )


def to_rlhf_format(signals: list[AnySignal]) -> list[dict[str, Any]]:
    """
    Convert signals to training format for RLHF.

    Formats signals into a structure suitable for reinforcement learning
    from human feedback (RLHF) training.
    """
    result: list[dict[str, Any]] = []

    for signal in signals:
        base: dict[str, Any] = {
            "type": signal.signal_type.value,
            "trace_id": signal.trace_id,
            "data": {},
        }

        if isinstance(signal, RewardSignal):
            base["data"] = {
                "reward": signal.value,
                "terminal": signal.terminal,
                "reason": signal.reason,
            }
        elif isinstance(signal, PreferenceSignal):
            base["data"] = {
                "chosen": signal.preferred_id,
                "rejected": signal.rejected_id,
                "confidence": signal.confidence,
            }
        elif isinstance(signal, DemonstrationSignal):
            base["data"] = {
                "action": {
                    "type": signal.action.action_type if signal.action else None,
                    "name": signal.action.name if signal.action else None,
                    "input": signal.action.input if signal.action else None,
                    "output": signal.action.output if signal.action else None,
                },
                "is_expert": signal.is_expert,
                "quality": signal.quality,
            }
        elif isinstance(signal, MetricSignal):
            base["data"] = {
                "name": signal.name,
                "value": signal.value,
                "unit": signal.unit,
            }
        else:
            base["data"] = signal.metadata

        result.append(base)

    return result


__all__ = [
    # Types
    "SignalType",
    "SignalSource",
    "SignalGranularity",
    "FeedbackCategory",
    "Signal",
    "RewardSignal",
    "PreferenceSignal",
    "DemonstrationSignal",
    "DemonstrationAction",
    "FeedbackSignal",
    "MetricSignal",
    "EventSignal",
    "AnySignal",
    "SignalBatch",
    "SignalAggregation",
    "SignalGeneratorConfig",
    "SignalFilter",
    "SignalContext",
    "SignalGenerationResult",
    # Config types
    "RewardSignalConfig",
    "DemonstrationSignalConfig",
    "MetricSignalConfig",
    "EventSignalConfig",
    "PreferenceSignalConfig",
    "ComprehensiveSignalConfig",
    # Generation functions
    "generate_reward_signals",
    "generate_demonstration_signals",
    "generate_metric_signals",
    "generate_event_signals",
    "generate_preference_signal",
    "generate_signals",
    # Utility functions
    "filter_signals",
    "aggregate_signals",
    "create_signal_batch",
    "to_rlhf_format",
]
