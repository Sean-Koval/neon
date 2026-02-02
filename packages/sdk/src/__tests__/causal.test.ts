/**
 * Tests for Causal Analysis Scorer
 */

import { describe, it, expect } from "vitest";
import {
  causalAnalysisScorer,
  causalAnalysisDetailedScorer,
  rootCauseScorer,
  analyzeCausality,
  type EvalContext,
} from "../index";
import type { SpanWithChildren, TraceWithSpans, ComponentType, SpanType, SpanStatus } from "@neon/shared";

// Helper to create mock spans
function createSpan(
  overrides: Partial<SpanWithChildren> & { spanId: string; name: string }
): SpanWithChildren {
  return {
    traceId: "test-trace",
    projectId: "test-project",
    kind: "internal",
    spanType: "span" as SpanType,
    timestamp: new Date(),
    durationMs: 100,
    status: "ok" as SpanStatus,
    attributes: {},
    children: [],
    ...overrides,
  };
}

// Helper to create mock context with span tree
function createMockContext(spans: SpanWithChildren[], traceStatus: "ok" | "error" = "ok"): EvalContext {
  return {
    trace: {
      trace: {
        traceId: "test-trace",
        projectId: "test-project",
        name: "test-trace",
        status: traceStatus,
        timestamp: new Date(),
        durationMs: 500,
        metadata: {},
        totalInputTokens: 0,
        totalOutputTokens: 0,
        toolCallCount: 0,
        llmCallCount: 0,
      },
      spans,
    },
  };
}

describe("causalAnalysisScorer", () => {
  describe("no errors", () => {
    it("returns 1.0 for trace with no errors", () => {
      const spans: SpanWithChildren[] = [
        createSpan({
          spanId: "span-1",
          name: "retrieval",
          componentType: "retrieval",
          status: "ok",
          children: [
            createSpan({
              spanId: "span-2",
              name: "generation",
              componentType: "reasoning",
              status: "ok",
              children: [],
            }),
          ],
        }),
      ];

      const scorer = causalAnalysisScorer();
      const result = scorer.evaluate(createMockContext(spans));

      expect(result.value).toBe(1.0);
      expect(result.reason).toBe("No errors detected in trace");
    });
  });

  describe("single error", () => {
    it("identifies single point of failure", () => {
      const spans: SpanWithChildren[] = [
        createSpan({
          spanId: "span-1",
          name: "retrieval",
          componentType: "retrieval",
          status: "error",
          statusMessage: "Database connection failed",
          children: [],
        }),
      ];

      const scorer = causalAnalysisScorer();
      const result = scorer.evaluate(createMockContext(spans, "error"));

      expect(result.value).toBeLessThan(1.0);
      expect(result.value).toBeGreaterThan(0);
      expect(result.reason).toContain("retrieval");
      expect(result.reason).toContain("Database connection failed");
    });

    it("scores higher when root cause is identified", () => {
      const spans: SpanWithChildren[] = [
        createSpan({
          spanId: "span-1",
          name: "tool_call",
          componentType: "tool",
          status: "error",
          statusMessage: "Tool execution failed",
          children: [],
        }),
      ];

      const scorer = causalAnalysisScorer();
      const result = scorer.evaluate(createMockContext(spans, "error"));

      // Root cause identified (0.5) + chain complete (0.3) + some error rate penalty
      expect(result.value).toBeGreaterThan(0.5);
    });
  });

  describe("causal chain", () => {
    it("identifies causal chain from parent to child failures", () => {
      const spans: SpanWithChildren[] = [
        createSpan({
          spanId: "root",
          name: "agent",
          componentType: "other",
          status: "error",
          children: [
            createSpan({
              spanId: "retrieval",
              name: "retrieval",
              componentType: "retrieval",
              status: "error",
              statusMessage: "Returned irrelevant docs",
              parentSpanId: "root",
              children: [
                createSpan({
                  spanId: "generation",
                  name: "generation",
                  componentType: "reasoning",
                  status: "error",
                  statusMessage: "Hallucinated due to bad context",
                  parentSpanId: "retrieval",
                  children: [],
                }),
              ],
            }),
          ],
        }),
      ];

      const scorer = causalAnalysisScorer();
      const result = scorer.evaluate(createMockContext(spans, "error"));

      expect(result.reason).toContain("Causal chain");
      expect(result.reason).toContain("retrieval");
    });

    it("finds root cause when child fails but parent succeeds", () => {
      const spans: SpanWithChildren[] = [
        createSpan({
          spanId: "root",
          name: "agent",
          status: "ok",
          children: [
            createSpan({
              spanId: "retrieval",
              name: "retrieval",
              componentType: "retrieval",
              status: "ok",
              parentSpanId: "root",
              children: [],
            }),
            createSpan({
              spanId: "tool",
              name: "tool_call",
              componentType: "tool",
              status: "error",
              statusMessage: "API rate limited",
              parentSpanId: "root",
              children: [],
            }),
          ],
        }),
      ];

      const analysis = analyzeCausality(createMockContext(spans, "error"));

      expect(analysis.hasErrors).toBe(true);
      expect(analysis.rootCause).not.toBeNull();
      expect(analysis.rootCause?.spanId).toBe("tool");
      expect(analysis.explanation).toContain("tool");
    });
  });

  describe("complex scenarios", () => {
    it("handles multiple independent failures", () => {
      const spans: SpanWithChildren[] = [
        createSpan({
          spanId: "agent",
          name: "agent",
          status: "ok",
          children: [
            createSpan({
              spanId: "retrieval",
              name: "retrieval",
              componentType: "retrieval",
              status: "error",
              parentSpanId: "agent",
              children: [],
            }),
            createSpan({
              spanId: "tool",
              name: "tool",
              componentType: "tool",
              status: "error",
              parentSpanId: "agent",
              children: [],
            }),
          ],
        }),
      ];

      const analysis = analyzeCausality(createMockContext(spans, "error"));

      expect(analysis.errorCount).toBe(2);
      expect(analysis.rootCause).not.toBeNull();
    });

    it("traces cascading failures correctly", () => {
      // Simulate: retrieval fails → reasoning fails → tool call fails
      const spans: SpanWithChildren[] = [
        createSpan({
          spanId: "retrieval",
          name: "document_retrieval",
          componentType: "retrieval",
          spanType: "retrieval",
          status: "error",
          statusMessage: "No relevant documents found",
          timestamp: new Date("2024-01-01T00:00:00Z"),
          children: [
            createSpan({
              spanId: "reasoning",
              name: "reasoning",
              componentType: "reasoning",
              spanType: "generation",
              status: "error",
              statusMessage: "Hallucinated answer",
              parentSpanId: "retrieval",
              timestamp: new Date("2024-01-01T00:00:01Z"),
              children: [
                createSpan({
                  spanId: "tool",
                  name: "tool_call",
                  componentType: "tool",
                  spanType: "tool",
                  status: "error",
                  statusMessage: "Invalid parameters",
                  parentSpanId: "reasoning",
                  timestamp: new Date("2024-01-01T00:00:02Z"),
                  children: [],
                }),
              ],
            }),
          ],
        }),
      ];

      const analysis = analyzeCausality(createMockContext(spans, "error"));

      expect(analysis.rootCause?.spanId).toBe("retrieval");
      expect(analysis.causalChain.length).toBe(3);
      expect(analysis.causalChain[0].componentType).toBe("retrieval");
      expect(analysis.causalChain[1].componentType).toBe("reasoning");
      expect(analysis.causalChain[2].componentType).toBe("tool");
      expect(analysis.explanation).toContain("→");
    });
  });

  describe("edge cases", () => {
    it("handles empty spans array", () => {
      const scorer = causalAnalysisScorer();
      const result = scorer.evaluate(createMockContext([]));

      expect(result.value).toBe(1.0);
      expect(result.reason).toBe("No errors detected in trace");
    });

    it("handles deeply nested spans", () => {
      // Create a 5-level deep span tree
      const deepSpan = createSpan({
        spanId: "level-5",
        name: "deepest",
        status: "error",
        children: [],
      });

      const spans: SpanWithChildren[] = [
        createSpan({
          spanId: "level-1",
          name: "root",
          children: [
            createSpan({
              spanId: "level-2",
              name: "level2",
              parentSpanId: "level-1",
              children: [
                createSpan({
                  spanId: "level-3",
                  name: "level3",
                  parentSpanId: "level-2",
                  children: [
                    createSpan({
                      spanId: "level-4",
                      name: "level4",
                      parentSpanId: "level-3",
                      children: [deepSpan],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ];

      const analysis = analyzeCausality(createMockContext(spans, "error"));

      expect(analysis.hasErrors).toBe(true);
      expect(analysis.rootCause?.spanId).toBe("level-5");
    });
  });
});

describe("rootCauseScorer", () => {
  it("returns 1.0 when root cause is identified", () => {
    const spans: SpanWithChildren[] = [
      createSpan({
        spanId: "error-span",
        name: "failed_tool",
        componentType: "tool",
        status: "error",
        children: [],
      }),
    ];

    const scorer = rootCauseScorer();
    const result = scorer.evaluate(createMockContext(spans, "error"));

    expect(result.value).toBe(1.0);
    expect(result.reason).toContain("Root cause identified");
    expect(result.reason).toContain("tool");
  });

  it("returns 1.0 when there are no errors", () => {
    const spans: SpanWithChildren[] = [
      createSpan({
        spanId: "ok-span",
        name: "success",
        status: "ok",
        children: [],
      }),
    ];

    const scorer = rootCauseScorer();
    const result = scorer.evaluate(createMockContext(spans));

    expect(result.value).toBe(1.0);
    expect(result.reason).toBe("No errors to analyze");
  });
});

describe("causalAnalysisDetailedScorer", () => {
  it("returns JSON-formatted analysis in reason", () => {
    const spans: SpanWithChildren[] = [
      createSpan({
        spanId: "error-span",
        name: "failed_retrieval",
        componentType: "retrieval",
        status: "error",
        statusMessage: "Connection timeout",
        children: [],
      }),
    ];

    const scorer = causalAnalysisDetailedScorer();
    const result = scorer.evaluate(createMockContext(spans, "error"));

    const analysis = JSON.parse(result.reason!);

    expect(analysis.hasErrors).toBe(true);
    expect(analysis.rootCause).not.toBeNull();
    expect(analysis.rootCause.spanId).toBe("error-span");
    expect(analysis.errorCount).toBe(1);
  });
});

describe("analyzeCausality", () => {
  it("returns complete CausalAnalysisResult structure", () => {
    const spans: SpanWithChildren[] = [
      createSpan({
        spanId: "span-1",
        name: "test",
        status: "error",
        children: [],
      }),
    ];

    const result = analyzeCausality(createMockContext(spans, "error"));

    expect(result).toHaveProperty("hasErrors");
    expect(result).toHaveProperty("rootCause");
    expect(result).toHaveProperty("causalChain");
    expect(result).toHaveProperty("explanation");
    expect(result).toHaveProperty("errorCount");
    expect(result).toHaveProperty("totalSpans");
  });
});

describe("custom configuration", () => {
  it("allows custom weights", () => {
    const spans: SpanWithChildren[] = [
      createSpan({
        spanId: "error-span",
        name: "error",
        status: "error",
        children: [],
      }),
    ];

    const context = createMockContext(spans, "error");

    // Higher weight on error rate
    const highErrorWeight = causalAnalysisScorer({
      rootCauseWeight: 0.2,
      chainCompletenessWeight: 0.2,
      errorRateWeight: 0.6,
    });

    // Higher weight on root cause
    const highRootCauseWeight = causalAnalysisScorer({
      rootCauseWeight: 0.8,
      chainCompletenessWeight: 0.1,
      errorRateWeight: 0.1,
    });

    const result1 = highErrorWeight.evaluate(context);
    const result2 = highRootCauseWeight.evaluate(context);

    // With one error span out of one total, error rate penalty is 100%
    // So high error weight should give lower score
    expect(result1.value).toBeLessThan(result2.value);
  });

  it("allows custom name and description", () => {
    const scorer = causalAnalysisScorer({
      name: "my_custom_causal",
      description: "My custom causal analyzer",
    });

    expect(scorer.name).toBe("my_custom_causal");
    expect(scorer.description).toBe("My custom causal analyzer");
  });
});
