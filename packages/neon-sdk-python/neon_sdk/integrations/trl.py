"""HuggingFace TRL Export.

Export traces to HuggingFace TRL library format.
Supports DPO pairs, reward model training, and PPO trajectories.

TRL (Transformer Reinforcement Learning) is a library for training
language models with reinforcement learning.
See: https://github.com/huggingface/trl
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal, cast

from neon_sdk.types import SpanWithChildren, TraceWithSpans

# =============================================================================
# Types
# =============================================================================


@dataclass
class DPOExample:
    """A single example for Direct Preference Optimization (DPO).

    Format matches TRL DPOTrainer requirements.
    """

    prompt: str
    chosen: str
    rejected: str
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for Dataset creation."""
        return {
            "prompt": self.prompt,
            "chosen": self.chosen,
            "rejected": self.rejected,
        }


@dataclass
class RewardModelExample:
    """A single example for reward model training.

    Format matches TRL RewardTrainer requirements.
    """

    input_ids_chosen: list[int] | None = None
    attention_mask_chosen: list[int] | None = None
    input_ids_rejected: list[int] | None = None
    attention_mask_rejected: list[int] | None = None
    # Alternative text format
    prompt: str = ""
    chosen: str = ""
    rejected: str = ""
    chosen_score: float = 1.0
    rejected_score: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for Dataset creation."""
        return {
            "prompt": self.prompt,
            "chosen": self.chosen,
            "rejected": self.rejected,
            "chosen_score": self.chosen_score,
            "rejected_score": self.rejected_score,
        }


@dataclass
class PPOStep:
    """A single step in a PPO trajectory."""

    query: str
    response: str
    reward: float
    log_prob: float | None = None
    value: float | None = None
    advantage: float | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class PPOTrajectory:
    """A trajectory for PPO training.

    Format matches TRL PPOTrainer requirements.
    """

    steps: list[PPOStep]
    total_reward: float = 0.0
    episode_id: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for Dataset creation."""
        return {
            "query": [s.query for s in self.steps],
            "response": [s.response for s in self.steps],
            "reward": [s.reward for s in self.steps],
        }


@dataclass
class TRLDataset:
    """Container for TRL training data."""

    dpo_examples: list[DPOExample] = field(default_factory=list)
    reward_examples: list[RewardModelExample] = field(default_factory=list)
    ppo_trajectories: list[PPOTrajectory] = field(default_factory=list)
    name: str = ""
    created_at: datetime = field(default_factory=datetime.now)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class TRLExportConfig:
    """Configuration for TRL export."""

    # DPO configuration
    comparison_method: Literal["score", "success", "latency"] = "score"
    score_field: str = "quality"
    min_score_diff: float = 0.2

    # Reward model configuration
    normalize_scores: bool = True
    score_range: tuple[float, float] = (0.0, 1.0)

    # PPO configuration
    discount_factor: float = 0.99
    include_advantages: bool = False

    # Filtering
    success_only: bool = False
    min_turns: int = 1

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


def _extract_prompt_response(trace: TraceWithSpans) -> tuple[str, str] | None:
    """Extract the main prompt and response from a trace."""
    all_spans = _flatten_spans(trace.spans)
    generation_spans = [s for s in all_spans if s.span_type.value == "generation"]

    if not generation_spans:
        return None

    # Use first generation for prompt, last for response
    first_gen = generation_spans[0]
    last_gen = generation_spans[-1]

    prompt = first_gen.input or ""
    response = last_gen.output or ""

    if not prompt or not response:
        return None

    return prompt, response


def _get_trace_score(
    trace: TraceWithSpans,
    scores_map: dict[str, dict[str, float]] | None,
    score_field: str,
) -> float:
    """Get score for a trace."""
    if scores_map and trace.trace.trace_id in scores_map:
        return scores_map[trace.trace.trace_id].get(score_field, 0.5)

    # Fallback to success-based scoring
    if trace.trace.status.value == "ok":
        return 1.0
    return 0.0


# =============================================================================
# DPO Export
# =============================================================================


def export_to_dpo_pairs(
    traces: list[TraceWithSpans],
    config: TRLExportConfig | None = None,
    scores_map: dict[str, dict[str, float]] | None = None,
) -> list[DPOExample]:
    """Export traces to DPO (Direct Preference Optimization) pairs.

    Creates preference pairs by comparing traces with different scores.

    Args:
        traces: List of traces to convert
        config: Export configuration
        scores_map: Optional mapping of trace_id to scores

    Returns:
        List of DPOExample ready for TRL DPOTrainer

    Example:
        ```python
        dpo_pairs = export_to_dpo_pairs(
            traces,
            TRLExportConfig(
                comparison_method='score',
                score_field='quality',
                min_score_diff=0.2,
            ),
            scores_map=my_scores,
        )

        # Convert to HuggingFace Dataset
        dataset = to_huggingface_dataset(dpo_pairs)

        # Use with TRL
        from trl import DPOTrainer
        trainer = DPOTrainer(
            model=model,
            ref_model=ref_model,
            train_dataset=dataset,
            ...
        )
        ```
    """
    if config is None:
        config = TRLExportConfig()

    # Extract prompt/response and score for each trace
    trace_data: list[tuple[str, str, float, str]] = []

    for trace in traces:
        # Apply filters
        if config.success_only and trace.trace.status.value != "ok":
            continue

        result = _extract_prompt_response(trace)
        if not result:
            continue

        prompt, response = result
        score = _get_trace_score(trace, scores_map, config.score_field)
        trace_data.append((prompt, response, score, trace.trace.trace_id))

    # Group by similar prompts and create pairs
    examples: list[DPOExample] = []
    prompt_groups: dict[str, list[tuple[str, float, str]]] = {}

    for prompt, response, score, trace_id in trace_data:
        # Normalize prompt for grouping
        key = prompt[:200].strip().lower()
        if key not in prompt_groups:
            prompt_groups[key] = []
        prompt_groups[key].append((response, score, trace_id))

    # Create DPO pairs from groups
    for _prompt_key, responses in prompt_groups.items():
        if len(responses) < 2:
            continue

        # Sort by score descending
        sorted_responses = sorted(responses, key=lambda x: x[1], reverse=True)

        # Create pairs between high and low scoring responses
        for i, (chosen, chosen_score, chosen_id) in enumerate(sorted_responses[:-1]):
            for rejected, rejected_score, rejected_id in sorted_responses[i + 1 :]:
                if chosen_score - rejected_score >= config.min_score_diff:
                    # Find the original prompt
                    original_prompt = next(
                        (p for p, r, s, tid in trace_data if tid == chosen_id),
                        ("", "", 0, ""),
                    )[0]

                    examples.append(
                        DPOExample(
                            prompt=original_prompt,
                            chosen=chosen,
                            rejected=rejected,
                            metadata={
                                "chosen_id": chosen_id,
                                "rejected_id": rejected_id,
                                "chosen_score": chosen_score,
                                "rejected_score": rejected_score,
                                "score_diff": chosen_score - rejected_score,
                            },
                        )
                    )

    return examples


# =============================================================================
# Reward Model Export
# =============================================================================


def export_to_reward_model(
    traces: list[TraceWithSpans],
    config: TRLExportConfig | None = None,
    scores_map: dict[str, dict[str, float]] | None = None,
) -> list[RewardModelExample]:
    """Export traces to reward model training format.

    Creates paired examples with scores for reward model training.

    Args:
        traces: List of traces to convert
        config: Export configuration
        scores_map: Optional mapping of trace_id to scores

    Returns:
        List of RewardModelExample ready for TRL RewardTrainer

    Example:
        ```python
        reward_examples = export_to_reward_model(
            traces,
            TRLExportConfig(normalize_scores=True),
            scores_map=my_scores,
        )

        # Convert to HuggingFace Dataset
        dataset = to_huggingface_dataset(reward_examples)

        # Use with TRL
        from trl import RewardTrainer
        trainer = RewardTrainer(
            model=model,
            train_dataset=dataset,
            ...
        )
        ```
    """
    if config is None:
        config = TRLExportConfig()

    # Build DPO pairs first, then convert to reward format
    dpo_pairs = export_to_dpo_pairs(traces, config, scores_map)

    examples: list[RewardModelExample] = []

    for pair in dpo_pairs:
        chosen_score = pair.metadata.get("chosen_score", 1.0)
        rejected_score = pair.metadata.get("rejected_score", 0.0)

        # Normalize scores if configured
        if config.normalize_scores:
            score_min, score_max = config.score_range
            chosen_score = (chosen_score - score_min) / (score_max - score_min)
            rejected_score = (rejected_score - score_min) / (score_max - score_min)

        examples.append(
            RewardModelExample(
                prompt=pair.prompt,
                chosen=pair.chosen,
                rejected=pair.rejected,
                chosen_score=chosen_score,
                rejected_score=rejected_score,
                metadata=pair.metadata,
            )
        )

    return examples


# =============================================================================
# PPO Export
# =============================================================================


def export_to_ppo_trajectories(
    traces: list[TraceWithSpans],
    config: TRLExportConfig | None = None,
    scores_map: dict[str, dict[str, float]] | None = None,
) -> list[PPOTrajectory]:
    """Export traces to PPO trajectory format.

    Creates trajectories with per-step rewards for PPO training.

    Args:
        traces: List of traces to convert
        config: Export configuration
        scores_map: Optional mapping of trace_id to scores

    Returns:
        List of PPOTrajectory ready for TRL PPOTrainer

    Example:
        ```python
        trajectories = export_to_ppo_trajectories(
            traces,
            TRLExportConfig(discount_factor=0.99),
            scores_map=my_scores,
        )

        # Use with TRL PPO
        from trl import PPOTrainer, PPOConfig

        ppo_config = PPOConfig(...)
        trainer = PPOTrainer(ppo_config, model, ref_model, tokenizer)

        for traj in trajectories:
            queries = [tokenizer(s.query, return_tensors='pt') for s in traj.steps]
            responses = [tokenizer(s.response, return_tensors='pt') for s in traj.steps]
            rewards = [torch.tensor([s.reward]) for s in traj.steps]
            trainer.step(queries, responses, rewards)
        ```
    """
    if config is None:
        config = TRLExportConfig()

    trajectories: list[PPOTrajectory] = []

    for trace in traces:
        # Apply filters
        if config.success_only and trace.trace.status.value != "ok":
            continue

        # Get terminal reward
        terminal_reward = _get_trace_score(trace, scores_map, config.score_field)

        all_spans = _flatten_spans(trace.spans)
        generation_spans = [s for s in all_spans if s.span_type.value == "generation"]

        if len(generation_spans) < config.min_turns:
            continue

        steps: list[PPOStep] = []
        n = len(generation_spans)

        for i, span in enumerate(generation_spans):
            query = span.input or ""
            response = span.output or ""

            if not query or not response:
                continue

            # Assign reward with discount
            steps_from_end = n - 1 - i
            discount = config.discount_factor ** steps_from_end
            reward = terminal_reward * discount

            step = PPOStep(
                query=query,
                response=response,
                reward=reward,
                metadata={
                    "span_id": span.span_id,
                    "span_name": span.name,
                    "model": span.model,
                },
            )
            steps.append(step)

        if steps:
            trajectories.append(
                PPOTrajectory(
                    steps=steps,
                    total_reward=terminal_reward,
                    episode_id=trace.trace.trace_id,
                    metadata={
                        "trace_id": trace.trace.trace_id,
                        "success": trace.trace.status.value == "ok",
                        "duration_ms": trace.trace.duration_ms,
                    },
                )
            )

    return trajectories


# =============================================================================
# HuggingFace Dataset Conversion
# =============================================================================


def to_huggingface_dataset(
    data: list[DPOExample] | list[RewardModelExample] | list[PPOTrajectory],
    dataset_type: Literal["dpo", "reward", "ppo"] | None = None,
) -> Any:
    """Convert TRL examples to HuggingFace Dataset.

    Args:
        data: List of examples or trajectories
        dataset_type: Type of dataset (auto-detected if not specified)

    Returns:
        HuggingFace Dataset object

    Raises:
        ImportError: If datasets library not installed

    Example:
        ```python
        dpo_pairs = export_to_dpo_pairs(traces)
        dataset = to_huggingface_dataset(dpo_pairs)

        # Now use with TRL
        from trl import DPOTrainer
        trainer = DPOTrainer(..., train_dataset=dataset)
        ```
    """
    try:
        from datasets import Dataset  # type: ignore[import-not-found]
    except ImportError as e:
        raise ImportError(
            "HuggingFace datasets library required. Install with: pip install datasets"
        ) from e

    if not data:
        return Dataset.from_dict({})

    # Auto-detect type
    if dataset_type is None:
        if isinstance(data[0], DPOExample):
            dataset_type = "dpo"
        elif isinstance(data[0], RewardModelExample):
            dataset_type = "reward"
        elif isinstance(data[0], PPOTrajectory):
            dataset_type = "ppo"
        else:
            raise ValueError(f"Unknown data type: {type(data[0])}")

    if dataset_type == "dpo":
        return Dataset.from_dict({
            "prompt": [ex.prompt for ex in data],  # type: ignore
            "chosen": [ex.chosen for ex in data],  # type: ignore
            "rejected": [ex.rejected for ex in data],  # type: ignore
        })

    elif dataset_type == "reward":
        return Dataset.from_dict({
            "prompt": [ex.prompt for ex in data],  # type: ignore
            "chosen": [ex.chosen for ex in data],  # type: ignore
            "rejected": [ex.rejected for ex in data],  # type: ignore
            "chosen_score": [ex.chosen_score for ex in data],  # type: ignore
            "rejected_score": [ex.rejected_score for ex in data],  # type: ignore
        })

    elif dataset_type == "ppo":
        # Flatten trajectories for PPO
        all_queries: list[str] = []
        all_responses: list[str] = []
        all_rewards: list[float] = []

        # Cast data to PPOTrajectory list for PPO dataset type
        ppo_data = cast(list[PPOTrajectory], data)
        for traj in ppo_data:
            for step in traj.steps:
                all_queries.append(step.query)
                all_responses.append(step.response)
                all_rewards.append(step.reward)

        return Dataset.from_dict({
            "query": all_queries,
            "response": all_responses,
            "reward": all_rewards,
        })

    else:
        raise ValueError(f"Unknown dataset type: {dataset_type}")


def create_trl_dataset(
    traces: list[TraceWithSpans],
    config: TRLExportConfig | None = None,
    scores_map: dict[str, dict[str, float]] | None = None,
    include_dpo: bool = True,
    include_reward: bool = False,
    include_ppo: bool = False,
) -> TRLDataset:
    """Create a comprehensive TRL dataset from traces.

    Args:
        traces: List of traces to convert
        config: Export configuration
        scores_map: Optional mapping of trace_id to scores
        include_dpo: Include DPO examples
        include_reward: Include reward model examples
        include_ppo: Include PPO trajectories

    Returns:
        TRLDataset with requested data types

    Example:
        ```python
        dataset = create_trl_dataset(
            traces,
            config=TRLExportConfig(comparison_method='score'),
            scores_map=my_scores,
            include_dpo=True,
            include_reward=True,
        )

        # Access different formats
        dpo_hf = to_huggingface_dataset(dataset.dpo_examples)
        reward_hf = to_huggingface_dataset(dataset.reward_examples)
        ```
    """
    if config is None:
        config = TRLExportConfig()

    result = TRLDataset(
        name=f"neon-trl-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
        metadata={
            "source_traces": len(traces),
            "config": {
                "comparison_method": config.comparison_method,
                "score_field": config.score_field,
                "success_only": config.success_only,
            },
        },
    )

    if include_dpo:
        result.dpo_examples = export_to_dpo_pairs(traces, config, scores_map)

    if include_reward:
        result.reward_examples = export_to_reward_model(traces, config, scores_map)

    if include_ppo:
        result.ppo_trajectories = export_to_ppo_trajectories(traces, config, scores_map)

    return result


__all__ = [
    # Types
    "DPOExample",
    "RewardModelExample",
    "PPOStep",
    "PPOTrajectory",
    "TRLDataset",
    "TRLExportConfig",
    # Export functions
    "export_to_dpo_pairs",
    "export_to_reward_model",
    "export_to_ppo_trajectories",
    # Dataset conversion
    "to_huggingface_dataset",
    "create_trl_dataset",
]
