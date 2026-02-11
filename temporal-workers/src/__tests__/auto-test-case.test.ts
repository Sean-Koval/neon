/**
 * Tests for Auto Test Case Generation Activity
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateTestCaseFromTrace,
  addToRegressionSuite,
} from "../activities/auto-test-case";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("generateTestCaseFromTrace", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv, NEON_API_URL: "http://localhost:3000" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("extracts input/output from a trace with generation spans", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          trace: {
            trace_id: "trace-abc",
            name: "my-agent",
            status: "ok",
            duration_ms: 1500,
          },
          spans: [
            {
              span_id: "s1",
              span_type: "generation",
              name: "root",
              input: "What is the weather?",
              output: "The weather is sunny.",
            },
            {
              span_id: "s2",
              span_type: "tool",
              name: "weather_api",
              tool_name: "weather_api",
              input: "",
              output: "",
            },
            {
              span_id: "s3",
              span_type: "generation",
              name: "final",
              input: "",
              output: "Based on weather_api, it is sunny today.",
            },
          ],
        }),
    });

    const result = await generateTestCaseFromTrace("proj-1", "trace-abc");

    expect(result.name).toContain("my-agent");
    expect(result.name).toContain("trace-ab");
    expect(result.input).toBe("What is the weather?");
    expect(result.expectedOutput).toBe(
      "Based on weather_api, it is sunny today."
    );
    expect(result.tools).toEqual(["weather_api"]);
    expect(result.sourceTraceId).toBe("trace-abc");
    expect(result.metadata.generatedFrom).toBe("anomaly-detection");
    expect(result.metadata.originalStatus).toBe("ok");
  });

  it("uses tool_input as fallback for input", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          trace: { trace_id: "trace-xyz", name: "agent" },
          spans: [
            {
              span_id: "s1",
              span_type: "tool",
              name: "root",
              tool_name: "tool1",
              tool_input: "fallback input",
              output: "some output",
              tool_output: "tool output",
            },
          ],
        }),
    });

    const result = await generateTestCaseFromTrace("proj-1", "trace-xyz");

    expect(result.input).toBe("fallback input");
    expect(result.expectedOutput).toBe("some output");
  });

  it("handles empty spans gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          trace: { trace_id: "trace-empty", name: "empty-trace" },
          spans: [],
        }),
    });

    const result = await generateTestCaseFromTrace("proj-1", "trace-empty");

    expect(result.input).toBe("{}");
    expect(result.expectedOutput).toBe("{}");
    expect(result.tools).toEqual([]);
  });

  it("deduplicates tool names", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          trace: { trace_id: "trace-dup" },
          spans: [
            { span_id: "s1", span_type: "tool", name: "search", tool_name: "search" },
            { span_id: "s2", span_type: "tool", name: "search", tool_name: "search" },
            { span_id: "s3", span_type: "tool", name: "extract", tool_name: "extract" },
          ],
        }),
    });

    const result = await generateTestCaseFromTrace("proj-1", "trace-dup");

    expect(result.tools).toHaveLength(2);
    expect(result.tools).toContain("search");
    expect(result.tools).toContain("extract");
  });

  it("throws on fetch failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    await expect(
      generateTestCaseFromTrace("proj-1", "missing-trace")
    ).rejects.toThrow("Failed to fetch trace missing-trace: 404 Not Found");
  });

  it("uses trace name or fallback in test case name", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          trace: { trace_id: "trace-no-name" },
          spans: [{ span_id: "s1", span_type: "generation", name: "root", output: "out" }],
        }),
    });

    const result = await generateTestCaseFromTrace("proj-1", "trace-no-name");

    expect(result.name).toContain("trace");
    expect(result.name).toContain("trace-no");
  });
});

describe("addToRegressionSuite", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv, NEON_API_URL: "http://localhost:3000" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("adds test cases successfully", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const testCases = [
      {
        name: "test-1",
        input: "hello",
        expectedOutput: "world",
        tools: [],
        sourceTraceId: "t1",
        metadata: {},
      },
      {
        name: "test-2",
        input: "foo",
        expectedOutput: "bar",
        tools: ["tool1"],
        sourceTraceId: "t2",
        metadata: {},
      },
    ];

    const result = await addToRegressionSuite("suite-1", testCases);

    expect(result.added).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Verify the request body structure
    const call = mockFetch.mock.calls[0];
    expect(call[0]).toContain("/api/trpc/suites.addCase");
    const body = JSON.parse(call[1].body);
    expect(body.json.suiteId).toBe("suite-1");
    expect(body.json.name).toBe("test-1");
  });

  it("collects errors for failed additions", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, statusText: "Internal Server Error" });

    const testCases = [
      {
        name: "good-case",
        input: "i",
        expectedOutput: "o",
        tools: [],
        sourceTraceId: "t1",
        metadata: {},
      },
      {
        name: "bad-case",
        input: "i",
        expectedOutput: "o",
        tools: [],
        sourceTraceId: "t2",
        metadata: {},
      },
    ];

    const result = await addToRegressionSuite("suite-1", testCases);

    expect(result.added).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("bad-case");
  });

  it("handles fetch exceptions gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const testCases = [
      {
        name: "error-case",
        input: "i",
        expectedOutput: "o",
        tools: [],
        sourceTraceId: "t1",
        metadata: {},
      },
    ];

    const result = await addToRegressionSuite("suite-1", testCases);

    expect(result.added).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Network error");
  });

  it("handles empty test cases array", async () => {
    const result = await addToRegressionSuite("suite-1", []);

    expect(result.added).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
