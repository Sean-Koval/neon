"""DSPy Integration.

Native Python integration for DSPy framework.
Provides callbacks, metrics extraction, and export for DSPy optimization.

DSPy is a framework for algorithmically optimizing LM prompts and weights.
See: https://github.com/stanfordnlp/dspy
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING, Any, Protocol, TypeVar, runtime_checkable

from neon_sdk.tracing import span, trace
from neon_sdk.types import SpanWithChildren, TraceWithSpans

if TYPE_CHECKING:
    pass


@runtime_checkable
class DSPyModuleProtocol(Protocol):
    """Protocol for DSPy module-like objects with a forward method."""

    def forward(self, *args: Any, **kwargs: Any) -> Any:
        """Forward method that DSPy modules implement."""
        ...


# =============================================================================
# Types
# =============================================================================


@dataclass
class DSPyExample:
    """A DSPy-compatible example derived from a trace.

    Maps to dspy.Example format with input/output fields.
    """

    inputs: dict[str, Any]
    outputs: dict[str, Any]
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dspy_example(self) -> Any:
        """Convert to a dspy.Example if DSPy is available.

        Returns:
            dspy.Example instance or dict if DSPy not installed
        """
        try:
            import dspy  # type: ignore[import-not-found]

            return dspy.Example(**self.inputs, **self.outputs).with_inputs(
                *self.inputs.keys()
            )
        except ImportError:
            return {**self.inputs, **self.outputs}


@dataclass
class DSPyDataset:
    """Collection of DSPy examples for training/evaluation."""

    examples: list[DSPyExample]
    name: str = ""
    description: str | None = None
    created_at: datetime = field(default_factory=datetime.now)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dspy_examples(self) -> list[Any]:
        """Convert all examples to dspy.Example format."""
        return [ex.to_dspy_example() for ex in self.examples]

    def split(
        self, train_ratio: float = 0.8
    ) -> tuple[list[Any], list[Any]]:
        """Split dataset into train and dev sets."""
        examples = self.to_dspy_examples()
        split_idx = int(len(examples) * train_ratio)
        return examples[:split_idx], examples[split_idx:]


@dataclass
class DSPyMetrics:
    """Metrics extracted from traces for DSPy optimization."""

    success_rate: float
    avg_latency_ms: float
    avg_tokens: int
    avg_cost_usd: float | None
    total_traces: int
    component_metrics: dict[str, dict[str, float]] = field(default_factory=dict)
    custom_metrics: dict[str, float] = field(default_factory=dict)

    def to_metric_fn(
        self, weights: dict[str, float] | None = None
    ) -> Callable[..., float]:
        """Create a DSPy metric function from these metrics.

        Args:
            weights: Optional weights for combining metrics

        Returns:
            A function suitable for dspy.evaluate or dspy.BootstrapFewShot
        """
        if weights is None:
            weights = {
                "success": 1.0,
                "latency": 0.1,
                "tokens": 0.1,
            }

        def metric_fn(example: Any, prediction: Any, trace_data: Any = None) -> float:
            # Base success score
            score = weights.get("success", 1.0) * self.success_rate

            # Latency bonus (lower is better)
            if self.avg_latency_ms > 0:
                latency_score = min(1.0, 1000 / self.avg_latency_ms)
                score += weights.get("latency", 0.1) * latency_score

            # Token efficiency bonus (lower is better)
            if self.avg_tokens > 0:
                token_score = min(1.0, 500 / self.avg_tokens)
                score += weights.get("tokens", 0.1) * token_score

            return min(1.0, score)

        return metric_fn


@dataclass
class DSPyModuleConfig:
    """Configuration for DSPy module wrapping."""

    trace_name: str = "dspy-module"
    capture_inputs: bool = True
    capture_outputs: bool = True
    capture_rationale: bool = True
    metadata: dict[str, Any] = field(default_factory=dict)


# =============================================================================
# Trace to Example Conversion
# =============================================================================


def trace_to_dspy_example(
    trace_data: TraceWithSpans,
    input_fields: list[str] | None = None,
    output_fields: list[str] | None = None,
    extract_from_metadata: bool = True,
) -> DSPyExample | None:
    """Convert a trace to a DSPy example.

    Args:
        trace_data: The trace to convert
        input_fields: Fields to extract as inputs (from trace metadata or first span)
        output_fields: Fields to extract as outputs (from last generation span)
        extract_from_metadata: Whether to extract fields from trace metadata

    Returns:
        DSPyExample if conversion successful, None otherwise

    Example:
        ```python
        example = trace_to_dspy_example(
            trace_data,
            input_fields=['question', 'context'],
            output_fields=['answer'],
        )
        if example:
            dspy_ex = example.to_dspy_example()
        ```
    """
    inputs: dict[str, Any] = {}
    outputs: dict[str, Any] = {}

    # Extract inputs from trace metadata if configured
    if extract_from_metadata and trace_data.trace.metadata:
        meta = trace_data.trace.metadata
        if input_fields:
            for field_name in input_fields:
                if field_name in meta:
                    inputs[field_name] = meta[field_name]
        else:
            # Try common input field names
            for key in ["question", "query", "input", "prompt", "context"]:
                if key in meta:
                    inputs[key] = meta[key]

    # Flatten spans to find generation spans
    def flatten(spans: list[SpanWithChildren]) -> list[SpanWithChildren]:
        result = []
        for s in spans:
            result.append(s)
            result.extend(flatten(s.children))
        return result

    all_spans = flatten(trace_data.spans)
    generation_spans = [s for s in all_spans if s.span_type.value == "generation"]

    # Extract input from first generation span if not found
    if not inputs and generation_spans:
        first_gen = generation_spans[0]
        if first_gen.input:
            inputs["input"] = first_gen.input

    # Extract output from last generation span
    if generation_spans:
        last_gen = generation_spans[-1]
        if output_fields:
            # Try to parse output as JSON for structured extraction
            if last_gen.output:
                try:
                    import json

                    parsed = json.loads(last_gen.output)
                    if isinstance(parsed, dict):
                        for field_name in output_fields:
                            if field_name in parsed:
                                outputs[field_name] = parsed[field_name]
                except (json.JSONDecodeError, TypeError):
                    outputs["output"] = last_gen.output
        else:
            if last_gen.output:
                outputs["output"] = last_gen.output

    # Check for rationale/reasoning in intermediate spans
    reasoning_spans = [
        s for s in all_spans if s.component_type and s.component_type.value == "reasoning"
    ]
    if reasoning_spans:
        rationales = [s.output for s in reasoning_spans if s.output]
        if rationales:
            outputs["rationale"] = "\n".join(rationales)

    if not inputs and not outputs:
        return None

    return DSPyExample(
        inputs=inputs,
        outputs=outputs,
        metadata={
            "trace_id": trace_data.trace.trace_id,
            "success": trace_data.trace.status.value == "ok",
            "duration_ms": trace_data.trace.duration_ms,
            "agent_id": trace_data.trace.agent_id,
        },
    )


def create_dspy_dataset(
    traces: list[TraceWithSpans],
    name: str = "neon-traces",
    input_fields: list[str] | None = None,
    output_fields: list[str] | None = None,
    success_only: bool = True,
) -> DSPyDataset:
    """Create a DSPy dataset from multiple traces.

    Args:
        traces: List of traces to convert
        name: Dataset name
        input_fields: Fields to extract as inputs
        output_fields: Fields to extract as outputs
        success_only: Only include successful traces

    Returns:
        DSPyDataset ready for use with DSPy optimizers

    Example:
        ```python
        dataset = create_dspy_dataset(
            traces,
            name='qa-examples',
            input_fields=['question'],
            output_fields=['answer'],
            success_only=True,
        )

        # Use with DSPy
        trainset, devset = dataset.split(train_ratio=0.8)
        optimizer = dspy.BootstrapFewShot(metric=my_metric)
        compiled_program = optimizer.compile(my_program, trainset=trainset)
        ```
    """
    examples: list[DSPyExample] = []

    for trace_data in traces:
        # Filter by success if configured
        if success_only and trace_data.trace.status.value != "ok":
            continue

        example = trace_to_dspy_example(
            trace_data, input_fields=input_fields, output_fields=output_fields
        )
        if example:
            examples.append(example)

    return DSPyDataset(
        examples=examples,
        name=name,
        description=f"Dataset created from {len(traces)} traces, {len(examples)} examples extracted",
        metadata={
            "source_traces": len(traces),
            "success_only": success_only,
            "input_fields": input_fields,
            "output_fields": output_fields,
        },
    )


# =============================================================================
# Metrics Extraction
# =============================================================================


def extract_dspy_metrics(
    traces: list[TraceWithSpans],
    custom_extractors: dict[str, Callable[[TraceWithSpans], float]] | None = None,
) -> DSPyMetrics:
    """Extract metrics from traces for DSPy optimization.

    Args:
        traces: List of traces to analyze
        custom_extractors: Optional custom metric extractors

    Returns:
        DSPyMetrics with aggregated statistics

    Example:
        ```python
        metrics = extract_dspy_metrics(traces)

        # Use as DSPy metric function
        metric_fn = metrics.to_metric_fn(weights={
            'success': 1.0,
            'latency': 0.2,
            'tokens': 0.1,
        })

        evaluator = dspy.Evaluate(devset=devset, metric=metric_fn)
        evaluator(my_program)
        ```
    """
    if not traces:
        return DSPyMetrics(
            success_rate=0,
            avg_latency_ms=0,
            avg_tokens=0,
            avg_cost_usd=None,
            total_traces=0,
        )

    success_count = sum(1 for t in traces if t.trace.status.value == "ok")
    total_latency = sum(t.trace.duration_ms for t in traces)
    total_tokens = sum(
        t.trace.total_input_tokens + t.trace.total_output_tokens for t in traces
    )
    costs = [t.trace.total_cost_usd for t in traces if t.trace.total_cost_usd is not None]

    # Component-level metrics
    component_metrics: dict[str, dict[str, float]] = {}

    def flatten(spans: list[SpanWithChildren]) -> list[SpanWithChildren]:
        result = []
        for s in spans:
            result.append(s)
            result.extend(flatten(s.children))
        return result

    for trace_data in traces:
        all_spans = flatten(trace_data.spans)
        for s in all_spans:
            comp_type = s.component_type.value if s.component_type else "other"
            if comp_type not in component_metrics:
                component_metrics[comp_type] = {
                    "count": 0,
                    "total_duration_ms": 0,
                    "success_count": 0,
                }
            component_metrics[comp_type]["count"] += 1
            component_metrics[comp_type]["total_duration_ms"] += s.duration_ms
            if s.status.value != "error":
                component_metrics[comp_type]["success_count"] += 1

    # Calculate averages for components
    for comp_type in component_metrics:
        count = component_metrics[comp_type]["count"]
        if count > 0:
            component_metrics[comp_type]["avg_duration_ms"] = (
                component_metrics[comp_type]["total_duration_ms"] / count
            )
            component_metrics[comp_type]["success_rate"] = (
                component_metrics[comp_type]["success_count"] / count
            )

    # Custom metrics
    custom_metrics: dict[str, float] = {}
    if custom_extractors:
        for metric_name, extractor in custom_extractors.items():
            values = [extractor(t) for t in traces]
            custom_metrics[metric_name] = sum(values) / len(values) if values else 0

    return DSPyMetrics(
        success_rate=success_count / len(traces),
        avg_latency_ms=total_latency / len(traces),
        avg_tokens=int(total_tokens / len(traces)),
        avg_cost_usd=sum(costs) / len(costs) if costs else None,
        total_traces=len(traces),
        component_metrics=component_metrics,
        custom_metrics=custom_metrics,
    )


# =============================================================================
# DSPy Module Wrapper / Callback
# =============================================================================


T = TypeVar("T")


class NeonDSPyCallback:
    """Callback for integrating Neon tracing with DSPy modules.

    Wraps DSPy module execution with Neon traces and spans.

    Example:
        ```python
        import dspy

        # Create callback
        callback = NeonDSPyCallback(trace_name='qa-agent')

        # Wrap a DSPy module
        class MyQA(dspy.Module):
            def __init__(self):
                self.generate = dspy.ChainOfThought('question -> answer')

            def forward(self, question):
                return self.generate(question=question)

        qa = MyQA()
        wrapped_qa = callback.wrap(qa)

        # Use wrapped module - traces automatically captured
        result = wrapped_qa(question='What is DSPy?')
        ```
    """

    def __init__(
        self,
        trace_name: str = "dspy-module",
        capture_inputs: bool = True,
        capture_outputs: bool = True,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        self.trace_name = trace_name
        self.capture_inputs = capture_inputs
        self.capture_outputs = capture_outputs
        self.metadata = metadata or {}

    def wrap(self, module: T) -> T:
        """Wrap a DSPy module with Neon tracing.

        Args:
            module: DSPy module to wrap

        Returns:
            Wrapped module with the same interface
        """
        original_forward = getattr(module, "forward", None)
        if not original_forward:
            return module

        callback = self

        def traced_forward(*args: Any, **kwargs: Any) -> Any:
            with (
                trace(callback.trace_name, metadata=callback.metadata),
                span("dspy-forward", span_type="generation"),
            ):
                result = original_forward(*args, **kwargs)
                return result

        module.forward = traced_forward  # type: ignore[attr-defined]
        return module

    def __call__(self, module: T) -> T:
        """Decorator-style usage."""
        return self.wrap(module)


def neon_dspy_callback(
    trace_name: str = "dspy-module",
    capture_inputs: bool = True,
    capture_outputs: bool = True,
    metadata: dict[str, Any] | None = None,
) -> NeonDSPyCallback:
    """Create a Neon callback for DSPy module tracing.

    Args:
        trace_name: Name for the trace
        capture_inputs: Whether to capture input arguments
        capture_outputs: Whether to capture output results
        metadata: Additional metadata to attach

    Returns:
        NeonDSPyCallback instance

    Example:
        ```python
        callback = neon_dspy_callback(trace_name='qa-agent')

        @callback
        class MyModule(dspy.Module):
            ...
        ```
    """
    return NeonDSPyCallback(
        trace_name=trace_name,
        capture_inputs=capture_inputs,
        capture_outputs=capture_outputs,
        metadata=metadata,
    )


def create_dspy_teleprompter_metric(
    success_weight: float = 1.0,
    latency_weight: float = 0.1,
    token_weight: float = 0.1,
    reference_traces: list[TraceWithSpans] | None = None,
) -> Callable[..., float]:
    """Create a metric function for DSPy teleprompters (optimizers).

    This metric combines multiple factors for holistic evaluation.

    Args:
        success_weight: Weight for success/correctness
        latency_weight: Weight for latency (lower is better)
        token_weight: Weight for token efficiency
        reference_traces: Optional traces to compute baseline metrics

    Returns:
        Metric function compatible with DSPy optimizers

    Example:
        ```python
        metric = create_dspy_teleprompter_metric(
            success_weight=1.0,
            latency_weight=0.2,
            reference_traces=baseline_traces,
        )

        optimizer = dspy.BootstrapFewShot(metric=metric, max_bootstrapped_demos=4)
        compiled = optimizer.compile(my_program, trainset=trainset)
        ```
    """
    # Compute baseline if traces provided
    baseline_latency: float = 1000.0  # default 1 second
    baseline_tokens: float = 500.0  # default

    if reference_traces:
        metrics = extract_dspy_metrics(reference_traces)
        baseline_latency = max(1.0, metrics.avg_latency_ms)
        baseline_tokens = max(1.0, float(metrics.avg_tokens))

    def metric_fn(example: Any, prediction: Any, trace_data: Any = None) -> float:
        score = 0.0

        # Success score (check if prediction matches expected)
        if hasattr(example, "answer") and hasattr(prediction, "answer"):
            if example.answer.lower().strip() in prediction.answer.lower():
                score += success_weight
            else:
                score += success_weight * 0.5  # Partial credit

        elif hasattr(prediction, "answer"):
            # No ground truth, give full credit for generating answer
            score += success_weight

        # Latency bonus (from trace metadata if available)
        if trace_data and hasattr(trace_data, "duration_ms"):
            latency_ratio = min(1.0, baseline_latency / max(1, trace_data.duration_ms))
            score += latency_weight * latency_ratio

        # Token efficiency (from trace metadata if available)
        if trace_data and hasattr(trace_data, "total_tokens"):
            token_ratio = min(1.0, baseline_tokens / max(1, trace_data.total_tokens))
            score += token_weight * token_ratio

        return min(1.0, max(0.0, score))

    return metric_fn


__all__ = [
    # Types
    "DSPyExample",
    "DSPyDataset",
    "DSPyMetrics",
    "DSPyModuleConfig",
    # Functions
    "trace_to_dspy_example",
    "create_dspy_dataset",
    "extract_dspy_metrics",
    # Callback
    "NeonDSPyCallback",
    "neon_dspy_callback",
    "create_dspy_teleprompter_metric",
]
