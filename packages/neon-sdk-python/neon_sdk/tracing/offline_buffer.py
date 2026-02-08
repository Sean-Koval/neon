"""Offline Tracing Buffer.

Provides durable span buffering for offline scenarios with configurable
flush strategies and file-based JSONL persistence.

Example:
    ```python
    from neon_sdk.tracing.offline_buffer import OfflineBuffer

    buffer = OfflineBuffer(
        max_size=1000,
        flush_interval=30.0,
        persist_path="~/.neon/buffer/spans.jsonl",
        on_flush=my_flush_callback,
    )

    buffer.add(span_data)
    await buffer.flush()
    await buffer.shutdown()
    ```
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

logger = logging.getLogger(__name__)


@dataclass
class BufferedSpan:
    """Span data structure for buffering."""

    span_id: str
    trace_id: str
    name: str
    start_time: str
    type: str = "span"
    parent_span_id: str | None = None
    component_type: str | None = None
    end_time: str | None = None
    duration_ms: float | None = None
    status: str = "unset"
    status_message: str | None = None
    attributes: dict[str, str | int | bool] = field(default_factory=dict)
    model: str | None = None
    input_text: str | None = None
    output_text: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    tool_name: str | None = None
    tool_input: str | None = None
    tool_output: str | None = None
    buffered_at: str = ""
    flush_attempts: int = 0

    def to_dict(self) -> dict[str, Any]:
        """Convert to dict for JSON serialization."""
        d: dict[str, Any] = {
            "spanId": self.span_id,
            "traceId": self.trace_id,
            "name": self.name,
            "startTime": self.start_time,
            "type": self.type,
            "status": self.status,
            "attributes": self.attributes,
            "bufferedAt": self.buffered_at,
            "flushAttempts": self.flush_attempts,
        }
        if self.parent_span_id:
            d["parentSpanId"] = self.parent_span_id
        if self.component_type:
            d["componentType"] = self.component_type
        if self.end_time:
            d["endTime"] = self.end_time
        if self.duration_ms is not None:
            d["durationMs"] = self.duration_ms
        if self.status_message:
            d["statusMessage"] = self.status_message
        if self.model:
            d["model"] = self.model
        if self.input_text:
            d["input"] = self.input_text
        if self.output_text:
            d["output"] = self.output_text
        if self.input_tokens is not None:
            d["inputTokens"] = self.input_tokens
        if self.output_tokens is not None:
            d["outputTokens"] = self.output_tokens
        if self.tool_name:
            d["toolName"] = self.tool_name
        if self.tool_input:
            d["toolInput"] = self.tool_input
        if self.tool_output:
            d["toolOutput"] = self.tool_output
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> BufferedSpan:
        """Create from dict (JSON deserialization)."""
        return cls(
            span_id=d["spanId"],
            trace_id=d["traceId"],
            name=d["name"],
            start_time=d["startTime"],
            type=d.get("type", "span"),
            parent_span_id=d.get("parentSpanId"),
            component_type=d.get("componentType"),
            end_time=d.get("endTime"),
            duration_ms=d.get("durationMs"),
            status=d.get("status", "unset"),
            status_message=d.get("statusMessage"),
            attributes=d.get("attributes", {}),
            model=d.get("model"),
            input_text=d.get("input"),
            output_text=d.get("output"),
            input_tokens=d.get("inputTokens"),
            output_tokens=d.get("outputTokens"),
            tool_name=d.get("toolName"),
            tool_input=d.get("toolInput"),
            tool_output=d.get("toolOutput"),
            buffered_at=d.get("bufferedAt", ""),
            flush_attempts=d.get("flushAttempts", 0),
        )


@dataclass
class FlushResult:
    """Result of a flush operation."""

    success: int = 0
    failed: int = 0
    failed_spans: list[BufferedSpan] = field(default_factory=list)
    error: str | None = None


@dataclass
class BufferStats:
    """Buffer statistics."""

    size: int = 0
    max_size: int = 0
    total_added: int = 0
    total_flushed: int = 0
    total_failed: int = 0
    is_persisted: bool = False
    last_flush_at: float | None = None
    last_error_at: float | None = None
    oldest_span_at: float | None = None
    pending_writes: int = 0


class FlushCallback(Protocol):
    """Protocol for flush callbacks."""

    async def __call__(self, spans: list[BufferedSpan]) -> FlushResult:
        """Flush the given spans, returning a result with success/failure counts."""
        ...


class OfflineBuffer:
    """Offline buffer for span data with JSONL persistence.

    Args:
        max_size: Maximum number of spans to buffer before auto-flush.
        flush_interval: Auto-flush interval in seconds.
        persist_path: Path for JSONL file persistence (None = memory only).
        max_retries: Maximum retry attempts per span.
        on_flush: Async callback for flushing spans.
        on_error: Callback for error handling.
        debug: Enable debug logging.
    """

    def __init__(
        self,
        max_size: int = 1000,
        flush_interval: float = 60.0,
        persist_path: str | None = None,
        max_retries: int = 3,
        on_flush: FlushCallback | None = None,
        on_error: Any = None,
        debug: bool = False,
    ) -> None:
        self._max_size = max_size
        self._flush_interval = flush_interval
        self._persist_path = (
            Path(os.path.expanduser(persist_path)) if persist_path else None
        )
        self._max_retries = max_retries
        self._on_flush = on_flush
        self._on_error = on_error
        self._debug = debug

        self._buffer: list[BufferedSpan] = []
        self._pending_writes: list[BufferedSpan] = []
        self._lock = asyncio.Lock()
        self._flush_task: asyncio.Task[None] | None = None
        self._is_shutting_down = False

        self._total_added = 0
        self._total_flushed = 0
        self._total_failed = 0
        self._last_flush_at: float | None = None
        self._last_error_at: float | None = None

        if debug:
            logger.setLevel(logging.DEBUG)

    async def initialize(self) -> None:
        """Initialize the buffer, loading persisted data from disk."""
        if self._persist_path:
            await self._load_from_disk()

    def start(self) -> None:
        """Start the background flush loop."""
        if self._flush_task is None:
            self._flush_task = asyncio.create_task(self._flush_loop())

    def add(self, span: BufferedSpan) -> None:
        """Add a span to the buffer.

        Args:
            span: Span data to buffer.
        """
        if self._is_shutting_down:
            return

        if not span.buffered_at:
            span.buffered_at = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

        self._buffer.append(span)
        self._total_added += 1

        if self._persist_path:
            self._pending_writes.append(span)

        self._log(f"Added span {span.span_id} to buffer (size: {len(self._buffer)})")

        if len(self._buffer) >= self._max_size:
            self._log("Buffer size limit reached, triggering flush")
            asyncio.get_event_loop().call_soon(
                lambda: asyncio.ensure_future(self.flush())
            )

    def add_batch(self, spans: list[BufferedSpan]) -> None:
        """Add multiple spans to the buffer."""
        for s in spans:
            self.add(s)

    async def flush(self) -> FlushResult:
        """Flush all buffered spans."""
        async with self._lock:
            return await self._flush_internal()

    async def _flush_internal(self) -> FlushResult:
        """Internal flush (must be called with lock held)."""
        if not self._buffer:
            return FlushResult()

        # Flush pending writes first
        await self._flush_pending_writes()

        spans_to_flush = list(self._buffer)
        self._buffer.clear()

        self._log(f"Flushing {len(spans_to_flush)} spans")

        try:
            if self._on_flush:
                result = await self._on_flush(spans_to_flush)
                self._last_flush_at = time.time()
                self._total_flushed += result.success
                self._total_failed += result.failed

                # Re-add failed spans for retry
                if result.failed_spans:
                    retriable = [
                        s for s in result.failed_spans
                        if s.flush_attempts < self._max_retries
                    ]
                    for s in retriable:
                        s.flush_attempts += 1
                    self._buffer.extend(retriable)

                    if self._persist_path and retriable:
                        await self._save_to_disk()

                if self._persist_path and result.failed == 0:
                    await self._clear_persisted_buffer()

                return result
            else:
                self._last_flush_at = time.time()
                self._total_flushed += len(spans_to_flush)
                if self._persist_path:
                    await self._clear_persisted_buffer()
                return FlushResult(success=len(spans_to_flush))

        except Exception as exc:
            for s in spans_to_flush:
                s.flush_attempts += 1

            retriable = [
                s for s in spans_to_flush
                if s.flush_attempts < self._max_retries
            ]
            dropped = [
                s for s in spans_to_flush
                if s.flush_attempts >= self._max_retries
            ]

            self._buffer.extend(retriable)
            self._total_failed += len(dropped)

            if self._persist_path and retriable:
                await self._save_to_disk()

            self._handle_error(exc, dropped)

            return FlushResult(
                failed=len(spans_to_flush),
                failed_spans=spans_to_flush,
                error=str(exc),
            )

    async def replay(self) -> FlushResult:
        """Replay spans from disk persistence."""
        if not self._persist_path:
            return FlushResult()
        await self._load_from_disk()
        if not self._buffer:
            return FlushResult()
        return await self.flush()

    def get_stats(self) -> BufferStats:
        """Get current buffer statistics."""
        oldest = self._buffer[0].buffered_at if self._buffer else None
        oldest_ts = None
        if oldest:
            try:
                import datetime

                dt = datetime.datetime.fromisoformat(oldest.replace("Z", "+00:00"))
                oldest_ts = dt.timestamp()
            except (ValueError, AttributeError):
                pass

        return BufferStats(
            size=len(self._buffer),
            max_size=self._max_size,
            total_added=self._total_added,
            total_flushed=self._total_flushed,
            total_failed=self._total_failed,
            is_persisted=self._persist_path is not None,
            last_flush_at=self._last_flush_at,
            last_error_at=self._last_error_at,
            oldest_span_at=oldest_ts,
            pending_writes=len(self._pending_writes),
        )

    async def clear(self) -> None:
        """Clear all buffered spans."""
        self._buffer.clear()
        self._pending_writes.clear()
        if self._persist_path:
            await self._clear_persisted_buffer()

    async def shutdown(self) -> None:
        """Gracefully shutdown the buffer."""
        self._is_shutting_down = True

        if self._flush_task:
            self._flush_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._flush_task

        # Flush pending writes
        if self._pending_writes:
            await self._flush_pending_writes()

        # Final flush
        if self._buffer:
            self._log("Flushing remaining spans before shutdown")
            try:
                await self.flush()
            except Exception as exc:
                self._log(f"Flush failed during shutdown: {exc}", level="error")

        # Save remaining to disk
        if self._persist_path and self._buffer:
            await self._save_to_disk()

        self._log("Buffer shutdown complete")

    # =========================================================================
    # Private Methods
    # =========================================================================

    async def _flush_loop(self) -> None:
        """Background flush loop."""
        while not self._is_shutting_down:
            await asyncio.sleep(self._flush_interval)
            try:
                if self._buffer:
                    await self.flush()
            except Exception:
                logger.exception("Error during auto-flush")

    async def _flush_pending_writes(self) -> None:
        """Flush pending writes to disk."""
        if not self._pending_writes or not self._persist_path:
            return

        writes = list(self._pending_writes)
        self._pending_writes.clear()

        if not writes:
            return

        try:
            self._persist_path.parent.mkdir(parents=True, exist_ok=True)
            content = "".join(json.dumps(s.to_dict()) + "\n" for s in writes)
            with self._persist_path.open("a") as f:
                f.write(content)
            self._log(f"Wrote {len(writes)} spans to disk")
        except OSError as exc:
            self._pending_writes.extend(writes)
            self._handle_error(exc)

    async def _load_from_disk(self) -> None:
        """Load buffered spans from disk."""
        if not self._persist_path or not self._persist_path.exists():
            return

        try:
            content = self._persist_path.read_text()
            lines = [line for line in content.strip().split("\n") if line]

            loaded = 0
            errors = 0
            for line in lines:
                try:
                    data = json.loads(line)
                    self._buffer.append(BufferedSpan.from_dict(data))
                    loaded += 1
                except (json.JSONDecodeError, KeyError):
                    errors += 1

            self._log(f"Loaded {loaded} spans from disk")
            if errors:
                self._log(f"Skipped {errors} corrupted lines", level="error")
        except OSError as exc:
            self._handle_error(exc)

    async def _save_to_disk(self) -> None:
        """Save all buffered spans to disk (full rewrite)."""
        if not self._persist_path:
            return

        try:
            self._persist_path.parent.mkdir(parents=True, exist_ok=True)
            content = "".join(json.dumps(s.to_dict()) + "\n" for s in self._buffer)
            self._persist_path.write_text(content)
            self._log(f"Saved {len(self._buffer)} spans to disk")
        except OSError as exc:
            self._handle_error(exc)

    async def _clear_persisted_buffer(self) -> None:
        """Remove the persisted buffer file."""
        if not self._persist_path or not self._persist_path.exists():
            return
        try:
            self._persist_path.unlink()
            self._log("Cleared persisted buffer")
        except OSError as exc:
            self._handle_error(exc)

    def _handle_error(
        self, error: Exception, spans: list[BufferedSpan] | None = None
    ) -> None:
        """Handle an error."""
        self._last_error_at = time.time()
        if self._on_error:
            self._on_error(error, spans)
        self._log(f"Error: {error}", level="error")

    def _log(self, message: str, level: str = "info") -> None:
        """Log a message if debug mode is enabled."""
        if self._debug:
            if level == "error":
                logger.error("[OfflineBuffer] %s", message)
            else:
                logger.debug("[OfflineBuffer] %s", message)


def is_buffer_healthy(buffer: OfflineBuffer) -> tuple[bool, list[str]]:
    """Check if the buffer is healthy.

    Args:
        buffer: The buffer to check.

    Returns:
        Tuple of (healthy, warnings).
    """
    stats = buffer.get_stats()
    warnings: list[str] = []

    fill_pct = stats.size / stats.max_size if stats.max_size else 0
    if fill_pct > 0.9:
        warnings.append(f"Buffer is {fill_pct * 100:.1f}% full ({stats.size}/{stats.max_size})")

    if stats.oldest_span_at:
        age_s = time.time() - stats.oldest_span_at
        if age_s > 300:
            warnings.append(f"Oldest span is {age_s / 60:.1f} minutes old")

    if stats.last_error_at:
        error_age = time.time() - stats.last_error_at
        if error_age < 60:
            warnings.append(f"Recent error occurred {error_age:.0f}s ago")

    total = stats.total_flushed + stats.total_failed
    if total > 10:
        fail_rate = stats.total_failed / total
        if fail_rate > 0.1:
            warnings.append(f"High failure rate: {fail_rate * 100:.1f}%")

    if stats.pending_writes > 100:
        warnings.append(f"{stats.pending_writes} writes pending")

    return (len(warnings) == 0, warnings)
