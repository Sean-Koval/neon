/**
 * Prompt Optimizer Tests
 */

import { describe, it, expect, vi } from "vitest";
import {
  optimizePrompt,
  type OptimizationConfig,
  type OptimizationResult,
} from "../optimization/prompt-optimizer.js";

// Helper to create a base config
function createConfig(overrides: Partial<OptimizationConfig> = {}): OptimizationConfig {
  return {
    promptId: "test-prompt",
    suiteId: "test-suite",
    strategy: "coordinate_ascent",
    maxIterations: 5,
    improvementThreshold: 0.02,
    evaluator: vi.fn().mockResolvedValue(0.5),
    llmClient: vi.fn().mockResolvedValue("improved prompt"),
    ...overrides,
  };
}

describe("Prompt Optimizer - Coordinate Ascent", () => {
  it("improves the prompt when LLM generates better version", async () => {
    let callCount = 0;
    const evaluator = vi.fn().mockImplementation(async (prompt: string) => {
      callCount++;
      // Each iteration scores slightly better
      if (prompt === "test-prompt") return 0.5; // baseline
      return 0.5 + callCount * 0.05;
    });

    const llmClient = vi.fn().mockResolvedValue("better prompt version");

    const result = await optimizePrompt(
      createConfig({
        strategy: "coordinate_ascent",
        evaluator,
        llmClient,
        maxIterations: 3,
      })
    );

    expect(result.strategy).toBe("coordinate_ascent");
    expect(result.optimizedScore).toBeGreaterThanOrEqual(result.originalScore);
    expect(result.improvement).toBeGreaterThanOrEqual(0);
    expect(result.evidence.iterationHistory.length).toBeGreaterThan(1);
    expect(result.evidence.iterationHistory[0].change).toBe("baseline");
  });

  it("stops when improvement is below threshold", async () => {
    let evalCall = 0;
    const evaluator = vi.fn().mockImplementation(async () => {
      evalCall++;
      // Tiny improvements that fall below threshold
      return 0.5 + evalCall * 0.001;
    });

    const result = await optimizePrompt(
      createConfig({
        strategy: "coordinate_ascent",
        evaluator,
        llmClient: vi.fn().mockResolvedValue("slightly better"),
        maxIterations: 10,
        improvementThreshold: 0.02,
      })
    );

    // Should have stopped early since improvements are < 0.02
    expect(result.iterations).toBeLessThan(10);
  });

  it("stops after consecutive non-improvements", async () => {
    // Evaluator always returns same score — no improvement
    const evaluator = vi.fn().mockResolvedValue(0.5);

    const result = await optimizePrompt(
      createConfig({
        strategy: "coordinate_ascent",
        evaluator,
        llmClient: vi.fn().mockResolvedValue("same quality prompt"),
        maxIterations: 10,
      })
    );

    // Should stop early due to stalling
    expect(result.iterations).toBeLessThan(10);
    expect(result.improvement).toBe(0);
  });

  it("tracks iteration history", async () => {
    let callCount = 0;
    const evaluator = vi.fn().mockImplementation(async () => {
      return 0.5 + (callCount++) * 0.03;
    });

    const result = await optimizePrompt(
      createConfig({
        strategy: "coordinate_ascent",
        evaluator,
        llmClient: vi.fn().mockResolvedValue("improved"),
        maxIterations: 3,
      })
    );

    const history = result.evidence.iterationHistory;
    expect(history.length).toBeGreaterThan(0);

    // First entry should be baseline
    expect(history[0].iteration).toBe(0);
    expect(history[0].change).toBe("baseline");

    // Each entry should have iteration number and score
    for (const entry of history) {
      expect(entry).toHaveProperty("iteration");
      expect(entry).toHaveProperty("score");
      expect(entry).toHaveProperty("change");
    }
  });
});

describe("Prompt Optimizer - Example Selection", () => {
  it("returns original prompt when no demonstrations available", async () => {
    const evaluator = vi.fn().mockResolvedValue(0.7);

    const result = await optimizePrompt(
      createConfig({
        strategy: "example_selection",
        evaluator,
        maxIterations: 5,
      })
    );

    expect(result.strategy).toBe("example_selection");
    // With no signals, should return the original
    expect(result.evidence.examplesSelected).toBe(0);
    expect(result.promptVersionId).toMatch(/^pv_/);
  });

  it("generates a version ID for the result", async () => {
    const result = await optimizePrompt(
      createConfig({
        strategy: "example_selection",
      })
    );

    expect(result.promptVersionId).toMatch(/^pv_/);
    expect(result.promptVersionId.length).toBeGreaterThan(3);
  });
});

describe("Prompt Optimizer - Reflection", () => {
  it("uses reflection to improve prompt", async () => {
    let evalCall = 0;
    const evaluator = vi.fn().mockImplementation(async () => {
      evalCall++;
      return 0.4 + evalCall * 0.05;
    });

    const llmClient = vi.fn().mockResolvedValue("reflected and improved prompt");

    const result = await optimizePrompt(
      createConfig({
        strategy: "reflection",
        evaluator,
        llmClient,
        maxIterations: 5,
      })
    );

    expect(result.strategy).toBe("reflection");
    expect(result.optimizedScore).toBeGreaterThanOrEqual(result.originalScore);
    expect(llmClient).toHaveBeenCalled();

    // Should contain reflection-specific changes in history
    const history = result.evidence.iterationHistory;
    const reflectionEntries = history.filter(h => h.change.includes("reflection"));
    expect(reflectionEntries.length).toBeGreaterThan(0);
  });

  it("stops reflection after convergence", async () => {
    const evaluator = vi.fn().mockResolvedValue(0.8);
    const llmClient = vi.fn().mockResolvedValue("same prompt");

    const result = await optimizePrompt(
      createConfig({
        strategy: "reflection",
        evaluator,
        llmClient,
        maxIterations: 10,
      })
    );

    // Should stop early
    expect(result.iterations).toBeLessThan(10);
  });
});

describe("Prompt Optimizer - Early Stopping on Convergence", () => {
  it("stops when no improvement across strategies", async () => {
    for (const strategy of ["coordinate_ascent", "reflection"] as const) {
      const evaluator = vi.fn().mockResolvedValue(0.75);

      const result = await optimizePrompt(
        createConfig({
          strategy,
          evaluator,
          llmClient: vi.fn().mockResolvedValue("prompt"),
          maxIterations: 10,
        })
      );

      expect(result.iterations).toBeLessThan(10);
      expect(result.improvement).toBe(0);
    }
  });
});

describe("Prompt Optimizer - Iteration History Tracking", () => {
  it("records baseline as first entry", async () => {
    const result = await optimizePrompt(
      createConfig({
        evaluator: vi.fn().mockResolvedValue(0.6),
        maxIterations: 2,
      })
    );

    expect(result.evidence.iterationHistory[0]).toEqual({
      iteration: 0,
      score: 0.6,
      change: "baseline",
    });
  });

  it("records correct number of iterations", async () => {
    let call = 0;
    const evaluator = vi.fn().mockImplementation(async () => {
      return 0.3 + (call++) * 0.05;
    });

    const result = await optimizePrompt(
      createConfig({
        strategy: "coordinate_ascent",
        evaluator,
        llmClient: vi.fn().mockResolvedValue("improved"),
        maxIterations: 3,
      })
    );

    // iterations = history.length - 1 (exclude baseline)
    expect(result.iterations).toBe(result.evidence.iterationHistory.length - 1);
  });

  it("records improvement amounts in change field", async () => {
    let evalCall = 0;
    const evaluator = vi.fn().mockImplementation(async () => {
      return 0.5 + (evalCall++) * 0.1;
    });

    const result = await optimizePrompt(
      createConfig({
        strategy: "coordinate_ascent",
        evaluator,
        llmClient: vi.fn().mockResolvedValue("better"),
        maxIterations: 2,
        improvementThreshold: 0.001,
      })
    );

    const nonBaseline = result.evidence.iterationHistory.filter(h => h.change !== "baseline");
    if (nonBaseline.length > 0) {
      const hasImprovedEntry = nonBaseline.some(h => h.change.includes("improved"));
      expect(hasImprovedEntry).toBe(true);
    }
  });

  it("calculates overall improvement correctly", async () => {
    const scores = [0.4, 0.6, 0.7];
    let idx = 0;
    const evaluator = vi.fn().mockImplementation(async () => scores[Math.min(idx++, scores.length - 1)]);

    const result = await optimizePrompt(
      createConfig({
        strategy: "coordinate_ascent",
        evaluator,
        llmClient: vi.fn().mockResolvedValue("improved"),
        maxIterations: 3,
        improvementThreshold: 0.001,
      })
    );

    expect(result.improvement).toBe(result.optimizedScore - result.originalScore);
  });

  it("returns all required result fields", async () => {
    const result = await optimizePrompt(createConfig());

    expect(result).toHaveProperty("originalPrompt");
    expect(result).toHaveProperty("optimizedPrompt");
    expect(result).toHaveProperty("originalScore");
    expect(result).toHaveProperty("optimizedScore");
    expect(result).toHaveProperty("improvement");
    expect(result).toHaveProperty("iterations");
    expect(result).toHaveProperty("promptVersionId");
    expect(result).toHaveProperty("strategy");
    expect(result).toHaveProperty("evidence");
    expect(result.evidence).toHaveProperty("signalsUsed");
    expect(result.evidence).toHaveProperty("examplesSelected");
    expect(result.evidence).toHaveProperty("iterationHistory");
  });
});
