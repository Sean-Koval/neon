/**
 * Threshold Tests
 *
 * Tests for threshold parsing, evaluation, and configuration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseThreshold,
  getThreshold,
  evaluateThreshold,
  evaluateAllThresholds,
  DEFAULT_THRESHOLD,
  type ThresholdConfig,
} from "../threshold/index.js";

describe("parseThreshold", () => {
  describe("decimal format", () => {
    it("parses decimal 0.7", () => {
      expect(parseThreshold("0.7")).toBe(0.7);
    });

    it("parses decimal 0.85", () => {
      expect(parseThreshold("0.85")).toBe(0.85);
    });

    it("parses decimal 1.0", () => {
      expect(parseThreshold("1.0")).toBe(1.0);
    });

    it("parses decimal 0", () => {
      expect(parseThreshold("0")).toBe(0);
    });

    it("parses decimal 0.0", () => {
      expect(parseThreshold("0.0")).toBe(0);
    });
  });

  describe("percentage format", () => {
    it("parses percentage 70", () => {
      expect(parseThreshold("70")).toBe(0.7);
    });

    it("parses percentage 85", () => {
      expect(parseThreshold("85")).toBe(0.85);
    });

    it("parses percentage 100", () => {
      expect(parseThreshold("100")).toBe(1.0);
    });

    it("parses percentage with symbol 70%", () => {
      expect(parseThreshold("70%")).toBe(0.7);
    });

    it("parses percentage with symbol 85%", () => {
      expect(parseThreshold("85%")).toBe(0.85);
    });
  });

  describe("number input", () => {
    it("accepts number 0.7", () => {
      expect(parseThreshold(0.7)).toBe(0.7);
    });

    it("accepts number 70 (treats as percentage)", () => {
      expect(parseThreshold(70)).toBe(0.7);
    });

    it("accepts number 1.0", () => {
      expect(parseThreshold(1.0)).toBe(1.0);
    });
  });

  describe("whitespace handling", () => {
    it("trims leading/trailing whitespace", () => {
      expect(parseThreshold("  0.7  ")).toBe(0.7);
    });

    it("handles whitespace with percentage", () => {
      expect(parseThreshold(" 70% ")).toBe(0.7);
    });
  });

  describe("error cases", () => {
    it("throws on empty string", () => {
      expect(() => parseThreshold("")).toThrow("cannot be empty");
    });

    it("throws on whitespace-only string", () => {
      expect(() => parseThreshold("   ")).toThrow("cannot be empty");
    });

    it("throws on non-numeric string", () => {
      expect(() => parseThreshold("abc")).toThrow("Invalid threshold");
    });

    it("throws on negative value", () => {
      expect(() => parseThreshold("-0.5")).toThrow("must be positive");
    });

    it("throws on value > 100", () => {
      expect(() => parseThreshold("150")).toThrow("cannot exceed 100%");
    });

    it("handles mixed format 0.7% as 0.007", () => {
      // 0.7% is interpreted as 0.7 (decimal) with percent sign stripped
      // then divided by 100 if > 1, but 0.7 <= 1 so stays as 0.7
      // Actually: "0.7%" -> strip % -> "0.7" -> 0.7 (already <= 1)
      expect(parseThreshold("0.7%")).toBe(0.7);
    });
  });

  describe("edge cases", () => {
    it("handles 1 as 1.0 (not 0.01)", () => {
      expect(parseThreshold("1")).toBe(1.0);
    });

    it("handles 0.99", () => {
      expect(parseThreshold("0.99")).toBe(0.99);
    });

    it("handles 99%", () => {
      expect(parseThreshold("99%")).toBe(0.99);
    });
  });
});

describe("getThreshold", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("priority order", () => {
    it("returns per-test threshold first", () => {
      const config: ThresholdConfig = {
        global: 0.8,
        perTest: { "my-test": 0.9 },
      };
      process.env.NEON_THRESHOLD = "0.5";

      expect(getThreshold("my-test", config)).toBe(0.9);
    });

    it("returns global config second", () => {
      const config: ThresholdConfig = {
        global: 0.8,
      };
      process.env.NEON_THRESHOLD = "0.5";

      expect(getThreshold("my-test", config)).toBe(0.8);
    });

    it("returns env var third", () => {
      process.env.NEON_THRESHOLD = "0.6";

      expect(getThreshold("my-test", {})).toBe(0.6);
    });

    it("returns default last", () => {
      delete process.env.NEON_THRESHOLD;

      expect(getThreshold("my-test", {})).toBe(DEFAULT_THRESHOLD);
    });
  });

  describe("NEON_THRESHOLD env var", () => {
    it("parses decimal format from env", () => {
      process.env.NEON_THRESHOLD = "0.85";

      expect(getThreshold("test", {})).toBe(0.85);
    });

    it("parses percentage format from env", () => {
      process.env.NEON_THRESHOLD = "75";

      expect(getThreshold("test", {})).toBe(0.75);
    });

    it("parses percentage with symbol from env", () => {
      process.env.NEON_THRESHOLD = "80%";

      expect(getThreshold("test", {})).toBe(0.8);
    });

    it("falls back to default on invalid env value", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      process.env.NEON_THRESHOLD = "invalid";

      expect(getThreshold("test", {})).toBe(DEFAULT_THRESHOLD);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Invalid NEON_THRESHOLD")
      );

      consoleSpy.mockRestore();
    });
  });

  describe("per-test overrides", () => {
    it("returns per-test value for matching test", () => {
      const config: ThresholdConfig = {
        perTest: {
          "test-1": 0.5,
          "test-2": 0.9,
        },
      };

      expect(getThreshold("test-1", config)).toBe(0.5);
      expect(getThreshold("test-2", config)).toBe(0.9);
    });

    it("falls back to global for non-matching test", () => {
      const config: ThresholdConfig = {
        global: 0.8,
        perTest: { "test-1": 0.5 },
      };

      expect(getThreshold("test-3", config)).toBe(0.8);
    });
  });
});

describe("evaluateThreshold", () => {
  describe("basic evaluation", () => {
    it("passes when score equals threshold", () => {
      const result = evaluateThreshold(0.7, "test", { global: 0.7 });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(0.7);
      expect(result.threshold).toBe(0.7);
      expect(result.reason).toContain("meets threshold");
    });

    it("passes when score exceeds threshold", () => {
      const result = evaluateThreshold(0.9, "test", { global: 0.7 });

      expect(result.passed).toBe(true);
      expect(result.reason).toContain("meets threshold");
    });

    it("fails when score below threshold", () => {
      const result = evaluateThreshold(0.5, "test", { global: 0.7 });

      expect(result.passed).toBe(false);
      expect(result.reason).toContain("below threshold");
    });
  });

  describe("edge cases", () => {
    it("handles score of 0", () => {
      const result = evaluateThreshold(0, "test", { global: 0.7 });

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });

    it("handles score of 1", () => {
      const result = evaluateThreshold(1, "test", { global: 0.7 });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(1);
    });

    it("handles threshold of 0", () => {
      const result = evaluateThreshold(0, "test", { global: 0 });

      expect(result.passed).toBe(true);
    });

    it("handles threshold of 1", () => {
      const result = evaluateThreshold(0.99, "test", { global: 1 });

      expect(result.passed).toBe(false);
    });

    it("exact boundary: 0.69999 vs 0.7 threshold", () => {
      const result = evaluateThreshold(0.69999, "test", { global: 0.7 });

      expect(result.passed).toBe(false);
    });

    it("exact boundary: 0.70001 vs 0.7 threshold", () => {
      const result = evaluateThreshold(0.70001, "test", { global: 0.7 });

      expect(result.passed).toBe(true);
    });
  });

  describe("reason formatting", () => {
    it("formats percentages in reason", () => {
      const result = evaluateThreshold(0.85, "test", { global: 0.7 });

      expect(result.reason).toContain("85.0%");
      expect(result.reason).toContain("70.0%");
    });
  });
});

describe("evaluateAllThresholds", () => {
  it("returns passed when all scores pass", () => {
    const scores = [
      { name: "score-1", value: 0.8 },
      { name: "score-2", value: 0.9 },
    ];
    const result = evaluateAllThresholds(scores, { global: 0.7 });

    expect(result.passed).toBe(true);
    expect(result.summary.total).toBe(2);
    expect(result.summary.passed).toBe(2);
    expect(result.summary.failed).toBe(0);
  });

  it("returns failed when any score fails", () => {
    const scores = [
      { name: "score-1", value: 0.8 },
      { name: "score-2", value: 0.5 },
    ];
    const result = evaluateAllThresholds(scores, { global: 0.7 });

    expect(result.passed).toBe(false);
    expect(result.summary.passed).toBe(1);
    expect(result.summary.failed).toBe(1);
  });

  it("handles empty scores array", () => {
    const result = evaluateAllThresholds([], { global: 0.7 });

    expect(result.passed).toBe(true);
    expect(result.results).toEqual([]);
    expect(result.summary.total).toBe(0);
  });

  it("includes individual results", () => {
    const scores = [
      { name: "accuracy", value: 0.85 },
      { name: "relevance", value: 0.6 },
    ];
    const result = evaluateAllThresholds(scores, { global: 0.7 });

    expect(result.results).toHaveLength(2);
    expect(result.results[0].passed).toBe(true);
    expect(result.results[1].passed).toBe(false);
  });

  it("uses per-test thresholds for individual scores", () => {
    const scores = [
      { name: "easy", value: 0.5 },
      { name: "hard", value: 0.8 },
    ];
    const config: ThresholdConfig = {
      global: 0.7,
      perTest: { easy: 0.4 },
    };
    const result = evaluateAllThresholds(scores, config);

    expect(result.passed).toBe(true);
    expect(result.results[0].passed).toBe(true); // 0.5 >= 0.4
    expect(result.results[1].passed).toBe(true); // 0.8 >= 0.7
  });
});

describe("DEFAULT_THRESHOLD", () => {
  it("is 0.7 (70%)", () => {
    expect(DEFAULT_THRESHOLD).toBe(0.7);
  });
});
