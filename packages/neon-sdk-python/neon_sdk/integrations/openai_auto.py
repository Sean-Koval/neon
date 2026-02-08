"""OpenAI Auto-Instrumentation.

Monkey-patches the OpenAI client to automatically wrap chat completion
calls in generation spans, capturing model, tokens, and input/output.

Example:
    ```python
    from openai import OpenAI
    from neon_sdk.integrations.openai_auto import instrument_openai

    client = OpenAI()
    instrument_openai(client)

    # All chat completions are now automatically traced
    response = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": "Hello"}],
    )
    ```
"""

from __future__ import annotations

import contextlib
import json
import time
from typing import Any


def instrument_openai(client: Any, *, capture_content: bool = True) -> None:
    """Instrument an OpenAI client for automatic tracing.

    Wraps `client.chat.completions.create` to emit generation spans.

    Args:
        client: An OpenAI client instance.
        capture_content: Whether to capture message content in span attributes.
    """
    from neon_sdk.tracing import generation

    if not hasattr(client, "chat") or not hasattr(client.chat, "completions"):
        raise ValueError("Expected an OpenAI client with chat.completions")

    original_create = client.chat.completions.create

    def patched_create(*args: Any, **kwargs: Any) -> Any:
        model = kwargs.get("model", "unknown")
        messages = kwargs.get("messages", [])

        attrs: dict[str, str] = {"gen_ai.system": "openai"}

        if capture_content and messages:
            with contextlib.suppress(TypeError, ValueError):
                attrs["gen_ai.prompt"] = json.dumps(messages, default=str)[:10000]

        with generation(f"openai:{model}", model=model, attributes=attrs):
            start = time.monotonic()
            result = original_create(*args, **kwargs)
            duration_ms = (time.monotonic() - start) * 1000

            # Extract usage from response
            if hasattr(result, "usage") and result.usage:
                usage = result.usage
                if hasattr(usage, "prompt_tokens"):
                    attrs["gen_ai.usage.input_tokens"] = str(usage.prompt_tokens)
                if hasattr(usage, "completion_tokens"):
                    attrs["gen_ai.usage.output_tokens"] = str(usage.completion_tokens)
                if hasattr(usage, "total_tokens"):
                    attrs["gen_ai.usage.total_tokens"] = str(usage.total_tokens)

            if capture_content and hasattr(result, "choices") and result.choices:
                try:
                    choice = result.choices[0]
                    if hasattr(choice, "message") and choice.message:
                        attrs["gen_ai.completion"] = str(choice.message.content)[:10000]
                except (IndexError, AttributeError):
                    pass

            attrs["gen_ai.duration_ms"] = f"{duration_ms:.1f}"
            return result

    client.chat.completions.create = patched_create


def uninstrument_openai(client: Any) -> None:
    """Remove instrumentation from an OpenAI client.

    This is a best-effort operation. If the client was never instrumented,
    this is a no-op.

    Args:
        client: An OpenAI client instance.
    """
    if hasattr(client.chat.completions.create, "__wrapped__"):
        client.chat.completions.create = client.chat.completions.create.__wrapped__
