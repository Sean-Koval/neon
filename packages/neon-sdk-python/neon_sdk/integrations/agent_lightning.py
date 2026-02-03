"""
Agent Lightning Export

Export traces in Agent Lightning format for RL training.
Agent Lightning is a framework for adding reinforcement learning
to AI agents without code rewrites.

See: https://www.microsoft.com/en-us/research/blog/agent-lightning-adding-reinforcement-learning-to-ai-agents-without-code-rewrites/
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Literal

from neon_sdk.types import ComponentType, SpanWithChildren, TraceWithSpans

# =============================================================================
# Types
# =============================================================================


@dataclass
class AgentLightningTransition:
    """
    A single transition in the Agent Lightning format.
    Represents one LLM call with its input, output, and assigned reward.
    """

    transition_id: str
    prompt: str
    generation: str
    reward: float
    discount: float | None = None
    state_before: dict[str, Any] | None = None
    state_after: dict[str, Any] | None = None
    component_type: ComponentType | None = None
    tool_name: str | None = None
    model: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentLightningEpisode:
    """
    An episode in Agent Lightning format.
    Represents a complete agent execution (trace).
    """

    episode_id: str
    name: str
    transitions: list[AgentLightningTransition]
    terminal_reward: float
    success: bool
    duration_ms: int
    total_tokens: int
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentLightningBatchStats:
    """Batch statistics."""

    total_episodes: int
    total_transitions: int
    success_rate: float
    avg_reward: float
    avg_duration_ms: float
    avg_tokens: float


@dataclass
class AgentLightningBatch:
    """Batch of episodes in Agent Lightning format."""

    format: Literal["agent-lightning"] = "agent-lightning"
    version: Literal["1.0"] = "1.0"
    created_at: str = ""
    episodes: list[AgentLightningEpisode] = field(default_factory=list)
    stats: AgentLightningBatchStats | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentLightningFilter:
    """Filter configuration for Agent Lightning export."""

    component_types: list[ComponentType] | None = None
    score_threshold: float | None = None
    success_only: bool = False
    max_duration_ms: int | None = None
    span_types: list[str] | None = None
    min_reward: float | None = None
    max_reward: float | None = None


class CreditAssignment(str, Enum):
    """Credit assignment strategy."""

    UNIFORM = "uniform"
    TERMINAL = "terminal"
    PROPORTIONAL = "proportional"
    DECAY = "decay"


@dataclass
class AgentLightningExportConfig:
    """Configuration for Agent Lightning export."""

    filter: AgentLightningFilter | None = None
    credit_assignment: CreditAssignment = CreditAssignment.DECAY
    discount_factor: float = 0.99
    success_reward: float = 1.0
    failure_penalty: float = 0.0
    include_state: bool = False
    metadata: dict[str, Any] | None = None


@dataclass
class ScoreData:
    """Score data for credit assignment."""

    name: str
    value: float
    span_id: str | None = None


@dataclass
class ExportContext:
    """Context for exporting a single trace."""

    trace: TraceWithSpans
    scores: list[ScoreData] | None = None
    metadata: dict[str, Any] | None = None


# =============================================================================
# Helper Functions
# =============================================================================


def _flatten_spans(spans: list[SpanWithChildren]) -> list[SpanWithChildren]:
    """Flatten span tree into ordered array by timestamp."""
    result: list[SpanWithChildren] = []

    def traverse(span: SpanWithChildren) -> None:
        result.append(span)
        for child in span.children:
            traverse(child)

    for span in spans:
        traverse(span)

    return sorted(result, key=lambda s: s.timestamp)


def _filter_spans(
    spans: list[SpanWithChildren],
    filter_config: AgentLightningFilter | None,
) -> list[SpanWithChildren]:
    """Apply filters to spans."""
    if not filter_config:
        return spans

    result: list[SpanWithChildren] = []

    for span in spans:
        # Filter by span type
        if filter_config.span_types and span.span_type.value not in filter_config.span_types:
            continue

        # Filter by component type
        if (
            filter_config.component_types
            and span.component_type
            and span.component_type not in filter_config.component_types
        ):
            continue

        result.append(span)

    return result


def _assign_credits(
    transitions: list[AgentLightningTransition],
    terminal_reward: float,
    config: AgentLightningExportConfig,
) -> list[AgentLightningTransition]:
    """Assign credits/rewards to transitions based on strategy."""
    n = len(transitions)
    if n == 0:
        return []

    if config.credit_assignment == CreditAssignment.UNIFORM:
        # Distribute reward equally
        reward_per_step = terminal_reward / n
        result = []
        for t in transitions:
            result.append(
                AgentLightningTransition(
                    transition_id=t.transition_id,
                    prompt=t.prompt,
                    generation=t.generation,
                    reward=reward_per_step,
                    discount=1.0,
                    state_before=t.state_before,
                    state_after=t.state_after,
                    component_type=t.component_type,
                    tool_name=t.tool_name,
                    model=t.model,
                    metadata=t.metadata,
                )
            )
        return result

    elif config.credit_assignment == CreditAssignment.TERMINAL:
        # Only assign reward to last transition
        result = []
        for i, t in enumerate(transitions):
            result.append(
                AgentLightningTransition(
                    transition_id=t.transition_id,
                    prompt=t.prompt,
                    generation=t.generation,
                    reward=terminal_reward if i == n - 1 else 0,
                    discount=1.0,
                    state_before=t.state_before,
                    state_after=t.state_after,
                    component_type=t.component_type,
                    tool_name=t.tool_name,
                    model=t.model,
                    metadata=t.metadata,
                )
            )
        return result

    elif config.credit_assignment == CreditAssignment.PROPORTIONAL:
        # Assign proportional to position (later steps get more)
        total_weight = n * (n + 1) / 2
        result = []
        for i, t in enumerate(transitions):
            result.append(
                AgentLightningTransition(
                    transition_id=t.transition_id,
                    prompt=t.prompt,
                    generation=t.generation,
                    reward=terminal_reward * (i + 1) / total_weight,
                    discount=1.0,
                    state_before=t.state_before,
                    state_after=t.state_after,
                    component_type=t.component_type,
                    tool_name=t.tool_name,
                    model=t.model,
                    metadata=t.metadata,
                )
            )
        return result

    else:  # DECAY
        # Exponential decay from terminal (standard RL discount)
        result = []
        for i, t in enumerate(transitions):
            steps_from_end = n - 1 - i
            discount = config.discount_factor ** steps_from_end
            result.append(
                AgentLightningTransition(
                    transition_id=t.transition_id,
                    prompt=t.prompt,
                    generation=t.generation,
                    reward=terminal_reward * discount,
                    discount=discount,
                    state_before=t.state_before,
                    state_after=t.state_after,
                    component_type=t.component_type,
                    tool_name=t.tool_name,
                    model=t.model,
                    metadata=t.metadata,
                )
            )
        return result


def _span_to_transition(
    span: SpanWithChildren,
    index: int,
    config: AgentLightningExportConfig,
) -> AgentLightningTransition | None:
    """Convert a span to an Agent Lightning transition."""
    # Extract prompt and generation based on span type
    prompt = ""
    generation = ""

    if span.span_type.value == "generation":
        prompt = span.input or ""
        generation = span.output or ""
    elif span.span_type.value == "tool":
        prompt = span.tool_input or span.input or ""
        generation = span.tool_output or span.output or ""
    else:
        # For other span types, use input/output if available
        prompt = span.input or ""
        generation = span.output or ""

    # Skip if no meaningful prompt/generation
    if not prompt and not generation:
        return None

    transition = AgentLightningTransition(
        transition_id=span.span_id,
        prompt=prompt,
        generation=generation,
        reward=0,  # Will be assigned later
        component_type=span.component_type,
        tool_name=span.tool_name,
        model=span.model,
        metadata={
            "span_name": span.name,
            "span_type": span.span_type.value,
            "duration_ms": span.duration_ms,
            "status": span.status.value,
            "input_tokens": span.input_tokens,
            "output_tokens": span.output_tokens,
        },
    )

    if config.include_state:
        transition.state_before = {
            "timestamp": span.timestamp.isoformat(),
            "span_index": index,
        }
        transition.state_after = {
            "timestamp": span.end_time.isoformat() if span.end_time else None,
            "status": span.status.value,
        }

    return transition


def _calculate_terminal_reward(
    trace: TraceWithSpans,
    scores: list[ScoreData] | None,
    config: AgentLightningExportConfig | None,
) -> float:
    """Calculate terminal reward from trace and scores."""
    success_reward = config.success_reward if config else 1.0
    failure_penalty = config.failure_penalty if config else 0.0

    # Base reward from trace status
    is_success = trace.trace.status.value == "ok"
    reward = success_reward if is_success else failure_penalty

    # Incorporate scores if available
    if scores and len(scores) > 0:
        avg_score = sum(s.value for s in scores) / len(scores)
        # Blend base reward with average score
        reward = reward * 0.5 + avg_score * 0.5

    return max(-1, min(1, reward))


# =============================================================================
# Export Functions
# =============================================================================


def export_to_agent_lightning(
    context: ExportContext,
    config: AgentLightningExportConfig | None = None,
) -> AgentLightningEpisode | None:
    """
    Export a single trace to Agent Lightning episode format.

    Example:
        ```python
        episode = export_to_agent_lightning(
            ExportContext(
                trace=my_trace,
                scores=[ScoreData(name='quality', value=0.9)],
            ),
            AgentLightningExportConfig(
                credit_assignment=CreditAssignment.DECAY,
                discount_factor=0.99,
                filter=AgentLightningFilter(
                    component_types=[ComponentType.TOOL, ComponentType.REASONING],
                    score_threshold=0.5,
                ),
            )
        )
        ```
    """
    if config is None:
        config = AgentLightningExportConfig()

    trace = context.trace
    scores = context.scores
    metadata = context.metadata
    filter_config = config.filter

    # Apply episode-level filters
    if filter_config:
        if filter_config.success_only and trace.trace.status.value != "ok":
            return None

        if (
            filter_config.max_duration_ms
            and trace.trace.duration_ms > filter_config.max_duration_ms
        ):
            return None

    # Flatten and filter spans
    all_spans = _flatten_spans(trace.spans)
    default_span_types = ["generation", "tool"]
    span_filter = AgentLightningFilter(
        component_types=filter_config.component_types if filter_config else None,
        span_types=filter_config.span_types if filter_config else default_span_types,
        score_threshold=filter_config.score_threshold if filter_config else None,
        min_reward=filter_config.min_reward if filter_config else None,
        max_reward=filter_config.max_reward if filter_config else None,
    )
    if not span_filter.span_types:
        span_filter.span_types = default_span_types

    filtered_spans = _filter_spans(all_spans, span_filter)

    # Convert spans to transitions
    transitions: list[AgentLightningTransition] = []
    for i, span in enumerate(filtered_spans):
        transition = _span_to_transition(span, i, config)
        if transition:
            # Apply span-level score if available
            if scores:
                span_score = next(
                    (s for s in scores if s.span_id == span.span_id), None
                )
                if span_score:
                    transition.metadata["score"] = span_score.value
                    transition.metadata["score_name"] = span_score.name
            transitions.append(transition)

    # Apply score threshold filter
    if filter_config and filter_config.score_threshold is not None:
        transitions = [
            t
            for t in transitions
            if t.metadata.get("score") is None
            or t.metadata.get("score", 0) >= filter_config.score_threshold
        ]

    # Apply reward range filters
    if filter_config:
        if filter_config.min_reward is not None:
            transitions = [
                t for t in transitions if t.reward >= filter_config.min_reward
            ]
        if filter_config.max_reward is not None:
            transitions = [
                t for t in transitions if t.reward <= filter_config.max_reward
            ]

    # Skip if no transitions
    if not transitions:
        return None

    # Calculate terminal reward
    terminal_reward = _calculate_terminal_reward(trace, scores, config)

    # Assign credits to transitions
    transitions = _assign_credits(transitions, terminal_reward, config)

    total_tokens = trace.trace.total_input_tokens + trace.trace.total_output_tokens

    return AgentLightningEpisode(
        episode_id=trace.trace.trace_id,
        name=trace.trace.name,
        transitions=transitions,
        terminal_reward=terminal_reward,
        success=trace.trace.status.value == "ok",
        duration_ms=trace.trace.duration_ms,
        total_tokens=total_tokens,
        metadata={
            "agent_id": trace.trace.agent_id,
            "agent_version": trace.trace.agent_version,
            "workflow_id": trace.trace.workflow_id,
            **(trace.trace.metadata or {}),
            **(metadata or {}),
        },
    )


def export_batch_to_agent_lightning(
    contexts: list[ExportContext],
    config: AgentLightningExportConfig | None = None,
) -> AgentLightningBatch:
    """
    Export multiple traces to Agent Lightning batch format.

    Example:
        ```python
        batch = export_batch_to_agent_lightning(
            [ExportContext(trace=t, scores=scores_map.get(t.trace.trace_id)) for t in traces],
            AgentLightningExportConfig(
                credit_assignment=CreditAssignment.DECAY,
                filter=AgentLightningFilter(success_only=True),
                metadata={'project_id': 'my-project'},
            )
        )

        # Write to file for training
        import json
        with open('training-data.json', 'w') as f:
            json.dump(batch, f, indent=2)
        ```
    """
    episodes: list[AgentLightningEpisode] = []

    for context in contexts:
        episode = export_to_agent_lightning(context, config)
        if episode:
            episodes.append(episode)

    # Calculate batch statistics
    total_transitions = sum(len(e.transitions) for e in episodes)
    success_count = sum(1 for e in episodes if e.success)
    total_reward = sum(e.terminal_reward for e in episodes)
    total_duration = sum(e.duration_ms for e in episodes)
    total_tokens = sum(e.total_tokens for e in episodes)

    stats = AgentLightningBatchStats(
        total_episodes=len(episodes),
        total_transitions=total_transitions,
        success_rate=success_count / len(episodes) if episodes else 0,
        avg_reward=total_reward / len(episodes) if episodes else 0,
        avg_duration_ms=total_duration / len(episodes) if episodes else 0,
        avg_tokens=total_tokens / len(episodes) if episodes else 0,
    )

    return AgentLightningBatch(
        format="agent-lightning",
        version="1.0",
        created_at=datetime.now().isoformat(),
        episodes=episodes,
        stats=stats,
        metadata={
            "exported_at": datetime.now().isoformat(),
            **(config.metadata if config and config.metadata else {}),
        },
    )


def validate_agent_lightning_batch(
    batch: AgentLightningBatch,
) -> tuple[bool, list[str]]:
    """
    Validate an Agent Lightning batch for completeness.

    Returns:
        Tuple of (is_valid, list of error messages)
    """
    errors: list[str] = []

    if batch.format != "agent-lightning":
        errors.append(
            f"Invalid format: expected 'agent-lightning', got '{batch.format}'"
        )

    if batch.version != "1.0":
        errors.append(f"Unsupported version: {batch.version}")

    if not isinstance(batch.episodes, list):
        errors.append("Episodes must be a list")
        return len(errors) == 0, errors

    for i, episode in enumerate(batch.episodes):
        if not episode.episode_id:
            errors.append(f"Episode {i}: missing episode_id")
        if not isinstance(episode.transitions, list):
            errors.append(f"Episode {i}: transitions must be a list")
            continue
        for j, t in enumerate(episode.transitions):
            if t.prompt is None:
                errors.append(f"Episode {i}, Transition {j}: missing prompt")
            if t.generation is None:
                errors.append(f"Episode {i}, Transition {j}: missing generation")
            if not isinstance(t.reward, (int, float)):
                errors.append(f"Episode {i}, Transition {j}: reward must be a number")

    return len(errors) == 0, errors


def merge_agent_lightning_batches(
    batches: list[AgentLightningBatch],
) -> AgentLightningBatch:
    """Merge multiple Agent Lightning batches into one."""
    all_episodes: list[AgentLightningEpisode] = []
    merged_metadata: dict[str, Any] = {}

    for batch in batches:
        all_episodes.extend(batch.episodes)
        merged_metadata.update(batch.metadata)

    # Recalculate statistics
    total_transitions = sum(len(e.transitions) for e in all_episodes)
    success_count = sum(1 for e in all_episodes if e.success)
    total_reward = sum(e.terminal_reward for e in all_episodes)
    total_duration = sum(e.duration_ms for e in all_episodes)
    total_tokens = sum(e.total_tokens for e in all_episodes)

    stats = AgentLightningBatchStats(
        total_episodes=len(all_episodes),
        total_transitions=total_transitions,
        success_rate=success_count / len(all_episodes) if all_episodes else 0,
        avg_reward=total_reward / len(all_episodes) if all_episodes else 0,
        avg_duration_ms=total_duration / len(all_episodes) if all_episodes else 0,
        avg_tokens=total_tokens / len(all_episodes) if all_episodes else 0,
    )

    return AgentLightningBatch(
        format="agent-lightning",
        version="1.0",
        created_at=datetime.now().isoformat(),
        episodes=all_episodes,
        stats=stats,
        metadata={
            "merged_at": datetime.now().isoformat(),
            "batch_count": len(batches),
            **merged_metadata,
        },
    )


async def stream_export_to_agent_lightning(
    contexts: list[ExportContext],
    config: AgentLightningExportConfig | None = None,
    on_episode: Callable[[AgentLightningEpisode], None] | None = None,
    on_progress: Callable[[int, int], None] | None = None,
) -> AgentLightningBatch:
    """
    Export traces with streaming support for large datasets.

    Example:
        ```python
        async def process():
            results = await stream_export_to_agent_lightning(
                trace_contexts,
                AgentLightningExportConfig(),
                on_episode=lambda e: append_to_file(e),
                on_progress=lambda c, t: print(f'{c}/{t}'),
            )
        ```
    """
    import asyncio

    episodes: list[AgentLightningEpisode] = []
    total = len(contexts)

    for i, context in enumerate(contexts):
        episode = export_to_agent_lightning(context, config)
        if episode:
            episodes.append(episode)
            if on_episode:
                on_episode(episode)
        if on_progress:
            on_progress(i + 1, total)
        # Yield to event loop for large batches
        if i % 100 == 0:
            await asyncio.sleep(0)

    # Calculate batch statistics
    total_transitions = sum(len(e.transitions) for e in episodes)
    success_count = sum(1 for e in episodes if e.success)
    total_reward = sum(e.terminal_reward for e in episodes)
    total_duration = sum(e.duration_ms for e in episodes)
    total_tokens = sum(e.total_tokens for e in episodes)

    stats = AgentLightningBatchStats(
        total_episodes=len(episodes),
        total_transitions=total_transitions,
        success_rate=success_count / len(episodes) if episodes else 0,
        avg_reward=total_reward / len(episodes) if episodes else 0,
        avg_duration_ms=total_duration / len(episodes) if episodes else 0,
        avg_tokens=total_tokens / len(episodes) if episodes else 0,
    )

    return AgentLightningBatch(
        format="agent-lightning",
        version="1.0",
        created_at=datetime.now().isoformat(),
        episodes=episodes,
        stats=stats,
        metadata={
            "exported_at": datetime.now().isoformat(),
            **(config.metadata if config and config.metadata else {}),
        },
    )


__all__ = [
    # Types
    "AgentLightningTransition",
    "AgentLightningEpisode",
    "AgentLightningBatch",
    "AgentLightningBatchStats",
    "AgentLightningFilter",
    "AgentLightningExportConfig",
    "CreditAssignment",
    "ScoreData",
    "ExportContext",
    # Functions
    "export_to_agent_lightning",
    "export_batch_to_agent_lightning",
    "validate_agent_lightning_batch",
    "merge_agent_lightning_batches",
    "stream_export_to_agent_lightning",
]
