"""ML Framework Integrations.

Native Python integrations for ML frameworks including:
- Optimization signals for RLHF training
- Agent Lightning export for RL training
- DSPy integration for prompt optimization
- OpenAI fine-tuning export
- HuggingFace TRL export
"""

from neon_sdk.integrations.agent_lightning import (
    # Types
    AgentLightningBatch,
    AgentLightningEpisode,
    AgentLightningExportConfig,
    AgentLightningFilter,
    AgentLightningTransition,
    CreditAssignment,
    ExportContext,
    ScoreData,
    # Functions
    export_batch_to_agent_lightning,
    export_to_agent_lightning,
    merge_agent_lightning_batches,
    validate_agent_lightning_batch,
)
from neon_sdk.integrations.dspy import (
    # Types
    DSPyDataset,
    DSPyExample,
    DSPyMetrics,
    DSPyModuleConfig,
    # Functions
    create_dspy_dataset,
    extract_dspy_metrics,
    neon_dspy_callback,
    trace_to_dspy_example,
)
from neon_sdk.integrations.openai_finetune import (
    # Types
    ChatMessage,
    FineTuneExample,
    FineTuneExportConfig,
    OpenAIFineTuneBatch,
    # Functions
    export_to_openai_finetune,
    validate_finetune_batch,
    write_finetune_jsonl,
)
from neon_sdk.integrations.optimization import (
    # Types
    AnySignal,
    DemonstrationAction,
    DemonstrationSignal,
    EventSignal,
    FeedbackCategory,
    FeedbackSignal,
    MetricSignal,
    PreferenceSignal,
    RewardSignal,
    Signal,
    SignalAggregation,
    SignalBatch,
    SignalContext,
    SignalFilter,
    SignalGenerationResult,
    SignalGeneratorConfig,
    SignalGranularity,
    SignalSource,
    SignalType,
    # Generation functions
    aggregate_signals,
    create_signal_batch,
    filter_signals,
    generate_demonstration_signals,
    generate_event_signals,
    generate_metric_signals,
    generate_preference_signal,
    generate_reward_signals,
    generate_signals,
    to_rlhf_format,
)
from neon_sdk.integrations.trl import (
    # Types
    DPOExample,
    PPOTrajectory,
    RewardModelExample,
    TRLDataset,
    TRLExportConfig,
    # Functions
    export_to_dpo_pairs,
    export_to_ppo_trajectories,
    export_to_reward_model,
    to_huggingface_dataset,
)

__all__ = [
    # Optimization types
    "SignalType",
    "SignalSource",
    "SignalGranularity",
    "Signal",
    "RewardSignal",
    "PreferenceSignal",
    "DemonstrationSignal",
    "DemonstrationAction",
    "FeedbackSignal",
    "FeedbackCategory",
    "MetricSignal",
    "EventSignal",
    "AnySignal",
    "SignalBatch",
    "SignalAggregation",
    "SignalGeneratorConfig",
    "SignalFilter",
    "SignalContext",
    "SignalGenerationResult",
    # Optimization functions
    "generate_reward_signals",
    "generate_demonstration_signals",
    "generate_metric_signals",
    "generate_event_signals",
    "generate_preference_signal",
    "generate_signals",
    "filter_signals",
    "aggregate_signals",
    "create_signal_batch",
    "to_rlhf_format",
    # Agent Lightning types
    "AgentLightningTransition",
    "AgentLightningEpisode",
    "AgentLightningBatch",
    "AgentLightningFilter",
    "AgentLightningExportConfig",
    "CreditAssignment",
    "ScoreData",
    "ExportContext",
    # Agent Lightning functions
    "export_to_agent_lightning",
    "export_batch_to_agent_lightning",
    "validate_agent_lightning_batch",
    "merge_agent_lightning_batches",
    # DSPy types
    "DSPyExample",
    "DSPyDataset",
    "DSPyMetrics",
    "DSPyModuleConfig",
    # DSPy functions
    "trace_to_dspy_example",
    "create_dspy_dataset",
    "extract_dspy_metrics",
    "neon_dspy_callback",
    # OpenAI fine-tune types
    "ChatMessage",
    "FineTuneExample",
    "FineTuneExportConfig",
    "OpenAIFineTuneBatch",
    # OpenAI fine-tune functions
    "export_to_openai_finetune",
    "write_finetune_jsonl",
    "validate_finetune_batch",
    # TRL types
    "DPOExample",
    "RewardModelExample",
    "PPOTrajectory",
    "TRLDataset",
    "TRLExportConfig",
    # TRL functions
    "export_to_dpo_pairs",
    "export_to_reward_model",
    "export_to_ppo_trajectories",
    "to_huggingface_dataset",
]
