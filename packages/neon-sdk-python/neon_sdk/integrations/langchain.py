"""LangChain Auto-Instrumentation.

Provides a LangChain callback handler that automatically creates
tracing spans for LLM calls, tool use, and chain execution.

Example:
    ```python
    from langchain_openai import ChatOpenAI
    from neon_sdk.integrations.langchain import NeonCallbackHandler

    handler = NeonCallbackHandler()
    llm = ChatOpenAI(model="gpt-4", callbacks=[handler])
    result = llm.invoke("Hello!")
    ```
"""

from __future__ import annotations

import time
import uuid
from typing import Any


class NeonCallbackHandler:
    """LangChain callback handler that creates Neon tracing spans.

    Drop this into any LangChain chain/agent as a callback handler
    to get automatic tracing of LLM calls, tool invocations, and chains.

    Args:
        capture_content: Whether to capture prompt/response content.
    """

    def __init__(self, *, capture_content: bool = True) -> None:
        self.capture_content = capture_content
        self._spans: dict[str, dict[str, Any]] = {}

    def on_llm_start(
        self,
        serialized: dict[str, Any],
        prompts: list[str],
        *,
        run_id: Any = None,
        **kwargs: Any,
    ) -> None:
        """Called when an LLM starts generating."""
        span_id = str(run_id) if run_id else str(uuid.uuid4())
        model_name = serialized.get("name", serialized.get("id", ["unknown"])[-1])

        self._spans[span_id] = {
            "name": f"langchain:llm:{model_name}",
            "model": model_name,
            "start_time": time.monotonic(),
            "prompts": prompts if self.capture_content else [],
        }

    def on_llm_end(
        self,
        response: Any,
        *,
        run_id: Any = None,
        **kwargs: Any,
    ) -> None:
        """Called when an LLM finishes generating."""
        span_id = str(run_id) if run_id else None
        if not span_id or span_id not in self._spans:
            return

        span_data = self._spans.pop(span_id)
        duration_ms = (time.monotonic() - span_data["start_time"]) * 1000

        attrs: dict[str, str] = {
            "gen_ai.system": "langchain",
            "gen_ai.duration_ms": f"{duration_ms:.1f}",
        }

        if self.capture_content and span_data.get("prompts"):
            attrs["gen_ai.prompt"] = "\n---\n".join(span_data["prompts"])[:10000]

        if self.capture_content and hasattr(response, "generations") and response.generations:
            try:
                texts = []
                for gen_list in response.generations:
                    for gen in gen_list:
                        if hasattr(gen, "text"):
                            texts.append(gen.text)
                if texts:
                    attrs["gen_ai.completion"] = "\n".join(texts)[:10000]
            except (TypeError, AttributeError):
                pass

        if hasattr(response, "llm_output") and response.llm_output:
            usage = response.llm_output.get("token_usage", {})
            if "prompt_tokens" in usage:
                attrs["gen_ai.usage.input_tokens"] = str(usage["prompt_tokens"])
            if "completion_tokens" in usage:
                attrs["gen_ai.usage.output_tokens"] = str(usage["completion_tokens"])

    def on_tool_start(
        self,
        serialized: dict[str, Any],
        input_str: str,
        *,
        run_id: Any = None,
        **kwargs: Any,
    ) -> None:
        """Called when a tool starts running."""
        span_id = str(run_id) if run_id else str(uuid.uuid4())
        tool_name = serialized.get("name", "unknown")

        self._spans[span_id] = {
            "name": f"langchain:tool:{tool_name}",
            "tool_name": tool_name,
            "start_time": time.monotonic(),
            "input": input_str if self.capture_content else "",
        }

    def on_tool_end(
        self,
        output: str,
        *,
        run_id: Any = None,
        **kwargs: Any,
    ) -> None:
        """Called when a tool finishes running."""
        span_id = str(run_id) if run_id else None
        if not span_id or span_id not in self._spans:
            return

        span_data = self._spans.pop(span_id)
        duration_ms = (time.monotonic() - span_data["start_time"]) * 1000

        attrs: dict[str, str] = {
            "tool.duration_ms": f"{duration_ms:.1f}",
        }

        if self.capture_content and span_data.get("input"):
            attrs["tool.input"] = span_data["input"][:10000]
        if self.capture_content and output:
            attrs["tool.output"] = str(output)[:10000]

    def on_chain_start(
        self,
        serialized: dict[str, Any],
        inputs: dict[str, Any],
        *,
        run_id: Any = None,
        **kwargs: Any,
    ) -> None:
        """Called when a chain starts running."""
        span_id = str(run_id) if run_id else str(uuid.uuid4())
        chain_name = serialized.get("name", serialized.get("id", ["unknown"])[-1])

        self._spans[span_id] = {
            "name": f"langchain:chain:{chain_name}",
            "start_time": time.monotonic(),
        }

    def on_chain_end(
        self,
        outputs: dict[str, Any],
        *,
        run_id: Any = None,
        **kwargs: Any,
    ) -> None:
        """Called when a chain finishes."""
        span_id = str(run_id) if run_id else None
        if span_id and span_id in self._spans:
            self._spans.pop(span_id)

    def on_llm_error(
        self,
        error: Exception,
        *,
        run_id: Any = None,
        **kwargs: Any,
    ) -> None:
        """Called when an LLM errors."""
        span_id = str(run_id) if run_id else None
        if span_id and span_id in self._spans:
            self._spans.pop(span_id)

    def on_tool_error(
        self,
        error: Exception,
        *,
        run_id: Any = None,
        **kwargs: Any,
    ) -> None:
        """Called when a tool errors."""
        span_id = str(run_id) if run_id else None
        if span_id and span_id in self._spans:
            self._spans.pop(span_id)

    def on_chain_error(
        self,
        error: Exception,
        *,
        run_id: Any = None,
        **kwargs: Any,
    ) -> None:
        """Called when a chain errors."""
        span_id = str(run_id) if run_id else None
        if span_id and span_id in self._spans:
            self._spans.pop(span_id)
