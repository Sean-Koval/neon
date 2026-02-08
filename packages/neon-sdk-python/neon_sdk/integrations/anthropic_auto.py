"""Anthropic Auto-Instrumentation.

Monkey-patches the Anthropic client to automatically wrap message
creation calls in generation spans, capturing model, tokens, and input/output.

Example:
    ```python
    from anthropic import Anthropic
    from neon_sdk.integrations.anthropic_auto import instrument_anthropic

    client = Anthropic()
    instrument_anthropic(client)

    # All message creations are now automatically traced
    response = client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=1024,
        messages=[{"role": "user", "content": "Hello"}],
    )
    ```
"""

from __future__ import annotations

import contextlib
import json
import time
from typing import Any


def instrument_anthropic(client: Any, *, capture_content: bool = True) -> None:
    """Instrument an Anthropic client for automatic tracing.

    Wraps `client.messages.create` to emit generation spans.

    Args:
        client: An Anthropic client instance.
        capture_content: Whether to capture message content in span attributes.
    """
    from neon_sdk.tracing import generation

    if not hasattr(client, "messages"):
        raise ValueError("Expected an Anthropic client with messages")

    original_create = client.messages.create

    def patched_create(*args: Any, **kwargs: Any) -> Any:
        model = kwargs.get("model", "unknown")
        messages = kwargs.get("messages", [])

        attrs: dict[str, str] = {"gen_ai.system": "anthropic"}

        if capture_content and messages:
            with contextlib.suppress(TypeError, ValueError):
                attrs["gen_ai.prompt"] = json.dumps(messages, default=str)[:10000]

        system = kwargs.get("system")
        if capture_content and system:
            with contextlib.suppress(TypeError, ValueError):
                attrs["gen_ai.system_prompt"] = str(system)[:5000]

        with generation(f"anthropic:{model}", model=model, attributes=attrs):
            start = time.monotonic()
            result = original_create(*args, **kwargs)
            duration_ms = (time.monotonic() - start) * 1000

            # Extract usage from response
            if hasattr(result, "usage") and result.usage:
                usage = result.usage
                if hasattr(usage, "input_tokens"):
                    attrs["gen_ai.usage.input_tokens"] = str(usage.input_tokens)
                if hasattr(usage, "output_tokens"):
                    attrs["gen_ai.usage.output_tokens"] = str(usage.output_tokens)

            if capture_content and hasattr(result, "content") and result.content:
                try:
                    texts = []
                    for block in result.content:
                        if hasattr(block, "text"):
                            texts.append(block.text)
                    if texts:
                        attrs["gen_ai.completion"] = "\n".join(texts)[:10000]
                except (TypeError, AttributeError):
                    pass

            attrs["gen_ai.duration_ms"] = f"{duration_ms:.1f}"
            return result

    client.messages.create = patched_create


def uninstrument_anthropic(client: Any) -> None:
    """Remove instrumentation from an Anthropic client.

    Args:
        client: An Anthropic client instance.
    """
    if hasattr(client.messages.create, "__wrapped__"):
        client.messages.create = client.messages.create.__wrapped__
