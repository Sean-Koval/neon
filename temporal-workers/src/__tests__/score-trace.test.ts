/**
 * Tests for Score Trace Activity
 *
 * Comprehensive test coverage for all scorers:
 * - Rule-based: latency, error_rate, token_efficiency, tool_selection,
 *   tool_sequence, contains, not_contains, regex_match, exact_match,
 *   json_valid, output_length
 * - LLM judges: response_quality, hallucination, relevance, coherence, safety
 * - Custom scorers via registry
 * - scoreTraceWithConfig (rule_based, llm_judge, custom)
 * - Error handling and edge cases
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

// Mock @neon/llm-providers for LLM judges
const mockChat = vi.fn();

vi.mock("@neon/llm-providers", () => ({
  getProvider: () => ({ chat: mockChat, name: "anthropic" }),
}));

// Helper to create mock trace data
function createMockTraceData(options: {
  duration_ms?: number;
  status?: string;
  spans?: Array<{
    span_id?: string;
    span_type: string;
    name: string;
    status: string;
    tool_name?: string;
    tool_input?: string;
    output?: string;
    input?: string;
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    status_message?: string;
    attributes?: Record<string, string>;
  }>;
}) {
  const defaultSpans = [
    {
      span_id: "span-1",
      trace_id: "trace-123",
      name: "generation",
      span_type: "generation",
      status: "ok",
      duration_ms: 500,
      output: "Test output",
    },
  ];

  const spans = options.spans?.map((s, i) => ({
    span_id: s.span_id || `span-${i + 1}`,
    trace_id: "trace-123",
    name: s.name,
    span_type: s.span_type,
    status: s.status,
    duration_ms: 500,
    output: s.output ?? "",
    input: s.input ?? "",
    tool_name: s.tool_name,
    tool_input: s.tool_input ?? "",
    input_tokens: s.input_tokens,
    output_tokens: s.output_tokens,
    total_tokens: s.total_tokens,
    status_message: s.status_message,
    attributes: s.attributes ?? {},
  })) ?? defaultSpans;

  return {
    trace: {
      trace_id: "trace-123",
      name: "test-trace",
      timestamp: new Date().toISOString(),
      duration_ms: options.duration_ms ?? 1000,
      status: options.status ?? "ok",
    },
    spans,
    flatSpans: spans,
  };
}

// Helper to set up fetch mock for a given trace
function setupFetchMock(traceData: ReturnType<typeof createMockTraceData>) {
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
}

describe("scoreTrace", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    mockChat.mockResolvedValue({
      content: '{"score": 0.85, "reason": "Good quality"}', inputTokens: 0, outputTokens: 0, model: "claude-3-haiku-20240307",
    });
    process.env = { ...originalEnv };
    process.env.NEON_API_URL = "http://localhost:3000";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("basic scoring", () => {
    it("fetches trace and runs scorers", async () => {
      const traceData = createMockTraceData({ duration_ms: 500 });
      setupFetchMock(traceData);

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["latency"],
      });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("latency");
      expect(results[0].value).toBe(1.0);
    });

    it("runs multiple scorers", async () => {
      const traceData = createMockTraceData({
        duration_ms: 2000,
        spans: [
          { span_type: "generation", name: "gen", status: "ok", output: "test" },
          { span_type: "tool", name: "tool", status: "error", tool_name: "search" },
        ],
      });
      setupFetchMock(traceData);

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["latency", "error_rate"],
      });

      expect(results).toHaveLength(2);
      expect(results.find((r) => r.name === "latency")).toBeDefined();
      expect(results.find((r) => r.name === "error_rate")).toBeDefined();
    });

    it("stores scores in database", async () => {
      setupFetchMock(createMockTraceData({}));

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
      expect(body.source).toBe("temporal");
      expect(body.score_type).toBe("numeric");
    });

    it("stores score with configId when provided", async () => {
      setupFetchMock(createMockTraceData({}));

      await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["latency"],
        configId: "config-abc",
      });

      const scoreCall = mockFetch.mock.calls.find(
        (call) => (call[0] as string).includes("/api/scores")
      );
      const body = JSON.parse(scoreCall![1].body);
      expect(body.config_id).toBe("config-abc");
    });

    it("uses custom scorer from registry when available", async () => {
      registerScorer("custom_priority", async () => ({
        name: "custom_priority",
        value: 0.77,
        reason: "Custom scorer ran",
      }));

      setupFetchMock(createMockTraceData({}));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["custom_priority"],
      });

      expect(results[0].value).toBe(0.77);
      expect(results[0].reason).toBe("Custom scorer ran");
    });
  });

  // =========================================================================
  // LATENCY SCORER - all threshold tiers
  // =========================================================================
  describe("latency scorer", () => {
    const durations = [
      { ms: 500, expected: 1.0, desc: "< 1s" },
      { ms: 1500, expected: 0.9, desc: "1-3s" },
      { ms: 4000, expected: 0.8, desc: "3-5s" },
      { ms: 7000, expected: 0.6, desc: "5-10s" },
      { ms: 20000, expected: 0.4, desc: "10-30s" },
      { ms: 45000, expected: 0.2, desc: "> 30s" },
    ];

    for (const { ms, expected, desc } of durations) {
      it(`scores ${expected} for duration ${desc} (${ms}ms)`, async () => {
        setupFetchMock(createMockTraceData({ duration_ms: ms }));

        const results = await scoreTrace({
          traceId: "trace-123",
          projectId: "project-1",
          scorers: ["latency"],
        });

        expect(results[0].value).toBe(expected);
        expect(results[0].reason).toContain(`${ms}ms`);
        expect(results[0].metadata).toEqual({ duration_ms: ms });
      });
    }
  });

  // =========================================================================
  // ERROR RATE SCORER
  // =========================================================================
  describe("error_rate scorer", () => {
    it("returns 1.0 for no errors", async () => {
      setupFetchMock(createMockTraceData({
        spans: [
          { span_type: "generation", name: "gen", status: "ok" },
          { span_type: "tool", name: "tool", status: "ok" },
        ],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["error_rate"],
      });

      expect(results[0].value).toBe(1.0);
    });

    it("returns 0.0 for all errors", async () => {
      setupFetchMock(createMockTraceData({
        spans: [
          { span_type: "generation", name: "gen", status: "error" },
          { span_type: "tool", name: "tool", status: "error" },
        ],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["error_rate"],
      });

      expect(results[0].value).toBe(0.0);
    });

    it("calculates partial error rate", async () => {
      setupFetchMock(createMockTraceData({
        spans: [
          { span_type: "generation", name: "gen1", status: "ok" },
          { span_type: "tool", name: "tool1", status: "error" },
          { span_type: "tool", name: "tool2", status: "ok" },
        ],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["error_rate"],
      });

      expect(results[0].value).toBeCloseTo(0.67, 1);
      expect(results[0].metadata).toMatchObject({
        total_spans: 3,
        error_spans: 1,
      });
    });

    it("handles empty spans array", async () => {
      setupFetchMock(createMockTraceData({ spans: [] }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["error_rate"],
      });

      // 0 total spans → errorRate = 0 → score = 1
      expect(results[0].value).toBe(1.0);
    });
  });

  // =========================================================================
  // TOKEN EFFICIENCY SCORER - all tiers
  // =========================================================================
  describe("token_efficiency scorer", () => {
    const tokenCases = [
      { input: 100, output: 50, total: 150, expected: 1.0, desc: "< 500" },
      { input: 300, output: 400, total: 700, expected: 0.9, desc: "500-1000" },
      { input: 1000, output: 1000, total: 2000, expected: 0.8, desc: "1000-2500" },
      { input: 2000, output: 2000, total: 4000, expected: 0.7, desc: "2500-5000" },
      { input: 4000, output: 4000, total: 8000, expected: 0.5, desc: "5000-10000" },
      { input: 10000, output: 10000, total: 20000, expected: 0.3, desc: "> 10000" },
    ];

    for (const { input, output, total, expected, desc } of tokenCases) {
      it(`scores ${expected} for ${desc} tokens (${total})`, async () => {
        setupFetchMock(createMockTraceData({
          spans: [
            {
              span_type: "generation",
              name: "gen",
              status: "ok",
              input_tokens: input,
              output_tokens: output,
              total_tokens: total,
            },
          ],
        }));

        const results = await scoreTrace({
          traceId: "trace-123",
          projectId: "project-1",
          scorers: ["token_efficiency"],
        });

        expect(results[0].value).toBe(expected);
        expect(results[0].metadata).toMatchObject({
          total_tokens: total,
          input_tokens: input,
          output_tokens: output,
        });
      });
    }

    it("handles spans without token counts", async () => {
      setupFetchMock(createMockTraceData({
        spans: [
          { span_type: "generation", name: "gen", status: "ok" },
        ],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["token_efficiency"],
      });

      // 0 total tokens → score = 1.0
      expect(results[0].value).toBe(1.0);
    });

    it("only counts generation spans", async () => {
      setupFetchMock(createMockTraceData({
        spans: [
          { span_type: "generation", name: "gen", status: "ok", input_tokens: 200, output_tokens: 200, total_tokens: 400 },
          { span_type: "tool", name: "tool", status: "ok", input_tokens: 5000, output_tokens: 5000, total_tokens: 10000 },
        ],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["token_efficiency"],
      });

      // Only gen span counted: 400 tokens → 1.0
      expect(results[0].value).toBe(1.0);
    });
  });

  // =========================================================================
  // TOOL SELECTION SCORER
  // =========================================================================
  describe("tool_selection scorer", () => {
    it("scores 1.0 for perfect tool selection", async () => {
      setupFetchMock(createMockTraceData({
        spans: [
          { span_type: "tool", name: "search", status: "ok", tool_name: "search" },
          { span_type: "tool", name: "analyze", status: "ok", tool_name: "analyze" },
        ],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["tool_selection"],
        expected: { toolCalls: ["search", "analyze"] },
      });

      expect(results[0].value).toBe(1.0);
    });

    it("scores partial match using F1", async () => {
      setupFetchMock(createMockTraceData({
        spans: [
          { span_type: "tool", name: "search", status: "ok", tool_name: "search" },
          { span_type: "tool", name: "extra", status: "ok", tool_name: "extra" },
        ],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["tool_selection"],
        expected: { toolCalls: ["search", "analyze"] },
      });

      // precision = 1/2, recall = 1/2, F1 = 0.5
      expect(results[0].value).toBeCloseTo(0.5);
      expect(results[0].metadata).toMatchObject({
        expected_tools: ["search", "analyze"],
        actual_tools: ["search", "extra"],
      });
    });

    it("returns 0.8 when tools used but no expected specified", async () => {
      setupFetchMock(createMockTraceData({
        spans: [
          { span_type: "tool", name: "search", status: "ok", tool_name: "search" },
        ],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["tool_selection"],
      });

      expect(results[0].value).toBe(0.8);
    });

    it("returns 0.5 when no tools used and no expected specified", async () => {
      setupFetchMock(createMockTraceData({
        spans: [
          { span_type: "generation", name: "gen", status: "ok" },
        ],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["tool_selection"],
      });

      expect(results[0].value).toBe(0.5);
    });

    it("uses 'tools' key as alternative to 'toolCalls'", async () => {
      setupFetchMock(createMockTraceData({
        spans: [
          { span_type: "tool", name: "search", status: "ok", tool_name: "search" },
        ],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["tool_selection"],
        expected: { tools: ["search"] },
      });

      expect(results[0].value).toBe(1.0);
    });

    it("returns 0 F1 when no tools match", async () => {
      setupFetchMock(createMockTraceData({
        spans: [
          { span_type: "tool", name: "search", status: "ok", tool_name: "search" },
        ],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["tool_selection"],
        expected: { toolCalls: ["analyze", "summarize"] },
      });

      expect(results[0].value).toBe(0);
    });
  });

  // =========================================================================
  // TOOL SEQUENCE SCORER
  // =========================================================================
  describe("tool_sequence scorer", () => {
    it("scores 1.0 for matching sequence", async () => {
      setupFetchMock(createMockTraceData({
        spans: [
          { span_id: "span-a", span_type: "tool", name: "search", status: "ok", tool_name: "search" },
          { span_id: "span-b", span_type: "tool", name: "analyze", status: "ok", tool_name: "analyze" },
        ],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["tool_sequence"],
        expected: { toolSequence: ["search", "analyze"] },
      });

      expect(results[0].value).toBe(1.0);
    });

    it("scores 0.0 for wrong sequence order", async () => {
      setupFetchMock(createMockTraceData({
        spans: [
          { span_id: "span-a", span_type: "tool", name: "analyze", status: "ok", tool_name: "analyze" },
          { span_id: "span-b", span_type: "tool", name: "search", status: "ok", tool_name: "search" },
        ],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["tool_sequence"],
        expected: { toolSequence: ["search", "analyze"] },
      });

      expect(results[0].value).toBe(0.0);
    });

    it("returns 0.5 when no expected sequence is provided", async () => {
      setupFetchMock(createMockTraceData({
        spans: [
          { span_type: "tool", name: "search", status: "ok", tool_name: "search" },
        ],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["tool_sequence"],
      });

      expect(results[0].value).toBe(0.5);
    });
  });

  // =========================================================================
  // CONTAINS SCORER
  // =========================================================================
  describe("contains scorer", () => {
    it("scores 1.0 when all substrings found", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "The answer is 42" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["contains"],
        expected: { contains: ["answer", "42"] },
      });

      expect(results[0].value).toBe(1.0);
      expect(results[0].reason).toContain("2/2");
    });

    it("scores partial when some substrings found", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "The answer is 42" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["contains"],
        expected: { contains: ["answer", "missing"] },
      });

      expect(results[0].value).toBe(0.5);
    });

    it("is case-insensitive", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "Hello World" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["contains"],
        expected: { contains: ["HELLO", "world"] },
      });

      expect(results[0].value).toBe(1.0);
    });

    it("returns 0.5 when no substrings specified", async () => {
      setupFetchMock(createMockTraceData({}));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["contains"],
        expected: { contains: [] },
      });

      expect(results[0].value).toBe(0.5);
    });

    it("uses 'substrings' key as alternative", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "test output" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["contains"],
        expected: { substrings: ["test"] },
      });

      expect(results[0].value).toBe(1.0);
    });

    it("returns 0.5 when no expected at all", async () => {
      setupFetchMock(createMockTraceData({}));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["contains"],
      });

      expect(results[0].value).toBe(0.5);
    });
  });

  // =========================================================================
  // NOT_CONTAINS SCORER
  // =========================================================================
  describe("not_contains scorer", () => {
    it("scores 1.0 when no forbidden substrings found", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "Good output" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["not_contains"],
        expected: { forbidden: ["error", "failed"] },
      });

      expect(results[0].value).toBe(1.0);
    });

    it("scores 0.0 when forbidden substring found", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "An error occurred" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["not_contains"],
        expected: { forbidden: ["error"] },
      });

      expect(results[0].value).toBe(0.0);
    });

    it("returns 1.0 when no forbidden list specified", async () => {
      setupFetchMock(createMockTraceData({}));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["not_contains"],
        expected: { forbidden: [] },
      });

      expect(results[0].value).toBe(1.0);
    });

    it("uses 'notContains' key as alternative", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "clean output" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["not_contains"],
        expected: { notContains: ["bad"] },
      });

      expect(results[0].value).toBe(1.0);
    });

    it("is case-insensitive", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "Contains ERROR text" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["not_contains"],
        expected: { forbidden: ["error"] },
      });

      expect(results[0].value).toBe(0.0);
    });
  });

  // =========================================================================
  // REGEX_MATCH SCORER
  // =========================================================================
  describe("regex_match scorer", () => {
    it("scores 1.0 for matching pattern", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "Result: 42" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["regex_match"],
        expected: { pattern: "\\d+" },
      });

      expect(results[0].value).toBe(1.0);
    });

    it("scores 0.0 for non-matching pattern", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "no numbers here" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["regex_match"],
        expected: { pattern: "^\\d+$" },
      });

      expect(results[0].value).toBe(0.0);
    });

    it("returns 0.5 when no pattern specified", async () => {
      setupFetchMock(createMockTraceData({}));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["regex_match"],
        expected: {},
      });

      expect(results[0].value).toBe(0.5);
    });

    it("uses 'regex' key as alternative", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "test123" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["regex_match"],
        expected: { regex: "test\\d+" },
      });

      expect(results[0].value).toBe(1.0);
    });

    it("handles invalid regex gracefully", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "test" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["regex_match"],
        expected: { pattern: "[invalid" },
      });

      expect(results[0].value).toBe(0);
      expect(results[0].reason).toContain("Invalid regex");
    });
  });

  // =========================================================================
  // EXACT_MATCH SCORER
  // =========================================================================
  describe("exact_match scorer", () => {
    it("scores 1.0 for exact match", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "Expected output" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["exact_match"],
        expected: { output: "Expected output" },
      });

      expect(results[0].value).toBe(1.0);
    });

    it("trims whitespace for comparison", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "  result  " }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["exact_match"],
        expected: { output: "result" },
      });

      expect(results[0].value).toBe(1.0);
    });

    it("uses similarity score for partial match", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "hello world foo" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["exact_match"],
        expected: { output: "hello world bar" },
      });

      // Not exact match, but similarity > 0
      expect(results[0].value).toBeGreaterThan(0);
      expect(results[0].value).toBeLessThan(1);
      expect(results[0].reason).toContain("similarity");
    });

    it("returns 0.5 when no expected output specified", async () => {
      setupFetchMock(createMockTraceData({}));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["exact_match"],
        expected: {},
      });

      expect(results[0].value).toBe(0.5);
    });

    it("uses 'exactMatch' key as alternative", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "exact text" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["exact_match"],
        expected: { exactMatch: "exact text" },
      });

      expect(results[0].value).toBe(1.0);
    });
  });

  // =========================================================================
  // JSON_VALID SCORER
  // =========================================================================
  describe("json_valid scorer", () => {
    it("scores 1.0 for valid JSON object", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: '{"result": "success"}' }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["json_valid"],
      });

      expect(results[0].value).toBe(1.0);
    });

    it("scores 1.0 for valid JSON array", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: '[1, 2, 3]' }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["json_valid"],
      });

      expect(results[0].value).toBe(1.0);
    });

    it("scores 1.0 for JSON embedded in text", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: 'Here is the result: {"data": true} and some text' }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["json_valid"],
      });

      expect(results[0].value).toBe(1.0);
    });

    it("scores 0.0 for no JSON in output", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "just plain text" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["json_valid"],
      });

      expect(results[0].value).toBe(0.0);
    });

    it("scores 0.0 for invalid JSON", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: '{invalid json}' }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["json_valid"],
      });

      expect(results[0].value).toBe(0.0);
    });
  });

  // =========================================================================
  // OUTPUT_LENGTH SCORER
  // =========================================================================
  describe("output_length scorer", () => {
    it("scores 1.0 when length is in range", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "Hello World!" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["output_length"],
        expected: { minLength: 5, maxLength: 50 },
      });

      expect(results[0].value).toBe(1.0);
    });

    it("gives partial credit when too short", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "Hi" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["output_length"],
        expected: { minLength: 10 },
      });

      // 2/10 = 0.2
      expect(results[0].value).toBeCloseTo(0.2);
    });

    it("gives partial credit when too long", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "A".repeat(100) }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["output_length"],
        expected: { maxLength: 50 },
      });

      // 50/100 = 0.5
      expect(results[0].value).toBeCloseTo(0.5);
    });

    it("scores 1.0 with no constraints (defaults: 0-Infinity)", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "anything" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["output_length"],
      });

      expect(results[0].value).toBe(1.0);
    });

    it("includes length metadata", async () => {
      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "test" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["output_length"],
        expected: { minLength: 1, maxLength: 100 },
      });

      expect(results[0].metadata).toMatchObject({
        length: 4,
        minLength: 1,
        maxLength: 100,
      });
    });
  });

  // =========================================================================
  // LLM JUDGE SCORERS
  // =========================================================================
  describe("LLM judge scorers", () => {
    const llmScorerNames = ["response_quality", "hallucination", "relevance", "coherence", "safety"];

    for (const scorerName of llmScorerNames) {
      it(`runs ${scorerName} scorer via LLM`, async () => {
        mockChat.mockResolvedValue({
          content: `{"score": 0.9, "reason": "High ${scorerName}"}`, inputTokens: 0, outputTokens: 0, model: "claude-3-haiku-20240307",
        });

        setupFetchMock(createMockTraceData({
          spans: [
            { span_type: "generation", name: "gen", status: "ok", output: "Good response", input: "User query" },
          ],
        }));

        const results = await scoreTrace({
          traceId: "trace-123",
          projectId: "project-1",
          scorers: [scorerName],
        });

        expect(results[0].name).toBe(scorerName);
        expect(results[0].value).toBe(0.9);
        expect(results[0].reason).toContain(scorerName);
      });
    }

    it("clamps LLM score to 0-1 range", async () => {
      mockChat.mockResolvedValue({
        content: '{"score": 1.5, "reason": "Over max"}', inputTokens: 0, outputTokens: 0, model: "claude-3-haiku-20240307",
      });

      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "test" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["response_quality"],
      });

      expect(results[0].value).toBe(1.0); // Clamped to max
    });

    it("clamps negative LLM score to 0", async () => {
      mockChat.mockResolvedValue({
        content: '{"score": -0.5, "reason": "Below min"}', inputTokens: 0, outputTokens: 0, model: "claude-3-haiku-20240307",
      });

      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "test" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["hallucination"],
      });

      expect(results[0].value).toBe(0.0);
    });

    it("handles LLM response in markdown code block", async () => {
      mockChat.mockResolvedValue({
        content: '```json\n{"score": 0.75, "reason": "Good"}\n```', inputTokens: 0, outputTokens: 0, model: "claude-3-haiku-20240307",
      });

      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "test" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["relevance"],
      });

      expect(results[0].value).toBe(0.75);
    });

    it("returns 0.5 when LLM response cannot be parsed", async () => {
      mockChat.mockResolvedValue({
        content: "Not a JSON response at all", inputTokens: 0, outputTokens: 0, model: "claude-3-haiku-20240307",
      });

      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "test" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["coherence"],
      });

      expect(results[0].value).toBe(0.5);
      expect(results[0].reason).toContain("LLM judge error");
    });

    it("returns 0.5 when LLM API call fails", async () => {
      mockChat.mockRejectedValue(new Error("API rate limit"));

      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "test" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["safety"],
      });

      expect(results[0].value).toBe(0.5);
      expect(results[0].reason).toContain("LLM judge error");
    });

    it("falls back to generic LLM judge for unknown scorer names", async () => {
      mockChat.mockResolvedValue({
        content: '{"score": 0.8, "reason": "Custom eval"}', inputTokens: 0, outputTokens: 0, model: "claude-3-haiku-20240307",
      });

      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "test" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["custom_unknown_scorer"],
      });

      expect(results[0].name).toBe("custom_unknown_scorer");
      expect(results[0].value).toBe(0.8);
    });

    it("includes model metadata in result", async () => {
      mockChat.mockResolvedValue({
        content: '{"score": 0.9, "reason": "Great"}', inputTokens: 0, outputTokens: 0, model: "claude-3-haiku-20240307",
      });

      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "generation", name: "gen", status: "ok", output: "test" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["response_quality"],
      });

      expect(results[0].metadata?.model).toBe("claude-3-haiku-20240307");
    });

    it("handles trace with no generation spans", async () => {
      mockChat.mockResolvedValue({
        content: '{"score": 0.5, "reason": "No generation found"}', inputTokens: 0, outputTokens: 0, model: "claude-3-haiku-20240307",
      });

      setupFetchMock(createMockTraceData({
        spans: [{ span_type: "tool", name: "tool", status: "ok" }],
      }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["response_quality"],
      });

      // Should still run (the prompt handles missing generation)
      expect(results[0]).toBeDefined();
    });
  });

  // =========================================================================
  // ERROR HANDLING
  // =========================================================================
  describe("error handling", () => {
    it("handles scorer errors gracefully with zero score", async () => {
      registerScorer("failing_scorer_2", async () => {
        throw new Error("Scorer failed");
      });

      setupFetchMock(createMockTraceData({}));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["failing_scorer_2"],
      });

      expect(results[0].value).toBe(0);
      expect(results[0].reason).toContain("Scorer error: Scorer failed");
      expect(results[0].metadata).toEqual({ error: true });
    });

    it("handles non-Error throws in scorer", async () => {
      registerScorer("string_throw_scorer", async () => {
        throw "just a string";
      });

      setupFetchMock(createMockTraceData({}));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["string_throw_scorer"],
      });

      expect(results[0].value).toBe(0);
      expect(results[0].reason).toContain("Unknown error");
    });

    it("stores error scores in database", async () => {
      registerScorer("error_stored_scorer", async () => {
        throw new Error("Failed");
      });

      setupFetchMock(createMockTraceData({}));

      await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["error_stored_scorer"],
      });

      const scoreCalls = mockFetch.mock.calls.filter(
        (call) => (call[0] as string).includes("/api/scores")
      );

      expect(scoreCalls.length).toBeGreaterThanOrEqual(1);
      const body = JSON.parse(scoreCalls[0][1].body);
      expect(body.value).toBe(0);
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

    it("handles store score failure by recording error score", async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes("/api/traces/")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(createMockTraceData({})),
          });
        }
        if (url.includes("/api/scores")) {
          // Both the initial storeScore and the error storeScore will fail
          return Promise.resolve({
            ok: false,
            text: () => Promise.resolve("Store failed"),
          });
        }
        return Promise.reject(new Error("Unknown"));
      });

      // When storeScore fails after scoring succeeds, the catch block runs.
      // The catch block also tries to storeScore (which also fails), causing another throw.
      // This propagates as an unhandled error from scoreTrace
      await expect(
        scoreTrace({
          traceId: "trace-123",
          projectId: "project-1",
          scorers: ["latency"],
        })
      ).rejects.toThrow("Failed to store score");
    });

    it("continues scoring after one scorer fails", async () => {
      registerScorer("fail_first", async () => {
        throw new Error("First fails");
      });

      setupFetchMock(createMockTraceData({ duration_ms: 500 }));

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["fail_first", "latency"],
      });

      expect(results).toHaveLength(2);
      expect(results[0].value).toBe(0); // Failed scorer
      expect(results[1].value).toBe(1.0); // Latency still scored
    });
  });

  // =========================================================================
  // EDGE CASES: spans vs flatSpans
  // =========================================================================
  describe("trace data handling", () => {
    it("prefers flatSpans over spans", async () => {
      const traceData = {
        trace: {
          trace_id: "trace-123",
          name: "test",
          timestamp: new Date().toISOString(),
          duration_ms: 1000,
          status: "ok",
        },
        spans: [
          { span_id: "s1", trace_id: "trace-123", name: "gen", span_type: "generation", status: "ok", duration_ms: 500, output: "from spans" },
        ],
        flatSpans: [
          { span_id: "s1", trace_id: "trace-123", name: "gen", span_type: "generation", status: "ok", duration_ms: 500, output: "from flatSpans" },
        ],
      };

      mockFetch.mockImplementation((url: string) => {
        if (url.includes("/api/traces/")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(traceData) });
        }
        return Promise.resolve({ ok: true });
      });

      const results = await scoreTrace({
        traceId: "trace-123",
        projectId: "project-1",
        scorers: ["contains"],
        expected: { contains: ["flatSpans"] },
      });

      expect(results[0].value).toBe(1.0);
    });
  });
});

// ============================================================================
// scoreTraceWithConfig
// ============================================================================
describe("scoreTraceWithConfig", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockChat.mockResolvedValue({
      content: '{"score": 0.85, "reason": "Good quality"}', inputTokens: 0, outputTokens: 0, model: "claude-3-haiku-20240307",
    });
    process.env.NEON_API_URL = "http://localhost:3000";

    setupFetchMock(createMockTraceData({
      spans: [
        { span_type: "generation", name: "gen", status: "ok", output: "hello world" },
      ],
    }));
  });

  it("runs rule-based contains scorer with config", async () => {
    const result = await scoreTraceWithConfig({
      traceId: "trace-123",
      projectId: "project-1",
      scorer: {
        name: "contains",
        type: "rule_based",
        rules: { contains: ["hello"] },
      },
    });

    expect(result.value).toBe(1.0);
  });

  it("runs rule-based not_contains scorer with config", async () => {
    const result = await scoreTraceWithConfig({
      traceId: "trace-123",
      projectId: "project-1",
      scorer: {
        name: "not_contains",
        type: "rule_based",
        rules: { forbidden: ["bad"] },
      },
    });

    expect(result.value).toBe(1.0);
  });

  it("runs rule-based regex_match scorer with config", async () => {
    const result = await scoreTraceWithConfig({
      traceId: "trace-123",
      projectId: "project-1",
      scorer: {
        name: "regex_match",
        type: "rule_based",
        rules: { pattern: "hello.*" },
      },
    });

    expect(result.value).toBe(1.0);
  });

  it("runs rule-based exact_match scorer with config", async () => {
    const result = await scoreTraceWithConfig({
      traceId: "trace-123",
      projectId: "project-1",
      scorer: {
        name: "exact_match",
        type: "rule_based",
        rules: { output: "hello world" },
      },
    });

    expect(result.value).toBe(1.0);
  });

  it("runs rule-based tool_selection scorer with config", async () => {
    setupFetchMock(createMockTraceData({
      spans: [
        { span_type: "tool", name: "search", status: "ok", tool_name: "search" },
      ],
    }));

    const result = await scoreTraceWithConfig({
      traceId: "trace-123",
      projectId: "project-1",
      scorer: {
        name: "tool_selection",
        type: "rule_based",
        rules: { toolCalls: ["search"] },
      },
    });

    expect(result.value).toBe(1.0);
  });

  it("runs rule-based tool_sequence scorer with config", async () => {
    setupFetchMock(createMockTraceData({
      spans: [
        { span_id: "span-a", span_type: "tool", name: "a", status: "ok", tool_name: "search" },
        { span_id: "span-b", span_type: "tool", name: "b", status: "ok", tool_name: "analyze" },
      ],
    }));

    const result = await scoreTraceWithConfig({
      traceId: "trace-123",
      projectId: "project-1",
      scorer: {
        name: "tool_sequence",
        type: "rule_based",
        rules: { toolSequence: ["search", "analyze"] },
      },
    });

    expect(result.value).toBe(1.0);
  });

  it("throws for unknown rule-based scorer", async () => {
    await expect(
      scoreTraceWithConfig({
        traceId: "trace-123",
        projectId: "project-1",
        scorer: {
          name: "unknown_rule",
          type: "rule_based",
        },
      })
    ).rejects.toThrow("Unknown rule-based scorer: unknown_rule");
  });

  it("runs LLM judge scorer with config", async () => {
    mockChat.mockResolvedValue({
      content: '{"score": 0.92, "reason": "Excellent"}', inputTokens: 0, outputTokens: 0, model: "claude-3-haiku-20240307",
    });

    const result = await scoreTraceWithConfig({
      traceId: "trace-123",
      projectId: "project-1",
      scorer: {
        name: "custom_quality",
        type: "llm_judge",
        prompt: "Evaluate the quality of this response.",
      },
    });

    expect(result.value).toBe(0.92);
  });

  it("runs LLM judge scorer with custom model", async () => {
    mockChat.mockResolvedValue({
      content: '{"score": 0.88, "reason": "Good"}', inputTokens: 0, outputTokens: 0, model: "claude-3-haiku-20240307",
    });

    const result = await scoreTraceWithConfig({
      traceId: "trace-123",
      projectId: "project-1",
      scorer: {
        name: "custom_judge",
        type: "llm_judge",
        model: "claude-3-sonnet-20240229",
        prompt: "Evaluate.",
      },
    });

    expect(result.value).toBe(0.88);
    // Verify the model was passed to the provider
    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-3-sonnet-20240229",
      })
    );
  });

  it("runs custom scorer from registry", async () => {
    registerScorer("custom_config_test", async (trace) => ({
      name: "custom_config_test",
      value: 0.99,
      reason: "Custom logic",
    }));

    const result = await scoreTraceWithConfig({
      traceId: "trace-123",
      projectId: "project-1",
      scorer: {
        name: "custom_config_test",
        type: "custom",
      },
    });

    expect(result.value).toBe(0.99);
  });

  it("passes config to custom scorer", async () => {
    registerScorer("custom_with_config", async (trace, expected, config) => ({
      name: "custom_with_config",
      value: config?.threshold ?? 0.5,
      reason: `Threshold: ${config?.threshold}`,
    }));

    const result = await scoreTraceWithConfig({
      traceId: "trace-123",
      projectId: "project-1",
      scorer: {
        name: "custom_with_config",
        type: "custom",
        threshold: 0.8,
      },
    });

    expect(result.value).toBe(0.8);
  });

  it("throws for unregistered custom scorer", async () => {
    await expect(
      scoreTraceWithConfig({
        traceId: "trace-123",
        projectId: "project-1",
        scorer: {
          name: "unregistered_scorer",
          type: "custom",
        },
      })
    ).rejects.toThrow("Custom scorer not registered: unregistered_scorer");
  });

  it("throws for unknown scorer type", async () => {
    await expect(
      scoreTraceWithConfig({
        traceId: "trace-123",
        projectId: "project-1",
        scorer: {
          name: "test",
          type: "unknown" as any,
        },
      })
    ).rejects.toThrow("Unknown scorer type: unknown");
  });

  it("stores score result in ClickHouse", async () => {
    mockChat.mockResolvedValue({
      content: '{"score": 0.8, "reason": "OK"}', inputTokens: 0, outputTokens: 0, model: "claude-3-haiku-20240307",
    });

    await scoreTraceWithConfig({
      traceId: "trace-123",
      projectId: "project-1",
      scorer: {
        name: "my_scorer",
        type: "llm_judge",
        prompt: "Evaluate.",
      },
    });

    const scoreCall = mockFetch.mock.calls.find(
      (call) => (call[0] as string).includes("/api/scores")
    );
    expect(scoreCall).toBeDefined();
    const body = JSON.parse(scoreCall![1].body);
    expect(body.name).toBe("my_scorer");
    expect(body.value).toBe(0.8);
  });

  it("falls back to expected when config has no rules", async () => {
    const result = await scoreTraceWithConfig({
      traceId: "trace-123",
      projectId: "project-1",
      scorer: {
        name: "contains",
        type: "rule_based",
      },
      expected: { contains: ["hello"] },
    });

    expect(result.value).toBe(1.0);
  });
});

// ============================================================================
// registerScorer / hasScorer
// ============================================================================
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

    expect(hasScorer("overwrite_test")).toBe(true);
  });
});

// =============================================================================
// Trajectory Scorers
// =============================================================================

describe("trajectory scorers via scoreTrace", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv, NEON_API_URL: "http://localhost:3000" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // -- path_optimality --

  it("path_optimality: scores 1.0 when steps match minimum", async () => {
    const traceData = createMockTraceData({
      spans: [
        { span_type: "tool", name: "search", status: "ok", tool_name: "search" },
        { span_type: "tool", name: "extract", status: "ok", tool_name: "extract" },
      ],
    });
    setupFetchMock(traceData);

    const results = await scoreTrace({
      projectId: "proj-1",
      traceId: "trace-123",
      scorers: ["path_optimality"],
      expected: { minSteps: 2 },
    });

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("path_optimality");
    expect(results[0].value).toBe(1.0);
  });

  it("path_optimality: penalizes extra steps", async () => {
    const traceData = createMockTraceData({
      spans: [
        { span_type: "tool", name: "search", status: "ok", tool_name: "search" },
        { span_type: "tool", name: "retry", status: "ok", tool_name: "retry" },
        { span_type: "tool", name: "search2", status: "ok", tool_name: "search2" },
        { span_type: "tool", name: "extract", status: "ok", tool_name: "extract" },
      ],
    });
    setupFetchMock(traceData);

    const results = await scoreTrace({
      projectId: "proj-1",
      traceId: "trace-123",
      scorers: ["path_optimality"],
      expected: { minSteps: 2 },
    });

    expect(results[0].value).toBe(0.5); // 2/4
  });

  it("path_optimality: handles no tool spans", async () => {
    const traceData = createMockTraceData({
      spans: [
        { span_type: "generation", name: "gen", status: "ok", output: "hello" },
      ],
    });
    setupFetchMock(traceData);

    const results = await scoreTrace({
      projectId: "proj-1",
      traceId: "trace-123",
      scorers: ["path_optimality"],
    });

    expect(results[0].value).toBe(1.0);
  });

  // -- step_consistency --

  it("step_consistency: scores 1.0 with no contradictions", async () => {
    const traceData = createMockTraceData({
      spans: [
        { span_type: "tool", name: "search", status: "ok", tool_name: "search" },
        { span_type: "tool", name: "extract", status: "ok", tool_name: "extract" },
        { span_type: "tool", name: "summarize", status: "ok", tool_name: "summarize" },
      ],
    });
    setupFetchMock(traceData);

    const results = await scoreTrace({
      projectId: "proj-1",
      traceId: "trace-123",
      scorers: ["step_consistency"],
    });

    expect(results[0].name).toBe("step_consistency");
    expect(results[0].value).toBe(1.0);
  });

  it("step_consistency: detects opposite actions (create/delete)", async () => {
    const traceData = createMockTraceData({
      spans: [
        { span_type: "tool", name: "create_file", status: "ok", tool_name: "create_file" },
        { span_type: "tool", name: "delete_file", status: "ok", tool_name: "delete_file" },
      ],
    });
    setupFetchMock(traceData);

    const results = await scoreTrace({
      projectId: "proj-1",
      traceId: "trace-123",
      scorers: ["step_consistency"],
    });

    expect(results[0].value).toBeLessThan(1.0);
  });

  it("step_consistency: detects duplicate tool calls with same input", async () => {
    const traceData = createMockTraceData({
      spans: [
        { span_type: "tool", name: "search", status: "ok", tool_name: "search", tool_input: "query=test" },
        { span_type: "tool", name: "search", status: "ok", tool_name: "search", tool_input: "query=test" },
      ],
    });
    setupFetchMock(traceData);

    const results = await scoreTrace({
      projectId: "proj-1",
      traceId: "trace-123",
      scorers: ["step_consistency"],
    });

    expect(results[0].value).toBeLessThan(1.0);
  });

  it("step_consistency: scores 1.0 for single step", async () => {
    const traceData = createMockTraceData({
      spans: [
        { span_type: "tool", name: "search", status: "ok", tool_name: "search" },
      ],
    });
    setupFetchMock(traceData);

    const results = await scoreTrace({
      projectId: "proj-1",
      traceId: "trace-123",
      scorers: ["step_consistency"],
    });

    expect(results[0].value).toBe(1.0);
  });

  it("step_consistency: scores 1.0 for no tool spans", async () => {
    const traceData = createMockTraceData({
      spans: [
        { span_type: "generation", name: "gen", status: "ok", output: "hello" },
      ],
    });
    setupFetchMock(traceData);

    const results = await scoreTrace({
      projectId: "proj-1",
      traceId: "trace-123",
      scorers: ["step_consistency"],
    });

    expect(results[0].value).toBe(1.0);
  });

  // -- recovery_efficiency --

  it("recovery_efficiency: scores 1.0 with no errors", async () => {
    const traceData = createMockTraceData({
      spans: [
        { span_type: "tool", name: "search", status: "ok", tool_name: "search" },
        { span_type: "tool", name: "extract", status: "ok", tool_name: "extract" },
      ],
    });
    setupFetchMock(traceData);

    const results = await scoreTrace({
      projectId: "proj-1",
      traceId: "trace-123",
      scorers: ["recovery_efficiency"],
    });

    expect(results[0].name).toBe("recovery_efficiency");
    expect(results[0].value).toBe(1.0);
  });

  it("recovery_efficiency: scores 1.0 when error is recovered", async () => {
    const traceData = createMockTraceData({
      spans: [
        { span_id: "span-1", span_type: "tool", name: "search", status: "error", tool_name: "search" },
        { span_id: "span-2", span_type: "tool", name: "search", status: "ok", tool_name: "search" },
      ],
    });
    setupFetchMock(traceData);

    const results = await scoreTrace({
      projectId: "proj-1",
      traceId: "trace-123",
      scorers: ["recovery_efficiency"],
    });

    expect(results[0].value).toBe(1.0);
  });

  it("recovery_efficiency: scores 0 when error is not recovered", async () => {
    const traceData = createMockTraceData({
      spans: [
        { span_id: "span-1", span_type: "tool", name: "search", status: "error", tool_name: "search" },
        { span_id: "span-2", span_type: "generation", name: "gen", status: "ok" },
      ],
    });
    setupFetchMock(traceData);

    const results = await scoreTrace({
      projectId: "proj-1",
      traceId: "trace-123",
      scorers: ["recovery_efficiency"],
    });

    expect(results[0].value).toBe(0);
  });

  it("recovery_efficiency: partial recovery score", async () => {
    const traceData = createMockTraceData({
      spans: [
        { span_id: "span-1", span_type: "tool", name: "search", status: "error", tool_name: "search" },
        { span_id: "span-2", span_type: "tool", name: "search", status: "ok", tool_name: "search" },
        { span_id: "span-3", span_type: "tool", name: "extract", status: "error", tool_name: "extract" },
      ],
    });
    setupFetchMock(traceData);

    const results = await scoreTrace({
      projectId: "proj-1",
      traceId: "trace-123",
      scorers: ["recovery_efficiency"],
    });

    expect(results[0].value).toBe(0.5); // 1 of 2 errors recovered
  });

  // -- plan_adherence --

  it("plan_adherence: scores 1.0 with no planning spans", async () => {
    const traceData = createMockTraceData({
      spans: [
        { span_type: "tool", name: "search", status: "ok", tool_name: "search" },
      ],
    });
    setupFetchMock(traceData);

    const results = await scoreTrace({
      projectId: "proj-1",
      traceId: "trace-123",
      scorers: ["plan_adherence"],
    });

    expect(results[0].name).toBe("plan_adherence");
    expect(results[0].value).toBe(1.0);
  });

  it("plan_adherence: scores based on planned vs executed actions", async () => {
    const traceData = createMockTraceData({
      spans: [
        {
          span_type: "generation",
          name: "planner",
          status: "ok",
          output: "I will use search and extract tools",
          attributes: { component_type: "planning" },
        },
        { span_type: "tool", name: "search", status: "ok", tool_name: "search" },
        { span_type: "tool", name: "extract", status: "ok", tool_name: "extract" },
      ],
    });
    setupFetchMock(traceData);

    const results = await scoreTrace({
      projectId: "proj-1",
      traceId: "trace-123",
      scorers: ["plan_adherence"],
    });

    expect(results[0].value).toBe(1.0);
  });

  it("plan_adherence: partial adherence when some planned actions not executed", async () => {
    const traceData = createMockTraceData({
      spans: [
        {
          span_type: "generation",
          name: "planner",
          status: "ok",
          output: "I will use search, extract, and summarize tools",
          attributes: { component_type: "planning" },
        },
        { span_type: "tool", name: "search", status: "ok", tool_name: "search" },
      ],
    });
    setupFetchMock(traceData);

    const results = await scoreTrace({
      projectId: "proj-1",
      traceId: "trace-123",
      scorers: ["plan_adherence"],
    });

    // search is mentioned and executed but extract and summarize are only in plan text,
    // not in tool names. Only search matches from planned → 1/1 for tool names found in plan
    // Actually: planned actions = tool names found in plan output. search is the only tool name
    // that appears in tool spans. So planned = {search} (extract only if it's a tool name).
    expect(results[0].value).toBeGreaterThan(0);
    expect(results[0].value).toBeLessThanOrEqual(1.0);
  });

  it("plan_adherence: scores 0.0 when planning exists but no tools executed", async () => {
    const traceData = createMockTraceData({
      spans: [
        {
          span_type: "generation",
          name: "planner",
          status: "ok",
          output: "I will use search and extract tools",
          attributes: { component_type: "planning" },
        },
      ],
    });
    setupFetchMock(traceData);

    const results = await scoreTrace({
      projectId: "proj-1",
      traceId: "trace-123",
      scorers: ["plan_adherence"],
    });

    expect(results[0].value).toBe(0.0);
  });

  it("plan_adherence: uses plan.actions attribute when available", async () => {
    const traceData = createMockTraceData({
      spans: [
        {
          span_type: "generation",
          name: "planner",
          status: "ok",
          output: "planning step",
          attributes: {
            component_type: "planning",
            "plan.actions": JSON.stringify(["search", "extract"]),
          },
        },
        { span_type: "tool", name: "search", status: "ok", tool_name: "search" },
        { span_type: "tool", name: "extract", status: "ok", tool_name: "extract" },
      ],
    });
    setupFetchMock(traceData);

    const results = await scoreTrace({
      projectId: "proj-1",
      traceId: "trace-123",
      scorers: ["plan_adherence"],
    });

    expect(results[0].value).toBe(1.0);
  });

  it("plan_adherence: returns 0.7 when plan output doesn't contain extractable actions", async () => {
    const traceData = createMockTraceData({
      spans: [
        {
          span_type: "generation",
          name: "planner",
          status: "ok",
          output: "I will think carefully about the problem",
          attributes: { component_type: "planning" },
        },
        { span_type: "tool", name: "search", status: "ok", tool_name: "search" },
      ],
    });
    setupFetchMock(traceData);

    const results = await scoreTrace({
      projectId: "proj-1",
      traceId: "trace-123",
      scorers: ["plan_adherence"],
    });

    expect(results[0].value).toBe(0.7);
  });
});

describe("hasScorer", () => {
  it("returns true for all built-in scorers", () => {
    const builtins = [
      "tool_selection", "response_quality", "latency", "error_rate",
      "token_efficiency", "contains", "not_contains", "regex_match",
      "exact_match", "json_valid", "output_length", "tool_sequence",
      "hallucination", "relevance", "coherence", "safety",
      "path_optimality", "step_consistency", "recovery_efficiency", "plan_adherence",
    ];

    for (const name of builtins) {
      expect(hasScorer(name)).toBe(true);
    }
  });

  it("returns false for unknown scorers", () => {
    expect(hasScorer("nonexistent_scorer")).toBe(false);
  });

  it("returns true for registered custom scorers", () => {
    registerScorer("custom_registered_2", async () => ({
      name: "custom_registered_2",
      value: 1.0,
    }));

    expect(hasScorer("custom_registered_2")).toBe(true);
  });
});
