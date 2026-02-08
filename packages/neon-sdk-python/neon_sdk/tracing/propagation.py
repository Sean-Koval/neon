"""W3C Trace Context Propagation.

Implements W3C Trace Context specification for distributed tracing.
See: https://www.w3.org/TR/trace-context/

Example:
    ```python
    from neon_sdk.tracing.propagation import inject_trace_context, extract_trace_context

    # Inject context into outgoing HTTP headers
    headers: dict[str, str] = {}
    inject_trace_context(headers)
    response = requests.get(url, headers=headers)

    # Extract context from incoming request headers
    ctx = extract_trace_context(request.headers)
    if ctx:
        with with_context(ctx):
            handle_request(request)
    ```
"""

from __future__ import annotations

import re

from neon_sdk.tracing import TraceContext, get_current_context

TRACEPARENT_HEADER = "traceparent"
TRACESTATE_HEADER = "tracestate"
VERSION = "00"
TRACE_FLAGS_SAMPLED = "01"
ZERO_PARENT = "0000000000000000"

_HEX_RE = re.compile(r"[^0-9a-fA-F]")


def _normalize_id(id_str: str, length: int) -> str:
    """Normalize an ID to a specific hex length."""
    hex_str = _HEX_RE.sub("", id_str)
    if len(hex_str) >= length:
        return hex_str[:length].lower()
    return hex_str.zfill(length).lower()


def inject_trace_context(headers: dict[str, str]) -> None:
    """Inject the current trace context into HTTP headers (W3C traceparent format).

    Modifies the headers dict in-place.

    Args:
        headers: HTTP headers dict to inject into.
    """
    ctx = get_current_context()
    if ctx is None:
        return

    trace_id = _normalize_id(ctx.trace_id, 32)
    parent_id = (
        _normalize_id(ctx.parent_span_id, 16)
        if ctx.parent_span_id
        else ZERO_PARENT
    )

    headers[TRACEPARENT_HEADER] = f"{VERSION}-{trace_id}-{parent_id}-{TRACE_FLAGS_SAMPLED}"


def extract_trace_context(headers: dict[str, str]) -> TraceContext | None:
    """Extract trace context from HTTP headers (W3C traceparent format).

    Returns None if no valid traceparent header is found.

    Args:
        headers: HTTP headers dict to extract from.

    Returns:
        TraceContext or None.
    """
    traceparent = (
        headers.get(TRACEPARENT_HEADER)
        or headers.get("Traceparent")
        or headers.get("TRACEPARENT")
    )
    if not traceparent:
        return None

    parts = traceparent.split("-")
    if len(parts) != 4:
        return None

    version, trace_id, parent_id, _flags = parts

    if version != "00":
        return None

    if len(trace_id) != 32 or len(parent_id) != 16:
        return None

    hex_32 = re.compile(r"^[0-9a-f]{32}$")
    hex_16 = re.compile(r"^[0-9a-f]{16}$")
    if not hex_32.match(trace_id) or not hex_16.match(parent_id):
        return None

    return TraceContext(
        trace_id=trace_id,
        parent_span_id=None if parent_id == ZERO_PARENT else parent_id,
    )


def format_traceparent(ctx: TraceContext) -> str:
    """Create a traceparent string from a TraceContext.

    Args:
        ctx: The trace context.

    Returns:
        W3C traceparent header value.
    """
    trace_id = _normalize_id(ctx.trace_id, 32)
    parent_id = (
        _normalize_id(ctx.parent_span_id, 16)
        if ctx.parent_span_id
        else ZERO_PARENT
    )
    return f"{VERSION}-{trace_id}-{parent_id}-{TRACE_FLAGS_SAMPLED}"


def parse_traceparent(
    traceparent: str,
) -> dict[str, str] | None:
    """Parse a traceparent string into its components.

    Args:
        traceparent: W3C traceparent header value.

    Returns:
        Dict with version, trace_id, parent_id, flags or None.
    """
    parts = traceparent.split("-")
    if len(parts) != 4:
        return None
    return {
        "version": parts[0],
        "trace_id": parts[1],
        "parent_id": parts[2],
        "flags": parts[3],
    }
