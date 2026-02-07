/**
 * Tests for Test Definition API
 */

import { describe, it, expect, vi } from "vitest";
import {
  defineTest,
  defineDataset,
  defineSuite,
  validateTest,
  validateSuite,
  run,
  type Test,
  type Suite,
  type AgentOutput,
} from "../test/index";
import { defineScorer } from "../scorers/base";

describe("defineTest", () => {
  it("creates a test with required fields", () => {
    const test = defineTest({
      name: "basic-test",
      input: { query: "Hello" },
    });

    expect(test.name).toBe("basic-test");
    expect(test.input).toEqual({ query: "Hello" });
    expect(test.timeout).toBe(60000); // default timeout
  });

  it("creates a test with expected output", () => {
    const test = defineTest({
      name: "with-expected",
      input: { query: "What is 2+2?" },
      expected: {
        output: "4",
        toolCalls: ["calculator"],
        outputContains: ["4", "four"],
      },
    });

    expect(test.expected?.output).toBe("4");
    expect(test.expected?.toolCalls).toEqual(["calculator"]);
    expect(test.expected?.outputContains).toEqual(["4", "four"]);
  });

  it("creates a test with named scorers", () => {
    const test = defineTest({
      name: "with-scorers",
      input: { query: "test" },
      scorers: ["quality", "safety"],
    });

    expect(test.scorers).toEqual(["quality", "safety"]);
  });

  it("creates a test with inline scorer function", () => {
    const scorer = () => ({ value: 1, reason: "pass" });
    const test = defineTest({
      name: "with-inline-scorer",
      input: { query: "test" },
      scorer,
    });

    expect(test.scorer).toBe(scorer);
  });

  it("respects custom timeout", () => {
    const test = defineTest({
      name: "custom-timeout",
      input: { query: "test" },
      timeout: 5000,
    });

    expect(test.timeout).toBe(5000);
  });
});

describe("defineDataset", () => {
  it("creates a dataset with items", () => {
    const dataset = defineDataset({
      name: "golden-queries",
      items: [
        { input: { query: "What is 2+2?" }, expected: { output: "4" } },
        { input: { query: "What is 3+3?" }, expected: { output: "6" } },
      ],
    });

    expect(dataset.name).toBe("golden-queries");
    expect(dataset.items).toHaveLength(2);
  });

  it("creates a dataset with description", () => {
    const dataset = defineDataset({
      name: "test-dataset",
      description: "A test dataset for math queries",
      items: [],
    });

    expect(dataset.description).toBe("A test dataset for math queries");
  });
});

describe("defineSuite", () => {
  it("creates a suite with tests", () => {
    const test1 = defineTest({ name: "test-1", input: { q: "a" } });
    const test2 = defineTest({ name: "test-2", input: { q: "b" } });

    const suite = defineSuite({
      name: "my-suite",
      tests: [test1, test2],
    });

    expect(suite.name).toBe("my-suite");
    expect(suite.tests).toHaveLength(2);
    expect(suite.config?.parallel).toBe(1); // default
    expect(suite.config?.timeout).toBe(300000); // default 5 minutes
  });

  it("creates a suite with custom config", () => {
    const suite = defineSuite({
      name: "parallel-suite",
      tests: [defineTest({ name: "test", input: {} })],
      config: {
        parallel: 5,
        timeout: 60000,
        agentId: "my-agent",
        agentVersion: "1.0.0",
      },
    });

    expect(suite.config?.parallel).toBe(5);
    expect(suite.config?.timeout).toBe(60000);
    expect(suite.config?.agentId).toBe("my-agent");
    expect(suite.config?.agentVersion).toBe("1.0.0");
  });

  it("creates a suite with scorers", () => {
    const scorer = defineScorer({
      name: "custom",
      evaluate: () => ({ value: 1 }),
    });

    const suite = defineSuite({
      name: "scored-suite",
      tests: [defineTest({ name: "test", input: {} })],
      scorers: { custom: scorer },
    });

    expect(suite.scorers?.custom).toBe(scorer);
  });
});

describe("validateTest", () => {
  it("returns no errors for valid test", () => {
    const test = defineTest({
      name: "valid-test",
      input: { query: "hello" },
    });

    const errors = validateTest(test);
    expect(errors).toHaveLength(0);
  });

  it("returns error for missing name", () => {
    const test = { name: "", input: { query: "test" } } as Test;

    const errors = validateTest(test);
    expect(errors).toContain("Test name is required");
  });

  it("returns error for missing input", () => {
    const test = { name: "test", input: null } as unknown as Test;

    const errors = validateTest(test);
    expect(errors).toContain("Test input must be an object");
  });

  it("returns error for invalid timeout", () => {
    const test = { name: "test", input: {}, timeout: -1 } as Test;

    const errors = validateTest(test);
    expect(errors).toContain("Test timeout must be positive");
  });
});

describe("validateSuite", () => {
  it("returns no errors for valid suite", () => {
    const suite = defineSuite({
      name: "valid-suite",
      tests: [defineTest({ name: "test", input: {} })],
    });

    const errors = validateSuite(suite);
    expect(errors).toHaveLength(0);
  });

  it("returns error for missing suite name", () => {
    const suite = { name: "", tests: [defineTest({ name: "t", input: {} })] } as Suite;

    const errors = validateSuite(suite);
    expect(errors).toContain("Suite name is required");
  });

  it("returns error for empty tests array", () => {
    const suite = { name: "suite", tests: [] } as Suite;

    const errors = validateSuite(suite);
    expect(errors).toContain("Suite must have at least one test");
  });

  it("returns nested test validation errors", () => {
    const suite = {
      name: "suite",
      tests: [{ name: "", input: {} } as Test],
    } as Suite;

    const errors = validateSuite(suite);
    expect(errors.some((e) => e.includes("Test name is required"))).toBe(true);
  });
});

describe("run", () => {
  it("runs a single test without agent", async () => {
    const test = defineTest({
      name: "simple-test",
      input: { query: "hello" },
    });

    const result = await run(test);

    expect(result).toHaveProperty("name", "simple-test");
    expect(result).toHaveProperty("passed");
    expect(result).toHaveProperty("scores");
    expect(result).toHaveProperty("durationMs");
  });

  it("runs a single test with agent", async () => {
    const test = defineTest({
      name: "agent-test",
      input: { query: "What is 2+2?" },
      expected: {
        output: "4",
      },
    });

    const mockAgent = vi.fn().mockResolvedValue({
      output: "4",
      toolCalls: [],
    } as AgentOutput);

    const result = await run(test, { agent: mockAgent });

    expect(mockAgent).toHaveBeenCalledWith({ query: "What is 2+2?" });
    expect(result).toHaveProperty("passed", true);
    expect(result).toHaveProperty("scores");
    // Should have exact_match score
    const exactMatch = (result as { scores: Array<{ name: string; value: number }> }).scores.find(
      (s) => s.name === "exact_match"
    );
    expect(exactMatch?.value).toBe(1);
  });

  it("runs an array of tests", async () => {
    const tests = [
      defineTest({ name: "test-1", input: { q: "a" } }),
      defineTest({ name: "test-2", input: { q: "b" } }),
      defineTest({ name: "test-3", input: { q: "c" } }),
    ];

    const results = await run(tests);

    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(3);
  });

  it("runs a suite and returns SuiteResult", async () => {
    const suite = defineSuite({
      name: "test-suite",
      tests: [
        defineTest({ name: "test-1", input: {} }),
        defineTest({ name: "test-2", input: {} }),
      ],
    });

    const result = await run(suite);

    expect(result).toHaveProperty("name", "test-suite");
    expect(result).toHaveProperty("results");
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("durationMs");

    const suiteResult = result as { summary: { total: number; passed: number } };
    expect(suiteResult.summary.total).toBe(2);
  });

  it("runs tests in parallel", async () => {
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    let concurrentCalls = 0;
    let maxConcurrent = 0;

    const mockAgent = vi.fn().mockImplementation(async () => {
      concurrentCalls++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
      await delay(50);
      concurrentCalls--;
      return { output: "ok" } as AgentOutput;
    });

    const tests = [
      defineTest({ name: "test-1", input: {} }),
      defineTest({ name: "test-2", input: {} }),
      defineTest({ name: "test-3", input: {} }),
      defineTest({ name: "test-4", input: {} }),
    ];

    await run(tests, { agent: mockAgent, parallel: 4 });

    expect(maxConcurrent).toBe(4);
  });

  it("filters tests by name pattern", async () => {
    const suite = defineSuite({
      name: "filter-suite",
      tests: [
        defineTest({ name: "auth-login", input: {} }),
        defineTest({ name: "auth-logout", input: {} }),
        defineTest({ name: "api-get", input: {} }),
      ],
    });

    const result = await run(suite, { filter: /^auth-/ });

    const suiteResult = result as { results: Array<{ name: string }> };
    expect(suiteResult.results).toHaveLength(2);
    expect(suiteResult.results.every((r) => r.name.startsWith("auth-"))).toBe(true);
  });

  it("runs inline scorer", async () => {
    const test = defineTest({
      name: "inline-scorer-test",
      input: { query: "test" },
      scorer: () => ({ value: 0.95, reason: "Custom check passed" }),
    });

    const result = await run(test);

    const testResult = result as { scores: Array<{ name: string; value: number; reason?: string }> };
    const inlineScore = testResult.scores.find((s) => s.name === "inline");
    expect(inlineScore?.value).toBe(0.95);
    expect(inlineScore?.reason).toBe("Custom check passed");
  });

  it("runs named scorers from options", async () => {
    const customScorer = defineScorer({
      name: "custom-scorer",
      evaluate: () => ({ value: 0.8, reason: "Good enough" }),
    });

    const test = defineTest({
      name: "named-scorer-test",
      input: {},
      scorers: ["custom-scorer"],
    });

    const result = await run(test, {
      scorers: { "custom-scorer": customScorer },
    });

    const testResult = result as { scores: Array<{ name: string; value: number }> };
    const customScore = testResult.scores.find((s) => s.name === "custom-scorer");
    expect(customScore?.value).toBe(0.8);
  });

  it("handles missing scorer gracefully", async () => {
    const test = defineTest({
      name: "missing-scorer-test",
      input: {},
      scorers: ["non-existent-scorer"],
    });

    const result = await run(test);

    const testResult = result as { scores: Array<{ name: string; value: number; reason?: string }> };
    const missingScore = testResult.scores.find((s) => s.name === "non-existent-scorer");
    expect(missingScore?.value).toBe(0);
    expect(missingScore?.reason).toContain("not found");
  });

  it("checks tool_selection from expected output", async () => {
    const test = defineTest({
      name: "tool-test",
      input: { query: "Get weather" },
      expected: {
        toolCalls: ["get_weather", "format_result"],
      },
    });

    const mockAgent = vi.fn().mockResolvedValue({
      output: "The weather is sunny",
      toolCalls: ["get_weather"],
    } as AgentOutput);

    const result = await run(test, { agent: mockAgent });

    const testResult = result as { scores: Array<{ name: string; value: number }> };
    const toolScore = testResult.scores.find((s) => s.name === "tool_selection");
    expect(toolScore?.value).toBe(0.5); // 1 out of 2 tools matched
  });

  it("checks outputContains from expected output", async () => {
    const test = defineTest({
      name: "contains-test",
      input: { query: "Hello" },
      expected: {
        outputContains: ["hello", "world"],
      },
    });

    const mockAgent = vi.fn().mockResolvedValue({
      output: "Hello there!",
    } as AgentOutput);

    const result = await run(test, { agent: mockAgent });

    const testResult = result as { scores: Array<{ name: string; value: number }> };
    const containsScore = testResult.scores.find((s) => s.name === "output_contains");
    expect(containsScore?.value).toBe(0.5); // 1 out of 2 strings matched (case insensitive)
  });

  it("handles test timeout", async () => {
    const test = defineTest({
      name: "slow-test",
      input: {},
      timeout: 50, // 50ms timeout
    });

    const slowAgent = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return { output: "done" };
    });

    const result = await run(test, { agent: slowAgent });

    const testResult = result as { passed: boolean; error?: string };
    expect(testResult.passed).toBe(false);
    expect(testResult.error).toContain("timed out");
  });

  it("handles agent errors gracefully", async () => {
    const test = defineTest({
      name: "error-test",
      input: {},
    });

    const errorAgent = vi.fn().mockRejectedValue(new Error("Agent failed"));

    const result = await run(test, { agent: errorAgent });

    const testResult = result as { passed: boolean; error?: string };
    expect(testResult.passed).toBe(false);
    expect(testResult.error).toBe("Agent failed");
  });

  it("calculates suite summary correctly", async () => {
    const passingScorer = defineScorer({
      name: "passing",
      evaluate: () => ({ value: 1.0 }),
    });

    const failingScorer = defineScorer({
      name: "failing",
      evaluate: () => ({ value: 0.3 }),
    });

    const suite = defineSuite({
      name: "summary-suite",
      tests: [
        defineTest({ name: "pass-1", input: {}, scorers: ["passing"] }),
        defineTest({ name: "pass-2", input: {}, scorers: ["passing"] }),
        defineTest({ name: "fail-1", input: {}, scorers: ["failing"] }),
      ],
      scorers: { passing: passingScorer, failing: failingScorer },
    });

    const result = await run(suite);

    const suiteResult = result as {
      summary: { total: number; passed: number; failed: number; passRate: number; avgScore: number };
    };
    expect(suiteResult.summary.total).toBe(3);
    expect(suiteResult.summary.passed).toBe(2);
    expect(suiteResult.summary.failed).toBe(1);
    expect(suiteResult.summary.passRate).toBeCloseTo(0.667, 2);
    expect(suiteResult.summary.avgScore).toBeCloseTo(0.767, 2); // (1 + 1 + 0.3) / 3
  });
});

describe("async scorer support", () => {
  it("supports async inline scorers", async () => {
    const test = defineTest({
      name: "async-scorer-test",
      input: {},
      scorer: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { value: 0.9, reason: "Async check passed" };
      },
    });

    const result = await run(test);

    const testResult = result as { scores: Array<{ name: string; value: number }> };
    const inlineScore = testResult.scores.find((s) => s.name === "inline");
    expect(inlineScore?.value).toBe(0.9);
  });

  it("supports async Scorer objects", async () => {
    const asyncScorer = defineScorer({
      name: "async-scorer",
      evaluate: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { value: 0.85, reason: "Async scorer passed" };
      },
    });

    const test = defineTest({
      name: "async-object-scorer-test",
      input: {},
      scorers: ["async-scorer"],
    });

    const result = await run(test, { scorers: { "async-scorer": asyncScorer } });

    const testResult = result as { scores: Array<{ name: string; value: number }> };
    const asyncScore = testResult.scores.find((s) => s.name === "async-scorer");
    expect(asyncScore?.value).toBe(0.85);
  });
});
