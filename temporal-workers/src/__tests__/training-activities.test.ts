/**
 * Unit Tests for Training Activities
 *
 * Tests the real implementations of collectSignals, curateTrainingData,
 * runOptimization, and checkRegressionStatus with mocked ClickHouse
 * and LLM provider dependencies.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// MOCK SETUP
// ============================================================================

const mockQueryFeedbackSignals = vi.fn();
const mockQueryLowScoreTraces = vi.fn();
const mockQueryErrorTraces = vi.fn();
const mockQueryRecentScores = vi.fn();

vi.mock("../lib/clickhouse", () => ({
  queryFeedbackSignals: (...args: unknown[]) => mockQueryFeedbackSignals(...args),
  queryLowScoreTraces: (...args: unknown[]) => mockQueryLowScoreTraces(...args),
  queryErrorTraces: (...args: unknown[]) => mockQueryErrorTraces(...args),
  queryRecentScores: (...args: unknown[]) => mockQueryRecentScores(...args),
}));

const mockEmitSpan = vi.fn().mockResolvedValue(undefined);
vi.mock("../activities/emit-span", () => ({
  emitSpan: (...args: unknown[]) => mockEmitSpan(...args),
}));

const mockChat = vi.fn();
const mockGetProvider = vi.fn().mockReturnValue({ chat: mockChat });
const mockHasProviderConfigured = vi.fn().mockReturnValue(false);

vi.mock("@neon/llm-providers", () => ({
  getProvider: (...args: unknown[]) => mockGetProvider(...args),
  hasProviderConfigured: () => mockHasProviderConfigured(),
}));

import {
  collectSignals,
  curateTrainingData,
  runOptimization,
  checkRegressionStatus,
  type TrainingSignal,
} from "../activities/training-activities";

// ============================================================================
// HELPERS
// ============================================================================

function makeSignal(overrides: Partial<TrainingSignal> = {}): TrainingSignal {
  return {
    type: "preference",
    traceId: `trace-${Math.random().toString(36).slice(2, 8)}`,
    content: `Sample content ${Math.random().toString(36).slice(2, 12)}`,
    timestamp: "2025-01-05T12:00:00Z",
    ...overrides,
  };
}

// ============================================================================
// collectSignals
// ============================================================================

describe("collectSignals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryFeedbackSignals.mockResolvedValue([]);
    mockQueryLowScoreTraces.mockResolvedValue([]);
    mockQueryErrorTraces.mockResolvedValue([]);
  });

  it("queries feedback signals for preference type", async () => {
    const feedback = [
      makeSignal({ type: "preference", content: "chose A over B" }),
    ];
    mockQueryFeedbackSignals.mockResolvedValue(feedback);

    const result = await collectSignals(
      "proj-1",
      { startDate: "2025-01-01", endDate: "2025-01-07" },
      ["preference"],
    );

    expect(result.count).toBe(1);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].type).toBe("preference");
    expect(mockQueryFeedbackSignals).toHaveBeenCalledWith("proj-1", "2025-01-01", "2025-01-07");
  });

  it("queries all sources when 'feedback' signal type is used", async () => {
    mockQueryFeedbackSignals.mockResolvedValue([
      makeSignal({ type: "preference" }),
      makeSignal({ type: "correction" }),
    ]);
    mockQueryLowScoreTraces.mockResolvedValue([
      makeSignal({ type: "low_score", score: 0.3 }),
    ]);
    mockQueryErrorTraces.mockResolvedValue([
      makeSignal({ type: "error" }),
    ]);

    const result = await collectSignals(
      "proj-1",
      { startDate: "2025-01-01", endDate: "2025-01-07" },
      ["feedback"],
    );

    expect(result.count).toBe(4);
    expect(mockQueryFeedbackSignals).toHaveBeenCalled();
    expect(mockQueryLowScoreTraces).toHaveBeenCalled();
    expect(mockQueryErrorTraces).toHaveBeenCalled();
  });

  it("emits an observability span", async () => {
    await collectSignals(
      "proj-1",
      { startDate: "2025-01-01", endDate: "2025-01-07" },
      ["preference"],
    );

    expect(mockEmitSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "collect-signals",
        attributes: expect.objectContaining({
          "training.project_id": "proj-1",
        }),
      }),
    );
  });

  it("does not query error traces when only preference is requested", async () => {
    await collectSignals(
      "proj-1",
      { startDate: "2025-01-01", endDate: "2025-01-07" },
      ["preference"],
    );

    expect(mockQueryFeedbackSignals).toHaveBeenCalled();
    expect(mockQueryErrorTraces).not.toHaveBeenCalled();
    expect(mockQueryLowScoreTraces).not.toHaveBeenCalled();
  });

  it("queries error traces when error signal type is specified", async () => {
    mockQueryErrorTraces.mockResolvedValue([
      makeSignal({ type: "error", content: "timeout" }),
    ]);

    const result = await collectSignals(
      "proj-1",
      { startDate: "2025-01-01", endDate: "2025-01-07" },
      ["error"],
    );

    expect(result.count).toBe(1);
    expect(mockQueryErrorTraces).toHaveBeenCalled();
  });
});

// ============================================================================
// curateTrainingData
// ============================================================================

describe("curateTrainingData", () => {
  it("returns empty set with quality 0 for empty input", async () => {
    const result = await curateTrainingData([], {
      minQuality: 0.5,
      maxSamples: 100,
      balanceClasses: true,
    });

    expect(result.curatedData).toHaveLength(0);
    expect(result.qualityScore).toBe(0);
    expect(result.stats.totalInput).toBe(0);
  });

  it("deduplicates signals with same traceId, type, and content prefix", async () => {
    const signals = [
      makeSignal({ traceId: "t1", type: "preference", content: "same content here" }),
      makeSignal({ traceId: "t1", type: "preference", content: "same content here" }),
      makeSignal({ traceId: "t2", type: "preference", content: "different content" }),
    ];

    const result = await curateTrainingData(signals, {
      minQuality: 0,
      maxSamples: 100,
      balanceClasses: false,
    });

    expect(result.curatedData).toHaveLength(2);
    expect(result.stats.afterDedup).toBe(2);
  });

  it("filters out signals with score below minQuality", async () => {
    const signals = [
      makeSignal({ score: 0.9, content: "high quality unique alpha" }),
      makeSignal({ score: 0.3, content: "low quality unique beta" }),
      makeSignal({ score: 0.7, content: "medium quality unique gamma" }),
      makeSignal({ content: "no score unique delta" }), // no score → kept
    ];

    const result = await curateTrainingData(signals, {
      minQuality: 0.5,
      maxSamples: 100,
      balanceClasses: false,
    });

    expect(result.stats.afterQualityFilter).toBe(3); // 0.9, 0.7, and no-score
    expect(result.curatedData.every((s) => s.score === undefined || s.score >= 0.5)).toBe(true);
  });

  it("balances classes when all signals are the same type", async () => {
    const signals = Array.from({ length: 10 }, (_, i) =>
      makeSignal({ type: "error", content: `unique error content number ${i}` }),
    );

    const result = await curateTrainingData(signals, {
      minQuality: 0,
      maxSamples: 100,
      balanceClasses: true,
    });

    // All same type, so balance doesn't reduce. Max per type = ceil(10 * 0.6) = 6
    expect(result.curatedData.length).toBeLessThanOrEqual(10);
    // All signals are error type
    expect(result.curatedData.every((s) => s.type === "error")).toBe(true);
  });

  it("respects maxSamples limit", async () => {
    const signals = Array.from({ length: 20 }, (_, i) =>
      makeSignal({ content: `unique content item number ${i} with extra words for diversity` }),
    );

    const result = await curateTrainingData(signals, {
      minQuality: 0,
      maxSamples: 5,
      balanceClasses: false,
    });

    expect(result.curatedData.length).toBeLessThanOrEqual(5);
  });

  it("computes quality score with multiple types", async () => {
    const signals = [
      makeSignal({ type: "preference", content: "preference feedback alpha unique" }),
      makeSignal({ type: "correction", content: "correction feedback beta unique" }),
      makeSignal({ type: "low_score", content: "low score feedback gamma unique", score: 0.8 }),
      makeSignal({ type: "error", content: "error feedback delta unique" }),
    ];

    const result = await curateTrainingData(signals, {
      minQuality: 0,
      maxSamples: 100,
      balanceClasses: true,
    });

    // 4 types present → coverage = 4/4 = 1.0
    expect(result.stats.coverageScore).toBe(1);
    // Quality score should be reasonable (>0 with diverse content)
    expect(result.qualityScore).toBeGreaterThan(0);
    expect(result.qualityScore).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// runOptimization
// ============================================================================

describe("runOptimization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasProviderConfigured.mockReturnValue(false);
  });

  describe("example_selection strategy", () => {
    it("generates a few-shot prompt from high-score examples", async () => {
      const dataset = [
        makeSignal({ score: 0.9, content: "Good response about customer service excellence and quality" }),
        makeSignal({ score: 0.8, content: "Another excellent response about technical support procedures" }),
        makeSignal({ score: 0.3, content: "Poor response with errors and mistakes" }),
      ];

      const result = await runOptimization(dataset, "example_selection", "prompt-1");

      expect(result.candidatePrompt).toContain("Few-Shot Prompt");
      expect(result.candidatePrompt).toContain("prompt-1");
      expect(result.metadata.strategy).toBe("example_selection");
      expect(result.metadata.examplesSelected).toBeGreaterThan(0);
      expect(result.metadata.goodExamplesAvailable).toBe(2);
      expect(result.candidateScore).toBeGreaterThanOrEqual(0);
    });

    it("falls back to all examples when no high-score examples exist", async () => {
      const dataset = [
        makeSignal({ content: "Content without explicit score alpha unique" }),
        makeSignal({ content: "More content without explicit score beta unique" }),
      ];

      const result = await runOptimization(dataset, "example_selection", "prompt-1");

      expect(result.candidatePrompt).toContain("Few-Shot Prompt");
      expect(result.metadata.goodExamplesAvailable).toBe(0);
      expect(result.metadata.examplesSelected).toBe(2);
    });

    it("returns non-zero diversity score when examples are diverse", async () => {
      const dataset = [
        makeSignal({ score: 0.9, content: "customer service handling complaints and feedback" }),
        makeSignal({ score: 0.85, content: "technical debugging network latency packet loss" }),
        makeSignal({ score: 0.8, content: "financial analysis quarterly revenue projections" }),
      ];

      const result = await runOptimization(dataset, "example_selection", "prompt-1");

      expect(result.candidateScore).toBeGreaterThan(0);
    });
  });

  describe("instruction_optimization strategy", () => {
    it("uses template fallback when no LLM provider is configured", async () => {
      mockHasProviderConfigured.mockReturnValue(false);

      const dataset = [
        makeSignal({ score: 0.9, content: "Good response unique alpha content" }),
        makeSignal({ type: "error", content: "Bad error unique beta content" }),
      ];

      const result = await runOptimization(dataset, "instruction_optimization", "prompt-1");

      expect(result.candidatePrompt).toContain("Optimized Instructions");
      expect(result.metadata.usedFallback).toBe(true);
    });

    it("calls LLM provider when configured", async () => {
      mockHasProviderConfigured.mockReturnValue(true);
      mockChat.mockResolvedValue({
        content: "You are a helpful assistant that always provides clear explanations.",
        inputTokens: 100,
        outputTokens: 50,
        model: "claude-3-haiku",
      });

      const dataset = [
        makeSignal({ score: 0.9, content: "Good response unique gamma content" }),
        makeSignal({ type: "error", score: 0.2, content: "Bad response unique delta content" }),
      ];

      const result = await runOptimization(dataset, "instruction_optimization", "prompt-1");

      expect(result.candidatePrompt).toBe("You are a helpful assistant that always provides clear explanations.");
      expect(mockGetProvider).toHaveBeenCalled();
      expect(mockChat).toHaveBeenCalled();
      expect(result.metadata.llmModel).toBeDefined();
    });

    it("falls back to template when LLM call fails", async () => {
      mockHasProviderConfigured.mockReturnValue(true);
      mockChat.mockRejectedValue(new Error("Rate limited"));

      const dataset = [
        makeSignal({ score: 0.9, content: "Good response unique epsilon content" }),
      ];

      const result = await runOptimization(dataset, "instruction_optimization", "prompt-1");

      expect(result.metadata.usedFallback).toBe(true);
      expect(result.metadata.fallbackReason).toBe("Rate limited");
    });

    it("discounts score for template-based fallback", async () => {
      mockHasProviderConfigured.mockReturnValue(false);

      const dataset = [
        makeSignal({ score: 0.9, content: "Good response unique zeta content" }),
      ];

      const result = await runOptimization(dataset, "instruction_optimization", "prompt-1");

      // Template fallback applies 0.8 discount: 0.9 * 0.8 = 0.72
      expect(result.candidateScore).toBeCloseTo(0.72, 1);
    });
  });
});

// ============================================================================
// checkRegressionStatus
// ============================================================================

describe("checkRegressionStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryRecentScores.mockResolvedValue([]);
  });

  it("returns no regression with insufficient data", async () => {
    mockQueryRecentScores.mockResolvedValue([
      { value: 0.8, timestamp: "2025-01-05" },
      { value: 0.82, timestamp: "2025-01-04" },
    ]);

    const result = await checkRegressionStatus("suite-1", 20);

    expect(result.hasRegression).toBe(false);
    expect(result.details).toContain("Insufficient data");
  });

  it("returns no regression when scores are stable", async () => {
    mockQueryRecentScores.mockResolvedValue([
      { value: 0.80, timestamp: "2025-01-07" },
      { value: 0.81, timestamp: "2025-01-06" },
      { value: 0.79, timestamp: "2025-01-05" },
      { value: 0.82, timestamp: "2025-01-04" },
      { value: 0.80, timestamp: "2025-01-03" },
      { value: 0.81, timestamp: "2025-01-02" },
    ]);

    const result = await checkRegressionStatus("suite-1", 20);

    expect(result.hasRegression).toBe(false);
    expect(result.currentScore).toBeCloseTo(0.80, 1);
    expect(result.baseline).toBeDefined();
  });

  it("detects regression when current score drops significantly", async () => {
    // Stable baseline around 0.8, then sudden drop to 0.3
    mockQueryRecentScores.mockResolvedValue([
      { value: 0.30, timestamp: "2025-01-07" }, // current: big drop
      { value: 0.80, timestamp: "2025-01-06" },
      { value: 0.81, timestamp: "2025-01-05" },
      { value: 0.79, timestamp: "2025-01-04" },
      { value: 0.82, timestamp: "2025-01-03" },
      { value: 0.80, timestamp: "2025-01-02" },
    ]);

    const result = await checkRegressionStatus("suite-1", 20);

    expect(result.hasRegression).toBe(true);
    expect(result.severity).toBeDefined();
    expect(result.dropPercent).toBeGreaterThan(20);
    expect(result.severity).toBe("critical");
    expect(result.currentScore).toBeCloseTo(0.30, 1);
  });

  it("returns warning severity for moderate drop", async () => {
    // Baseline around 0.8, drop to 0.65 (~18.75% drop)
    mockQueryRecentScores.mockResolvedValue([
      { value: 0.65, timestamp: "2025-01-07" },
      { value: 0.80, timestamp: "2025-01-06" },
      { value: 0.80, timestamp: "2025-01-05" },
      { value: 0.80, timestamp: "2025-01-04" },
      { value: 0.80, timestamp: "2025-01-03" },
      { value: 0.80, timestamp: "2025-01-02" },
    ]);

    const result = await checkRegressionStatus("suite-1", 20);

    // stddev = 0, so threshold = 0.80 - 0 = 0.80; 0.65 < 0.80 → regression
    expect(result.hasRegression).toBe(true);
    expect(result.dropPercent).toBeGreaterThan(10);
    expect(result.dropPercent).toBeLessThanOrEqual(20);
    expect(result.severity).toBe("warning");
  });

  it("emits an observability span", async () => {
    mockQueryRecentScores.mockResolvedValue([]);

    await checkRegressionStatus("suite-1", 20);

    expect(mockEmitSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "check-regression",
        attributes: expect.objectContaining({
          "training.suite_id": "suite-1",
        }),
      }),
    );
  });
});
