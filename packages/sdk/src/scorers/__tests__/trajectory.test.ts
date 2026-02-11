/**
 * Tests for Trajectory Scorers
 */

import { describe, it, expect } from "vitest";
import type { EvalContext } from "../base.js";
import {
  pathOptimalityScorer,
  stepConsistencyScorer,
  recoveryEfficiencyScorer,
  planAdherenceScorer,
} from "../trajectory.js";

// Helper to create mock EvalContext with tool spans
function createTrajectoryContext(
  toolSpans: Array<{
    name: string;
    toolName?: string;
    toolInput?: string;
    status?: "ok" | "error";
    componentType?: string;
    output?: string;
    attributes?: Record<string, string>;
  }>,
  expected?: Record<string, unknown>,
): EvalContext {
  const spans = toolSpans.map((s, i) => ({
    spanId: `span-${i}`,
    traceId: "test-trace-id",
    projectId: "test-project",
    parentSpanId: undefined,
    name: s.name,
    kind: "internal" as const,
    spanType: (s.componentType === "planning" ? "span" : "tool") as "tool" | "span",
    componentType: s.componentType as any,
    timestamp: new Date(Date.now() + i * 1000),
    endTime: new Date(Date.now() + i * 1000 + 500),
    durationMs: 500,
    status: (s.status || "ok") as "ok" | "error",
    statusMessage: s.status === "error" ? "Failed" : undefined,
    toolName: s.toolName || s.name,
    toolInput: s.toolInput,
    output: s.output,
    attributes: s.attributes || {},
    children: [],
  }));

  return {
    trace: {
      trace: {
        traceId: "test-trace-id",
        projectId: "test-project",
        name: "test-trace",
        timestamp: new Date(),
        durationMs: 1000,
        status: "ok",
        metadata: {},
        totalInputTokens: 0,
        totalOutputTokens: 0,
        toolCallCount: toolSpans.length,
        llmCallCount: 0,
      },
      spans,
    },
    expected,
  };
}

describe("pathOptimalityScorer", () => {
  it("returns 1.0 when actual steps equals minimum expected", () => {
    const scorer = pathOptimalityScorer();
    const result = scorer.evaluate(
      createTrajectoryContext(
        [{ name: "search" }, { name: "analyze" }, { name: "summarize" }],
        { minSteps: 3 },
      ),
    );

    expect(result).toMatchObject({ value: 1.0 });
    expect(result.reason).toContain("3 steps taken, 3 minimum expected");
  });

  it("returns less than 1 when more steps than minimum", () => {
    const scorer = pathOptimalityScorer();
    const result = scorer.evaluate(
      createTrajectoryContext(
        [
          { name: "search" },
          { name: "retry-search" },
          { name: "analyze" },
          { name: "summarize" },
        ],
        { minSteps: 2 },
      ),
    );

    expect(result.value).toBeCloseTo(0.5);
    expect(result.reason).toContain("4 steps taken, 2 minimum expected");
  });

  it("caps score at 1.0 when fewer steps than minimum", () => {
    const scorer = pathOptimalityScorer();
    const result = scorer.evaluate(
      createTrajectoryContext([{ name: "search" }], { minSteps: 5 }),
    );

    expect(result.value).toBe(1.0);
  });

  it("returns 1.0 when no minSteps expected (defaults to actual)", () => {
    const scorer = pathOptimalityScorer();
    const result = scorer.evaluate(
      createTrajectoryContext([{ name: "search" }, { name: "analyze" }]),
    );

    expect(result.value).toBe(1.0);
  });

  it("handles single-step traces", () => {
    const scorer = pathOptimalityScorer();
    const result = scorer.evaluate(
      createTrajectoryContext([{ name: "search" }], { minSteps: 1 }),
    );

    expect(result.value).toBe(1.0);
  });

  it("handles zero tool spans", () => {
    const scorer = pathOptimalityScorer();
    const ctx = createTrajectoryContext([]);
    // No tool spans means 0 actual steps, 0 minSteps → 1.0
    const result = scorer.evaluate(ctx);

    expect(result.value).toBe(1.0);
  });
});

describe("stepConsistencyScorer", () => {
  it("returns 1.0 for consistent steps (no contradictions)", () => {
    const scorer = stepConsistencyScorer();
    const result = scorer.evaluate(
      createTrajectoryContext([
        { name: "search" },
        { name: "analyze" },
        { name: "summarize" },
      ]),
    );

    expect(result.value).toBe(1.0);
    expect(result.reason).toContain("0 contradictions");
  });

  it("detects repeated identical tool calls", () => {
    const scorer = stepConsistencyScorer();
    const result = scorer.evaluate(
      createTrajectoryContext([
        { name: "search", toolInput: '{"q": "hello"}' },
        { name: "search", toolInput: '{"q": "hello"}' },
      ]),
    );

    expect(result.value).toBeLessThan(1.0);
    expect(result.reason).toContain("1 contradictions");
  });

  it("detects create-then-delete contradictions", () => {
    const scorer = stepConsistencyScorer();
    const result = scorer.evaluate(
      createTrajectoryContext([
        { name: "create_file" },
        { name: "delete_file" },
      ]),
    );

    expect(result.value).toBeLessThan(1.0);
    expect(result.reason).toContain("contradictions");
  });

  it("handles single tool span", () => {
    const scorer = stepConsistencyScorer();
    const result = scorer.evaluate(
      createTrajectoryContext([{ name: "search" }]),
    );

    expect(result.value).toBe(1.0);
    expect(result.reason).toContain("Single tool span");
  });

  it("handles no tool spans", () => {
    const scorer = stepConsistencyScorer();
    const result = scorer.evaluate(createTrajectoryContext([]));

    expect(result.value).toBe(1.0);
    expect(result.reason).toContain("No tool spans");
  });

  it("does not flag different tool inputs as contradictions", () => {
    const scorer = stepConsistencyScorer();
    const result = scorer.evaluate(
      createTrajectoryContext([
        { name: "search", toolInput: '{"q": "first"}' },
        { name: "search", toolInput: '{"q": "second"}' },
      ]),
    );

    expect(result.value).toBe(1.0);
  });
});

describe("recoveryEfficiencyScorer", () => {
  it("returns 1.0 when no errors", () => {
    const scorer = recoveryEfficiencyScorer();
    const result = scorer.evaluate(
      createTrajectoryContext([
        { name: "search", status: "ok" },
        { name: "analyze", status: "ok" },
      ]),
    );

    expect(result.value).toBe(1.0);
    expect(result.reason).toBe("No errors encountered");
  });

  it("returns 1.0 when all errors are recovered from", () => {
    const scorer = recoveryEfficiencyScorer();
    const result = scorer.evaluate(
      createTrajectoryContext([
        { name: "search", status: "error" },
        { name: "search", status: "ok" },
      ]),
    );

    expect(result.value).toBe(1.0);
    expect(result.reason).toContain("1/1 errors recovered");
  });

  it("returns 0 when no errors are recovered from", () => {
    const scorer = recoveryEfficiencyScorer();
    const result = scorer.evaluate(
      createTrajectoryContext([
        { name: "search", status: "error" },
        { name: "analyze", status: "error" },
      ]),
    );

    expect(result.value).toBe(0);
    expect(result.reason).toContain("0/2 errors recovered");
  });

  it("returns partial score for partial recovery", () => {
    const scorer = recoveryEfficiencyScorer();
    const result = scorer.evaluate(
      createTrajectoryContext([
        { name: "search", status: "error" },
        { name: "search", status: "ok" },
        { name: "analyze", status: "error" },
      ]),
    );

    expect(result.value).toBe(0.5);
    expect(result.reason).toContain("1/2 errors recovered");
  });

  it("handles all-error traces", () => {
    const scorer = recoveryEfficiencyScorer();
    const result = scorer.evaluate(
      createTrajectoryContext([
        { name: "step1", status: "error" },
        { name: "step2", status: "error" },
        { name: "step3", status: "error" },
      ]),
    );

    expect(result.value).toBe(0);
  });
});

describe("planAdherenceScorer", () => {
  it("returns 1.0 when no planning spans exist", () => {
    const scorer = planAdherenceScorer();
    const result = scorer.evaluate(
      createTrajectoryContext([
        { name: "search" },
        { name: "analyze" },
      ]),
    );

    expect(result.value).toBe(1.0);
    expect(result.reason).toContain("No planning spans");
  });

  it("returns 0.0 when planning exists but no tools executed", () => {
    const scorer = planAdherenceScorer();
    // Only planning spans, no tool spans
    const ctx: EvalContext = {
      trace: {
        trace: {
          traceId: "test-trace-id",
          projectId: "test-project",
          name: "test-trace",
          timestamp: new Date(),
          durationMs: 1000,
          status: "ok",
          metadata: {},
          totalInputTokens: 0,
          totalOutputTokens: 0,
          toolCallCount: 0,
          llmCallCount: 0,
        },
        spans: [
          {
            spanId: "plan-1",
            traceId: "test-trace-id",
            projectId: "test-project",
            name: "plan",
            kind: "internal",
            spanType: "span",
            componentType: "planning",
            timestamp: new Date(),
            durationMs: 100,
            status: "ok",
            output: "I will search and then analyze",
            attributes: {},
            children: [],
          } as any,
        ],
      },
    };
    const result = scorer.evaluate(ctx);

    expect(result.value).toBe(0.0);
    expect(result.reason).toContain("no tool execution");
  });

  it("scores based on plan.actions attribute", () => {
    const scorer = planAdherenceScorer();
    const ctx: EvalContext = {
      trace: {
        trace: {
          traceId: "test-trace-id",
          projectId: "test-project",
          name: "test-trace",
          timestamp: new Date(),
          durationMs: 1000,
          status: "ok",
          metadata: {},
          totalInputTokens: 0,
          totalOutputTokens: 0,
          toolCallCount: 2,
          llmCallCount: 0,
        },
        spans: [
          {
            spanId: "plan-1",
            traceId: "test-trace-id",
            projectId: "test-project",
            name: "plan",
            kind: "internal",
            spanType: "span",
            componentType: "planning",
            timestamp: new Date(),
            durationMs: 100,
            status: "ok",
            attributes: {
              "plan.actions": JSON.stringify(["search", "analyze", "summarize"]),
            },
            children: [],
          } as any,
          {
            spanId: "tool-1",
            traceId: "test-trace-id",
            projectId: "test-project",
            name: "search",
            kind: "internal",
            spanType: "tool",
            toolName: "search",
            timestamp: new Date(Date.now() + 1000),
            durationMs: 100,
            status: "ok",
            attributes: {},
            children: [],
          } as any,
          {
            spanId: "tool-2",
            traceId: "test-trace-id",
            projectId: "test-project",
            name: "analyze",
            kind: "internal",
            spanType: "tool",
            toolName: "analyze",
            timestamp: new Date(Date.now() + 2000),
            durationMs: 100,
            status: "ok",
            attributes: {},
            children: [],
          } as any,
        ],
      },
    };
    const result = scorer.evaluate(ctx);

    // 2 out of 3 planned actions executed
    expect(result.value).toBeCloseTo(2 / 3);
    expect(result.reason).toContain("2/3 planned actions");
  });

  it("returns 0.7 when plans exist but actions cannot be extracted", () => {
    const scorer = planAdherenceScorer();
    const ctx: EvalContext = {
      trace: {
        trace: {
          traceId: "test-trace-id",
          projectId: "test-project",
          name: "test-trace",
          timestamp: new Date(),
          durationMs: 1000,
          status: "ok",
          metadata: {},
          totalInputTokens: 0,
          totalOutputTokens: 0,
          toolCallCount: 1,
          llmCallCount: 0,
        },
        spans: [
          {
            spanId: "plan-1",
            traceId: "test-trace-id",
            projectId: "test-project",
            name: "plan",
            kind: "internal",
            spanType: "span",
            componentType: "planning",
            timestamp: new Date(),
            durationMs: 100,
            status: "ok",
            output: "I will do some things",
            attributes: {},
            children: [],
          } as any,
          {
            spanId: "tool-1",
            traceId: "test-trace-id",
            projectId: "test-project",
            name: "custom_tool",
            kind: "internal",
            spanType: "tool",
            toolName: "custom_tool",
            timestamp: new Date(Date.now() + 1000),
            durationMs: 100,
            status: "ok",
            attributes: {},
            children: [],
          } as any,
        ],
      },
    };
    const result = scorer.evaluate(ctx);

    expect(result.value).toBe(0.7);
    expect(result.reason).toContain("could not extract");
  });
});
