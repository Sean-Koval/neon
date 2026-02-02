"""
Tracing Utilities

Local context management for structuring async evaluation code.
Provides decorators, context managers, and async-local style context.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from contextvars import ContextVar
from dataclasses import dataclass, field
from functools import wraps
from typing import TYPE_CHECKING, Any, ParamSpec, TypeVar

if TYPE_CHECKING:
    pass  # Keep TYPE_CHECKING for potential future use

from neon_sdk.types import ComponentType

# =============================================================================
# Trace Context
# =============================================================================


@dataclass
class TraceContext:
    """Trace context for span tracking."""

    trace_id: str
    parent_span_id: str | None = None


@dataclass
class SpanData:
    """Data collected during a span."""

    span_id: str
    name: str
    span_type: str = "span"
    component_type: ComponentType | None = None
    attributes: dict[str, str] = field(default_factory=dict)
    input: str | None = None
    output: str | None = None
    model: str | None = None
    tool_name: str | None = None
    tool_input: str | None = None


# Context variable for async-local trace context
_current_context: ContextVar[TraceContext | None] = ContextVar("trace_context", default=None)


def get_current_context() -> TraceContext | None:
    """Get the current trace context."""
    return _current_context.get()


def set_current_context(context: TraceContext | None) -> None:
    """Set the current trace context."""
    _current_context.set(context)


# =============================================================================
# Context Manager for Trace Context
# =============================================================================


class TraceContextManager:
    """Context manager for trace context."""

    def __init__(self, context: TraceContext) -> None:
        self._context = context
        self._previous: TraceContext | None = None

    def __enter__(self) -> TraceContext:
        self._previous = _current_context.get()
        _current_context.set(self._context)
        return self._context

    def __exit__(self, *args: object) -> None:
        _current_context.set(self._previous)

    async def __aenter__(self) -> TraceContext:
        return self.__enter__()

    async def __aexit__(self, *args: object) -> None:
        self.__exit__()


def with_context(context: TraceContext) -> TraceContextManager:
    """Run code with a trace context (use as context manager)."""
    return TraceContextManager(context)


# =============================================================================
# Span Options
# =============================================================================


@dataclass
class SpanOptions:
    """Span options."""

    type: str = "span"  # "span" | "generation" | "tool"
    component_type: ComponentType | None = None
    attributes: dict[str, str] = field(default_factory=dict)


# =============================================================================
# Type Variables for Decorators
# =============================================================================

P = ParamSpec("P")
T = TypeVar("T")


# =============================================================================
# Core Span Functions and Decorators
# =============================================================================


class SpanContextManager:
    """Context manager for spans."""

    def __init__(
        self,
        name: str,
        span_type: str = "span",
        component_type: ComponentType | None = None,
        attributes: dict[str, str] | None = None,
    ) -> None:
        self.name = name
        self.span_type = span_type
        self.component_type = component_type
        self.attributes = attributes or {}
        self._span_id = str(uuid.uuid4())
        self._previous_parent: str | None = None
        self._result: Any = None

    def __enter__(self) -> SpanData:
        ctx = get_current_context()
        if ctx:
            self._previous_parent = ctx.parent_span_id
            ctx.parent_span_id = self._span_id
        return SpanData(
            span_id=self._span_id,
            name=self.name,
            span_type=self.span_type,
            component_type=self.component_type,
            attributes=self.attributes,
        )

    def __exit__(self, *args: object) -> None:
        ctx = get_current_context()
        if ctx:
            ctx.parent_span_id = self._previous_parent

    async def __aenter__(self) -> SpanData:
        return self.__enter__()

    async def __aexit__(self, *args: object) -> None:
        self.__exit__()


def span(
    name: str,
    *,
    span_type: str = "span",
    component_type: ComponentType | None = None,
    attributes: dict[str, str] | None = None,
) -> SpanContextManager:
    """
    Create a span context manager.

    Can be used as a context manager or async context manager.

    Example:
        ```python
        with span("process-data"):
            result = process_data(input)

        async with span("async-operation"):
            result = await async_operation()
        ```
    """
    return SpanContextManager(
        name=name,
        span_type=span_type,
        component_type=component_type,
        attributes=attributes,
    )


def traced(
    name: str | None = None,
    *,
    span_type: str = "span",
    component_type: ComponentType | None = None,
    attributes: dict[str, str] | None = None,
) -> Callable[[Callable[P, T]], Callable[P, T]]:
    """
    Decorator to wrap a function in a span.

    Example:
        ```python
        @traced("my-function")
        def my_function(x: int) -> int:
            return x * 2

        @traced("async-function")
        async def async_function(x: int) -> int:
            return x * 2
        ```
    """

    def decorator(fn: Callable[P, T]) -> Callable[P, T]:
        span_name = name or fn.__name__

        @wraps(fn)
        def sync_wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            with span(span_name, span_type=span_type, component_type=component_type, attributes=attributes):
                return fn(*args, **kwargs)

        @wraps(fn)
        async def async_wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            async with span(span_name, span_type=span_type, component_type=component_type, attributes=attributes):
                return await fn(*args, **kwargs)  # type: ignore[misc]

        import asyncio

        if asyncio.iscoroutinefunction(fn):
            return async_wrapper  # type: ignore[return-value]
        return sync_wrapper  # type: ignore[return-value]

    return decorator


class TraceManager:
    """Context manager for traces."""

    def __init__(self, name: str, metadata: dict[str, str] | None = None) -> None:
        self.name = name
        self.metadata = metadata or {}
        self._trace_id = f"trace-{uuid.uuid4()}"
        self._context = TraceContext(trace_id=self._trace_id)
        self._ctx_manager = TraceContextManager(self._context)

    def __enter__(self) -> TraceContext:
        return self._ctx_manager.__enter__()

    def __exit__(self, *args: object) -> None:
        self._ctx_manager.__exit__(*args)

    async def __aenter__(self) -> TraceContext:
        return await self._ctx_manager.__aenter__()

    async def __aexit__(self, *args: object) -> None:
        await self._ctx_manager.__aexit__(*args)


def trace(name: str, metadata: dict[str, str] | None = None) -> TraceManager:
    """
    Create a trace context manager.

    Example:
        ```python
        with trace("my-operation"):
            do_something()

        async with trace("async-operation"):
            await async_operation()
        ```
    """
    return TraceManager(name, metadata)


# =============================================================================
# Specialized Span Context Managers
# =============================================================================


def generation(
    name: str,
    *,
    model: str | None = None,
    input_text: str | None = None,
    component_type: ComponentType | None = None,
    attributes: dict[str, str] | None = None,
) -> SpanContextManager:
    """
    Create a generation span (for LLM calls).

    Example:
        ```python
        with generation("gpt-4-call", model="gpt-4"):
            response = await llm.chat(prompt)
        ```
    """
    attrs = dict(attributes or {})
    if model:
        attrs["model"] = model
    if input_text:
        attrs["input"] = input_text
    return SpanContextManager(
        name=name,
        span_type="generation",
        component_type=component_type,
        attributes=attrs,
    )


def tool(
    name: str,
    *,
    tool_name: str | None = None,
    tool_input: str | None = None,
    component_type: ComponentType | None = None,
    attributes: dict[str, str] | None = None,
) -> SpanContextManager:
    """
    Create a tool span.

    Example:
        ```python
        with tool("search", tool_name="web_search"):
            results = search_web(query)
        ```
    """
    attrs = dict(attributes or {})
    if tool_name:
        attrs["tool_name"] = tool_name
    if tool_input:
        attrs["tool_input"] = tool_input
    return SpanContextManager(
        name=name,
        span_type="tool",
        component_type=component_type or ComponentType.TOOL,
        attributes=attrs,
    )


def retrieval(
    name: str,
    *,
    query: str | None = None,
    top_k: int | None = None,
    attributes: dict[str, str] | None = None,
) -> SpanContextManager:
    """
    Create a retrieval span (for RAG operations).

    Example:
        ```python
        with retrieval("doc-search", query="user question"):
            docs = vector_store.search(query)
        ```
    """
    attrs = dict(attributes or {})
    if query:
        attrs["query"] = query
    if top_k:
        attrs["top_k"] = str(top_k)
    return SpanContextManager(
        name=name,
        span_type="span",
        component_type=ComponentType.RETRIEVAL,
        attributes=attrs,
    )


def reasoning(
    name: str,
    *,
    attributes: dict[str, str] | None = None,
) -> SpanContextManager:
    """
    Create a reasoning span (for chain-of-thought, planning steps).

    Example:
        ```python
        with reasoning("analyze-problem"):
            analysis = think_about(problem)
        ```
    """
    return SpanContextManager(
        name=name,
        span_type="span",
        component_type=ComponentType.REASONING,
        attributes=attributes,
    )


def planning(
    name: str,
    *,
    attributes: dict[str, str] | None = None,
) -> SpanContextManager:
    """
    Create a planning span (for high-level task decomposition).

    Example:
        ```python
        with planning("create-plan"):
            plan = decompose_task(task)
        ```
    """
    return SpanContextManager(
        name=name,
        span_type="span",
        component_type=ComponentType.PLANNING,
        attributes=attributes,
    )


def prompt(
    name: str,
    *,
    template: str | None = None,
    attributes: dict[str, str] | None = None,
) -> SpanContextManager:
    """
    Create a prompt span (for prompt construction).

    Example:
        ```python
        with prompt("build-prompt"):
            final_prompt = format_prompt(template, variables)
        ```
    """
    attrs = dict(attributes or {})
    if template:
        attrs["template"] = template
    return SpanContextManager(
        name=name,
        span_type="span",
        component_type=ComponentType.PROMPT,
        attributes=attrs,
    )


def routing(
    name: str,
    *,
    attributes: dict[str, str] | None = None,
) -> SpanContextManager:
    """
    Create a routing span (for agent orchestration).

    Example:
        ```python
        with routing("select-agent"):
            agent = router.select(query)
        ```
    """
    return SpanContextManager(
        name=name,
        span_type="span",
        component_type=ComponentType.ROUTING,
        attributes=attributes,
    )


def memory(
    name: str,
    *,
    attributes: dict[str, str] | None = None,
) -> SpanContextManager:
    """
    Create a memory span (for memory access and management).

    Example:
        ```python
        with memory("load-context"):
            context = memory_store.retrieve(user_id)
        ```
    """
    return SpanContextManager(
        name=name,
        span_type="span",
        component_type=ComponentType.MEMORY,
        attributes=attributes,
    )


# =============================================================================
# Decorator Variants for Specialized Spans
# =============================================================================


def traced_generation(
    name: str | None = None,
    *,
    model: str | None = None,
    component_type: ComponentType | None = None,
) -> Callable[[Callable[P, T]], Callable[P, T]]:
    """Decorator for generation spans."""
    return traced(name, span_type="generation", component_type=component_type)


def traced_tool(
    name: str | None = None,
    *,
    tool_name: str | None = None,
    component_type: ComponentType | None = None,
) -> Callable[[Callable[P, T]], Callable[P, T]]:
    """Decorator for tool spans."""
    return traced(name, span_type="tool", component_type=component_type or ComponentType.TOOL)


def traced_retrieval(
    name: str | None = None,
) -> Callable[[Callable[P, T]], Callable[P, T]]:
    """Decorator for retrieval spans."""
    return traced(name, span_type="span", component_type=ComponentType.RETRIEVAL)


def traced_reasoning(
    name: str | None = None,
) -> Callable[[Callable[P, T]], Callable[P, T]]:
    """Decorator for reasoning spans."""
    return traced(name, span_type="span", component_type=ComponentType.REASONING)


def traced_planning(
    name: str | None = None,
) -> Callable[[Callable[P, T]], Callable[P, T]]:
    """Decorator for planning spans."""
    return traced(name, span_type="span", component_type=ComponentType.PLANNING)


__all__ = [
    # Context
    "TraceContext",
    "SpanData",
    "get_current_context",
    "set_current_context",
    "with_context",
    # Core
    "trace",
    "span",
    "traced",
    # Specialized context managers
    "generation",
    "tool",
    "retrieval",
    "reasoning",
    "planning",
    "prompt",
    "routing",
    "memory",
    # Specialized decorators
    "traced_generation",
    "traced_tool",
    "traced_retrieval",
    "traced_reasoning",
    "traced_planning",
]
