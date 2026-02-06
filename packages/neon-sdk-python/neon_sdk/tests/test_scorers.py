"""Tests for scorers."""

from datetime import UTC, datetime

from neon_sdk.scorers import (
    ContainsConfig,
    EvalContext,
    ExactMatchConfig,
    LatencyThresholds,
    ScorerConfig,
    ScoreResult,
    analyze_causality,
    causal_analysis_scorer,
    # Rule-based
    contains,
    define_scorer,
    error_rate_scorer,
    exact_match,
    json_match_scorer,
    latency_scorer,
    root_cause_scorer,
    scorer,
    success_scorer,
    tool_selection_scorer,
)
from neon_sdk.types import (
    ComponentType,
    ScoreDataType,
    SpanKind,
    SpanStatus,
    SpanType,
    SpanWithChildren,
    Trace,
    TraceStatus,
    TraceWithSpans,
)

# =============================================================================
# Test Fixtures
# =============================================================================


def create_span(
    name: str = "test-span",
    span_type: SpanType = SpanType.SPAN,
    status: SpanStatus = SpanStatus.OK,
    output: str | None = None,
    tool_name: str | None = None,
    component_type: ComponentType | None = None,
    children: list[SpanWithChildren] | None = None,
) -> SpanWithChildren:
    """Create a test span."""
    return SpanWithChildren(
        spanId=f"span-{name}",
        traceId="trace-1",
        projectId="project-1",
        name=name,
        kind=SpanKind.INTERNAL,
        spanType=span_type,
        componentType=component_type,
        timestamp=datetime.now(UTC),
        durationMs=100,
        status=status,
        output=output,
        toolName=tool_name,
        children=children or [],
    )


def create_trace(
    spans: list[SpanWithChildren] | None = None,
    status: TraceStatus = TraceStatus.OK,
    duration_ms: int = 1000,
) -> TraceWithSpans:
    """Create a test trace."""
    return TraceWithSpans(
        trace=Trace(
            traceId="trace-1",
            projectId="project-1",
            name="test-trace",
            timestamp=datetime.now(UTC),
            durationMs=duration_ms,
            status=status,
            metadata={},
            totalInputTokens=0,
            totalOutputTokens=0,
            toolCallCount=0,
            llmCallCount=0,
        ),
        spans=spans or [],
    )


def create_context(
    spans: list[SpanWithChildren] | None = None,
    expected: dict | None = None,
    **trace_kwargs,
) -> EvalContext:
    """Create a test evaluation context."""
    return EvalContext(
        trace=create_trace(spans, **trace_kwargs),
        expected=expected,
    )


# =============================================================================
# Test Define Scorer
# =============================================================================


class TestDefineScorer:
    """Tests for define_scorer."""

    def test_define_scorer(self) -> None:
        """Test defining a custom scorer."""
        custom = define_scorer(
            ScorerConfig(
                name="custom",
                description="A custom scorer",
                data_type=ScoreDataType.NUMERIC,
                evaluate=lambda ctx: ScoreResult(value=0.5, reason="Custom"),
            )
        )

        assert custom.name == "custom"
        assert custom.description == "A custom scorer"
        assert custom.data_type == ScoreDataType.NUMERIC

        ctx = create_context()
        result = custom.evaluate(ctx)
        assert result.value == 0.5
        assert result.reason == "Custom"

    def test_scorer_decorator(self) -> None:
        """Test @scorer decorator."""

        @scorer("decorated")
        def my_scorer(context: EvalContext) -> ScoreResult:
            return ScoreResult(value=1.0, reason="Decorated")

        assert my_scorer.name == "decorated"
        result = my_scorer.evaluate(create_context())
        assert result.value == 1.0


# =============================================================================
# Test Contains Scorer
# =============================================================================


class TestContainsScorer:
    """Tests for contains scorer."""

    def test_contains_single_string(self) -> None:
        """Test contains with single string."""
        scorer = contains("hello")
        ctx = create_context(
            spans=[create_span(span_type=SpanType.GENERATION, output="hello world")]
        )
        result = scorer.evaluate(ctx)
        assert result.value == 1.0

    def test_contains_list(self) -> None:
        """Test contains with list of strings."""
        scorer = contains(["hello", "world"])
        ctx = create_context(
            spans=[create_span(span_type=SpanType.GENERATION, output="hello world")]
        )
        result = scorer.evaluate(ctx)
        assert result.value == 1.0

    def test_contains_partial_match(self) -> None:
        """Test contains with partial match."""
        scorer = contains(["hello", "missing"])
        ctx = create_context(
            spans=[create_span(span_type=SpanType.GENERATION, output="hello world")]
        )
        result = scorer.evaluate(ctx)
        assert result.value == 0.5  # 1/2 matched

    def test_contains_case_insensitive(self) -> None:
        """Test contains is case insensitive by default."""
        scorer = contains("HELLO")
        ctx = create_context(
            spans=[create_span(span_type=SpanType.GENERATION, output="hello world")]
        )
        result = scorer.evaluate(ctx)
        assert result.value == 1.0

    def test_contains_case_sensitive(self) -> None:
        """Test contains with case sensitivity."""
        scorer = contains(ContainsConfig(expected="HELLO", case_sensitive=True))
        ctx = create_context(
            spans=[create_span(span_type=SpanType.GENERATION, output="hello world")]
        )
        result = scorer.evaluate(ctx)
        assert result.value == 0.0

    def test_contains_or_mode(self) -> None:
        """Test contains in OR mode."""
        scorer = contains(ContainsConfig(expected=["missing", "world"], match_all=False))
        ctx = create_context(
            spans=[create_span(span_type=SpanType.GENERATION, output="hello world")]
        )
        result = scorer.evaluate(ctx)
        assert result.value == 1.0  # "world" matched

    def test_contains_empty_output(self) -> None:
        """Test contains with empty output."""
        scorer = contains("hello")
        ctx = create_context(
            spans=[create_span(span_type=SpanType.GENERATION, output="")]
        )
        result = scorer.evaluate(ctx)
        assert result.value == 0.0


# =============================================================================
# Test Exact Match Scorer
# =============================================================================


class TestExactMatchScorer:
    """Tests for exact_match scorer."""

    def test_exact_match_success(self) -> None:
        """Test exact match success."""
        scorer = exact_match("hello world")
        ctx = create_context(
            spans=[create_span(span_type=SpanType.GENERATION, output="hello world")]
        )
        result = scorer.evaluate(ctx)
        assert result.value == 1.0

    def test_exact_match_failure(self) -> None:
        """Test exact match failure."""
        scorer = exact_match("hello world")
        ctx = create_context(
            spans=[create_span(span_type=SpanType.GENERATION, output="hello")]
        )
        result = scorer.evaluate(ctx)
        assert result.value == 0.0

    def test_exact_match_trims_whitespace(self) -> None:
        """Test exact match trims whitespace by default."""
        scorer = exact_match("hello")
        ctx = create_context(
            spans=[create_span(span_type=SpanType.GENERATION, output="  hello  ")]
        )
        result = scorer.evaluate(ctx)
        assert result.value == 1.0

    def test_exact_match_case_insensitive(self) -> None:
        """Test exact match case insensitive."""
        scorer = exact_match(ExactMatchConfig(expected="HELLO", case_sensitive=False))
        ctx = create_context(
            spans=[create_span(span_type=SpanType.GENERATION, output="hello")]
        )
        result = scorer.evaluate(ctx)
        assert result.value == 1.0

    def test_exact_match_normalize_whitespace(self) -> None:
        """Test exact match with whitespace normalization."""
        scorer = exact_match(ExactMatchConfig(expected="hello world", normalize_whitespace=True))
        ctx = create_context(
            spans=[create_span(span_type=SpanType.GENERATION, output="hello   world")]
        )
        result = scorer.evaluate(ctx)
        assert result.value == 1.0


# =============================================================================
# Test Tool Selection Scorer
# =============================================================================


class TestToolSelectionScorer:
    """Tests for tool_selection_scorer."""

    def test_tool_selection_all_called(self) -> None:
        """Test tool selection with all expected tools called."""
        scorer = tool_selection_scorer(["search", "calculate"])
        ctx = create_context(
            spans=[
                create_span("s1", span_type=SpanType.TOOL, tool_name="search"),
                create_span("s2", span_type=SpanType.TOOL, tool_name="calculate"),
            ]
        )
        result = scorer.evaluate(ctx)
        assert result.value == 1.0

    def test_tool_selection_partial(self) -> None:
        """Test tool selection with partial match."""
        scorer = tool_selection_scorer(["search", "calculate"])
        ctx = create_context(
            spans=[
                create_span("s1", span_type=SpanType.TOOL, tool_name="search"),
            ]
        )
        result = scorer.evaluate(ctx)
        assert result.value == 0.5


# =============================================================================
# Test JSON Match Scorer
# =============================================================================


class TestJsonMatchScorer:
    """Tests for json_match_scorer."""

    def test_json_match_success(self) -> None:
        """Test JSON match success."""
        scorer = json_match_scorer({"status": "ok", "count": 5})
        ctx = create_context(
            spans=[
                create_span(
                    span_type=SpanType.GENERATION,
                    output='{"status": "ok", "count": 5}',
                )
            ]
        )
        result = scorer.evaluate(ctx)
        assert result.value == 1.0

    def test_json_match_partial(self) -> None:
        """Test JSON match with extra fields (should still match)."""
        scorer = json_match_scorer({"status": "ok"})
        ctx = create_context(
            spans=[
                create_span(
                    span_type=SpanType.GENERATION,
                    output='{"status": "ok", "extra": "field"}',
                )
            ]
        )
        result = scorer.evaluate(ctx)
        assert result.value == 1.0

    def test_json_match_failure(self) -> None:
        """Test JSON match failure."""
        scorer = json_match_scorer({"status": "ok"})
        ctx = create_context(
            spans=[
                create_span(
                    span_type=SpanType.GENERATION,
                    output='{"status": "error"}',
                )
            ]
        )
        result = scorer.evaluate(ctx)
        assert result.value == 0.0

    def test_json_match_invalid_json(self) -> None:
        """Test JSON match with invalid JSON."""
        scorer = json_match_scorer({"status": "ok"})
        ctx = create_context(
            spans=[
                create_span(
                    span_type=SpanType.GENERATION,
                    output="not valid json",
                )
            ]
        )
        result = scorer.evaluate(ctx)
        assert result.value == 0.0


# =============================================================================
# Test Latency Scorer
# =============================================================================


class TestLatencyScorer:
    """Tests for latency_scorer."""

    def test_latency_excellent(self) -> None:
        """Test latency scorer with excellent latency."""
        scorer = latency_scorer()
        ctx = create_context(duration_ms=500)
        result = scorer.evaluate(ctx)
        assert result.value == 1.0

    def test_latency_good(self) -> None:
        """Test latency scorer with good latency."""
        scorer = latency_scorer()
        ctx = create_context(duration_ms=3000)
        result = scorer.evaluate(ctx)
        assert result.value == 0.8

    def test_latency_acceptable(self) -> None:
        """Test latency scorer with acceptable latency."""
        scorer = latency_scorer()
        ctx = create_context(duration_ms=7000)
        result = scorer.evaluate(ctx)
        assert result.value == 0.6

    def test_latency_poor(self) -> None:
        """Test latency scorer with poor latency."""
        scorer = latency_scorer()
        ctx = create_context(duration_ms=15000)
        result = scorer.evaluate(ctx)
        assert result.value == 0.4

    def test_latency_custom_thresholds(self) -> None:
        """Test latency scorer with custom thresholds."""
        scorer = latency_scorer(LatencyThresholds(excellent=100, good=500, acceptable=1000))
        ctx = create_context(duration_ms=300)
        result = scorer.evaluate(ctx)
        assert result.value == 0.8  # Between excellent and good


# =============================================================================
# Test Error Rate Scorer
# =============================================================================


class TestErrorRateScorer:
    """Tests for error_rate_scorer."""

    def test_error_rate_no_errors(self) -> None:
        """Test error rate with no errors."""
        scorer = error_rate_scorer()
        ctx = create_context(
            spans=[
                create_span("s1", status=SpanStatus.OK),
                create_span("s2", status=SpanStatus.OK),
            ]
        )
        result = scorer.evaluate(ctx)
        assert result.value == 1.0

    def test_error_rate_some_errors(self) -> None:
        """Test error rate with some errors."""
        scorer = error_rate_scorer()
        ctx = create_context(
            spans=[
                create_span("s1", status=SpanStatus.OK),
                create_span("s2", status=SpanStatus.ERROR),
            ]
        )
        result = scorer.evaluate(ctx)
        assert result.value == 0.5  # 1 error out of 2

    def test_error_rate_all_errors(self) -> None:
        """Test error rate with all errors."""
        scorer = error_rate_scorer()
        ctx = create_context(
            spans=[
                create_span("s1", status=SpanStatus.ERROR),
                create_span("s2", status=SpanStatus.ERROR),
            ]
        )
        result = scorer.evaluate(ctx)
        assert result.value == 0.0


# =============================================================================
# Test Success Scorer
# =============================================================================


class TestSuccessScorer:
    """Tests for success_scorer."""

    def test_success_ok(self) -> None:
        """Test success scorer with OK status."""
        scorer = success_scorer()
        ctx = create_context(status=TraceStatus.OK)
        result = scorer.evaluate(ctx)
        assert result.value == 1.0

    def test_success_error(self) -> None:
        """Test success scorer with error status."""
        scorer = success_scorer()
        ctx = create_context(status=TraceStatus.ERROR)
        result = scorer.evaluate(ctx)
        assert result.value == 0.0


# =============================================================================
# Test Causal Analysis
# =============================================================================


class TestCausalAnalysis:
    """Tests for causal analysis."""

    def test_no_errors(self) -> None:
        """Test causal analysis with no errors."""
        ctx = create_context(
            spans=[
                create_span("s1", status=SpanStatus.OK),
                create_span("s2", status=SpanStatus.OK),
            ]
        )
        result = analyze_causality(ctx)
        assert not result.has_errors
        assert result.root_cause is None
        assert len(result.causal_chain) == 0

    def test_single_error(self) -> None:
        """Test causal analysis with single error."""
        ctx = create_context(
            spans=[
                create_span("s1", status=SpanStatus.ERROR, component_type=ComponentType.RETRIEVAL),
            ]
        )
        result = analyze_causality(ctx)
        assert result.has_errors
        assert result.root_cause is not None
        assert result.root_cause.span_name == "s1"
        assert result.error_count == 1

    def test_causal_analysis_scorer(self) -> None:
        """Test causal analysis scorer."""
        scorer = causal_analysis_scorer()
        ctx = create_context(
            spans=[
                create_span("s1", status=SpanStatus.OK),
            ]
        )
        result = scorer.evaluate(ctx)
        assert result.value == 1.0  # No errors

    def test_root_cause_scorer(self) -> None:
        """Test root cause scorer."""
        scorer = root_cause_scorer()
        ctx = create_context(
            spans=[
                create_span("s1", status=SpanStatus.ERROR),
            ]
        )
        result = scorer.evaluate(ctx)
        assert result.value == 1.0  # Root cause identified
