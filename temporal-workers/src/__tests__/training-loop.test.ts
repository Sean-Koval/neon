/**
 * Tests for Training Loop Workflow
 *
 * Tests trainingLoopWorkflow state machine, approval gates,
 * signal handling, and regression-triggered re-entry
 * by mocking @temporalio/workflow.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// MOCK SETUP
// ============================================================================

const {
  handlers,
  mockExecuteChild,
  mockCondition,
  mockProxyActivities,
} = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: unknown[]) => unknown>,
  mockExecuteChild: vi.fn(),
  mockCondition: vi.fn(async (_fn?: () => boolean) => true),
  mockProxyActivities: {
    collectSignals: vi.fn().mockResolvedValue({ signals: [], count: 50 }),
    curateTrainingData: vi.fn().mockResolvedValue({
      curatedData: [],
      qualityScore: 0.85,
      stats: { totalInput: 50, finalCount: 45 },
    }),
    runOptimization: vi.fn().mockResolvedValue({
      candidatePrompt: "optimized prompt",
      candidateScore: 0.9,
      metadata: {},
    }),
    checkRegressionStatus: vi.fn().mockResolvedValue({
      hasRegression: false,
    }),
    recordLoopIteration: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: vi.fn(() => mockProxyActivities),
  executeChild: vi.fn((...args: unknown[]) => mockExecuteChild(args[0], args[1])),
  ParentClosePolicy: { PARENT_CLOSE_POLICY_TERMINATE: 1 },
  defineQuery: vi.fn((name: string) => name),
  defineSignal: vi.fn((name: string) => name),
  setHandler: vi.fn((name: string, handler: (...args: unknown[]) => unknown) => {
    handlers[name] = handler;
  }),
  condition: vi.fn((fn?: () => boolean, _timeout?: string) => mockCondition(fn)),
  workflowInfo: vi.fn(() => ({
    workflowId: "test-loop-1",
    runId: "run-1",
    startTime: new Date(),
  })),
  sleep: vi.fn().mockResolvedValue(undefined),
}));

import { trainingLoopWorkflow } from "../workflows/training-loop";
import type { TrainingLoopInput, TrainingLoopStatus } from "../workflows/training-loop";

// ============================================================================
// HELPERS
// ============================================================================

function makeInput(overrides: Partial<TrainingLoopInput> = {}): TrainingLoopInput {
  return {
    projectId: "proj-1",
    suiteId: "suite-1",
    promptId: "prompt-1",
    strategy: "coordinate_ascent",
    trigger: "manual",
    maxIterations: 3,
    improvementThreshold: 0.02,
    signalTypes: ["preference", "feedback"],
    timeWindow: {
      startDate: "2025-01-01T00:00:00Z",
      endDate: "2025-01-07T00:00:00Z",
    },
    ...overrides,
  };
}

function makeEvalRunResult(avgScore: number) {
  return {
    runId: "eval-run-1",
    results: [],
    summary: {
      total: 10,
      passed: avgScore >= 0.7 ? 10 : 0,
      failed: avgScore >= 0.7 ? 0 : 10,
      avgScore,
    },
  };
}

function makeRolloutResult(completed: boolean) {
  return {
    rolloutId: "rollout-1",
    finalStage: completed ? 3 : 1,
    completed,
    aborted: !completed,
    stageResults: [],
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe("trainingLoopWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Also explicitly reset executeChild and condition to avoid once-queue leaks
    mockExecuteChild.mockReset();
    mockCondition.mockReset();
    for (const key of Object.keys(handlers)) {
      delete handlers[key];
    }
    // Reset default mock behaviors
    mockCondition.mockImplementation(async () => true);
    mockProxyActivities.collectSignals.mockReset();
    mockProxyActivities.collectSignals.mockResolvedValue({ signals: [], count: 50 });
    mockProxyActivities.curateTrainingData.mockReset();
    mockProxyActivities.curateTrainingData.mockResolvedValue({
      curatedData: [],
      qualityScore: 0.85,
      stats: { totalInput: 50, finalCount: 45 },
    });
    mockProxyActivities.runOptimization.mockReset();
    mockProxyActivities.runOptimization.mockResolvedValue({
      candidatePrompt: "optimized",
      candidateScore: 0.9,
      metadata: {},
    });
    mockProxyActivities.checkRegressionStatus.mockReset();
    mockProxyActivities.checkRegressionStatus.mockResolvedValue({
      hasRegression: false,
    });
    mockProxyActivities.recordLoopIteration.mockReset();
    mockProxyActivities.recordLoopIteration.mockResolvedValue(undefined);
  });

  // --------------------------------------------------------------------------
  // Full state machine flow
  // --------------------------------------------------------------------------

  it("completes full state machine with all stages passing", async () => {
    // Eval result: score well above baseline → auto-approve
    mockExecuteChild
      .mockResolvedValueOnce(makeEvalRunResult(0.9)) // evalRunWorkflow
      .mockResolvedValueOnce(makeRolloutResult(true)); // progressiveRolloutWorkflow

    const result = await trainingLoopWorkflow(makeInput());

    expect(result.loopId).toBe("test-loop-1");
    expect(result.status).toBe("completed");
    expect(result.iterations).toBe(1);

    // Verify all 6 stages completed
    const completedStages = result.stages.filter((s) => s.status === "completed");
    expect(completedStages).toHaveLength(6);

    const stageNames = result.stages.map((s) => s.stage);
    expect(stageNames).toEqual([
      "collecting",
      "curating",
      "optimizing",
      "evaluating",
      "deploying",
      "monitoring",
    ]);

    // Verify activities called
    expect(mockProxyActivities.collectSignals).toHaveBeenCalledTimes(1);
    expect(mockProxyActivities.curateTrainingData).toHaveBeenCalledTimes(1);
    expect(mockProxyActivities.runOptimization).toHaveBeenCalledTimes(1);
    expect(mockExecuteChild).toHaveBeenCalledTimes(2); // eval + rollout
    expect(mockProxyActivities.checkRegressionStatus).toHaveBeenCalledTimes(1);

    // Verify recordLoopIteration called for each stage
    expect(mockProxyActivities.recordLoopIteration).toHaveBeenCalledTimes(6);
  });

  // --------------------------------------------------------------------------
  // Approval gate: auto-approve
  // --------------------------------------------------------------------------

  it("auto-approves when eval score exceeds baseline by threshold", async () => {
    // First iteration sets baseline to 0.7, regression triggers re-loop.
    // Second iteration scores 0.9, ratio = 0.9/0.7 ≈ 1.29 >> 1.02 → auto-approve
    mockProxyActivities.checkRegressionStatus
      .mockResolvedValueOnce({ hasRegression: true }) // iter 1: regression → re-loop
      .mockResolvedValueOnce({ hasRegression: false }); // iter 2: no regression

    mockExecuteChild
      .mockResolvedValueOnce(makeEvalRunResult(0.7))  // iter 1 eval (sets baseline)
      .mockResolvedValueOnce(makeRolloutResult(true))  // iter 1 rollout
      .mockResolvedValueOnce(makeEvalRunResult(0.9))   // iter 2 eval (0.9/0.7 > 1.02)
      .mockResolvedValueOnce(makeRolloutResult(true));  // iter 2 rollout

    // For iter 1 eval: score/baseline = 1.0 (edge case), auto-approve via condition
    mockCondition.mockImplementation(async (fn?: () => boolean) => {
      if (fn) {
        if (handlers.trainingApprove) {
          handlers.trainingApprove();
        }
        return fn();
      }
      return true;
    });

    const result = await trainingLoopWorkflow(makeInput());

    expect(result.status).toBe("completed");
    expect(result.iterations).toBe(2);

    // Second eval stage should be auto-approved (decision = 1)
    const evalStages = result.stages.filter((s) => s.stage === "evaluating");
    expect(evalStages).toHaveLength(2);
    expect(evalStages[1].status).toBe("completed");
    expect(evalStages[1].metrics.decision).toBe(1); // auto-approve
  });

  // --------------------------------------------------------------------------
  // Approval gate: pause for human review
  // --------------------------------------------------------------------------

  it("pauses for human review when score is within threshold of baseline", async () => {
    // First eval sets baseline. We need two iterations to test edge case.
    // Use a score that equals the baseline (ratio = 1.0, within ±0.02)
    const baselineScore = 0.8;
    mockExecuteChild
      .mockResolvedValueOnce(makeEvalRunResult(baselineScore)) // first eval sets baseline
      .mockResolvedValueOnce(makeRolloutResult(true)); // rollout for iter 1 if approved

    // When condition is called for approval, simulate approval
    mockCondition.mockImplementation(async (fn?: () => boolean) => {
      if (fn) {
        // Simulate approving - trigger the approve signal
        if (handlers.trainingApprove) {
          handlers.trainingApprove();
        }
        return fn();
      }
      return true;
    });

    const result = await trainingLoopWorkflow(makeInput());

    // Since baseline is set from first eval, score/baseline = 1.0 which is
    // >= 1 - 0.02 = 0.98 and < 1 + 0.02 = 1.02 → edge case → human review
    expect(result.status).toBe("completed");
    const evalStage = result.stages.find((s) => s.stage === "evaluating");
    expect(evalStage?.status).toBe("completed");
    expect(evalStage?.metrics.decision).toBe(0); // human review path
  });

  // --------------------------------------------------------------------------
  // Approval gate: auto-reject
  // --------------------------------------------------------------------------

  it("auto-rejects when score is significantly below baseline", async () => {
    // Score below baseline * 0.98 → auto-reject
    // Baseline will be set to the score itself on first eval,
    // so we need to manipulate: first eval returns 1.0 (baseline),
    // then re-entry with score 0.5
    // Actually, since baseline is set from first iteration and
    // score/baseline = 1.0, we need a different approach.
    // Let's test with a regression re-entry scenario:

    // Simpler: set baselineScore via a first iteration where monitoring
    // detects regression, then second iteration has low score
    mockProxyActivities.checkRegressionStatus
      .mockResolvedValueOnce({ hasRegression: true }) // first iteration → re-trigger
      .mockResolvedValueOnce({ hasRegression: false }); // second iteration → done

    mockExecuteChild
      .mockResolvedValueOnce(makeEvalRunResult(1.0)) // iter 1 eval (baseline set to 1.0)
      .mockResolvedValueOnce(makeRolloutResult(true)) // iter 1 rollout
      .mockResolvedValueOnce(makeEvalRunResult(0.5)); // iter 2 eval (0.5/1.0 = 0.5, well below 0.98)

    const result = await trainingLoopWorkflow(makeInput());

    expect(result.status).toBe("failed");

    // Find the failed evaluating stage (should be the second one)
    const evalStages = result.stages.filter((s) => s.stage === "evaluating");
    const failedEval = evalStages.find((s) => s.status === "failed");
    expect(failedEval).toBeDefined();
    expect(failedEval?.metrics.decision).toBe(-1); // auto-reject
  });

  // --------------------------------------------------------------------------
  // Pause/resume signal handling
  // --------------------------------------------------------------------------

  it("handles pause and resume signals", async () => {
    mockExecuteChild
      .mockResolvedValueOnce(makeEvalRunResult(0.9))
      .mockResolvedValueOnce(makeRolloutResult(true));

    // Simulate: pause then resume via condition mock
    mockCondition.mockImplementation(async (fn?: () => boolean) => {
      if (fn) {
        // Simulate resume
        if (handlers.trainingResume) {
          handlers.trainingResume();
        }
        return fn();
      }
      return true;
    });

    const result = await trainingLoopWorkflow(makeInput());

    expect(result.status).toBe("completed");
    expect(result.iterations).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Abort signal handling
  // --------------------------------------------------------------------------

  it("aborts when abort signal is received", async () => {
    // Trigger abort during collecting stage
    mockProxyActivities.collectSignals.mockImplementation(async () => {
      if (handlers.trainingAbort) {
        handlers.trainingAbort();
      }
      return { signals: [], count: 0 };
    });

    mockExecuteChild
      .mockResolvedValueOnce(makeEvalRunResult(0.9))
      .mockResolvedValueOnce(makeRolloutResult(true));

    const result = await trainingLoopWorkflow(makeInput());

    expect(result.status).toBe("aborted");
    // Should stop after collecting (abort checked before curating)
    expect(result.stages).toHaveLength(1);
    expect(result.stages[0].stage).toBe("collecting");
  });

  // --------------------------------------------------------------------------
  // Skip stage signal
  // --------------------------------------------------------------------------

  it("skips stages when skipStage signal is received", async () => {
    // Trigger skip during collecting
    mockProxyActivities.collectSignals.mockImplementation(async () => {
      // This won't skip collecting (already in progress), but will skip curating
      if (handlers.trainingSkipStage) {
        handlers.trainingSkipStage();
      }
      return { signals: [], count: 0 };
    });

    mockExecuteChild
      .mockResolvedValueOnce(makeEvalRunResult(0.9))
      .mockResolvedValueOnce(makeRolloutResult(true));

    const result = await trainingLoopWorkflow(makeInput());

    // Curating should be skipped
    const curatingStage = result.stages.find((s) => s.stage === "curating");
    expect(curatingStage?.status).toBe("skipped");
  });

  // --------------------------------------------------------------------------
  // Regression-triggered re-entry
  // --------------------------------------------------------------------------

  it("re-triggers loop when regression is detected during monitoring", async () => {
    // First iteration: regression detected → re-trigger
    // Second iteration: no regression → complete
    mockProxyActivities.checkRegressionStatus
      .mockResolvedValueOnce({ hasRegression: true })
      .mockResolvedValueOnce({ hasRegression: false });

    mockExecuteChild
      .mockResolvedValueOnce(makeEvalRunResult(0.9))   // iter 1 eval
      .mockResolvedValueOnce(makeRolloutResult(true))   // iter 1 rollout
      .mockResolvedValueOnce(makeEvalRunResult(0.95))   // iter 2 eval
      .mockResolvedValueOnce(makeRolloutResult(true));   // iter 2 rollout

    const result = await trainingLoopWorkflow(makeInput());

    expect(result.status).toBe("completed");
    expect(result.iterations).toBe(2);

    // Should have monitoring stages for both iterations
    const monitoringStages = result.stages.filter((s) => s.stage === "monitoring");
    expect(monitoringStages).toHaveLength(2);
    expect(monitoringStages[0].metrics.hasRegression).toBe(1);
    expect(monitoringStages[1].metrics.hasRegression).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Query handler
  // --------------------------------------------------------------------------

  it("getLoopStatusQuery returns correct stage info", async () => {
    mockExecuteChild
      .mockResolvedValueOnce(makeEvalRunResult(0.9))
      .mockResolvedValueOnce(makeRolloutResult(true));

    await trainingLoopWorkflow(makeInput());

    expect(handlers.getLoopStatus).toBeDefined();

    const status = handlers.getLoopStatus() as TrainingLoopStatus;
    expect(status.stage).toBe("idle"); // after completion, back to idle
    expect(status.currentIteration).toBe(1);
    expect(status.maxIterations).toBe(3);
    expect(status.isPaused).toBe(false);
    expect(status.history).toHaveLength(6);
  });

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------

  it("uses default time window and signal types when not provided", async () => {
    mockExecuteChild
      .mockResolvedValueOnce(makeEvalRunResult(0.9))
      .mockResolvedValueOnce(makeRolloutResult(true));

    const input = makeInput({
      timeWindow: undefined,
      signalTypes: undefined,
    });

    const result = await trainingLoopWorkflow(input);

    expect(result.status).toBe("completed");
    expect(mockProxyActivities.collectSignals).toHaveBeenCalledWith(
      "proj-1",
      expect.objectContaining({
        startDate: expect.any(String),
        endDate: expect.any(String),
      }),
      ["preference", "feedback", "correction"]
    );
  });

  it("stops when curation quality is below threshold", async () => {
    mockProxyActivities.curateTrainingData.mockResolvedValue({
      curatedData: [],
      qualityScore: 0.5, // Below 0.7 threshold
      stats: { totalInput: 50, finalCount: 10 },
    });

    const result = await trainingLoopWorkflow(makeInput());

    expect(result.status).toBe("failed");

    const curatingStage = result.stages.find((s) => s.stage === "curating");
    expect(curatingStage?.status).toBe("failed");

    // Should not proceed to optimizing
    const optimizingStage = result.stages.find((s) => s.stage === "optimizing");
    expect(optimizingStage).toBeUndefined();
  });

  it("stops when rollout fails", async () => {
    // First call: eval (score = baseline → edge case → approve via condition)
    // Second call: rollout fails
    mockExecuteChild
      .mockResolvedValueOnce(makeEvalRunResult(0.9))
      .mockResolvedValueOnce(makeRolloutResult(false));

    // Approve the edge case eval gate
    mockCondition.mockImplementation(async (fn?: () => boolean) => {
      if (fn) {
        if (handlers.trainingApprove) {
          handlers.trainingApprove();
        }
        return fn();
      }
      return true;
    });

    const result = await trainingLoopWorkflow(makeInput());

    expect(result.status).toBe("failed");

    const deployStage = result.stages.find((s) => s.stage === "deploying");
    expect(deployStage?.status).toBe("failed");
  });

  it("respects maxIterations limit", async () => {
    // All iterations trigger regression → re-loop until max
    mockProxyActivities.checkRegressionStatus.mockResolvedValue({
      hasRegression: true,
    });

    // Return eval then rollout for each iteration
    mockExecuteChild.mockImplementation(async (_wf: unknown, opts: { workflowId: string }) => {
      if (opts.workflowId.includes("eval")) {
        return makeEvalRunResult(0.9);
      }
      return makeRolloutResult(true);
    });

    // Auto-approve edge-case eval gates
    mockCondition.mockImplementation(async (fn?: () => boolean) => {
      if (fn) {
        if (handlers.trainingApprove) {
          handlers.trainingApprove();
        }
        return fn();
      }
      return true;
    });

    const result = await trainingLoopWorkflow(makeInput({ maxIterations: 2 }));

    expect(result.iterations).toBe(2);
  });

  it("rejects during human review when reject signal is sent", async () => {
    mockExecuteChild
      .mockResolvedValueOnce(makeEvalRunResult(0.8)); // score/baseline = 1.0 → edge case

    // When condition is called for approval gate, simulate rejection
    mockCondition.mockImplementation(async (fn?: () => boolean) => {
      if (fn) {
        if (handlers.trainingReject) {
          handlers.trainingReject();
        }
        return fn();
      }
      return true;
    });

    const result = await trainingLoopWorkflow(makeInput());

    expect(result.status).toBe("failed");

    const evalStage = result.stages.find((s) => s.stage === "evaluating");
    expect(evalStage?.status).toBe("failed");
    expect(evalStage?.metrics.decision).toBe(-1);
  });
});
