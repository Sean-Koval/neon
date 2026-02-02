"""
Neon Tracer

A lightweight tracer that sends spans to Neon's API in OTLP format.
"""

import os
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any

import httpx

# Configuration
NEON_API_URL = os.getenv("NEON_API_URL", "http://localhost:3001")
NEON_PROJECT_ID = os.getenv("NEON_PROJECT_ID", "00000000-0000-0000-0000-000000000001")


@dataclass
class Span:
    """A span representing a unit of work."""

    trace_id: str
    span_id: str
    name: str
    start_time_ns: int
    parent_span_id: str | None = None
    end_time_ns: int | None = None
    attributes: dict[str, Any] = field(default_factory=dict)
    status_code: int = 0  # 0=unset, 1=ok, 2=error
    status_message: str = ""

    def to_otlp(self) -> dict:
        """Convert to OTLP span format."""
        attrs = []
        for key, value in self.attributes.items():
            if isinstance(value, bool):
                attrs.append({"key": key, "value": {"boolValue": value}})
            elif isinstance(value, int):
                attrs.append({"key": key, "value": {"intValue": str(value)}})
            elif isinstance(value, float):
                attrs.append({"key": key, "value": {"doubleValue": value}})
            else:
                attrs.append({"key": key, "value": {"stringValue": str(value)}})

        span_dict = {
            "traceId": self.trace_id,
            "spanId": self.span_id,
            "name": self.name,
            "startTimeUnixNano": str(self.start_time_ns),
            "attributes": attrs,
            "status": {"code": self.status_code, "message": self.status_message},
        }

        if self.parent_span_id:
            span_dict["parentSpanId"] = self.parent_span_id

        if self.end_time_ns:
            span_dict["endTimeUnixNano"] = str(self.end_time_ns)

        return span_dict


class NeonTracer:
    """Tracer that collects spans and sends them to Neon."""

    def __init__(
        self,
        api_url: str = NEON_API_URL,
        project_id: str = NEON_PROJECT_ID,
    ):
        self.api_url = api_url
        self.project_id = project_id
        self.spans: list[Span] = []
        self.current_trace_id: str | None = None
        self.current_span_id: str | None = None

    def _generate_id(self) -> str:
        """Generate a random ID (16 hex chars for span, 32 for trace)."""
        return uuid.uuid4().hex[:16]

    def _now_ns(self) -> int:
        """Get current time in nanoseconds."""
        return int(time.time() * 1e9)

    @contextmanager
    def trace(self, name: str):
        """Start a new trace context."""
        self.current_trace_id = uuid.uuid4().hex
        self.current_span_id = None
        self.spans = []

        print(f"\n{'='*60}")
        print(f"Starting trace: {name}")
        print(f"Trace ID: {self.current_trace_id}")
        print(f"{'='*60}\n")

        try:
            yield self
        finally:
            # Send all collected spans
            self._send_spans()
            self.current_trace_id = None

    @contextmanager
    def span(
        self,
        name: str,
        span_type: str = "span",
        attributes: dict[str, Any] | None = None,
    ):
        """Create a span within the current trace."""
        if not self.current_trace_id:
            raise RuntimeError("No active trace. Use tracer.trace() first.")

        span_id = self._generate_id()
        parent_span_id = self.current_span_id

        span = Span(
            trace_id=self.current_trace_id,
            span_id=span_id,
            name=name,
            start_time_ns=self._now_ns(),
            parent_span_id=parent_span_id,
            attributes=attributes or {},
        )

        # Set span type attribute
        if span_type == "generation":
            span.attributes["gen_ai.system"] = "langchain"
        elif span_type == "tool":
            span.attributes["tool.call.id"] = span_id

        # Push this span as current
        previous_span_id = self.current_span_id
        self.current_span_id = span_id

        try:
            yield span
            span.status_code = 1  # OK
        except Exception as e:
            span.status_code = 2  # Error
            span.status_message = str(e)
            raise
        finally:
            span.end_time_ns = self._now_ns()
            self.spans.append(span)
            self.current_span_id = previous_span_id

    def generation(
        self,
        name: str,
        model: str,
        input_text: str = "",
        output_text: str = "",
        input_tokens: int = 0,
        output_tokens: int = 0,
    ):
        """Create a generation span for LLM calls."""
        return self.span(
            name=name,
            span_type="generation",
            attributes={
                "gen_ai.request.model": model,
                "gen_ai.prompt": input_text[:1000],  # Truncate for storage
                "gen_ai.completion": output_text[:1000],
                "gen_ai.usage.input_tokens": input_tokens,
                "gen_ai.usage.output_tokens": output_tokens,
                "gen_ai.usage.total_tokens": input_tokens + output_tokens,
            },
        )

    def tool(
        self,
        name: str,
        tool_name: str,
        tool_input: str = "",
        tool_output: str = "",
    ):
        """Create a tool span for tool calls."""
        return self.span(
            name=name,
            span_type="tool",
            attributes={
                "tool.name": tool_name,
                "tool.input": tool_input[:1000],
                "tool.output": tool_output[:1000],
            },
        )

    def _send_spans(self):
        """Send collected spans to Neon API."""
        if not self.spans:
            print("No spans to send.")
            return

        # Build OTLP request
        otlp_request = {
            "resourceSpans": [
                {
                    "resource": {
                        "attributes": [
                            {"key": "service.name", "value": {"stringValue": "langgraph-agent"}},
                            {"key": "project.id", "value": {"stringValue": self.project_id}},
                        ]
                    },
                    "scopeSpans": [
                        {
                            "scope": {"name": "neon-tracer", "version": "0.1.0"},
                            "spans": [span.to_otlp() for span in self.spans],
                        }
                    ],
                }
            ]
        }

        # Send to Neon
        url = f"{self.api_url}/api/v1/traces"
        headers = {
            "Content-Type": "application/json",
            "x-project-id": self.project_id,
        }

        try:
            response = httpx.post(url, json=otlp_request, headers=headers, timeout=10.0)
            response.raise_for_status()
            result = response.json()
            print(f"\nSent {len(self.spans)} spans to Neon")
            print(f"  Traces: {result.get('traces', 0)}")
            print(f"  Spans: {result.get('spans', 0)}")
            print(f"  View at: {self.api_url}/traces/{self.current_trace_id}")
        except httpx.HTTPError as e:
            print(f"\nFailed to send spans to Neon: {e}")
            print("Make sure the Neon frontend is running (bun dev in frontend/)")


# Global tracer instance
tracer = NeonTracer()
