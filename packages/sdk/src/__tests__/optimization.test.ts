/**
 * Optimization Signal Tests
 */

import { describe, it, expect } from "vitest";
import type { TraceWithSpans, SpanWithChildren, Trace } from "@neon/shared";
import {
  generateSignals,
  generateRewardSignals,
  generateDemonstrationSignals,
  generateMetricSignals,
  generateEventSignals,
  generatePreferenceSignal,
  filterSignals,
  aggregateSignals,
  createSignalBatch,
  toRLHFFormat,
  type SignalContext,
  type RewardSignal,
  type MetricSignal,
  type EventSignal,
  type DemonstrationSignal,
} from "../optimization/index.js";

// Helper to create mock trace
function createMockTrace(overrides: Partial<Trace> = {}): Trace {
  return {
    traceId: "trace-123",
    projectId: "project-456",
    name: "test-trace",
    timestamp: new Date("2024-01-01T00:00:00Z"),
    endTime: new Date("2024-01-01T00:00:05Z"),
    durationMs: 5000,
    status: "ok",
    metadata: {},
    agentId: "agent-1",
    agentVersion: "1.0.0",
    totalInputTokens: 500,
    totalOutputTokens: 200,
    totalCostUsd: 0.01,
    toolCallCount: 2,
    llmCallCount: 3,
    ...overrides,
  };
}

// Helper to create mock span
function createMockSpan(overrides: Partial<SpanWithChildren> = {}): SpanWithChildren {
  return {
    spanId: `span-${Math.random().toString(36).substring(7)}`,
    traceId: "trace-123",
    projectId: "project-456",
    name: "test-span",
    kind: "internal",
    spanType: "span",
    timestamp: new Date("2024-01-01T00:00:00Z"),
    endTime: new Date("2024-01-01T00:00:01Z"),
    durationMs: 1000,
    status: "ok",
    attributes: {},
    children: [],
    ...overrides,
  };
}

// Helper to create mock context
function createMockContext(
  traceOverrides: Partial<Trace> = {},
  spans: SpanWithChildren[] = []
): SignalContext {
  return {
    trace: {
      trace: createMockTrace(traceOverrides),
      spans: spans.length > 0 ? spans : [createMockSpan()],
    },
  };
}

describe("Reward Signal Generation", () => {
  it("generates trace-level reward for successful execution", () => {
    const context = createMockContext({ status: "ok" });
    const signals = generateRewardSignals(context, {
      name: "test_reward",
      granularity: "trace",
      successReward: 1.0,
      failurePenalty: 0.0,
    });

    expect(signals).toHaveLength(1);
    expect(signals[0].signalType).toBe("reward");
    expect(signals[0].value).toBe(1.0);
    expect(signals[0].terminal).toBe(true);
    expect(signals[0].granularity).toBe("trace");
  });

  it("generates trace-level penalty for failed execution", () => {
    const context = createMockContext({ status: "error" });
    const signals = generateRewardSignals(context, {
      name: "test_reward",
      granularity: "trace",
      successReward: 1.0,
      failurePenalty: -0.5,
    });

    expect(signals).toHaveLength(1);
    expect(signals[0].value).toBe(-0.5);
    expect(signals[0].reason).toContain("failed");
  });

  it("generates span-level rewards with discounting", () => {
    const spans = [
      createMockSpan({ spanId: "span-1", status: "ok" }),
      createMockSpan({ spanId: "span-2", status: "ok" }),
      createMockSpan({ spanId: "span-3", status: "error" }),
    ];
    const context = createMockContext({}, spans);

    const signals = generateRewardSignals(context, {
      name: "test_reward",
      granularity: "span",
      discountFactor: 0.99,
    });

    expect(signals).toHaveLength(3);
    // Last span should have terminal=true
    expect(signals[signals.length - 1].terminal).toBe(true);
    // Earlier spans should have terminal=false
    expect(signals[0].terminal).toBe(false);
  });

  it("generates component-level aggregated rewards", () => {
    const spans = [
      createMockSpan({ componentType: "retrieval", status: "ok" }),
      createMockSpan({ componentType: "retrieval", status: "ok" }),
      createMockSpan({ componentType: "tool", status: "error" }),
      createMockSpan({ componentType: "tool", status: "ok" }),
    ];
    const context = createMockContext({}, spans);

    const signals = generateRewardSignals(context, {
      name: "test_reward",
      granularity: "component",
    });

    // Should have signals for retrieval, tool components
    expect(signals.length).toBeGreaterThanOrEqual(2);

    const retrievalSignal = signals.find(s => s.componentType === "retrieval");
    const toolSignal = signals.find(s => s.componentType === "tool");

    expect(retrievalSignal).toBeDefined();
    expect(toolSignal).toBeDefined();

    // Retrieval had 100% success, tool had 50%
    expect(retrievalSignal!.value).toBe(1.0);
    expect(toolSignal!.value).toBe(0.5);
  });

  it("includes latency reward when configured", () => {
    const context = createMockContext({ durationMs: 2000 }); // 2s is under 5s target
    const signals = generateRewardSignals(context, {
      name: "test_reward",
      granularity: "trace",
      includeLatencyReward: true,
      targetLatencyMs: 5000,
    });

    expect(signals).toHaveLength(1);
    // Should get bonus for being under target latency
    expect(signals[0].value).toBeGreaterThan(0.8);
  });
});

describe("Demonstration Signal Generation", () => {
  it("generates demonstration signals from tool spans", () => {
    const spans = [
      createMockSpan({
        spanType: "tool",
        toolName: "search",
        toolInput: '{"query": "test"}',
        toolOutput: '{"results": []}',
      }),
    ];
    const context = createMockContext({}, spans);

    const signals = generateDemonstrationSignals(context, {
      name: "expert_demos",
      granularity: "span",
      isExpert: true,
    });

    expect(signals).toHaveLength(1);
    expect(signals[0].signalType).toBe("demonstration");
    expect(signals[0].action.actionType).toBe("tool_call");
    expect(signals[0].action.name).toBe("search");
    expect(signals[0].isExpert).toBe(true);
  });

  it("generates demonstration signals from generation spans", () => {
    const spans = [
      createMockSpan({
        spanType: "generation",
        model: "gpt-4",
        input: "What is 2+2?",
        output: "4",
      }),
    ];
    const context = createMockContext({}, spans);

    const signals = generateDemonstrationSignals(context, {
      name: "demos",
      granularity: "span",
      spanTypes: ["generation"],
    });

    expect(signals).toHaveLength(1);
    expect(signals[0].action.actionType).toBe("generation");
    expect(signals[0].action.name).toBe("gpt-4");
  });

  it("calculates quality based on status", () => {
    const spans = [
      createMockSpan({ spanType: "tool", status: "ok", durationMs: 100 }),
      createMockSpan({ spanType: "tool", status: "error" }),
    ];
    const context = createMockContext({}, spans);

    const signals = generateDemonstrationSignals(context, {
      name: "demos",
      granularity: "span",
      isExpert: true,
    });

    expect(signals).toHaveLength(2);
    expect(signals[0].quality).toBe(1.0); // ok status
    expect(signals[1].quality).toBe(0.0); // error status
  });
});

describe("Metric Signal Generation", () => {
  it("generates latency metric", () => {
    const context = createMockContext({ durationMs: 5000 });
    const signals = generateMetricSignals(context, {
      name: "metrics",
      granularity: "trace",
      metrics: ["latency"],
    });

    const latencySignal = signals.find(s => s.name === "latency_ms");
    expect(latencySignal).toBeDefined();
    expect(latencySignal!.value).toBe(5000);
    expect(latencySignal!.unit).toBe("ms");
    expect(latencySignal!.higherIsBetter).toBe(false);
  });

  it("generates token metric", () => {
    const context = createMockContext({
      totalInputTokens: 500,
      totalOutputTokens: 200,
    });
    const signals = generateMetricSignals(context, {
      name: "metrics",
      granularity: "trace",
      metrics: ["tokens"],
    });

    const tokenSignal = signals.find(s => s.name === "total_tokens");
    expect(tokenSignal).toBeDefined();
    expect(tokenSignal!.value).toBe(700);
  });

  it("generates error rate metric", () => {
    const spans = [
      createMockSpan({ status: "ok" }),
      createMockSpan({ status: "ok" }),
      createMockSpan({ status: "error" }),
      createMockSpan({ status: "error" }),
    ];
    const context = createMockContext({}, spans);

    const signals = generateMetricSignals(context, {
      name: "metrics",
      granularity: "trace",
      metrics: ["error_rate"],
    });

    const errorRateSignal = signals.find(s => s.name === "error_rate");
    expect(errorRateSignal).toBeDefined();
    expect(errorRateSignal!.value).toBe(0.5); // 2 out of 4
    expect(errorRateSignal!.threshold).toBe(0.1);
  });

  it("generates cost metric when available", () => {
    const context = createMockContext({ totalCostUsd: 0.05 });
    const signals = generateMetricSignals(context, {
      name: "metrics",
      granularity: "trace",
      metrics: ["cost"],
    });

    const costSignal = signals.find(s => s.name === "cost_usd");
    expect(costSignal).toBeDefined();
    expect(costSignal!.value).toBe(0.05);
    expect(costSignal!.unit).toBe("USD");
  });
});

describe("Event Signal Generation", () => {
  it("generates error events for failed spans", () => {
    const spans = [
      createMockSpan({ status: "error", statusMessage: "Connection timeout" }),
    ];
    const context = createMockContext({}, spans);

    const signals = generateEventSignals(context, {
      name: "events",
      granularity: "span",
      eventTypes: ["error"],
    });

    expect(signals).toHaveLength(1);
    expect(signals[0].eventName).toBe("span_error");
    expect(signals[0].severity).toBe("error");
    expect(signals[0].data?.statusMessage).toBe("Connection timeout");
  });

  it("generates tool error events specifically", () => {
    const spans = [
      createMockSpan({
        spanType: "tool",
        toolName: "search",
        status: "error",
        statusMessage: "API rate limit",
      }),
    ];
    const context = createMockContext({}, spans);

    const signals = generateEventSignals(context, {
      name: "events",
      granularity: "span",
      eventTypes: ["tool_error"],
    });

    const toolError = signals.find(s => s.eventName === "tool_error");
    expect(toolError).toBeDefined();
    expect(toolError!.data?.toolName).toBe("search");
  });

  it("detects potential timeout events", () => {
    const spans = [
      createMockSpan({ durationMs: 60000 }), // 60 seconds
    ];
    const context = createMockContext({}, spans);

    const signals = generateEventSignals(context, {
      name: "events",
      granularity: "span",
      eventTypes: ["timeout"],
    });

    expect(signals).toHaveLength(1);
    expect(signals[0].eventName).toBe("potential_timeout");
    expect(signals[0].severity).toBe("warning");
  });
});

describe("Preference Signal Generation", () => {
  it("prefers successful trace over failed trace", () => {
    const contextA = createMockContext({ status: "ok", traceId: "trace-A" });
    const contextB = createMockContext({ status: "error", traceId: "trace-B" });

    const pref = generatePreferenceSignal(contextA, contextB, {
      name: "comparison",
      criteria: ["success"],
    });

    expect(pref.signalType).toBe("preference");
    expect(pref.preferredId).toBe("trace-A");
    expect(pref.rejectedId).toBe("trace-B");
    expect(pref.confidence).toBeGreaterThan(0.5);
  });

  it("prefers faster trace when both succeed", () => {
    const contextA = createMockContext({
      status: "ok",
      traceId: "trace-A",
      durationMs: 1000,
    });
    const contextB = createMockContext({
      status: "ok",
      traceId: "trace-B",
      durationMs: 5000,
    });

    const pref = generatePreferenceSignal(contextA, contextB, {
      name: "comparison",
      criteria: ["latency"],
    });

    expect(pref.preferredId).toBe("trace-A");
    expect(pref.reason).toContain("faster");
  });

  it("prefers cheaper trace", () => {
    const contextA = createMockContext({
      status: "ok",
      traceId: "trace-A",
      totalCostUsd: 0.01,
    });
    const contextB = createMockContext({
      status: "ok",
      traceId: "trace-B",
      totalCostUsd: 0.10,
    });

    const pref = generatePreferenceSignal(contextA, contextB, {
      name: "comparison",
      criteria: ["cost"],
    });

    expect(pref.preferredId).toBe("trace-A");
    expect(pref.reason).toContain("cheaper");
  });
});

describe("Comprehensive Signal Generation", () => {
  it("generates all signal types when configured", () => {
    const spans = [
      createMockSpan({ spanType: "tool", toolName: "search", status: "ok" }),
      createMockSpan({ spanType: "generation", status: "error" }),
    ];
    const context = createMockContext({}, spans);

    const result = generateSignals(context, {
      includeRewards: true,
      includeDemonstrations: true,
      includeMetrics: true,
      includeEvents: true,
    });

    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.stats.totalSignals).toBe(result.signals.length);
    expect(result.stats.byType.reward).toBeGreaterThan(0);
    expect(result.stats.byType.metric).toBeGreaterThan(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("respects configuration options", () => {
    const context = createMockContext();

    const result = generateSignals(context, {
      includeRewards: true,
      includeDemonstrations: false,
      includeMetrics: false,
      includeEvents: false,
    });

    expect(result.stats.byType.reward).toBeGreaterThan(0);
    expect(result.stats.byType.demonstration).toBeUndefined();
    expect(result.stats.byType.metric).toBeUndefined();
  });
});

describe("Signal Filtering", () => {
  it("filters by signal type", () => {
    const context = createMockContext();
    const result = generateSignals(context, {
      includeRewards: true,
      includeMetrics: true,
    });

    const rewardsOnly = filterSignals(result.signals, {
      signalTypes: ["reward"],
    });

    expect(rewardsOnly.every(s => s.signalType === "reward")).toBe(true);
  });

  it("filters by value range", () => {
    const spans = [
      createMockSpan({ status: "ok" }),
      createMockSpan({ status: "error" }),
    ];
    const context = createMockContext({}, spans);

    const result = generateSignals(context, {
      includeRewards: true,
      rewardConfig: { granularity: "span" },
    });

    const highRewards = filterSignals(result.signals, {
      signalTypes: ["reward"],
      minValue: 0.5,
    });

    expect(highRewards.every(s => (s as RewardSignal).value >= 0.5)).toBe(true);
  });

  it("filters by time range", () => {
    const context = createMockContext();
    const result = generateSignals(context);

    const future = new Date("2100-01-01");
    const filtered = filterSignals(result.signals, {
      timeRange: { end: future },
    });

    expect(filtered.length).toBe(result.signals.length);

    const past = new Date("2000-01-01");
    const noResults = filterSignals(result.signals, {
      timeRange: { end: past },
    });

    expect(noResults.length).toBe(0);
  });
});

describe("Signal Aggregation", () => {
  it("aggregates signals by type", () => {
    const spans = [
      createMockSpan({ status: "ok" }),
      createMockSpan({ status: "ok" }),
      createMockSpan({ status: "error" }),
    ];
    const context = createMockContext({}, spans);

    const result = generateSignals(context, {
      includeRewards: true,
      includeMetrics: true,
      rewardConfig: { granularity: "span" },
    });

    const aggregations = aggregateSignals(result.signals);

    expect(aggregations.length).toBeGreaterThan(0);

    const rewardAgg = aggregations.find(a => a.signalType === "reward");
    expect(rewardAgg).toBeDefined();
    expect(rewardAgg!.count).toBe(3); // 3 spans
    expect(rewardAgg!.mean).toBeDefined();
    expect(rewardAgg!.min).toBeDefined();
    expect(rewardAgg!.max).toBeDefined();
  });

  it("calculates statistics correctly", () => {
    const spans = [
      createMockSpan({ status: "ok" }),  // reward = 1.0
      createMockSpan({ status: "ok" }),  // reward = 1.0
    ];
    const context = createMockContext({}, spans);

    const result = generateSignals(context, {
      includeRewards: true,
      rewardConfig: { granularity: "span", successReward: 1.0 },
    });

    const aggregations = aggregateSignals(result.signals);
    const rewardAgg = aggregations.find(a => a.signalType === "reward");

    expect(rewardAgg!.mean).toBeCloseTo(1.0, 1);
    expect(rewardAgg!.min).toBeCloseTo(1.0, 1);
    expect(rewardAgg!.max).toBeCloseTo(1.0, 1);
  });
});

describe("Signal Batch Creation", () => {
  it("creates a signal batch with metadata", () => {
    const context = createMockContext();
    const result = generateSignals(context);

    const batch = createSignalBatch("project-123", result.signals, "sdk-test");

    expect(batch.batchId).toMatch(/^batch_/);
    expect(batch.projectId).toBe("project-123");
    expect(batch.signals).toBe(result.signals);
    expect(batch.source).toBe("sdk-test");
    expect(batch.createdAt).toBeInstanceOf(Date);
  });
});

describe("RLHF Format Conversion", () => {
  it("converts reward signals to RLHF format", () => {
    const context = createMockContext();
    const result = generateSignals(context, {
      includeRewards: true,
      rewardConfig: { granularity: "trace" },
    });

    const rlhfData = toRLHFFormat(result.signals);
    const rewardData = rlhfData.filter(d => d.type === "reward");

    expect(rewardData.length).toBeGreaterThan(0);
    expect(rewardData[0].data).toHaveProperty("reward");
    expect(rewardData[0].data).toHaveProperty("terminal");
  });

  it("converts demonstration signals to RLHF format", () => {
    const spans = [
      createMockSpan({ spanType: "tool", toolName: "search" }),
    ];
    const context = createMockContext({}, spans);

    const result = generateSignals(context, {
      includeDemonstrations: true,
    });

    const rlhfData = toRLHFFormat(result.signals);
    const demoData = rlhfData.filter(d => d.type === "demonstration");

    expect(demoData.length).toBeGreaterThan(0);
    expect(demoData[0].data).toHaveProperty("action");
    expect(demoData[0].data).toHaveProperty("isExpert");
  });

  it("converts metric signals to RLHF format", () => {
    const context = createMockContext();
    const result = generateSignals(context, {
      includeMetrics: true,
    });

    const rlhfData = toRLHFFormat(result.signals);
    const metricData = rlhfData.filter(d => d.type === "metric");

    expect(metricData.length).toBeGreaterThan(0);
    expect(metricData[0].data).toHaveProperty("name");
    expect(metricData[0].data).toHaveProperty("value");
  });
});
