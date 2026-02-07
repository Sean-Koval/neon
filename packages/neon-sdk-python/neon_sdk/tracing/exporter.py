"""NeonExporter - OTLP-compatible span exporter for Neon platform.

Exports spans to the Neon API or OTel Collector using the OTLP HTTP
protocol with batching and offline resilience.

Example:
    ```python
    from neon_sdk.tracing.exporter import NeonExporter

    exporter = NeonExporter(
        api_url="http://localhost:4318",
        api_key="my-api-key",
        batch_size=100,
        flush_interval=10.0,
    )

    exporter.add_span(span_data)
    await exporter.shutdown()
    ```
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger(__name__)


@dataclass
class ExportSpan:
    """Span data for export."""

    trace_id: str
    span_id: str
    name: str
    start_time_ns: int
    end_time_ns: int | None = None
    parent_span_id: str | None = None
    status: str = "unset"
    status_message: str = ""
    attributes: dict[str, str | int | bool] = field(default_factory=dict)
    span_type: str = "span"
    component_type: str | None = None
    model: str | None = None
    input_text: str | None = None
    output_text: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    tool_name: str | None = None
    tool_input: str | None = None
    tool_output: str | None = None


def _status_code(status: str) -> int:
    """Map status string to OTLP status code."""
    if status == "ok":
        return 1
    if status == "error":
        return 2
    return 0


def _to_otlp_attributes(attrs: dict[str, str | int | bool]) -> list[dict[str, Any]]:
    """Convert attributes dict to OTLP attribute format."""
    result: list[dict[str, Any]] = []
    for key, value in attrs.items():
        if isinstance(value, bool):
            result.append({"key": key, "value": {"boolValue": value}})
        elif isinstance(value, int):
            result.append({"key": key, "value": {"intValue": str(value)}})
        else:
            result.append({"key": key, "value": {"stringValue": str(value)}})
    return result


def _span_to_otlp(span: ExportSpan) -> dict[str, Any]:
    """Convert an ExportSpan to OTLP JSON format."""
    attrs: dict[str, str | int | bool] = dict(span.attributes)

    if span.model:
        attrs["gen_ai.request.model"] = span.model
    if span.input_text:
        attrs["gen_ai.prompt"] = span.input_text
    if span.output_text:
        attrs["gen_ai.completion"] = span.output_text
    if span.input_tokens is not None:
        attrs["gen_ai.usage.input_tokens"] = span.input_tokens
    if span.output_tokens is not None:
        attrs["gen_ai.usage.output_tokens"] = span.output_tokens
    if span.tool_name:
        attrs["tool.name"] = span.tool_name
    if span.tool_input:
        attrs["tool.input"] = span.tool_input
    if span.tool_output:
        attrs["tool.output"] = span.tool_output
    if span.span_type:
        attrs["neon.span_type"] = span.span_type
    if span.component_type:
        attrs["neon.component_type"] = span.component_type

    result: dict[str, Any] = {
        "traceId": span.trace_id,
        "spanId": span.span_id,
        "name": span.name,
        "kind": 0,
        "startTimeUnixNano": str(span.start_time_ns),
        "attributes": _to_otlp_attributes(attrs),
        "status": {
            "code": _status_code(span.status),
        },
    }

    if span.parent_span_id:
        result["parentSpanId"] = span.parent_span_id
    if span.end_time_ns is not None:
        result["endTimeUnixNano"] = str(span.end_time_ns)
    if span.status_message:
        result["status"]["message"] = span.status_message

    return result


class NeonExporter:
    """OTLP HTTP span exporter for Neon platform.

    Buffers spans in memory and flushes them in batches to the
    configured OTLP endpoint (Neon API or OTel Collector).

    Args:
        api_url: Neon API or OTel Collector endpoint URL.
        api_key: API key for authentication (optional for local collector).
        project_id: Project/workspace ID for multi-tenant routing.
        batch_size: Maximum spans per export batch (default: 100).
        flush_interval: Auto-flush interval in seconds (default: 10.0).
        max_retries: Maximum retry attempts per batch (default: 3).
        debug: Enable debug logging (default: False).
    """

    def __init__(
        self,
        api_url: str,
        api_key: str | None = None,
        project_id: str | None = None,
        batch_size: int = 100,
        flush_interval: float = 10.0,
        max_retries: int = 3,
        debug: bool = False,
    ) -> None:
        self._api_url = api_url.rstrip("/")
        self._api_key = api_key
        self._project_id = project_id
        self._batch_size = batch_size
        self._flush_interval = flush_interval
        self._max_retries = max_retries
        self._debug = debug

        self._buffer: list[ExportSpan] = []
        self._lock = asyncio.Lock()
        self._flush_task: asyncio.Task[None] | None = None
        self._shutdown = False
        self._client: httpx.AsyncClient | None = None

        if debug:
            logger.setLevel(logging.DEBUG)

    async def start(self) -> None:
        """Start the exporter background flush loop."""
        self._client = httpx.AsyncClient(timeout=30.0)
        self._flush_task = asyncio.create_task(self._flush_loop())

    def add_span(self, span: ExportSpan) -> None:
        """Add a span to the export buffer.

        If the buffer exceeds batch_size, a flush is triggered.
        """
        if self._shutdown:
            return
        self._buffer.append(span)
        if len(self._buffer) >= self._batch_size:
            asyncio.get_event_loop().call_soon(
                lambda: asyncio.ensure_future(self.flush())
            )

    def add_spans(self, spans: list[ExportSpan]) -> None:
        """Add multiple spans to the export buffer."""
        for s in spans:
            self.add_span(s)

    async def flush(self) -> int:
        """Flush all buffered spans to the OTLP endpoint.

        Returns:
            Number of spans successfully exported.
        """
        async with self._lock:
            if not self._buffer:
                return 0

            spans = self._buffer[:]
            self._buffer.clear()

        return await self._export_batch(spans)

    async def shutdown(self) -> None:
        """Gracefully shutdown the exporter, flushing remaining spans."""
        self._shutdown = True

        if self._flush_task:
            self._flush_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._flush_task

        await self.flush()

        if self._client:
            await self._client.aclose()
            self._client = None

    async def _flush_loop(self) -> None:
        """Background loop that flushes at the configured interval."""
        while not self._shutdown:
            await asyncio.sleep(self._flush_interval)
            try:
                await self.flush()
            except Exception:
                logger.exception("Error during auto-flush")

    async def _export_batch(self, spans: list[ExportSpan]) -> int:
        """Export a batch of spans via OTLP HTTP."""
        if not spans:
            return 0

        otlp_spans = [_span_to_otlp(s) for s in spans]
        payload = {
            "resourceSpans": [
                {
                    "resource": {
                        "attributes": _to_otlp_attributes(
                            self._resource_attributes()
                        ),
                    },
                    "scopeSpans": [
                        {
                            "scope": {"name": "neon-sdk-python", "version": "0.1.0"},
                            "spans": otlp_spans,
                        }
                    ],
                }
            ]
        }

        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._api_key:
            headers["x-api-key"] = self._api_key
        if self._project_id:
            headers["x-workspace-id"] = self._project_id

        url = (
            self._api_url
            if self._api_url.endswith("/v1/traces")
            else f"{self._api_url}/v1/traces"
        )

        for attempt in range(self._max_retries):
            try:
                client = self._client or httpx.AsyncClient(timeout=30.0)
                response = await client.post(url, json=payload, headers=headers)
                response.raise_for_status()
                logger.debug("Exported %d spans successfully", len(spans))
                return len(spans)
            except httpx.HTTPStatusError as exc:
                logger.warning(
                    "Export attempt %d/%d failed (HTTP %d): %s",
                    attempt + 1,
                    self._max_retries,
                    exc.response.status_code,
                    exc.response.text,
                )
            except Exception:
                logger.warning(
                    "Export attempt %d/%d failed",
                    attempt + 1,
                    self._max_retries,
                    exc_info=True,
                )

            if attempt < self._max_retries - 1:
                await asyncio.sleep(2**attempt)

        logger.error("Failed to export %d spans after %d retries", len(spans), self._max_retries)
        return 0

    def _resource_attributes(self) -> dict[str, str | int | bool]:
        """Build resource attributes for the OTLP payload."""
        attrs: dict[str, str | int | bool] = {
            "service.name": "neon-sdk-python",
        }
        if self._project_id:
            attrs["neon.project_id"] = self._project_id
        return attrs


def create_neon_exporter(
    api_url: str,
    api_key: str | None = None,
    project_id: str | None = None,
    batch_size: int = 100,
    flush_interval: float = 10.0,
    max_retries: int = 3,
    debug: bool = False,
) -> NeonExporter:
    """Create a NeonExporter instance.

    Convenience factory function for creating exporters.

    Args:
        api_url: Neon API or OTel Collector endpoint URL.
        api_key: API key for authentication.
        project_id: Project/workspace ID.
        batch_size: Maximum spans per export batch.
        flush_interval: Auto-flush interval in seconds.
        max_retries: Maximum retry attempts per batch.
        debug: Enable debug logging.

    Returns:
        Configured NeonExporter instance.
    """
    return NeonExporter(
        api_url=api_url,
        api_key=api_key,
        project_id=project_id,
        batch_size=batch_size,
        flush_interval=flush_interval,
        max_retries=max_retries,
        debug=debug,
    )
