"""Tests for tracing exporter behavior."""

import re

from neon_sdk.tracing.exporter import (
    ExportFilterConfig,
    ExportFilterRule,
    ExportMaskingConfig,
    ExportSamplingConfig,
    ExportSpan,
    _should_filter_span,
    _should_sample_span,
    _span_to_otlp,
)


class TestExporterMasking:
    """Tests for exporter-side masking."""

    def test_masks_prompt_completion_and_tool_fields(self) -> None:
        span = ExportSpan(
            trace_id="trace-1",
            span_id="span-1",
            name="masked-span",
            start_time_ns=1,
            end_time_ns=2,
            input_text="email test@example.com",
            output_text="ssn 123-45-6789",
            tool_input='{"token":"sk_test_1234567890abcdefghijkl"}',
            tool_output="contact tool@example.com",
        )

        otlp = _span_to_otlp(
            span,
            ExportMaskingConfig(enabled=True),
        )
        attr_map = {
            attr["key"]: (
                attr["value"].get("stringValue")
                or attr["value"].get("intValue")
                or attr["value"].get("boolValue")
            )
            for attr in otlp["attributes"]
        }

        assert "[REDACTED:email]" in attr_map["gen_ai.prompt"]
        assert "[REDACTED:ssn]" in attr_map["gen_ai.completion"]
        assert "[REDACTED:api_key]" in attr_map["tool.input"]
        assert "[REDACTED:email]" in attr_map["tool.output"]


class TestExporterSamplingAndFiltering:
    """Tests for exporter-side sampling and filtering."""

    def test_samples_out_when_project_rate_is_zero(self) -> None:
        span = ExportSpan(
            trace_id="trace-drop",
            span_id="span-drop",
            name="sampled-out",
            start_time_ns=1,
        )

        assert _should_sample_span(
            span,
            ExportSamplingConfig(enabled=True, rate=0.0),
            "project-a",
        )

    def test_keeps_when_project_override_is_full_rate(self) -> None:
        span = ExportSpan(
            trace_id="trace-keep",
            span_id="span-keep",
            name="sampled-in",
            start_time_ns=1,
        )

        assert not _should_sample_span(
            span,
            ExportSamplingConfig(
                enabled=True,
                rate=0.0,
                project_rates={"project-a": 1.0},
            ),
            "project-a",
        )

    def test_filters_noisy_spans_but_preserves_root_and_error_spans(self) -> None:
        root_span = ExportSpan(
            trace_id="trace-1",
            span_id="root",
            name="healthcheck root",
            start_time_ns=1,
            span_type="event",
        )
        child_span = ExportSpan(
            trace_id="trace-1",
            span_id="child",
            parent_span_id="root",
            name="healthcheck child",
            start_time_ns=2,
            span_type="event",
        )
        error_span = ExportSpan(
            trace_id="trace-1",
            span_id="error-child",
            parent_span_id="root",
            name="healthcheck failed",
            start_time_ns=3,
            span_type="event",
            status="error",
            attributes={"http.route": "/health"},
        )

        filtering = ExportFilterConfig(
            enabled=True,
            exclude_span_types=frozenset({"event"}),
            exclude_names=(re.compile("healthcheck", re.IGNORECASE),),
            exclude_attributes=(ExportFilterRule(key="http.route", value="/health"),),
        )

        assert not _should_filter_span(root_span, filtering)
        assert _should_filter_span(child_span, filtering)
        assert not _should_filter_span(error_span, filtering)
