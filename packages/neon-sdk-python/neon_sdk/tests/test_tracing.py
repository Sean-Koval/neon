"""Tests for tracing utilities."""

import asyncio

from neon_sdk.tracing import (
    generation,
    get_current_context,
    memory,
    planning,
    prompt,
    reasoning,
    retrieval,
    routing,
    span,
    tool,
    trace,
    traced,
)
from neon_sdk.types import ComponentType


class TestTraceContext:
    """Tests for trace context management."""

    def test_trace_creates_context(self) -> None:
        """Test that trace creates a context."""
        assert get_current_context() is None

        with trace("test-trace"):
            ctx = get_current_context()
            assert ctx is not None
            assert ctx.trace_id.startswith("trace-")

        assert get_current_context() is None

    def test_nested_spans(self) -> None:
        """Test nested spans update parent_span_id."""
        with trace("test-trace"):
            outer_ctx = get_current_context()
            assert outer_ctx is not None
            assert outer_ctx.parent_span_id is None

            with span("outer-span") as outer_span:
                # After entering outer span, parent should be set
                ctx = get_current_context()
                assert ctx is not None
                assert ctx.parent_span_id == outer_span.span_id

                with span("inner-span") as inner_span:
                    ctx2 = get_current_context()
                    assert ctx2 is not None
                    assert ctx2.parent_span_id == inner_span.span_id

                # After exiting inner span, parent should be outer
                ctx3 = get_current_context()
                assert ctx3 is not None
                assert ctx3.parent_span_id == outer_span.span_id


class TestSpanTypes:
    """Tests for specialized span types."""

    def test_generation_span(self) -> None:
        """Test generation span."""
        with trace("test"), generation("llm-call", model="gpt-4") as gen_span:
            assert gen_span.span_type == "generation"
            assert gen_span.attributes.get("model") == "gpt-4"

    def test_tool_span(self) -> None:
        """Test tool span."""
        with trace("test"), tool("search", tool_name="web_search") as tool_span:
            assert tool_span.span_type == "tool"
            assert tool_span.component_type == ComponentType.TOOL
            assert tool_span.attributes.get("tool_name") == "web_search"

    def test_retrieval_span(self) -> None:
        """Test retrieval span."""
        with trace("test"), retrieval("doc-search", query="test query") as ret_span:
            assert ret_span.component_type == ComponentType.RETRIEVAL
            assert ret_span.attributes.get("query") == "test query"

    def test_reasoning_span(self) -> None:
        """Test reasoning span."""
        with trace("test"), reasoning("analyze") as r_span:
            assert r_span.component_type == ComponentType.REASONING

    def test_planning_span(self) -> None:
        """Test planning span."""
        with trace("test"), planning("create-plan") as p_span:
            assert p_span.component_type == ComponentType.PLANNING

    def test_prompt_span(self) -> None:
        """Test prompt span."""
        with trace("test"), prompt("build-prompt", template="Hello {name}") as pr_span:
            assert pr_span.component_type == ComponentType.PROMPT
            assert pr_span.attributes.get("template") == "Hello {name}"

    def test_routing_span(self) -> None:
        """Test routing span."""
        with trace("test"), routing("select-agent") as ro_span:
            assert ro_span.component_type == ComponentType.ROUTING

    def test_memory_span(self) -> None:
        """Test memory span."""
        with trace("test"), memory("load-context") as m_span:
            assert m_span.component_type == ComponentType.MEMORY


class TestTracedDecorator:
    """Tests for @traced decorator."""

    def test_traced_sync_function(self) -> None:
        """Test @traced on sync function."""

        @traced("my-func")
        def my_function(x: int) -> int:
            return x * 2

        with trace("test"):
            result = my_function(5)
            assert result == 10

    def test_traced_async_function(self) -> None:
        """Test @traced on async function."""

        @traced("async-func")
        async def async_function(x: int) -> int:
            return x * 2

        async def run_test() -> None:
            with trace("test"):
                result = await async_function(5)
                assert result == 10

        asyncio.run(run_test())

    def test_traced_uses_function_name(self) -> None:
        """Test @traced uses function name when name not provided."""

        @traced()
        def named_function() -> str:
            return "result"

        with trace("test"):
            result = named_function()
            assert result == "result"


class TestAsyncTracing:
    """Tests for async tracing."""

    def test_async_trace_context(self) -> None:
        """Test async trace context management."""

        async def run_test() -> None:
            async with trace("async-test"):
                ctx = get_current_context()
                assert ctx is not None
                assert ctx.trace_id.startswith("trace-")

            assert get_current_context() is None

        asyncio.run(run_test())

    def test_async_nested_spans(self) -> None:
        """Test async nested spans."""

        async def run_test() -> None:
            async with trace("async-test"), span("outer"), span("inner") as inner:
                ctx = get_current_context()
                assert ctx is not None
                assert ctx.parent_span_id == inner.span_id

        asyncio.run(run_test())
