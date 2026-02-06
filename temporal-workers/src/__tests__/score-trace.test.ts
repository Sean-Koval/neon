/**
 * Tests for Score Trace Activity
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  scoreTrace,
  scoreTraceWithConfig,
  registerScorer,
  hasScorer,
  type ScoreResult,
} from "../activities/score-trace";
import type { ScoreTraceParams, ScorerDefinition } from "../types";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock the Anthropic SDK for LLM judges
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: '{"score": 0.85, "reason": "Good quality"}' }],
        }),
      },
    })),
  };
});

// Helper to create mock trace data
function createMockTraceData(options: {
  duration_ms?: number;
  status?: string;
  spans?: Array<{
    span_type: string;
    name: string;
    status: string;
    tool_name?: string;
    output?: string;
    input_tokens?: number;
    output_tokens?: number;
  }>;
}) {
  return {
    trace: {
      trace_id: "trace-123",
      name: "test-trace",
      timestamp: new Date().toISOString(),
      duration_ms: options.duration_ms ?? 1000,
      status: options.status ?? "ok",
    },
    spans: options.spans ?? [
      {
        span_id: "span-1",
        trace_id: "trace-123",
        name: "generation",
        span_type: "generation",
        status: "ok",
        duration_ms: 500,
        output: "Test output",
      },
    ],
    flatSpans: options.spans ?? [
      {
        span_id: "span-1",
        trace_id: "trace-123",
        name: "generation",
        span_type: "generation",
        status: "ok",
        duration_ms: 500,
        output: "Test output",
      },
    ],
  };
}

describe("scoreTrace", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
    process.env.NEON_API_URL = "http://localhost:3000";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("basic scoring", () => {
    it("fetches trace and runs scorers", async () => {
      const traceData = createMockTraceData({ duration_ms: 500 });

      mockFetch.mockImplementation((url: string) => {
        if (url.includes("/api/traces/")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(traceData),
          });
        }
        if (url.includes("/api/scores")) {
          return Promise.resolve({ ok: true });
        }
        return Promise.reject(new Error("Unknown URL"));
      });

      const params: ScoreTraceParams = {
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["latency"],
      };

      const results = await scoreTrace(params);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("latency");
      expect(results[0].value).toBe(1.0); // 500ms is fast
    });

    it("runs multiple scorers", async () => {
      const traceData = createMockTraceData({
        duration_ms: 2000,
        spans: [
          { span_type: "generation", name: "gen", status: "ok", output: "test" },
          { span_type: "tool", name: "tool", status: "error", tool_name: "search" },
        ],
      });

      mockFetch.mockImplementation((url: string) => {
        if (url.includes("/api/traces/")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(traceData),
          });
        }
        if (url.includes("/api/scores")) {
          return Promise.resolve({ ok: true });
        }
        return Promise.reject(new Error("Unknown URL"));
      });

      const params: ScoreTraceParams = {
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["latency", "error_rate"],
      };

      const results = await scoreTrace(params);

      expect(results).toHaveLength(2);
      expect(results.find((r) => r.name === "latency")).toBeDefined();
      expect(results.find((r) => r.name === "error_rate")).toBeDefined();
    });

    it("stores scores in database", async () => {
      const traceData = createMockTraceData({});

      mockFetch.mockImplementation((url: string) => {
        if (url.includes("/api/traces/")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(traceData),
          });
        }
        if (url.includes("/api/scores")) {
          return Promise.resolve({ ok: true });
        }
        return Promise.reject(new Error("Unknown URL"));
      });

      await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["latency"],
      });

      const scoreCall = mockFetch.mock.calls.find(
        (call) => (call[0] as string).includes("/api/scores")
      );

      expect(scoreCall).toBeDefined();
      const body = JSON.parse(scoreCall![1].body);
      expect(body.project_id).toBe("project-1");
      expect(body.trace_id).toBe("trace-123");
      expect(body.name).toBe("latency");
    });
  });

  describe("rule-based scorers", () => {
    beforeEach(() => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes("/api/traces/")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve(
                createMockTraceData({
                  spans: [
                    {
                      span_type: "generation",
                      name: "gen",
                      status: "ok",
                      output: "The answer is 42",
                      input_tokens: 100,
                      output_tokens: 50,
                    },
                  ],
                })
              ),
          });
        }
        if (url.includes("/api/scores")) {
          return Promise.resolve({ ok: true });
        }
        return Promise.reject(new Error("Unknown URL"));
      });
    });

    it("scores latency based on duration", async () => {
      const fastTrace = createMockTraceData({ duration_ms: 500 });
      mockFetch.mockImplementation((url: string) => {
        if (url.includes("/api/traces/")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(fastTrace),
          });
        }
        return Promise.resolve({ ok: true });
      });

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["latency"],
      });

      expect(results[0].value).toBe(1.0);
      expect(results[0].reason).toContain("500ms");
    });

    it("scores error rate based on span status", async () => {
      const traceWithErrors = createMockTraceData({
        spans: [
          { span_type: "generation", name: "gen1", status: "ok", output: "" },
          { span_type: "tool", name: "tool1", status: "error", output: "" },
          { span_type: "tool", name: "tool2", status: "ok", output: "" },
        ],
      });

      mockFetch.mockImplementation((url: string) => {
        if (url.includes("/api/traces/")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(traceWithErrors),
          });
        }
        return Promise.resolve({ ok: true });
      });

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["error_rate"],
      });

      // 1/3 errors = 33% error rate = 0.67 score
      expect(results[0].value).toBeCloseTo(0.67, 1);
    });

    it("scores contains based on expected substrings", async () => {
      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["contains"],
        expected: { contains: ["answer", "42"] },
      });

      expect(results[0].value).toBe(1.0);
      expect(results[0].reason).toContain("2/2");
    });

    it("scores not_contains for forbidden substrings", async () => {
      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["not_contains"],
        expected: { forbidden: ["error", "failed"] },
      });

      expect(results[0].value).toBe(1.0);
    });

    it("scores regex_match for pattern matching", async () => {
      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["regex_match"],
        expected: { pattern: "\\d+" },
      });

      expect(results[0].value).toBe(1.0);
    });

    it("scores json_valid for JSON output", async () => {
      const jsonTrace = createMockTraceData({
        spans: [
          {
            span_type: "generation",
            name: "gen",
            status: "ok",
            output: '{"result": "success"}',
          },
        ],
      });

      mockFetch.mockImplementation((url: string) => {
        if (url.includes("/api/traces/")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(jsonTrace),
          });
        }
        return Promise.resolve({ ok: true });
      });

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["json_valid"],
      });

      expect(results[0].value).toBe(1.0);
    });

    it("scores tool_selection based on expected tools", async () => {
      const toolTrace = createMockTraceData({
        spans: [
          { span_type: "tool", name: "search", status: "ok", tool_name: "search", output: "" },
          { span_type: "tool", name: "analyze", status: "ok", tool_name: "analyze", output: "" },
        ],
      });

      mockFetch.mockImplementation((url: string) => {
        if (url.includes("/api/traces/")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(toolTrace),
          });
        }
        return Promise.resolve({ ok: true });
      });

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["tool_selection"],
        expected: { toolCalls: ["search", "analyze"] },
      });

      expect(results[0].value).toBe(1.0);
    });

    it("scores token_efficiency based on token count", async () => {
      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["token_efficiency"],
      });

      // 150 total tokens is very efficient
      expect(results[0].value).toBe(1.0);
    });
  });

  describe("error handling", () => {
    it("handles scorer errors gracefully", async () => {
      registerScorer("failing_scorer", async () => {
        throw new Error("Scorer failed");
      });

      mockFetch.mockImplementation((url: string) => {
        if (url.includes("/api/traces/")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(createMockTraceData({})),
          });
        }
        return Promise.resolve({ ok: true });
      });

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["failing_scorer"],
      });

      expect(results[0].value).toBe(0);
      expect(results[0].reason).toContain("Scorer error");
    });

    it("handles trace fetch errors", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: () => Promise.resolve("Trace not found"),
      });

      await expect(
        scoreTrace({
          traceId: "trace-123",
          projectId: "project-1",
          scorers: ["latency"],
        })
      ).rejects.toThrow("Failed to fetch trace");
    });
  });
});

describe("scoreTraceWithConfig", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.NEON_API_URL = "http://localhost:3000";

    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/traces/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              createMockTraceData({
                spans: [
                  { span_type: "generation", name: "gen", status: "ok", output: "hello world" },
                ],
              })
            ),
        });
      }
      return Promise.resolve({ ok: true });
    });
  });

  it("runs rule-based scorer with config", async () => {
    const scorer: ScorerDefinition = {
      name: "contains",
      type: "rule_based",
      rules: { contains: ["hello"] },
    };

    const result = await scoreTraceWithConfig({
      traceId: "trace-123",
      projectId: "project-1",
      scorer,
    });

    expect(result.value).toBe(1.0);
  });

  it("runs custom scorer from registry", async () => {
    registerScorer("custom_test", async (trace) => ({
      name: "custom_test",
      value: 0.99,
      reason: "Custom logic",
    }));

    const scorer: ScorerDefinition = {
      name: "custom_test",
      type: "custom",
    };

    const result = await scoreTraceWithConfig({
      traceId: "trace-123",
      projectId: "project-1",
      scorer,
    });

    expect(result.value).toBe(0.99);
  });

  it("throws for unregistered custom scorer", async () => {
    const scorer: ScorerDefinition = {
      name: "unregistered_scorer",
      type: "custom",
    };

    await expect(
      scoreTraceWithConfig({
        traceId: "trace-123",
        projectId: "project-1",
        scorer,
      })
    ).rejects.toThrow("Custom scorer not registered");
  });
});

describe("registerScorer", () => {
  it("registers a custom scorer", () => {
    registerScorer("my_scorer", async () => ({
      name: "my_scorer",
      value: 1.0,
    }));

    expect(hasScorer("my_scorer")).toBe(true);
  });

  it("overwrites existing scorer with same name", async () => {
    registerScorer("overwrite_test", async () => ({
      name: "overwrite_test",
      value: 0.5,
    }));

    registerScorer("overwrite_test", async () => ({
      name: "overwrite_test",
      value: 0.9,
    }));

    // The scorer should be registered
    expect(hasScorer("overwrite_test")).toBe(true);
  });
});

describe("hasScorer", () => {
  it("returns true for built-in scorers", () => {
    expect(hasScorer("latency")).toBe(true);
    expect(hasScorer("error_rate")).toBe(true);
    expect(hasScorer("tool_selection")).toBe(true);
    expect(hasScorer("contains")).toBe(true);
    expect(hasScorer("regex_match")).toBe(true);
    expect(hasScorer("json_valid")).toBe(true);
    expect(hasScorer("response_quality")).toBe(true);
    expect(hasScorer("hallucination")).toBe(true);
    expect(hasScorer("safety")).toBe(true);
  });

  it("returns false for unknown scorers", () => {
    expect(hasScorer("nonexistent_scorer")).toBe(false);
  });

  it("returns true for registered custom scorers", () => {
    registerScorer("custom_registered", async () => ({
      name: "custom_registered",
      value: 1.0,
    }));

    expect(hasScorer("custom_registered")).toBe(true);
  });
});
