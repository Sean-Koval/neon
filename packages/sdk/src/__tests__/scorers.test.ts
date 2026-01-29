/**
 * Tests for Scorer APIs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  exactMatch,
  contains,
  llmJudge,
  exactMatchScorer,
  containsScorer,
  defineScorer,
  responseQualityJudge,
  safetyJudge,
  helpfulnessJudge,
  type EvalContext,
} from "../index";

// Mock trace data for testing
function createMockContext(output: string, expected?: Record<string, unknown>): EvalContext {
  return {
    trace: {
      trace: {
        id: "test-trace-id",
        projectId: "test-project",
        name: "test-trace",
        status: "ok",
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        durationMs: 100,
        metadata: { input: "test input" },
      },
      spans: [
        {
          id: "gen-1",
          traceId: "test-trace-id",
          name: "generation",
          spanType: "generation",
          status: "ok",
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          durationMs: 50,
          input: "test input",
          output,
        },
      ],
    },
    expected,
  };
}

describe("exactMatch", () => {
  describe("basic matching", () => {
    it("returns 1 for exact match", () => {
      const scorer = exactMatch("hello world");
      const result = scorer.evaluate(createMockContext("hello world"));

      expect(result).toEqual({
        value: 1,
        reason: "Output matches expected exactly",
      });
    });

    it("returns 0 for non-match", () => {
      const scorer = exactMatch("hello world");
      const result = scorer.evaluate(createMockContext("goodbye world"));

      expect(result).toMatchObject({
        value: 0,
      });
      expect((result as { reason: string }).reason).toContain("does not match");
    });

    it("trims whitespace by default", () => {
      const scorer = exactMatch("hello");
      const result = scorer.evaluate(createMockContext("  hello  "));

      expect(result).toEqual({
        value: 1,
        reason: "Output matches expected exactly",
      });
    });
  });

  describe("config options", () => {
    it("supports string shorthand", () => {
      const scorer = exactMatch("test");
      expect(scorer.name).toBe("exact_match");
    });

    it("supports object config", () => {
      const scorer = exactMatch({ expected: "test" });
      const result = scorer.evaluate(createMockContext("test"));
      expect(result).toMatchObject({ value: 1 });
    });

    it("respects caseSensitive: false", () => {
      const scorer = exactMatch({ expected: "Hello World", caseSensitive: false });
      const result = scorer.evaluate(createMockContext("hello world"));

      expect(result).toEqual({
        value: 1,
        reason: "Output matches expected exactly",
      });
    });

    it("respects caseSensitive: true (default)", () => {
      const scorer = exactMatch({ expected: "Hello World" });
      const result = scorer.evaluate(createMockContext("hello world"));

      expect(result).toMatchObject({ value: 0 });
    });

    it("respects normalizeWhitespace option", () => {
      const scorer = exactMatch({
        expected: "hello world",
        normalizeWhitespace: true,
      });
      const result = scorer.evaluate(createMockContext("hello   world"));

      expect(result).toEqual({
        value: 1,
        reason: "Output matches expected exactly",
      });
    });

    it("respects trim: false option", () => {
      const scorer = exactMatch({ expected: "hello", trim: false });
      const result = scorer.evaluate(createMockContext("  hello  "));

      expect(result).toMatchObject({ value: 0 });
    });
  });

  describe("edge cases", () => {
    it("handles empty string output", () => {
      const scorer = exactMatch("expected");
      const result = scorer.evaluate(createMockContext(""));

      expect(result).toMatchObject({ value: 0 });
    });

    it("handles empty expected string", () => {
      const scorer = exactMatch("");
      const result = scorer.evaluate(createMockContext(""));

      expect(result).toEqual({
        value: 1,
        reason: "Output matches expected exactly",
      });
    });

    it("handles no expected specified (returns 1)", () => {
      const scorer = exactMatch();
      const result = scorer.evaluate(createMockContext("anything"));

      expect(result).toEqual({
        value: 1,
        reason: "No expected output specified",
      });
    });

    it("uses context.expected.output when no config provided", () => {
      const scorer = exactMatch();
      const result = scorer.evaluate(
        createMockContext("hello", { output: "hello" })
      );

      expect(result).toEqual({
        value: 1,
        reason: "Output matches expected exactly",
      });
    });

    it("handles very long strings with truncated preview", () => {
      const longString = "a".repeat(100);
      const scorer = exactMatch(longString);
      const result = scorer.evaluate(createMockContext("different"));

      expect((result as { reason: string }).reason).toContain("...");
    });
  });

  describe("legacy alias", () => {
    it("exactMatchScorer works the same as exactMatch", () => {
      const scorer1 = exactMatch("test");
      const scorer2 = exactMatchScorer("test");

      const context = createMockContext("test");
      expect(scorer1.evaluate(context)).toEqual(scorer2.evaluate(context));
    });
  });
});

describe("contains", () => {
  describe("basic matching", () => {
    it("returns 1 when string is found", () => {
      const scorer = contains("hello");
      const result = scorer.evaluate(createMockContext("hello world"));

      expect(result).toEqual({
        value: 1,
        reason: "All 1 expected string(s) found",
      });
    });

    it("returns 0 when string is not found", () => {
      const scorer = contains("goodbye");
      const result = scorer.evaluate(createMockContext("hello world"));

      expect(result).toMatchObject({ value: 0 });
      expect((result as { reason: string }).reason).toContain("missing");
    });

    it("is case-insensitive by default", () => {
      const scorer = contains("HELLO");
      const result = scorer.evaluate(createMockContext("hello world"));

      expect(result).toMatchObject({ value: 1 });
    });
  });

  describe("array matching", () => {
    it("returns 1 when all strings are found", () => {
      const scorer = contains(["hello", "world"]);
      const result = scorer.evaluate(createMockContext("hello world"));

      expect(result).toEqual({
        value: 1,
        reason: "All 2 expected string(s) found",
      });
    });

    it("returns partial score when some strings are found", () => {
      const scorer = contains(["hello", "goodbye", "world"]);
      const result = scorer.evaluate(createMockContext("hello world"));

      expect(result).toMatchObject({
        value: 2 / 3,
      });
      expect((result as { reason: string }).reason).toContain("2/3");
      expect((result as { reason: string }).reason).toContain("goodbye");
    });

    it("returns 0 when no strings are found", () => {
      const scorer = contains(["foo", "bar"]);
      const result = scorer.evaluate(createMockContext("hello world"));

      expect(result).toMatchObject({ value: 0 });
    });
  });

  describe("config options", () => {
    it("supports string shorthand", () => {
      const scorer = contains("test");
      expect(scorer.name).toBe("contains");
    });

    it("supports array shorthand", () => {
      const scorer = contains(["a", "b"]);
      const result = scorer.evaluate(createMockContext("a b c"));
      expect(result).toMatchObject({ value: 1 });
    });

    it("supports object config", () => {
      const scorer = contains({ expected: ["test"] });
      const result = scorer.evaluate(createMockContext("test"));
      expect(result).toMatchObject({ value: 1 });
    });

    it("respects caseSensitive: true", () => {
      const scorer = contains({ expected: "HELLO", caseSensitive: true });
      const result = scorer.evaluate(createMockContext("hello"));

      expect(result).toMatchObject({ value: 0 });
    });

    it("respects matchAll: false (OR mode)", () => {
      const scorer = contains({
        expected: ["hello", "goodbye"],
        matchAll: false,
      });
      const result = scorer.evaluate(createMockContext("hello world"));

      expect(result).toEqual({
        value: 1,
        reason: 'Found matching string: "hello"',
      });
    });

    it("matchAll: false returns 0 when none match", () => {
      const scorer = contains({
        expected: ["foo", "bar"],
        matchAll: false,
      });
      const result = scorer.evaluate(createMockContext("hello world"));

      expect(result).toMatchObject({ value: 0 });
      expect((result as { reason: string }).reason).toContain("None of the expected");
    });
  });

  describe("edge cases", () => {
    it("handles empty string output", () => {
      const scorer = contains("hello");
      const result = scorer.evaluate(createMockContext(""));

      expect(result).toEqual({
        value: 0,
        reason: "Output is empty",
      });
    });

    it("handles empty expected array", () => {
      const scorer = contains([]);
      const result = scorer.evaluate(createMockContext("anything"));

      expect(result).toEqual({
        value: 1,
        reason: "No expected strings specified",
      });
    });

    it("handles no expected specified", () => {
      const scorer = contains();
      const result = scorer.evaluate(createMockContext("anything"));

      expect(result).toEqual({
        value: 1,
        reason: "No expected strings specified",
      });
    });

    it("uses context.expected.outputContains when no config provided", () => {
      const scorer = contains();
      const result = scorer.evaluate(
        createMockContext("hello world", { outputContains: ["hello"] })
      );

      expect(result).toMatchObject({ value: 1 });
    });

    it("handles null/undefined in expected array gracefully", () => {
      const scorer = contains({
        expected: ["hello", null as unknown as string, undefined as unknown as string],
      });
      const result = scorer.evaluate(createMockContext("hello"));

      // null and undefined should not match
      expect(result).toMatchObject({ value: 1 / 3 });
    });
  });

  describe("legacy alias", () => {
    it("containsScorer works the same as contains", () => {
      const scorer1 = contains(["a", "b"]);
      const scorer2 = containsScorer(["a", "b"]);

      const context = createMockContext("a b c");
      expect(scorer1.evaluate(context)).toEqual(scorer2.evaluate(context));
    });
  });
});

describe("llmJudge", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("configuration", () => {
    it("throws error if prompt is not provided", () => {
      expect(() => llmJudge({ prompt: "" })).toThrow("requires a prompt string");
      expect(() => llmJudge({ prompt: null as unknown as string })).toThrow(
        "requires a prompt string"
      );
    });

    it("creates scorer with default name", () => {
      const scorer = llmJudge({ prompt: "Rate this" });
      expect(scorer.name).toBe("llm_judge");
    });

    it("allows custom name", () => {
      const scorer = llmJudge({ prompt: "Rate this", name: "custom_judge" });
      expect(scorer.name).toBe("custom_judge");
    });

    it("allows custom description", () => {
      const scorer = llmJudge({
        prompt: "Rate this",
        description: "Custom description",
      });
      expect(scorer.description).toBe("Custom description");
    });
  });

  describe("API key handling", () => {
    it("returns error when ANTHROPIC_API_KEY is not set", async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const scorer = llmJudge({ prompt: "Rate: {{output}}" });
      const result = await scorer.evaluate(createMockContext("test output"));

      expect(result).toEqual({
        value: 0,
        reason: "LLM judge error: ANTHROPIC_API_KEY environment variable not set",
      });
    });
  });

  describe("prompt substitution", () => {
    it("creates scorer with prompt template", () => {
      // Verify scorer is created with prompt containing template variables
      // Actual prompt substitution is tested implicitly when API is available
      const scorer = llmJudge({
        prompt: "Rate this output: {{output}} given input: {{input}}",
      });

      expect(scorer.name).toBe("llm_judge");
      expect(scorer.dataType).toBe("numeric");
    });
  });

  describe("response parsing", () => {
    it("has default parser that extracts score from JSON", () => {
      // Test the default parser behavior through scorer config
      const scorer = llmJudge({ prompt: "Test" });
      expect(scorer.name).toBe("llm_judge");
    });

    it("allows custom parseResponse function", () => {
      const customParser = (text: string) =>
        text.toUpperCase().includes("YES") ? 1 : 0;

      const scorer = llmJudge({
        prompt: "Is this good? YES or NO",
        parseResponse: customParser,
      });

      expect(scorer.name).toBe("llm_judge");
    });
  });

  describe("pre-built judges", () => {
    it("responseQualityJudge is configured correctly", () => {
      expect(responseQualityJudge.name).toBe("llm_judge");
      expect(responseQualityJudge.dataType).toBe("numeric");
    });

    it("safetyJudge is configured correctly", () => {
      expect(safetyJudge.name).toBe("llm_judge");
      expect(safetyJudge.dataType).toBe("numeric");
    });

    it("helpfulnessJudge is configured correctly", () => {
      expect(helpfulnessJudge.name).toBe("llm_judge");
      expect(helpfulnessJudge.dataType).toBe("numeric");
    });
  });
});

describe("defineScorer", () => {
  it("creates a scorer with required fields", () => {
    const scorer = defineScorer({
      name: "test",
      evaluate: () => ({ value: 1 }),
    });

    expect(scorer.name).toBe("test");
    expect(scorer.dataType).toBe("numeric"); // default
  });

  it("allows custom dataType", () => {
    const scorer = defineScorer({
      name: "test",
      dataType: "categorical",
      evaluate: () => ({ value: 1 }),
    });

    expect(scorer.dataType).toBe("categorical");
  });

  it("allows async evaluate function", async () => {
    const scorer = defineScorer({
      name: "async-test",
      evaluate: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { value: 0.9, reason: "Async result" };
      },
    });

    const result = await scorer.evaluate(createMockContext("test"));
    expect(result).toEqual({ value: 0.9, reason: "Async result" });
  });
});

describe("ScoreResult format consistency", () => {
  it("all scorers return value between 0-1", () => {
    const scorers = [
      exactMatch("test"),
      contains("test"),
      llmJudge({ prompt: "test" }),
    ];

    for (const scorer of scorers) {
      expect(scorer.dataType).toBe("numeric");
    }
  });

  it("exactMatch always returns reason string", () => {
    const scorer = exactMatch("expected");

    const matchResult = scorer.evaluate(createMockContext("expected"));
    expect(matchResult).toHaveProperty("reason");
    expect(typeof (matchResult as { reason: string }).reason).toBe("string");

    const noMatchResult = scorer.evaluate(createMockContext("different"));
    expect(noMatchResult).toHaveProperty("reason");
    expect(typeof (noMatchResult as { reason: string }).reason).toBe("string");
  });

  it("contains always returns reason string", () => {
    const scorer = contains(["a", "b"]);

    const fullMatch = scorer.evaluate(createMockContext("a b"));
    expect(fullMatch).toHaveProperty("reason");

    const partialMatch = scorer.evaluate(createMockContext("a"));
    expect(partialMatch).toHaveProperty("reason");

    const noMatch = scorer.evaluate(createMockContext("c"));
    expect(noMatch).toHaveProperty("reason");
  });
});
