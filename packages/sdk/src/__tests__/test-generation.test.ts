/**
 * Test Generation Tests
 */

import { describe, it, expect, vi } from "vitest";
import type { SpanWithChildren } from "@neon/shared";
import {
  generateTestCases,
  type FailedTrace,
  type GeneratedTestCase,
} from "../optimization/test-generation.js";

// Helper to create a mock span
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

// Helper to create a failed trace
function createFailedTrace(overrides: Partial<FailedTrace> = {}): FailedTrace {
  return {
    traceId: `trace-${Math.random().toString(36).substring(7)}`,
    spans: [
      createMockSpan({
        status: "error",
        statusMessage: "Connection timeout",
        spanType: "tool",
        toolName: "search",
        toolInput: '{"query": "test"}',
      }),
    ],
    failureReason: "Connection timeout",
    errorCategory: "timeout",
    score: 0.2,
    ...overrides,
  };
}

describe("Test Generation - Extraction", () => {
  it("extracts test cases from failed traces", async () => {
    const failures = [createFailedTrace()];
    const results = await generateTestCases(failures);

    expect(results.length).toBe(1);
    expect(results[0].input).toBeDefined();
    expect(results[0].lineage.generationMethod).toBe("extraction");
    expect(results[0].lineage.sourceTraceIds).toHaveLength(1);
    expect(results[0].status).toBe("pending_review");
  });

  it("extracts tool input from tool spans", async () => {
    const failures = [
      createFailedTrace({
        spans: [
          createMockSpan({
            status: "error",
            spanType: "tool",
            toolName: "search",
            toolInput: '{"query": "weather"}',
          }),
        ],
      }),
    ];
    const results = await generateTestCases(failures);

    expect(results[0].input.toolName).toBe("search");
    expect(results[0].input.toolInput).toEqual({ query: "weather" });
  });

  it("extracts from generation spans with input", async () => {
    const failures = [
      createFailedTrace({
        spans: [
          createMockSpan({
            status: "error",
            spanType: "generation",
            input: "What is 2+2?",
            output: "Invalid response",
          }),
        ],
      }),
    ];
    const results = await generateTestCases(failures);

    expect(results[0].input.query).toBe("What is 2+2?");
    expect(results[0].expectedOutput).toBe("Invalid response");
  });

  it("returns empty array for no failures", async () => {
    const results = await generateTestCases([]);
    expect(results).toHaveLength(0);
  });

  it("handles multiple failures", async () => {
    const failures = [
      createFailedTrace({ traceId: "trace-1", errorCategory: "timeout" }),
      createFailedTrace({ traceId: "trace-2", errorCategory: "validation" }),
      createFailedTrace({ traceId: "trace-3", errorCategory: "timeout" }),
    ];
    const results = await generateTestCases(failures);

    expect(results.length).toBe(3);
    // Each should have a unique ID
    const ids = new Set(results.map(r => r.id));
    expect(ids.size).toBe(3);
  });
});

describe("Test Generation - Deduplication", () => {
  it("deduplicates similar test cases against existing suite", async () => {
    const failures = [createFailedTrace()];

    // Create an existing test case that's identical to what would be extracted
    const existing: GeneratedTestCase[] = [
      {
        id: "existing-1",
        input: { toolName: "search", toolInput: { query: "test" } },
        scorers: [{ name: "error_detection", type: "rule" }],
        priority: 0.5,
        lineage: {
          sourceTraceIds: ["old-trace"],
          generationMethod: "extraction",
          generatedAt: new Date(),
        },
        status: "approved",
        similarityToExisting: 0,
      },
    ];

    const results = await generateTestCases(failures, existing);

    // Each result should have similarityToExisting computed
    for (const result of results) {
      expect(result.similarityToExisting).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps test cases below similarity threshold", async () => {
    const failures = [
      createFailedTrace({
        spans: [
          createMockSpan({
            status: "error",
            spanType: "tool",
            toolName: "completely_different_tool",
            toolInput: '{"x": "unique_input"}',
          }),
        ],
        errorCategory: "server_error",
        failureReason: "Internal server error",
      }),
    ];

    const existing: GeneratedTestCase[] = [
      {
        id: "existing-1",
        input: { toolName: "search", toolInput: { query: "test" } },
        scorers: [{ name: "success", type: "rule" }],
        priority: 0.5,
        lineage: {
          sourceTraceIds: ["old-trace"],
          generationMethod: "extraction",
          generatedAt: new Date(),
        },
        status: "approved",
        similarityToExisting: 0,
      },
    ];

    const results = await generateTestCases(failures, existing, {
      deduplicationThreshold: 0.85,
    });

    expect(results.length).toBeGreaterThan(0);
  });
});

describe("Test Generation - Priority Ranking", () => {
  it("ranks test cases by composite priority score", async () => {
    const failures = [
      createFailedTrace({
        traceId: "trace-1",
        errorCategory: "timeout",
        score: 0.1,
      }),
      createFailedTrace({
        traceId: "trace-2",
        errorCategory: "timeout",
        score: 0.1,
      }),
      createFailedTrace({
        traceId: "trace-3",
        errorCategory: "validation",
        score: 0.9,
      }),
    ];

    const results = await generateTestCases(failures);

    // Results should be sorted by priority (descending)
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].priority).toBeGreaterThanOrEqual(results[i].priority);
    }

    // All priorities should be between 0 and 1
    for (const result of results) {
      expect(result.priority).toBeGreaterThanOrEqual(0);
      expect(result.priority).toBeLessThanOrEqual(1);
    }
  });

  it("assigns higher priority to more frequent failure patterns", async () => {
    // Create 3 timeout failures and 1 validation failure
    const failures = [
      createFailedTrace({ traceId: "t1", errorCategory: "timeout" }),
      createFailedTrace({ traceId: "t2", errorCategory: "timeout" }),
      createFailedTrace({ traceId: "t3", errorCategory: "timeout" }),
      createFailedTrace({
        traceId: "t4",
        errorCategory: "validation",
        spans: [
          createMockSpan({
            status: "error",
            spanType: "tool",
            toolName: "validate",
            toolInput: '{"data": "invalid"}',
            statusMessage: "Validation failed",
          }),
        ],
        failureReason: "Validation failed",
      }),
    ];

    const results = await generateTestCases(failures);

    // The timeout failures should collectively have higher priority
    const timeoutCases = results.filter(r => r.lineage.sourcePattern === "timeout");
    const validationCases = results.filter(r => r.lineage.sourcePattern === "validation");

    if (timeoutCases.length > 0 && validationCases.length > 0) {
      const avgTimeoutPriority = timeoutCases.reduce((s, c) => s + c.priority, 0) / timeoutCases.length;
      const avgValidationPriority = validationCases.reduce((s, c) => s + c.priority, 0) / validationCases.length;
      expect(avgTimeoutPriority).toBeGreaterThanOrEqual(avgValidationPriority);
    }
  });
});

describe("Test Generation - Lineage Tracking", () => {
  it("tracks source trace IDs", async () => {
    const failures = [
      createFailedTrace({ traceId: "trace-abc-123" }),
    ];
    const results = await generateTestCases(failures);

    expect(results[0].lineage.sourceTraceIds).toContain("trace-abc-123");
  });

  it("tracks error category as source pattern", async () => {
    const failures = [
      createFailedTrace({ errorCategory: "rate_limit" }),
    ];
    const results = await generateTestCases(failures);

    expect(results[0].lineage.sourcePattern).toBe("rate_limit");
  });

  it("tracks generation method as extraction", async () => {
    const failures = [createFailedTrace()];
    const results = await generateTestCases(failures);

    expect(results[0].lineage.generationMethod).toBe("extraction");
  });

  it("tracks generation timestamp", async () => {
    const before = new Date();
    const failures = [createFailedTrace()];
    const results = await generateTestCases(failures);
    const after = new Date();

    expect(results[0].lineage.generatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(results[0].lineage.generatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

describe("Test Generation - With/Without LLM", () => {
  it("generates only extraction cases when no LLM provided", async () => {
    const failures = [createFailedTrace()];
    const results = await generateTestCases(failures);

    expect(results.every(r => r.lineage.generationMethod === "extraction")).toBe(true);
  });

  it("generates adversarial variants when LLM is provided", async () => {
    const mockLlm = vi.fn().mockResolvedValue('{"query": "adversarial test input"}');
    const failures = [createFailedTrace()];

    const results = await generateTestCases(failures, [], {
      llmGenerator: mockLlm,
    });

    expect(mockLlm).toHaveBeenCalled();

    const adversarial = results.filter(r => r.lineage.generationMethod === "adversarial");
    expect(adversarial.length).toBeGreaterThan(0);
  });

  it("handles LLM returning invalid JSON gracefully", async () => {
    const mockLlm = vi.fn().mockResolvedValue("not valid json at all");
    const failures = [createFailedTrace()];

    const results = await generateTestCases(failures, [], {
      llmGenerator: mockLlm,
    });

    // Should still have the extracted cases, just no adversarial ones
    const extracted = results.filter(r => r.lineage.generationMethod === "extraction");
    expect(extracted.length).toBeGreaterThan(0);
  });

  it("respects maxTestCases limit", async () => {
    const failures = Array.from({ length: 30 }, (_, i) =>
      createFailedTrace({ traceId: `trace-${i}` })
    );

    const results = await generateTestCases(failures, [], {
      maxTestCases: 5,
    });

    expect(results.length).toBeLessThanOrEqual(5);
  });

  it("infers correct scorers for tool spans", async () => {
    const failures = [
      createFailedTrace({
        spans: [
          createMockSpan({
            status: "error",
            spanType: "tool",
            toolName: "search",
          }),
        ],
      }),
    ];
    const results = await generateTestCases(failures);

    const scorerNames = results[0].scorers.map(s => s.name);
    expect(scorerNames).toContain("error_detection");
    expect(scorerNames).toContain("tool_selection");
  });

  it("infers llm_judge scorer for generation spans", async () => {
    const failures = [
      createFailedTrace({
        spans: [
          createMockSpan({
            status: "error",
            spanType: "generation",
            input: "test",
          }),
        ],
      }),
    ];
    const results = await generateTestCases(failures);

    const hasJudge = results[0].scorers.some(s => s.type === "llm_judge");
    expect(hasJudge).toBe(true);
  });
});
