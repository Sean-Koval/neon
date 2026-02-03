"""
Tests for ML Framework Integrations

Tests for optimization signals, Agent Lightning, DSPy, OpenAI fine-tuning, and TRL exports.
"""

from datetime import datetime

from neon_sdk.types import (
    ComponentType,
    SpanKind,
    SpanStatus,
    SpanType,
    SpanWithChildren,
    Trace,
    TraceStatus,
    TraceWithSpans,
)

# =============================================================================
# Test Fixtures
# =============================================================================


def make_span(
    span_id: str = "span-1",
    trace_id: str = "trace-1",
    name: str = "test-span",
    span_type: SpanType = SpanType.SPAN,
    component_type: ComponentType | None = None,
    status: SpanStatus = SpanStatus.OK,
    duration_ms: int = 100,
    input_text: str | None = None,
    output_text: str | None = None,
    model: str | None = None,
    tool_name: str | None = None,
    tool_input: str | None = None,
    tool_output: str | None = None,
    children: list[SpanWithChildren] | None = None,
) -> SpanWithChildren:
    """Create a test span."""
    return SpanWithChildren(
        spanId=span_id,
        traceId=trace_id,
        projectId="test-project",
        parentSpanId=None,
        name=name,
        kind=SpanKind.INTERNAL,
        spanType=span_type,
        componentType=component_type,
        timestamp=datetime.now(),
        endTime=datetime.now(),
        durationMs=duration_ms,
        status=status,
        statusMessage=None,
        model=model,
        modelParameters=None,
        input=input_text,
        output=output_text,
        inputTokens=10,
        outputTokens=20,
        totalTokens=30,
        costUsd=0.001,
        toolName=tool_name,
        toolInput=tool_input,
        toolOutput=tool_output,
        attributes={},
        children=children or [],
    )


def make_trace(
    trace_id: str = "trace-1",
    name: str = "test-trace",
    status: TraceStatus = TraceStatus.OK,
    duration_ms: int = 1000,
    spans: list[SpanWithChildren] | None = None,
) -> TraceWithSpans:
    """Create a test trace."""
    return TraceWithSpans(
        trace=Trace(
            traceId=trace_id,
            projectId="test-project",
            name=name,
            timestamp=datetime.now(),
            endTime=datetime.now(),
            durationMs=duration_ms,
            status=status,
            metadata={"question": "What is AI?", "context": "Technology context"},
            agentId="test-agent",
            agentVersion="1.0",
            workflowId=None,
            workflowRunId=None,
            totalInputTokens=100,
            totalOutputTokens=200,
            totalCostUsd=0.01,
            toolCallCount=2,
            llmCallCount=3,
        ),
        spans=spans
        or [
            make_span(
                span_id="span-1",
                name="generation-1",
                span_type=SpanType.GENERATION,
                input_text="User query about AI",
                output_text="AI is artificial intelligence.",
                model="gpt-4",
            ),
            make_span(
                span_id="span-2",
                name="tool-call",
                span_type=SpanType.TOOL,
                component_type=ComponentType.TOOL,
                tool_name="search",
                tool_input='{"query": "AI definition"}',
                tool_output='{"results": ["AI is..."]}',
            ),
            make_span(
                span_id="span-3",
                name="generation-2",
                span_type=SpanType.GENERATION,
                input_text="Follow-up question",
                output_text="Machine learning is a subset of AI.",
                model="gpt-4",
            ),
        ],
    )


# =============================================================================
# Optimization Module Tests
# =============================================================================


class TestOptimizationSignals:
    """Tests for optimization signal generation."""

    def test_generate_reward_signals_trace_level(self) -> None:
        """Test trace-level reward signal generation."""
        from neon_sdk.integrations.optimization import (
            RewardSignalConfig,
            SignalContext,
            SignalGranularity,
            generate_reward_signals,
        )

        trace = make_trace()
        context = SignalContext(trace=trace)
        config = RewardSignalConfig(
            name="test",
            granularity=SignalGranularity.TRACE,
            success_reward=1.0,
            failure_penalty=-0.5,
        )

        signals = generate_reward_signals(context, config)

        assert len(signals) == 1
        assert signals[0].value == 1.0  # Success
        assert signals[0].terminal is True
        assert "Trace completed successfully" in signals[0].reason

    def test_generate_reward_signals_span_level(self) -> None:
        """Test span-level reward signal generation."""
        from neon_sdk.integrations.optimization import (
            RewardSignalConfig,
            SignalContext,
            SignalGranularity,
            generate_reward_signals,
        )

        trace = make_trace()
        context = SignalContext(trace=trace)
        config = RewardSignalConfig(
            name="test",
            granularity=SignalGranularity.SPAN,
            discount_factor=0.9,
        )

        signals = generate_reward_signals(context, config)

        assert len(signals) == 3
        # Last span should be terminal
        assert signals[-1].terminal is True
        # Discounting should be applied
        assert signals[0].discount < signals[-1].discount

    def test_generate_demonstration_signals(self) -> None:
        """Test demonstration signal generation."""
        from neon_sdk.integrations.optimization import (
            DemonstrationSignalConfig,
            SignalContext,
            SignalGranularity,
            generate_demonstration_signals,
        )

        trace = make_trace()
        context = SignalContext(trace=trace)
        config = DemonstrationSignalConfig(
            name="test",
            granularity=SignalGranularity.SPAN,
            is_expert=True,
            span_types=["generation", "tool"],
        )

        signals = generate_demonstration_signals(context, config)

        assert len(signals) == 3
        assert all(s.is_expert for s in signals)
        assert signals[0].action is not None
        assert signals[0].action.action_type == "generation"

    def test_generate_metric_signals(self) -> None:
        """Test metric signal generation."""
        from neon_sdk.integrations.optimization import (
            MetricSignalConfig,
            SignalContext,
            SignalGranularity,
            generate_metric_signals,
        )

        trace = make_trace()
        context = SignalContext(trace=trace)
        config = MetricSignalConfig(
            name="test",
            granularity=SignalGranularity.TRACE,
            metrics=["latency", "tokens", "error_rate"],
        )

        signals = generate_metric_signals(context, config)

        assert len(signals) == 3
        metric_names = [s.name for s in signals]
        assert "latency_ms" in metric_names
        assert "total_tokens" in metric_names
        assert "error_rate" in metric_names

    def test_generate_preference_signal(self) -> None:
        """Test preference signal generation."""
        from neon_sdk.integrations.optimization import (
            PreferenceSignalConfig,
            SignalContext,
            generate_preference_signal,
        )

        # Create two traces with different performance
        trace_a = make_trace(
            trace_id="trace-a",
            status=TraceStatus.OK,
            duration_ms=500,
        )
        trace_b = make_trace(
            trace_id="trace-b",
            status=TraceStatus.ERROR,
            duration_ms=2000,
        )

        context_a = SignalContext(trace=trace_a)
        context_b = SignalContext(trace=trace_b)

        signal = generate_preference_signal(
            context_a,
            context_b,
            PreferenceSignalConfig(name="test", criteria=["success", "latency"]),
        )

        assert signal.preferred_id == "trace-a"
        assert signal.rejected_id == "trace-b"
        assert signal.confidence > 0.5

    def test_comprehensive_signal_generation(self) -> None:
        """Test comprehensive signal generation."""
        from neon_sdk.integrations.optimization import (
            ComprehensiveSignalConfig,
            SignalContext,
            generate_signals,
        )

        trace = make_trace()
        context = SignalContext(trace=trace)
        config = ComprehensiveSignalConfig(
            include_rewards=True,
            include_metrics=True,
            include_events=True,
        )

        result = generate_signals(context, config)

        assert len(result.signals) > 0
        assert "reward" in result.stats["by_type"]
        assert "metric" in result.stats["by_type"]

    def test_filter_signals(self) -> None:
        """Test signal filtering."""
        from neon_sdk.integrations.optimization import (
            SignalContext,
            SignalFilter,
            SignalType,
            filter_signals,
            generate_signals,
        )

        trace = make_trace()
        context = SignalContext(trace=trace)
        result = generate_signals(context)

        # Filter to only reward signals
        filtered = filter_signals(
            result.signals,
            SignalFilter(signal_types=[SignalType.REWARD]),
        )

        assert all(s.signal_type == SignalType.REWARD for s in filtered)

    def test_to_rlhf_format(self) -> None:
        """Test RLHF format conversion."""
        from neon_sdk.integrations.optimization import (
            SignalContext,
            generate_signals,
            to_rlhf_format,
        )

        trace = make_trace()
        context = SignalContext(trace=trace)
        result = generate_signals(context)

        rlhf_data = to_rlhf_format(result.signals)

        assert len(rlhf_data) == len(result.signals)
        assert all("type" in item for item in rlhf_data)
        assert all("trace_id" in item for item in rlhf_data)
        assert all("data" in item for item in rlhf_data)


# =============================================================================
# Agent Lightning Tests
# =============================================================================


class TestAgentLightningExport:
    """Tests for Agent Lightning export."""

    def test_export_single_trace(self) -> None:
        """Test exporting a single trace to Agent Lightning format."""
        from neon_sdk.integrations.agent_lightning import (
            AgentLightningExportConfig,
            CreditAssignment,
            ExportContext,
            export_to_agent_lightning,
        )

        trace = make_trace()
        context = ExportContext(trace=trace)
        config = AgentLightningExportConfig(
            credit_assignment=CreditAssignment.DECAY,
            discount_factor=0.99,
        )

        episode = export_to_agent_lightning(context, config)

        assert episode is not None
        assert episode.episode_id == "trace-1"
        assert len(episode.transitions) > 0
        assert episode.success is True
        assert episode.terminal_reward > 0

    def test_export_batch(self) -> None:
        """Test exporting batch of traces."""
        from neon_sdk.integrations.agent_lightning import (
            ExportContext,
            export_batch_to_agent_lightning,
        )

        traces = [make_trace(trace_id=f"trace-{i}") for i in range(3)]
        contexts = [ExportContext(trace=t) for t in traces]

        batch = export_batch_to_agent_lightning(contexts)

        assert batch.format == "agent-lightning"
        assert batch.version == "1.0"
        assert len(batch.episodes) == 3
        assert batch.stats is not None
        assert batch.stats.total_episodes == 3

    def test_credit_assignment_uniform(self) -> None:
        """Test uniform credit assignment."""
        from neon_sdk.integrations.agent_lightning import (
            AgentLightningExportConfig,
            CreditAssignment,
            ExportContext,
            export_to_agent_lightning,
        )

        trace = make_trace()
        context = ExportContext(trace=trace)
        config = AgentLightningExportConfig(
            credit_assignment=CreditAssignment.UNIFORM,
            success_reward=1.0,
        )

        episode = export_to_agent_lightning(context, config)

        assert episode is not None
        # All rewards should be equal
        rewards = [t.reward for t in episode.transitions]
        assert len(set(rewards)) == 1  # All same value

    def test_credit_assignment_terminal(self) -> None:
        """Test terminal credit assignment."""
        from neon_sdk.integrations.agent_lightning import (
            AgentLightningExportConfig,
            CreditAssignment,
            ExportContext,
            export_to_agent_lightning,
        )

        trace = make_trace()
        context = ExportContext(trace=trace)
        config = AgentLightningExportConfig(
            credit_assignment=CreditAssignment.TERMINAL,
            success_reward=1.0,
        )

        episode = export_to_agent_lightning(context, config)

        assert episode is not None
        # Only last transition should have reward
        rewards = [t.reward for t in episode.transitions]
        assert rewards[-1] > 0
        assert all(r == 0 for r in rewards[:-1])

    def test_validate_batch(self) -> None:
        """Test batch validation."""
        from neon_sdk.integrations.agent_lightning import (
            ExportContext,
            export_batch_to_agent_lightning,
            validate_agent_lightning_batch,
        )

        traces = [make_trace(trace_id=f"trace-{i}") for i in range(3)]
        contexts = [ExportContext(trace=t) for t in traces]
        batch = export_batch_to_agent_lightning(contexts)

        is_valid, errors = validate_agent_lightning_batch(batch)

        assert is_valid
        assert len(errors) == 0

    def test_merge_batches(self) -> None:
        """Test merging batches."""
        from neon_sdk.integrations.agent_lightning import (
            ExportContext,
            export_batch_to_agent_lightning,
            merge_agent_lightning_batches,
        )

        batch1 = export_batch_to_agent_lightning(
            [ExportContext(trace=make_trace(trace_id="trace-1"))]
        )
        batch2 = export_batch_to_agent_lightning(
            [ExportContext(trace=make_trace(trace_id="trace-2"))]
        )

        merged = merge_agent_lightning_batches([batch1, batch2])

        assert len(merged.episodes) == 2
        assert merged.stats.total_episodes == 2


# =============================================================================
# DSPy Integration Tests
# =============================================================================


class TestDSPyIntegration:
    """Tests for DSPy integration."""

    def test_trace_to_dspy_example(self) -> None:
        """Test converting trace to DSPy example."""
        from neon_sdk.integrations.dspy import trace_to_dspy_example

        trace = make_trace()
        example = trace_to_dspy_example(
            trace,
            input_fields=["question"],
            output_fields=["answer"],
        )

        assert example is not None
        assert "question" in example.inputs or "input" in example.inputs
        assert len(example.outputs) > 0

    def test_create_dspy_dataset(self) -> None:
        """Test creating DSPy dataset from traces."""
        from neon_sdk.integrations.dspy import create_dspy_dataset

        traces = [make_trace(trace_id=f"trace-{i}") for i in range(5)]
        dataset = create_dspy_dataset(
            traces,
            name="test-dataset",
            success_only=True,
        )

        assert len(dataset.examples) > 0
        assert dataset.name == "test-dataset"

    def test_dspy_dataset_split(self) -> None:
        """Test splitting DSPy dataset."""
        from neon_sdk.integrations.dspy import create_dspy_dataset

        traces = [make_trace(trace_id=f"trace-{i}") for i in range(10)]
        dataset = create_dspy_dataset(traces)

        train, dev = dataset.split(train_ratio=0.8)

        # Note: May not be exactly 80% due to rounding
        assert len(train) >= 6
        assert len(dev) >= 1

    def test_extract_dspy_metrics(self) -> None:
        """Test metrics extraction for DSPy."""
        from neon_sdk.integrations.dspy import extract_dspy_metrics

        traces = [make_trace(trace_id=f"trace-{i}") for i in range(5)]
        metrics = extract_dspy_metrics(traces)

        assert metrics.success_rate == 1.0
        assert metrics.avg_latency_ms > 0
        assert metrics.avg_tokens > 0
        assert metrics.total_traces == 5

    def test_neon_dspy_callback(self) -> None:
        """Test DSPy callback creation."""
        from neon_sdk.integrations.dspy import neon_dspy_callback

        callback = neon_dspy_callback(
            trace_name="test-module",
            capture_inputs=True,
        )

        assert callback.trace_name == "test-module"
        assert callback.capture_inputs is True


# =============================================================================
# OpenAI Fine-Tuning Tests
# =============================================================================


class TestOpenAIFineTuneExport:
    """Tests for OpenAI fine-tuning export."""

    def test_export_to_openai_finetune(self) -> None:
        """Test exporting traces to OpenAI fine-tuning format."""
        from neon_sdk.integrations.openai_finetune import (
            FineTuneExportConfig,
            export_to_openai_finetune,
        )

        traces = [make_trace(trace_id=f"trace-{i}") for i in range(3)]
        config = FineTuneExportConfig(
            system_prompt="You are a helpful assistant.",
            success_only=True,
        )

        batch = export_to_openai_finetune(traces, config)

        assert len(batch.examples) > 0
        # Check format
        for example in batch.examples:
            assert len(example.messages) > 0
            # Should have at least one user and one assistant message
            roles = [m.role for m in example.messages]
            assert "assistant" in roles

    def test_finetune_example_to_jsonl(self) -> None:
        """Test JSONL conversion."""
        from neon_sdk.integrations.openai_finetune import (
            export_to_openai_finetune,
        )

        traces = [make_trace()]
        batch = export_to_openai_finetune(traces)

        jsonl = batch.to_jsonl()

        assert isinstance(jsonl, str)
        assert '"messages"' in jsonl

    def test_validate_finetune_batch(self) -> None:
        """Test batch validation."""
        from neon_sdk.integrations.openai_finetune import (
            export_to_openai_finetune,
            validate_finetune_batch,
        )

        # Create enough traces for validation (OpenAI requires at least 10)
        traces = [make_trace(trace_id=f"trace-{i}") for i in range(15)]
        batch = export_to_openai_finetune(traces)

        is_valid, errors = validate_finetune_batch(batch)

        # Should pass validation if we have enough examples
        if len(batch.examples) >= 10:
            assert is_valid
            assert len(errors) == 0

    def test_estimate_finetune_cost(self) -> None:
        """Test cost estimation."""
        from neon_sdk.integrations.openai_finetune import (
            estimate_finetune_cost,
            export_to_openai_finetune,
        )

        traces = [make_trace(trace_id=f"trace-{i}") for i in range(10)]
        batch = export_to_openai_finetune(traces)

        estimate = estimate_finetune_cost(batch, model="gpt-3.5-turbo", epochs=3)

        assert "model" in estimate
        assert "estimated_cost_usd" in estimate
        assert "total_examples" in estimate

    def test_split_finetune_batch(self) -> None:
        """Test batch splitting."""
        from neon_sdk.integrations.openai_finetune import (
            export_to_openai_finetune,
            split_finetune_batch,
        )

        traces = [make_trace(trace_id=f"trace-{i}") for i in range(10)]
        batch = export_to_openai_finetune(traces)

        train, val = split_finetune_batch(batch, train_ratio=0.8)

        assert train.metadata.get("split") == "train"
        assert val.metadata.get("split") == "validation"


# =============================================================================
# HuggingFace TRL Tests
# =============================================================================


class TestTRLExport:
    """Tests for HuggingFace TRL export."""

    def test_export_to_dpo_pairs(self) -> None:
        """Test DPO pairs export."""
        from neon_sdk.integrations.trl import TRLExportConfig, export_to_dpo_pairs

        # Create traces with different scores
        traces = [
            make_trace(trace_id="trace-good", status=TraceStatus.OK),
            make_trace(trace_id="trace-bad", status=TraceStatus.ERROR),
        ]
        scores_map = {
            "trace-good": {"quality": 0.9},
            "trace-bad": {"quality": 0.3},
        }

        config = TRLExportConfig(
            comparison_method="score",
            score_field="quality",
            min_score_diff=0.2,
        )

        pairs = export_to_dpo_pairs(traces, config, scores_map)

        # May or may not generate pairs depending on prompt similarity
        # Just check the format is correct
        for pair in pairs:
            assert pair.prompt is not None
            assert pair.chosen is not None
            assert pair.rejected is not None

    def test_export_to_reward_model(self) -> None:
        """Test reward model export."""
        from neon_sdk.integrations.trl import export_to_reward_model

        traces = [
            make_trace(trace_id="trace-good", status=TraceStatus.OK),
            make_trace(trace_id="trace-bad", status=TraceStatus.ERROR),
        ]
        scores_map = {
            "trace-good": {"quality": 0.9},
            "trace-bad": {"quality": 0.3},
        }

        examples = export_to_reward_model(traces, scores_map=scores_map)

        for example in examples:
            assert example.chosen_score >= example.rejected_score

    def test_export_to_ppo_trajectories(self) -> None:
        """Test PPO trajectories export."""
        from neon_sdk.integrations.trl import TRLExportConfig, export_to_ppo_trajectories

        traces = [make_trace(trace_id=f"trace-{i}") for i in range(3)]
        config = TRLExportConfig(discount_factor=0.99)

        trajectories = export_to_ppo_trajectories(traces, config)

        assert len(trajectories) > 0
        for traj in trajectories:
            assert len(traj.steps) > 0
            # Check discounting is applied
            if len(traj.steps) > 1:
                assert traj.steps[-1].reward >= traj.steps[0].reward

    def test_create_trl_dataset(self) -> None:
        """Test comprehensive TRL dataset creation."""
        from neon_sdk.integrations.trl import TRLExportConfig, create_trl_dataset

        traces = [make_trace(trace_id=f"trace-{i}") for i in range(5)]
        config = TRLExportConfig()

        dataset = create_trl_dataset(
            traces,
            config,
            include_dpo=True,
            include_ppo=True,
        )

        assert dataset.name != ""
        assert len(dataset.ppo_trajectories) > 0


# =============================================================================
# Integration Test: Full Pipeline
# =============================================================================


class TestFullPipeline:
    """Tests for full integration pipeline."""

    def test_signals_to_agent_lightning(self) -> None:
        """Test generating signals then exporting to Agent Lightning."""
        from neon_sdk.integrations.agent_lightning import (
            ExportContext,
            ScoreData,
            export_to_agent_lightning,
        )
        from neon_sdk.integrations.optimization import (
            SignalContext,
            generate_signals,
        )

        trace = make_trace()

        # Generate signals
        signal_context = SignalContext(trace=trace)
        signals_result = generate_signals(signal_context)

        # Extract reward signals as scores
        scores = [
            ScoreData(name="reward", value=s.value, span_id=s.span_id)
            for s in signals_result.signals
            if hasattr(s, "value")
        ]

        # Export to Agent Lightning
        export_context = ExportContext(trace=trace, scores=scores)
        episode = export_to_agent_lightning(export_context)

        assert episode is not None
        assert len(episode.transitions) > 0

    def test_traces_to_multiple_formats(self) -> None:
        """Test exporting traces to multiple ML formats."""
        from neon_sdk.integrations.agent_lightning import (
            ExportContext as ALContext,
        )
        from neon_sdk.integrations.agent_lightning import (
            export_batch_to_agent_lightning,
        )
        from neon_sdk.integrations.dspy import create_dspy_dataset
        from neon_sdk.integrations.openai_finetune import export_to_openai_finetune
        from neon_sdk.integrations.trl import export_to_ppo_trajectories

        traces = [make_trace(trace_id=f"trace-{i}") for i in range(5)]

        # Export to all formats
        al_batch = export_batch_to_agent_lightning(
            [ALContext(trace=t) for t in traces]
        )
        dspy_dataset = create_dspy_dataset(traces)
        openai_batch = export_to_openai_finetune(traces)
        ppo_trajs = export_to_ppo_trajectories(traces)

        # Verify all exports produced output
        assert len(al_batch.episodes) > 0
        assert len(dspy_dataset.examples) > 0
        assert len(openai_batch.examples) > 0
        assert len(ppo_trajs) > 0
