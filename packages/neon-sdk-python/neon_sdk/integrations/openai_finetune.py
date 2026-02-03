"""
OpenAI Fine-Tuning Export

Export traces to OpenAI fine-tuning API format.
Converts agent traces to JSONL format suitable for fine-tuning chat models.

See: https://platform.openai.com/docs/guides/fine-tuning
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from neon_sdk.types import SpanWithChildren, TraceWithSpans

# =============================================================================
# Types
# =============================================================================


@dataclass
class ChatMessage:
    """A single chat message in OpenAI format."""

    role: Literal["system", "user", "assistant", "tool"]
    content: str
    name: str | None = None
    tool_calls: list[dict[str, Any]] | None = None
    tool_call_id: str | None = None


@dataclass
class FineTuneExample:
    """A single fine-tuning example with messages."""

    messages: list[ChatMessage]
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        messages = []
        for msg in self.messages:
            m: dict[str, Any] = {"role": msg.role, "content": msg.content}
            if msg.name:
                m["name"] = msg.name
            if msg.tool_calls:
                m["tool_calls"] = msg.tool_calls
            if msg.tool_call_id:
                m["tool_call_id"] = msg.tool_call_id
            messages.append(m)
        return {"messages": messages}

    def to_jsonl(self) -> str:
        """Convert to JSONL string."""
        return json.dumps(self.to_dict())


@dataclass
class OpenAIFineTuneBatch:
    """Batch of fine-tuning examples."""

    examples: list[FineTuneExample]
    created_at: datetime = field(default_factory=datetime.now)
    metadata: dict[str, Any] = field(default_factory=dict)
    stats: dict[str, Any] = field(default_factory=dict)

    def to_jsonl(self) -> str:
        """Convert batch to JSONL string."""
        return "\n".join(ex.to_jsonl() for ex in self.examples)


@dataclass
class FineTuneExportConfig:
    """Configuration for OpenAI fine-tuning export."""

    # System prompt configuration
    system_prompt: str | None = None
    include_system_prompt: bool = True

    # Message extraction
    include_tool_calls: bool = True
    include_tool_results: bool = True
    include_reasoning: bool = False

    # Filtering
    success_only: bool = True
    min_turns: int = 1
    max_turns: int | None = None

    # Quality filters
    min_score: float | None = None
    score_field: str = "quality"

    # Metadata
    metadata: dict[str, Any] = field(default_factory=dict)


# =============================================================================
# Helper Functions
# =============================================================================


def _flatten_spans(spans: list[SpanWithChildren]) -> list[SpanWithChildren]:
    """Flatten span tree into ordered list by timestamp."""
    result: list[SpanWithChildren] = []

    def traverse(span: SpanWithChildren) -> None:
        result.append(span)
        for child in span.children:
            traverse(child)

    for span in spans:
        traverse(span)

    return sorted(result, key=lambda s: s.timestamp)


def _extract_messages_from_generation(span: SpanWithChildren) -> list[ChatMessage]:
    """Extract chat messages from a generation span."""
    messages: list[ChatMessage] = []

    # Try to parse input as messages
    if span.input:
        try:
            parsed = json.loads(span.input)
            if isinstance(parsed, list):
                for msg in parsed:
                    if isinstance(msg, dict) and "role" in msg:
                        messages.append(
                            ChatMessage(
                                role=msg.get("role", "user"),
                                content=msg.get("content", ""),
                                name=msg.get("name"),
                            )
                        )
            elif isinstance(parsed, dict) and "messages" in parsed:
                for msg in parsed["messages"]:
                    if isinstance(msg, dict) and "role" in msg:
                        messages.append(
                            ChatMessage(
                                role=msg.get("role", "user"),
                                content=msg.get("content", ""),
                                name=msg.get("name"),
                            )
                        )
        except (json.JSONDecodeError, TypeError):
            # Treat as user message
            messages.append(ChatMessage(role="user", content=span.input))

    # Add assistant output
    if span.output:
        messages.append(ChatMessage(role="assistant", content=span.output))

    return messages


def _extract_tool_call_messages(span: SpanWithChildren) -> list[ChatMessage]:
    """Extract messages from a tool span."""
    messages: list[ChatMessage] = []

    # Tool call from assistant
    if span.tool_name and span.tool_input:
        tool_call = {
            "id": f"call_{span.span_id[:8]}",
            "type": "function",
            "function": {
                "name": span.tool_name,
                "arguments": span.tool_input,
            },
        }
        messages.append(
            ChatMessage(
                role="assistant",
                content="",
                tool_calls=[tool_call],
            )
        )

        # Tool result
        if span.tool_output:
            messages.append(
                ChatMessage(
                    role="tool",
                    content=span.tool_output,
                    tool_call_id=f"call_{span.span_id[:8]}",
                    name=span.tool_name,
                )
            )

    return messages


# =============================================================================
# Export Functions
# =============================================================================


def _trace_to_finetune_example(
    trace: TraceWithSpans,
    config: FineTuneExportConfig,
    scores: dict[str, float] | None = None,
) -> FineTuneExample | None:
    """Convert a single trace to a fine-tuning example."""
    # Apply filters
    if config.success_only and trace.trace.status.value != "ok":
        return None

    if config.min_score is not None and scores:
        score = scores.get(config.score_field, 0)
        if score < config.min_score:
            return None

    messages: list[ChatMessage] = []

    # Add system prompt if configured
    if config.include_system_prompt and config.system_prompt:
        messages.append(ChatMessage(role="system", content=config.system_prompt))

    # Flatten and process spans
    all_spans = _flatten_spans(trace.spans)

    for span in all_spans:
        if span.span_type.value == "generation":
            gen_messages = _extract_messages_from_generation(span)
            messages.extend(gen_messages)

        elif span.span_type.value == "tool" and config.include_tool_calls:
            tool_messages = _extract_tool_call_messages(span)
            messages.extend(tool_messages)

        elif (
            config.include_reasoning
            and span.component_type
            and span.component_type.value == "reasoning"
            and span.output
        ):
            # Include reasoning as assistant message
            messages.append(
                ChatMessage(
                    role="assistant",
                    content=f"<reasoning>{span.output}</reasoning>",
                )
            )

    # Apply turn filters
    assistant_turns = sum(1 for m in messages if m.role == "assistant")
    if assistant_turns < config.min_turns:
        return None
    if config.max_turns and assistant_turns > config.max_turns:
        return None

    if not messages:
        return None

    return FineTuneExample(
        messages=messages,
        metadata={
            "trace_id": trace.trace.trace_id,
            "success": trace.trace.status.value == "ok",
            "duration_ms": trace.trace.duration_ms,
            "agent_id": trace.trace.agent_id,
            **(scores or {}),
        },
    )


def export_to_openai_finetune(
    traces: list[TraceWithSpans],
    config: FineTuneExportConfig | None = None,
    scores_map: dict[str, dict[str, float]] | None = None,
) -> OpenAIFineTuneBatch:
    """
    Export traces to OpenAI fine-tuning format.

    Args:
        traces: List of traces to convert
        config: Export configuration
        scores_map: Optional mapping of trace_id to scores

    Returns:
        OpenAIFineTuneBatch with examples ready for fine-tuning

    Example:
        ```python
        batch = export_to_openai_finetune(
            traces,
            FineTuneExportConfig(
                system_prompt='You are a helpful assistant.',
                include_tool_calls=True,
                success_only=True,
                min_score=0.8,
            ),
            scores_map={
                'trace-123': {'quality': 0.9, 'helpfulness': 0.85},
            },
        )

        # Write to file
        write_finetune_jsonl(batch, 'training_data.jsonl')

        # Or upload directly to OpenAI
        import openai
        client = openai.OpenAI()
        file = client.files.create(
            file=batch.to_jsonl().encode(),
            purpose='fine-tune'
        )
        ```
    """
    if config is None:
        config = FineTuneExportConfig()

    examples: list[FineTuneExample] = []

    for trace in traces:
        scores = scores_map.get(trace.trace.trace_id) if scores_map else None
        example = _trace_to_finetune_example(trace, config, scores)
        if example:
            examples.append(example)

    # Calculate stats
    total_messages = sum(len(ex.messages) for ex in examples)
    avg_messages = total_messages / len(examples) if examples else 0
    success_count = sum(
        1 for ex in examples if ex.metadata.get("success", False)
    )

    return OpenAIFineTuneBatch(
        examples=examples,
        created_at=datetime.now(),
        metadata={
            "source_traces": len(traces),
            "exported_examples": len(examples),
            **config.metadata,
        },
        stats={
            "total_examples": len(examples),
            "total_messages": total_messages,
            "avg_messages_per_example": avg_messages,
            "success_rate": success_count / len(examples) if examples else 0,
        },
    )


def write_finetune_jsonl(
    batch: OpenAIFineTuneBatch,
    filepath: str | Path,
) -> int:
    """
    Write fine-tuning batch to JSONL file.

    Args:
        batch: The batch to write
        filepath: Output file path

    Returns:
        Number of examples written

    Example:
        ```python
        batch = export_to_openai_finetune(traces)
        count = write_finetune_jsonl(batch, 'training.jsonl')
        print(f'Wrote {count} examples')
        ```
    """
    filepath = Path(filepath)
    with filepath.open("w", encoding="utf-8") as f:
        for example in batch.examples:
            f.write(example.to_jsonl())
            f.write("\n")
    return len(batch.examples)


def validate_finetune_batch(
    batch: OpenAIFineTuneBatch,
) -> tuple[bool, list[str]]:
    """
    Validate a fine-tuning batch against OpenAI requirements.

    Returns:
        Tuple of (is_valid, list of error messages)

    Example:
        ```python
        is_valid, errors = validate_finetune_batch(batch)
        if not is_valid:
            for error in errors:
                print(f'Error: {error}')
        ```
    """
    errors: list[str] = []

    if len(batch.examples) < 10:
        errors.append(
            f"OpenAI requires at least 10 examples, got {len(batch.examples)}"
        )

    for i, example in enumerate(batch.examples):
        if not example.messages:
            errors.append(f"Example {i}: no messages")
            continue

        # Check for at least one assistant message
        has_assistant = any(m.role == "assistant" for m in example.messages)
        if not has_assistant:
            errors.append(f"Example {i}: no assistant message")

        # Validate message format
        for j, msg in enumerate(example.messages):
            if msg.role not in ("system", "user", "assistant", "tool"):
                errors.append(f"Example {i}, Message {j}: invalid role '{msg.role}'")

            if msg.role == "tool" and not msg.tool_call_id:
                errors.append(f"Example {i}, Message {j}: tool message missing tool_call_id")

        # Check message order (system first if present, then alternating)
        if example.messages[0].role == "system" and len(example.messages) < 2:
            errors.append(f"Example {i}: only system message, needs at least one user/assistant turn")

    return len(errors) == 0, errors


def estimate_finetune_cost(
    batch: OpenAIFineTuneBatch,
    model: str = "gpt-3.5-turbo",
    epochs: int = 3,
) -> dict[str, Any]:
    """
    Estimate fine-tuning cost for a batch.

    Args:
        batch: The batch to estimate
        model: Target model for fine-tuning
        epochs: Number of training epochs

    Returns:
        Dictionary with cost estimates

    Note:
        These are rough estimates. Actual costs may vary.
        See https://openai.com/pricing for current rates.
    """
    # Rough token estimation (4 chars per token average)
    total_chars = sum(
        sum(len(m.content) for m in ex.messages)
        for ex in batch.examples
    )
    estimated_tokens = total_chars / 4

    # Cost per 1K tokens for training (as of 2024, varies by model)
    cost_per_1k_tokens = {
        "gpt-3.5-turbo": 0.008,
        "gpt-4": 0.03,
        "gpt-4-turbo": 0.01,
    }

    base_cost = cost_per_1k_tokens.get(model, 0.01)
    training_tokens = estimated_tokens * epochs
    estimated_cost = (training_tokens / 1000) * base_cost

    return {
        "model": model,
        "epochs": epochs,
        "total_examples": len(batch.examples),
        "estimated_tokens": int(estimated_tokens),
        "training_tokens": int(training_tokens),
        "estimated_cost_usd": round(estimated_cost, 2),
        "cost_per_1k_tokens": base_cost,
    }


def split_finetune_batch(
    batch: OpenAIFineTuneBatch,
    train_ratio: float = 0.8,
) -> tuple[OpenAIFineTuneBatch, OpenAIFineTuneBatch]:
    """
    Split a fine-tuning batch into training and validation sets.

    Args:
        batch: The batch to split
        train_ratio: Ratio of examples for training (default: 0.8)

    Returns:
        Tuple of (training_batch, validation_batch)
    """
    import random

    examples = batch.examples.copy()
    random.shuffle(examples)

    split_idx = int(len(examples) * train_ratio)
    train_examples = examples[:split_idx]
    val_examples = examples[split_idx:]

    train_batch = OpenAIFineTuneBatch(
        examples=train_examples,
        created_at=datetime.now(),
        metadata={**batch.metadata, "split": "train"},
        stats={"total_examples": len(train_examples)},
    )

    val_batch = OpenAIFineTuneBatch(
        examples=val_examples,
        created_at=datetime.now(),
        metadata={**batch.metadata, "split": "validation"},
        stats={"total_examples": len(val_examples)},
    )

    return train_batch, val_batch


__all__ = [
    # Types
    "ChatMessage",
    "FineTuneExample",
    "OpenAIFineTuneBatch",
    "FineTuneExportConfig",
    # Functions
    "export_to_openai_finetune",
    "write_finetune_jsonl",
    "validate_finetune_batch",
    "estimate_finetune_cost",
    "split_finetune_batch",
]
