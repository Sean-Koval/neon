/**
 * Tests for Agent Lightning Export
 */

import { describe, test, expect } from "vitest";
import {
  exportToAgentLightning,
  exportBatchToAgentLightning,
  validateAgentLightningBatch,
  mergeAgentLightningBatches,
  type ExportContext,
  type AgentLightningBatch,
} from "../export/agent-lightning.js";
import type { TraceWithSpans, SpanWithChildren } from "@neon/shared";

// Helper to create mock spans
function createMockSpan(
  overrides: Partial<SpanWithChildren> = {}
): SpanWithChildren {
  return {
    spanId: `span-${Math.random().toString(36).slice(2, 9)}`,
    traceId: "trace-123",
    projectId: "project-1",
    name: "test-span",
    kind: "internal",
    spanType: "generation",
    timestamp: new Date("2024-01-01T10:00:00Z"),
    endTime: new Date("2024-01-01T10:00:01Z"),
    durationMs: 1000,
    status: "ok",
    attributes: {},
    children: [],
    input: "Test prompt input",
    output: "Test generation output",
    model: "gpt-4",
    ...overrides,
  };
}

// Helper to create mock trace
function createMockTrace(
  overrides: Partial<TraceWithSpans["trace"]> = {},
  spans: SpanWithChildren[] = []
): TraceWithSpans {
  return {
    trace: {
      traceId: "trace-123",
      projectId: "project-1",
      name: "test-trace",
      timestamp: new Date("2024-01-01T10:00:00Z"),
      endTime: new Date("2024-01-01T10:00:05Z"),
      durationMs: 5000,
      status: "ok",
      metadata: {},
      totalInputTokens: 100,
      totalOutputTokens: 200,
      toolCallCount: 1,
      llmCallCount: 2,
      ...overrides,
    },
    spans:
      spans.length > 0
        ? spans
        : [
            createMockSpan({
              spanId: "span-1",
              name: "generation-1",
              spanType: "generation",
              input: "What is the weather?",
              output: "The weather is sunny.",
            }),
            createMockSpan({
              spanId: "span-2",
              name: "tool-call",
              spanType: "tool",
              toolName: "get_weather",
              toolInput: '{"location": "NYC"}',
              toolOutput: '{"temp": 72, "conditions": "sunny"}',
            }),
          ],
  };
}

describe("exportToAgentLightning", () => {
  test("exports basic trace to episode format", () => {
    const trace = createMockTrace();
    const context: ExportContext = { trace };

    const episode = exportToAgentLightning(context);

    expect(episode).not.toBeNull();
    expect(episode!.episodeId).toBe("trace-123");
    expect(episode!.name).toBe("test-trace");
    expect(episode!.success).toBe(true);
    expect(episode!.terminalReward).toBeCloseTo(1.0);
    expect(episode!.transitions.length).toBe(2);
  });

  test("assigns rewards with decay strategy", () => {
    const trace = createMockTrace();
    const context: ExportContext = { trace };

    const episode = exportToAgentLightning(context, {
      creditAssignment: "decay",
      discountFactor: 0.9,
    });

    expect(episode).not.toBeNull();
    // With decay, later transitions get higher rewards
    const rewards = episode!.transitions.map((t) => t.reward);
    expect(rewards[1]).toBeGreaterThan(rewards[0]);
  });

  test("assigns rewards with uniform strategy", () => {
    const trace = createMockTrace();
    const context: ExportContext = { trace };

    const episode = exportToAgentLightning(context, {
      creditAssignment: "uniform",
    });

    expect(episode).not.toBeNull();
    const rewards = episode!.transitions.map((t) => t.reward);
    // All rewards should be equal
    expect(rewards[0]).toBeCloseTo(rewards[1]);
  });

  test("assigns rewards with terminal strategy", () => {
    const trace = createMockTrace();
    const context: ExportContext = { trace };

    const episode = exportToAgentLightning(context, {
      creditAssignment: "terminal",
    });

    expect(episode).not.toBeNull();
    const rewards = episode!.transitions.map((t) => t.reward);
    // Only last transition should have reward
    expect(rewards[0]).toBe(0);
    expect(rewards[1]).toBeCloseTo(1.0);
  });

  test("filters by component type", () => {
    const trace = createMockTrace({}, [
      createMockSpan({
        spanId: "span-1",
        spanType: "generation",
        componentType: "prompt",
      }),
      createMockSpan({
        spanId: "span-2",
        spanType: "generation",
        componentType: "reasoning",
      }),
      createMockSpan({
        spanId: "span-3",
        spanType: "tool",
        componentType: "tool",
      }),
    ]);
    const context: ExportContext = { trace };

    const episode = exportToAgentLightning(context, {
      filter: {
        componentTypes: ["tool"],
        spanTypes: ["generation", "tool"],
      },
    });

    expect(episode).not.toBeNull();
    expect(episode!.transitions.length).toBe(1);
    expect(episode!.transitions[0].componentType).toBe("tool");
  });

  test("filters by success only", () => {
    const failedTrace = createMockTrace({ status: "error" });
    const context: ExportContext = { trace: failedTrace };

    const episode = exportToAgentLightning(context, {
      filter: { successOnly: true },
    });

    expect(episode).toBeNull();
  });

  test("incorporates scores into terminal reward", () => {
    const trace = createMockTrace();
    const context: ExportContext = {
      trace,
      scores: [
        { name: "quality", value: 0.8 },
        { name: "helpfulness", value: 0.6 },
      ],
    };

    const episode = exportToAgentLightning(context);

    expect(episode).not.toBeNull();
    // Terminal reward should blend base success (1.0) with avg score (0.7)
    expect(episode!.terminalReward).toBeCloseTo(0.85);
  });

  test("includes state when configured", () => {
    const trace = createMockTrace();
    const context: ExportContext = { trace };

    const episode = exportToAgentLightning(context, {
      includeState: true,
    });

    expect(episode).not.toBeNull();
    expect(episode!.transitions[0].stateBefore).toBeDefined();
    expect(episode!.transitions[0].stateAfter).toBeDefined();
  });

  test("extracts tool information correctly", () => {
    const trace = createMockTrace({}, [
      createMockSpan({
        spanType: "tool",
        toolName: "search_api",
        toolInput: '{"query": "test"}',
        toolOutput: '{"results": []}',
      }),
    ]);
    const context: ExportContext = { trace };

    const episode = exportToAgentLightning(context);

    expect(episode).not.toBeNull();
    expect(episode!.transitions[0].toolName).toBe("search_api");
    expect(episode!.transitions[0].prompt).toBe('{"query": "test"}');
    expect(episode!.transitions[0].generation).toBe('{"results": []}');
  });

  test("returns null for trace with no exportable spans", () => {
    const trace = createMockTrace({}, [
      createMockSpan({
        spanType: "event", // Not generation or tool
        input: undefined,
        output: undefined,
      }),
    ]);
    const context: ExportContext = { trace };

    const episode = exportToAgentLightning(context);

    expect(episode).toBeNull();
  });
});

describe("exportBatchToAgentLightning", () => {
  test("exports multiple traces to batch format", () => {
    const contexts: ExportContext[] = [
      { trace: createMockTrace({ traceId: "trace-1" }) },
      { trace: createMockTrace({ traceId: "trace-2" }) },
      { trace: createMockTrace({ traceId: "trace-3", status: "error" }) },
    ];

    const batch = exportBatchToAgentLightning(contexts);

    expect(batch.format).toBe("agent-lightning");
    expect(batch.version).toBe("1.0");
    expect(batch.episodes.length).toBe(3);
    expect(batch.stats.totalEpisodes).toBe(3);
    expect(batch.stats.successRate).toBeCloseTo(2 / 3);
  });

  test("filters unsuccessful traces when configured", () => {
    const contexts: ExportContext[] = [
      { trace: createMockTrace({ traceId: "trace-1", status: "ok" }) },
      { trace: createMockTrace({ traceId: "trace-2", status: "error" }) },
    ];

    const batch = exportBatchToAgentLightning(contexts, {
      filter: { successOnly: true },
    });

    expect(batch.episodes.length).toBe(1);
    expect(batch.episodes[0].episodeId).toBe("trace-1");
  });

  test("calculates batch statistics correctly", () => {
    const contexts: ExportContext[] = [
      { trace: createMockTrace({ traceId: "trace-1", durationMs: 1000 }) },
      { trace: createMockTrace({ traceId: "trace-2", durationMs: 2000 }) },
    ];

    const batch = exportBatchToAgentLightning(contexts);

    expect(batch.stats.avgDurationMs).toBe(1500);
    expect(batch.stats.totalTransitions).toBe(4); // 2 transitions per trace
  });

  test("includes custom metadata", () => {
    const contexts: ExportContext[] = [{ trace: createMockTrace() }];

    const batch = exportBatchToAgentLightning(contexts, {
      metadata: { projectId: "test-project", version: "1.0.0" },
    });

    expect(batch.metadata.projectId).toBe("test-project");
    expect(batch.metadata.version).toBe("1.0.0");
  });
});

describe("validateAgentLightningBatch", () => {
  test("validates correct batch", () => {
    const batch = exportBatchToAgentLightning([{ trace: createMockTrace() }]);

    const result = validateAgentLightningBatch(batch);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("detects invalid format", () => {
    const batch = {
      format: "wrong-format",
      version: "1.0",
      episodes: [],
      stats: {},
      metadata: {},
    } as unknown as AgentLightningBatch;

    const result = validateAgentLightningBatch(batch);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Invalid format: expected 'agent-lightning', got 'wrong-format'"
    );
  });

  test("detects missing episode fields", () => {
    const batch = {
      format: "agent-lightning",
      version: "1.0",
      createdAt: new Date().toISOString(),
      episodes: [
        {
          // Missing episodeId
          transitions: [{ prompt: "test", generation: "output", reward: 0.5 }],
        },
      ],
      stats: {},
      metadata: {},
    } as unknown as AgentLightningBatch;

    const result = validateAgentLightningBatch(batch);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("missing episodeId"))).toBe(
      true
    );
  });

  test("detects invalid transition reward", () => {
    const batch = {
      format: "agent-lightning",
      version: "1.0",
      createdAt: new Date().toISOString(),
      episodes: [
        {
          episodeId: "test",
          transitions: [{ prompt: "test", generation: "output", reward: "invalid" }],
        },
      ],
      stats: {},
      metadata: {},
    } as unknown as AgentLightningBatch;

    const result = validateAgentLightningBatch(batch);

    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("reward must be a number"))
    ).toBe(true);
  });
});

describe("mergeAgentLightningBatches", () => {
  test("merges multiple batches", () => {
    const batch1 = exportBatchToAgentLightning([
      { trace: createMockTrace({ traceId: "trace-1" }) },
    ]);
    const batch2 = exportBatchToAgentLightning([
      { trace: createMockTrace({ traceId: "trace-2" }) },
      { trace: createMockTrace({ traceId: "trace-3" }) },
    ]);

    const merged = mergeAgentLightningBatches([batch1, batch2]);

    expect(merged.episodes.length).toBe(3);
    expect(merged.stats.totalEpisodes).toBe(3);
    expect(merged.metadata.batchCount).toBe(2);
  });

  test("recalculates statistics after merge", () => {
    const batch1 = exportBatchToAgentLightning([
      { trace: createMockTrace({ traceId: "trace-1", status: "ok" }) },
    ]);
    const batch2 = exportBatchToAgentLightning([
      { trace: createMockTrace({ traceId: "trace-2", status: "error" }) },
    ]);

    const merged = mergeAgentLightningBatches([batch1, batch2]);

    expect(merged.stats.successRate).toBeCloseTo(0.5);
  });
});

describe("score threshold filtering", () => {
  test("filters transitions by score threshold", () => {
    const trace = createMockTrace({}, [
      createMockSpan({ spanId: "span-1", spanType: "generation" }),
      createMockSpan({ spanId: "span-2", spanType: "generation" }),
    ]);
    const context: ExportContext = {
      trace,
      scores: [
        { name: "quality", value: 0.3, spanId: "span-1" },
        { name: "quality", value: 0.8, spanId: "span-2" },
      ],
    };

    const episode = exportToAgentLightning(context, {
      filter: { scoreThreshold: 0.5 },
    });

    expect(episode).not.toBeNull();
    expect(episode!.transitions.length).toBe(1);
    expect(episode!.transitions[0].transitionId).toBe("span-2");
  });
});

describe("credit assignment strategies", () => {
  test("proportional assignment gives more to later steps", () => {
    const trace = createMockTrace({}, [
      createMockSpan({ spanId: "span-1" }),
      createMockSpan({ spanId: "span-2" }),
      createMockSpan({ spanId: "span-3" }),
    ]);
    const context: ExportContext = { trace };

    const episode = exportToAgentLightning(context, {
      creditAssignment: "proportional",
    });

    expect(episode).not.toBeNull();
    const rewards = episode!.transitions.map((t) => t.reward);
    expect(rewards[0]).toBeLessThan(rewards[1]);
    expect(rewards[1]).toBeLessThan(rewards[2]);
  });
});
