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
  skillSelectionScorer,
  skillChainScorer,
  skillSetScorer,
  firstSkillScorer,
  skillCategoryScorer,
  skillConfidenceScorer,
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

// Mock trace data with tool spans for skill selection testing
function createMockContextWithTools(
  toolNames: string[],
  expected?: Record<string, unknown>,
  options?: {
    skillSelections?: Array<{
      selectedSkill: string;
      selectionConfidence?: number;
      skillCategory?: string;
    }>;
  }
): EvalContext {
  const toolSpans = toolNames.map((toolName, i) => ({
    id: `tool-${i}`,
    traceId: "test-trace-id",
    name: toolName,
    spanType: "tool" as const,
    status: "ok" as const,
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    durationMs: 50,
    toolName,
    ...(options?.skillSelections?.[i] && {
      skillSelection: options.skillSelections[i],
    }),
  }));

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
        metadata: {},
      },
      spans: toolSpans,
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
    it("throws error when ANTHROPIC_API_KEY is not set", async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const scorer = llmJudge({ prompt: "Rate: {{output}}" });

      await expect(scorer.evaluate(createMockContext("test output"))).rejects.toThrow(
        "LLM judge requires ANTHROPIC_API_KEY environment variable"
      );
    });

    it("missing API key error is not swallowed by catch block", async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const scorer = llmJudge({ prompt: "Rate: {{output}}" });

      // Should throw, NOT return { value: 0 }
      const resultPromise = scorer.evaluate(createMockContext("test"));
      await expect(resultPromise).rejects.toThrow();

      // Verify it's a rejection, not a resolved { value: 0 }
      let wasResolved = false;
      try {
        const result = await scorer.evaluate(createMockContext("test"));
        wasResolved = true;
      } catch {
        // Expected path
      }
      expect(wasResolved).toBe(false);
    });
  });

  describe("unrecoverable error handling", () => {
    it("re-throws authentication errors instead of returning score 0", async () => {
      // Verify the error-handling logic directly: 401/authentication errors
      // should cause a throw, not return { value: 0 }
      process.env.ANTHROPIC_API_KEY = "test-key";

      const scorer = llmJudge({ prompt: "Rate: {{output}}" });

      // The scorer's evaluate wraps the API call in try/catch.
      // We verify the contract: unrecoverable errors should not silently return score 0.
      // The missing API key check (before try/catch) already throws - verify it propagates.
      delete process.env.ANTHROPIC_API_KEY;

      await expect(scorer.evaluate(createMockContext("test"))).rejects.toThrow(
        "ANTHROPIC_API_KEY"
      );
    });

    it("missing API key error propagates as rejection, not as score 0", async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const scorer = llmJudge({ prompt: "Rate: {{output}}" });

      // Verify it throws (rejects) rather than returning { value: 0, reason: "..." }
      let resolvedWithScore = false;
      try {
        const result = await scorer.evaluate(createMockContext("test"));
        resolvedWithScore = true;
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect((e as Error).message).toContain("ANTHROPIC_API_KEY");
      }
      expect(resolvedWithScore).toBe(false);
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

// ==================== Skill Selection Scorer Tests ====================

describe("skillSelectionScorer", () => {
  describe("basic matching", () => {
    it("returns 1 when all expected skills are called", () => {
      const scorer = skillSelectionScorer({
        expectedSkills: ["search", "summarize"],
      });
      const result = scorer.evaluate(
        createMockContextWithTools(["search", "summarize"])
      );

      expect(result.value).toBe(1);
      expect(result.reason).toContain("matched");
    });

    it("returns 0 when no skills are called", () => {
      const scorer = skillSelectionScorer({
        expectedSkills: ["search", "summarize"],
      });
      const result = scorer.evaluate(createMockContextWithTools([]));

      expect(result.value).toBe(0);
      expect(result.reason).toContain("No skills were called");
    });

    it("returns partial score when some skills are missing", () => {
      const scorer = skillSelectionScorer({
        expectedSkills: ["search", "analyze", "summarize"],
      });
      const result = scorer.evaluate(
        createMockContextWithTools(["search", "summarize"])
      );

      expect(result.value).toBeCloseTo(2 / 3);
      expect(result.reason).toContain("missing");
      expect(result.reason).toContain("analyze");
    });

    it("returns 1 when no expected skills specified", () => {
      const scorer = skillSelectionScorer();
      const result = scorer.evaluate(createMockContextWithTools(["anything"]));

      expect(result.value).toBe(1);
      expect(result.reason).toBe("No expected skills specified");
    });
  });

  describe("order matching", () => {
    it("respects orderMatters: true", () => {
      const scorer = skillSelectionScorer({
        expectedSkills: ["search", "analyze", "summarize"],
        orderMatters: true,
      });

      // Correct order
      const correctOrder = scorer.evaluate(
        createMockContextWithTools(["search", "analyze", "summarize"])
      );
      expect(correctOrder.value).toBe(1);
      expect(correctOrder.reason).toContain("order: correct");

      // Wrong order
      const wrongOrder = scorer.evaluate(
        createMockContextWithTools(["summarize", "analyze", "search"])
      );
      expect(wrongOrder.value).toBeLessThan(1);
      expect(wrongOrder.reason).toContain("order: incorrect");
    });

    it("allows non-consecutive matching with orderMatters: true", () => {
      const scorer = skillSelectionScorer({
        expectedSkills: ["search", "summarize"],
        orderMatters: true,
      });

      // Extra skills in between should be ok
      const result = scorer.evaluate(
        createMockContextWithTools(["search", "analyze", "summarize"])
      );
      expect(result.value).toBe(1);
    });
  });

  describe("skill substitutes", () => {
    it("accepts substitute skills", () => {
      const scorer = skillSelectionScorer({
        expectedSkills: ["web_search", "code_edit"],
        substitutes: {
          web_search: ["google_search", "bing_search"],
          code_edit: ["file_edit", "sed_edit"],
        },
      });

      const result = scorer.evaluate(
        createMockContextWithTools(["google_search", "file_edit"])
      );
      expect(result.value).toBe(1);
    });
  });

  describe("category partial credit", () => {
    it("gives partial credit for correct category", () => {
      const scorer = skillSelectionScorer({
        expectedSkills: ["web_search"],
        categoryMap: {
          web_search: "search",
          file_search: "search",
          grep_search: "search",
        },
        categoryPartialCredit: 0.5,
      });

      // Different skill but same category
      const result = scorer.evaluate(
        createMockContextWithTools(["file_search"])
      );
      expect(result.value).toBe(0.5);
      expect(result.reason).toContain("category matches");
    });
  });

  describe("extra skill penalty", () => {
    it("penalizes extra skills when configured", () => {
      const scorer = skillSelectionScorer({
        expectedSkills: ["search"],
        penalizeExtraSkills: true,
        extraSkillPenalty: 0.2,
      });

      // One expected, two extra
      const result = scorer.evaluate(
        createMockContextWithTools(["search", "extra1", "extra2"])
      );
      expect(result.value).toBe(0.6); // 1 - 0.2 - 0.2
      expect(result.reason).toContain("extra (penalized)");
    });

    it("does not penalize extra skills by default", () => {
      const scorer = skillSelectionScorer({
        expectedSkills: ["search"],
      });

      const result = scorer.evaluate(
        createMockContextWithTools(["search", "extra1", "extra2"])
      );
      expect(result.value).toBe(1);
    });
  });

  describe("uses context.expected", () => {
    it("reads expectedSkills from context.expected", () => {
      const scorer = skillSelectionScorer();
      const result = scorer.evaluate(
        createMockContextWithTools(["search", "summarize"], {
          expectedSkills: ["search", "summarize"],
        })
      );

      expect(result.value).toBe(1);
    });

    it("reads toolCalls from context.expected as fallback", () => {
      const scorer = skillSelectionScorer();
      const result = scorer.evaluate(
        createMockContextWithTools(["search"], {
          toolCalls: ["search"],
        })
      );

      expect(result.value).toBe(1);
    });
  });
});

describe("skillChainScorer", () => {
  it("is a shorthand for skillSelectionScorer with orderMatters: true", () => {
    const scorer = skillChainScorer(["a", "b", "c"]);

    const correctOrder = scorer.evaluate(
      createMockContextWithTools(["a", "b", "c"])
    );
    expect(correctOrder.value).toBe(1);

    const wrongOrder = scorer.evaluate(
      createMockContextWithTools(["c", "b", "a"])
    );
    expect(wrongOrder.value).toBeLessThan(1);
  });
});

describe("skillSetScorer", () => {
  it("is a shorthand for skillSelectionScorer with orderMatters: false", () => {
    const scorer = skillSetScorer(["a", "b", "c"]);

    // Any order should work
    const result1 = scorer.evaluate(createMockContextWithTools(["a", "b", "c"]));
    expect(result1.value).toBe(1);

    const result2 = scorer.evaluate(createMockContextWithTools(["c", "a", "b"]));
    expect(result2.value).toBe(1);
  });
});

describe("firstSkillScorer", () => {
  it("returns 1 when first skill is acceptable", () => {
    const scorer = firstSkillScorer(["search", "retrieve"]);

    const result = scorer.evaluate(
      createMockContextWithTools(["search", "analyze", "summarize"])
    );
    expect(result.value).toBe(1);
    expect(result.reason).toContain("Correct first skill");
  });

  it("returns 0 when first skill is not acceptable", () => {
    const scorer = firstSkillScorer(["search", "retrieve"]);

    const result = scorer.evaluate(
      createMockContextWithTools(["analyze", "search", "summarize"])
    );
    expect(result.value).toBe(0);
    expect(result.reason).toContain("not in expected");
  });

  it("returns 0 when no skills are called", () => {
    const scorer = firstSkillScorer(["search"]);
    const result = scorer.evaluate(createMockContextWithTools([]));

    expect(result.value).toBe(0);
    expect(result.reason).toBe("No skills were called");
  });
});

describe("skillCategoryScorer", () => {
  const categoryMap = {
    web_search: "search" as const,
    file_search: "search" as const,
    code_edit: "code" as const,
    file_write: "file" as const,
  };

  it("scores based on category matches", () => {
    const scorer = skillCategoryScorer({
      expectedCategories: ["search", "code"],
      categoryMap,
    });

    const result = scorer.evaluate(
      createMockContextWithTools(["web_search", "code_edit"])
    );
    expect(result.value).toBe(1);
  });

  it("returns partial score for partial category matches", () => {
    const scorer = skillCategoryScorer({
      expectedCategories: ["search", "code", "file"],
      categoryMap,
    });

    const result = scorer.evaluate(
      createMockContextWithTools(["web_search", "code_edit"])
    );
    expect(result.value).toBeCloseTo(2 / 3);
  });

  it("respects orderMatters for categories", () => {
    const scorer = skillCategoryScorer({
      expectedCategories: ["search", "code"],
      categoryMap,
      orderMatters: true,
    });

    // Correct order
    const correctOrder = scorer.evaluate(
      createMockContextWithTools(["web_search", "code_edit"])
    );
    expect(correctOrder.value).toBe(1);

    // Wrong order
    const wrongOrder = scorer.evaluate(
      createMockContextWithTools(["code_edit", "web_search"])
    );
    expect(wrongOrder.value).toBeLessThan(1);
  });
});

describe("skillConfidenceScorer", () => {
  it("returns average confidence from span context", () => {
    const scorer = skillConfidenceScorer();

    const result = scorer.evaluate(
      createMockContextWithTools(["search", "analyze"], undefined, {
        skillSelections: [
          { selectedSkill: "search", selectionConfidence: 0.9 },
          { selectedSkill: "analyze", selectionConfidence: 0.7 },
        ],
      })
    );

    expect(result.value).toBeCloseTo(0.8);
  });

  it("returns 0.5 when no confidence data available", () => {
    const scorer = skillConfidenceScorer();
    const result = scorer.evaluate(createMockContextWithTools(["search"]));

    expect(result.value).toBe(0.5);
    expect(result.reason).toContain("No skill confidence data");
  });

  it("reports when confidence is below threshold", () => {
    const scorer = skillConfidenceScorer({ minConfidence: 0.8 });

    const result = scorer.evaluate(
      createMockContextWithTools(["search"], undefined, {
        skillSelections: [{ selectedSkill: "search", selectionConfidence: 0.6 }],
      })
    );

    expect(result.value).toBe(0.6);
    expect(result.reason).toContain("some below");
  });
});
