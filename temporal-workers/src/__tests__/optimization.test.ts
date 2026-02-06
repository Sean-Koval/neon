/**
 * Tests for Optimization Workflows
 *
 * Tests abTestWorkflow and progressiveRolloutWorkflow
 * by mocking @temporalio/workflow.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EvalRunResult } from "../types";
import type {
  ABTestInput,
  ProgressiveRolloutInput,
} from "../workflows/optimization";

// ============================================================================
// MOCK SETUP
// ============================================================================

const {
  handlers,
  mockEmitSpan,
  mockExecuteChild,
  mockSleep,
} = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: unknown[]) => unknown>,
  mockEmitSpan: vi.fn().mockResolvedValue(undefined),
  mockExecuteChild: vi.fn(),
  mockSleep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: vi.fn(() => ({
    emitSpan: (...args: unknown[]) => mockEmitSpan(...args),
  })),
  executeChild: (...args: unknown[]) => mockExecuteChild(...args),
  ParentClosePolicy: { PARENT_CLOSE_POLICY_ABANDON: 5 },
  defineQuery: vi.fn((name: string) => name),
  defineSignal: vi.fn((name: string) => name),
  setHandler: vi.fn((name: string, handler: (...args: unknown[]) => unknown) => {
    handlers[name] = handler;
  }),
  condition: vi.fn(async () => true),
  workflowInfo: vi.fn(() => ({
    workflowId: "test-optimization-workflow",
    runId: "test-optimization-run",
  })),
  sleep: (...args: unknown[]) => mockSleep(...args),
}));

import {
  abTestWorkflow,
  progressiveRolloutWorkflow,
} from "../workflows/optimization";

// ============================================================================
// HELPERS
// ============================================================================

function makeABTestInput(overrides: Partial<ABTestInput> = {}): ABTestInput {
  return {
    experimentId: "exp-1",
    projectId: "proj-1",
    variantA: {
      agentId: "agent-a",
      agentVersion: "v1",
      tools: [{ name: "search", description: "Search", parameters: {} }],
    },
    variantB: {
      agentId: "agent-b",
      agentVersion: "v2",
      tools: [{ name: "search", description: "Search", parameters: {} }],
    },
    dataset: {
      items: [
        { input: { query: "test1" } },
        { input: { query: "test2" } },
      ],
    },
    scorers: ["accuracy"],
    significanceThreshold: 0.05,
    ...overrides,
  };
}

function makeEvalRunResult(avgScore: number, overrides: Partial<EvalRunResult> = {}): EvalRunResult {
  return {
    runId: "run-1",
    results: [],
    summary: {
      total: 2,
      passed: avgScore >= 0.7 ? 2 : 0,
      failed: avgScore >= 0.7 ? 0 : 2,
      avgScore,
    },
    ...overrides,
  };
}

function makeRolloutInput(
  overrides: Partial<ProgressiveRolloutInput> = {}
): ProgressiveRolloutInput {
  return {
    rolloutId: "rollout-1",
    projectId: "proj-1",
    currentAgent: {
      agentId: "agent-current",
      agentVersion: "v1",
      tools: [],
    },
    newAgent: {
      agentId: "agent-new",
      agentVersion: "v2",
      tools: [],
    },
    dataset: {
      items: [{ input: { query: "test" } }],
    },
    scorers: ["accuracy"],
    stages: [10, 25, 50, 100],
    minimumScore: 0.7,
    stageDurationMs: 1000,
    ...overrides,
  };
}

// ============================================================================
// A/B TEST WORKFLOW TESTS
// ============================================================================

describe("abTestWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(handlers)) {
      delete handlers[key];
    }
  });

  it("variant B wins when it has higher score", async () => {
    const variantAResult = makeEvalRunResult(0.7, { runId: "exp-1-variant-a" });
    const variantBResult = makeEvalRunResult(0.9, { runId: "exp-1-variant-b" });

    // executeChild is called twice in parallel (Promise.all)
    mockExecuteChild
      .mockResolvedValueOnce(variantAResult)
      .mockResolvedValueOnce(variantBResult);

    const result = await abTestWorkflow(makeABTestInput());

    expect(result.winner).toBe("B");
    expect(result.improvement).toBeCloseTo(0.2);
    expect(result.experimentId).toBe("exp-1");
    expect(result.recommendation).toContain("Variant B");
    expect(result.recommendation).toContain("agent-b");
    expect(result.confidence).toBeGreaterThan(0);

    // Should have emitted start + complete spans
    expect(mockEmitSpan).toHaveBeenCalledWith(
      expect.objectContaining({ name: "ab-test:exp-1" })
    );
    expect(mockEmitSpan).toHaveBeenCalledWith(
      expect.objectContaining({ name: "ab-test-complete" })
    );
  });

  it("variant A wins when it has higher score", async () => {
    const variantAResult = makeEvalRunResult(0.95, { runId: "exp-1-variant-a" });
    const variantBResult = makeEvalRunResult(0.7, { runId: "exp-1-variant-b" });

    mockExecuteChild
      .mockResolvedValueOnce(variantAResult)
      .mockResolvedValueOnce(variantBResult);

    const result = await abTestWorkflow(makeABTestInput());

    expect(result.winner).toBe("A");
    expect(result.improvement).toBeLessThan(0); // B - A is negative
    expect(result.recommendation).toContain("Variant A");
    expect(result.recommendation).toContain("agent-a");
  });

  it("tie when scores are within threshold", async () => {
    const variantAResult = makeEvalRunResult(0.80, { runId: "exp-1-variant-a" });
    const variantBResult = makeEvalRunResult(0.82, { runId: "exp-1-variant-b" });

    mockExecuteChild
      .mockResolvedValueOnce(variantAResult)
      .mockResolvedValueOnce(variantBResult);

    // With 5% threshold, 2.5% improvement (0.02/0.80) is within threshold
    const result = await abTestWorkflow(makeABTestInput({ significanceThreshold: 0.05 }));

    expect(result.winner).toBe("tie");
    expect(result.recommendation).toContain("No significant difference");
  });

  it("uses default significance threshold of 0.05", async () => {
    const variantAResult = makeEvalRunResult(0.80, { runId: "exp-1-variant-a" });
    // 1% improvement on 0.80 = 0.0125 relative, under 0.05 threshold
    const variantBResult = makeEvalRunResult(0.81, { runId: "exp-1-variant-b" });

    mockExecuteChild
      .mockResolvedValueOnce(variantAResult)
      .mockResolvedValueOnce(variantBResult);

    const result = await abTestWorkflow(
      makeABTestInput({ significanceThreshold: undefined })
    );

    expect(result.winner).toBe("tie");
  });

  it("runs both variants in parallel via executeChild", async () => {
    mockExecuteChild
      .mockResolvedValueOnce(makeEvalRunResult(0.8))
      .mockResolvedValueOnce(makeEvalRunResult(0.8));

    await abTestWorkflow(makeABTestInput());

    // Both variants should have been started
    expect(mockExecuteChild).toHaveBeenCalledTimes(2);

    // Verify workflow IDs
    const calls = mockExecuteChild.mock.calls;
    const workflowIds = calls.map((call) => call[1]?.workflowId);
    expect(workflowIds).toContain("exp-1-variant-a");
    expect(workflowIds).toContain("exp-1-variant-b");
  });

  it("exposes progress via query handler", async () => {
    mockExecuteChild
      .mockResolvedValueOnce(makeEvalRunResult(0.8))
      .mockResolvedValueOnce(makeEvalRunResult(0.8));

    await abTestWorkflow(makeABTestInput());

    expect(handlers.abTestProgress).toBeDefined();
    const progress = handlers.abTestProgress() as {
      variantAComplete: boolean;
      variantBComplete: boolean;
    };
    expect(progress.variantAComplete).toBe(true);
    expect(progress.variantBComplete).toBe(true);
  });

  it("handles variant A score of 0 (avoid division by zero)", async () => {
    const variantAResult = makeEvalRunResult(0, { runId: "exp-1-variant-a" });
    const variantBResult = makeEvalRunResult(0.5, { runId: "exp-1-variant-b" });

    mockExecuteChild
      .mockResolvedValueOnce(variantAResult)
      .mockResolvedValueOnce(variantBResult);

    // Should not throw
    const result = await abTestWorkflow(makeABTestInput());

    expect(result.winner).toBe("B");
    expect(result.improvement).toBeCloseTo(0.5);
  });
});

// ============================================================================
// PROGRESSIVE ROLLOUT WORKFLOW TESTS
// ============================================================================

describe("progressiveRolloutWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(handlers)) {
      delete handlers[key];
    }
  });

  it("completes all stages successfully", async () => {
    // All stages return good scores
    mockExecuteChild.mockResolvedValue(makeEvalRunResult(0.85));

    const result = await progressiveRolloutWorkflow(makeRolloutInput());

    expect(result.completed).toBe(true);
    expect(result.aborted).toBe(false);
    expect(result.finalStage).toBe(3); // 0-indexed, 4 stages
    expect(result.stageResults).toHaveLength(4);

    // Verify all stages passed
    for (const stage of result.stageResults) {
      expect(stage.passed).toBe(true);
      expect(stage.score).toBeCloseTo(0.85);
    }

    // Verify stage percentages
    expect(result.stageResults.map((s) => s.percentage)).toEqual([10, 25, 50, 100]);

    // Sleep should be called between stages (n-1 times)
    expect(mockSleep).toHaveBeenCalledTimes(3);
    expect(mockSleep).toHaveBeenCalledWith(1000);
  });

  it("aborts when score drops below minimum", async () => {
    // First two stages pass, third fails
    mockExecuteChild
      .mockResolvedValueOnce(makeEvalRunResult(0.85))
      .mockResolvedValueOnce(makeEvalRunResult(0.75))
      .mockResolvedValueOnce(makeEvalRunResult(0.5)); // Below 0.7 minimum

    const result = await progressiveRolloutWorkflow(makeRolloutInput());

    expect(result.completed).toBe(false);
    expect(result.aborted).toBe(true);
    expect(result.finalStage).toBe(2); // Stopped at stage index 2
    expect(result.abortReason).toContain("0.50");
    expect(result.abortReason).toContain("below minimum");
    expect(result.stageResults).toHaveLength(3);

    // Only 2 stages passed
    expect(result.stageResults[0].passed).toBe(true);
    expect(result.stageResults[1].passed).toBe(true);
    expect(result.stageResults[2].passed).toBe(false);

    // Abort span should be emitted
    expect(mockEmitSpan).toHaveBeenCalledWith(
      expect.objectContaining({ name: "rollout-aborted" })
    );
  });

  it("aborts at first stage if score is too low", async () => {
    mockExecuteChild.mockResolvedValueOnce(makeEvalRunResult(0.3));

    const result = await progressiveRolloutWorkflow(makeRolloutInput());

    expect(result.completed).toBe(false);
    expect(result.aborted).toBe(true);
    expect(result.finalStage).toBe(0);
    expect(result.stageResults).toHaveLength(1);
    expect(result.stageResults[0].passed).toBe(false);

    // Should not have called sleep at all (aborted at first stage)
    expect(mockSleep).not.toHaveBeenCalled();
  });

  it("does not sleep after the last stage", async () => {
    mockExecuteChild.mockResolvedValue(makeEvalRunResult(0.9));

    const input = makeRolloutInput({ stages: [50, 100] });
    await progressiveRolloutWorkflow(input);

    // Only 1 sleep call (between stage 0 and 1, not after stage 1)
    expect(mockSleep).toHaveBeenCalledTimes(1);
  });

  it("uses correct workflow IDs for each stage", async () => {
    mockExecuteChild.mockResolvedValue(makeEvalRunResult(0.9));

    await progressiveRolloutWorkflow(makeRolloutInput());

    // 4 stages = 4 executeChild calls
    expect(mockExecuteChild).toHaveBeenCalledTimes(4);

    for (let i = 0; i < 4; i++) {
      expect(mockExecuteChild).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          workflowId: `rollout-1-stage-${i}`,
        })
      );
    }
  });

  it("exposes rollout progress via query handler", async () => {
    mockExecuteChild.mockResolvedValue(makeEvalRunResult(0.9));

    await progressiveRolloutWorkflow(makeRolloutInput());

    expect(handlers.rolloutProgress).toBeDefined();
    const progress = handlers.rolloutProgress() as {
      currentStage: number;
      currentPercentage: number;
      scores: number[];
    };
    // After completion, currentStage should be the last stage index
    expect(progress.currentStage).toBe(3);
    expect(progress.scores).toHaveLength(4);
  });

  it("emits start and complete spans", async () => {
    mockExecuteChild.mockResolvedValue(makeEvalRunResult(0.9));

    await progressiveRolloutWorkflow(makeRolloutInput());

    expect(mockEmitSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "progressive-rollout:rollout-1",
        attributes: expect.objectContaining({
          "rollout.stages": "10,25,50,100",
        }),
      })
    );
    expect(mockEmitSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "rollout-complete",
      })
    );
  });

  it("handles single-stage rollout", async () => {
    mockExecuteChild.mockResolvedValue(makeEvalRunResult(0.9));

    const input = makeRolloutInput({ stages: [100] });
    const result = await progressiveRolloutWorkflow(input);

    expect(result.completed).toBe(true);
    expect(result.stageResults).toHaveLength(1);
    expect(result.stageResults[0].percentage).toBe(100);
    expect(mockSleep).not.toHaveBeenCalled();
  });
});
