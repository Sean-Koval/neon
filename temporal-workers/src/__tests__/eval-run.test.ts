/**
 * Tests for Eval Run Workflows
 *
 * Tests evalRunWorkflow, parallelEvalRunWorkflow, and calculateSummary
 * by mocking the @temporalio/workflow module.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EvalRunInput, EvalCaseOutput } from "../types";

// ============================================================================
// MOCK SETUP
// ============================================================================

// Use vi.hoisted so mock fns are available when vi.mock factory runs (hoisted above imports)
const {
  handlers,
  mockEmitSpan,
  mockSendNotifications,
  mockExecuteChild,
} = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: unknown[]) => unknown>,
  mockEmitSpan: vi.fn().mockResolvedValue(undefined),
  mockSendNotifications: vi.fn().mockResolvedValue(undefined),
  mockExecuteChild: vi.fn(),
}));

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: vi.fn(() => ({
    emitSpan: mockEmitSpan,
    sendNotifications: mockSendNotifications,
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
    workflowId: "test-workflow",
    runId: "test-run",
    startTime: new Date().toISOString(),
  })),
  sleep: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocks are set up
import {
  evalRunWorkflow,
  parallelEvalRunWorkflow,
} from "../workflows/eval-run";

// ============================================================================
// HELPERS
// ============================================================================

function makeInput(overrides: Partial<EvalRunInput> = {}): EvalRunInput {
  return {
    runId: "run-1",
    projectId: "proj-1",
    agentId: "agent-1",
    agentVersion: "v1",
    dataset: {
      items: [
        { input: { query: "hello" }, expected: { answer: "world" } },
        { input: { query: "foo" }, expected: { answer: "bar" } },
      ],
    },
    tools: [{ name: "search", description: "Search tool", parameters: {} }],
    scorers: ["accuracy", "latency"],
    ...overrides,
  };
}

function makeCaseOutput(overrides: Partial<EvalCaseOutput> = {}): EvalCaseOutput {
  return {
    status: "completed",
    traceId: "trace-1",
    agentResult: {
      traceId: "trace-1",
      status: "completed",
      iterations: 2,
    },
    scores: [
      { name: "accuracy", value: 0.9, reason: "Good" },
      { name: "latency", value: 0.8, reason: "Fast" },
    ],
    passed: true,
    avgScore: 0.85,
    durationMs: 1000,
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe("evalRunWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(handlers)) {
      delete handlers[key];
    }
  });

  it("happy path: all cases pass", async () => {
    const caseOutput = makeCaseOutput();
    mockExecuteChild.mockResolvedValue(caseOutput);

    const result = await evalRunWorkflow(makeInput());

    expect(result.runId).toBe("run-1");
    expect(result.results).toHaveLength(2);
    expect(result.summary.total).toBe(2);
    expect(result.summary.avgScore).toBeCloseTo(0.85);

    // Verify executeChild was called for each dataset item
    expect(mockExecuteChild).toHaveBeenCalledTimes(2);

    // Verify emitSpan was called (start + complete)
    expect(mockEmitSpan).toHaveBeenCalledTimes(2);
    expect(mockEmitSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "eval-run:run-1",
      })
    );
    expect(mockEmitSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "eval-run-complete",
      })
    );
  });

  it("handles some failures", async () => {
    const passCase = makeCaseOutput({ passed: true });
    const failCase = makeCaseOutput({
      status: "failed",
      passed: false,
      agentResult: {
        traceId: "trace-fail",
        status: "failed",
        iterations: 0,
        reason: "LLM error",
      },
      scores: [],
    });

    mockExecuteChild
      .mockResolvedValueOnce(passCase)
      .mockResolvedValueOnce(failCase);

    const result = await evalRunWorkflow(makeInput());

    expect(result.results).toHaveLength(2);
    // First case passed (high scores), second case failed (no scores = failed status)
    expect(result.summary.failed).toBeGreaterThanOrEqual(1);
  });

  it("handles child workflow throwing an error", async () => {
    mockExecuteChild
      .mockResolvedValueOnce(makeCaseOutput())
      .mockRejectedValueOnce(new Error("Child workflow failed"));

    const result = await evalRunWorkflow(makeInput());

    expect(result.results).toHaveLength(2);
    // The second case should be recorded as failed
    expect(result.results[1].result.status).toBe("failed");
    expect(result.results[1].result.reason).toBe("Child workflow failed");
    expect(result.results[1].scores).toEqual([]);
  });

  it("respects cancelRunSignal", async () => {
    // Make executeChild slow so we can trigger cancellation
    mockExecuteChild.mockImplementation(async () => {
      // Simulate cancellation being triggered after first case
      if (handlers.cancelRun) {
        handlers.cancelRun();
      }
      return makeCaseOutput();
    });

    const input = makeInput({
      dataset: {
        items: [
          { input: { query: "a" } },
          { input: { query: "b" } },
          { input: { query: "c" } },
        ],
      },
    });

    const result = await evalRunWorkflow(input);

    // Should have processed the first case, then stopped after cancellation
    // (cancelled flag checked at start of next iteration)
    expect(result.results.length).toBeLessThanOrEqual(2);
    expect(mockEmitSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "eval-run-complete",
        attributes: expect.objectContaining({
          "eval.cancelled": "true",
        }),
      })
    );
  });

  it("handles pause/resume via pauseSignal", async () => {
    mockExecuteChild.mockResolvedValue(makeCaseOutput());

    // Override condition to immediately resolve (simulating resume)
    const { condition } = await import("@temporalio/workflow");
    (condition as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const result = await evalRunWorkflow(makeInput());

    // Should complete all cases since we resume immediately
    expect(result.results).toHaveLength(2);
    expect(result.summary.total).toBe(2);
  });

  it("sends notifications when configured", async () => {
    mockExecuteChild.mockResolvedValue(makeCaseOutput());

    const input = makeInput({
      notify: {
        slackWebhookUrl: "https://hooks.slack.com/test",
        notifyOnSuccess: true,
      },
    });

    const result = await evalRunWorkflow(input);

    expect(mockSendNotifications).toHaveBeenCalledTimes(1);
    expect(mockSendNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        projectId: "proj-1",
        agentId: "agent-1",
        agentVersion: "v1",
        total: 2,
      }),
      expect.objectContaining({
        slackWebhookUrl: "https://hooks.slack.com/test",
      })
    );
    expect(result.runId).toBe("run-1");
  });

  it("does not send notifications when not configured", async () => {
    mockExecuteChild.mockResolvedValue(makeCaseOutput());

    await evalRunWorkflow(makeInput());

    expect(mockSendNotifications).not.toHaveBeenCalled();
  });

  it("does not fail if notification sending throws", async () => {
    mockExecuteChild.mockResolvedValue(makeCaseOutput());
    mockSendNotifications.mockRejectedValueOnce(new Error("Slack down"));

    const input = makeInput({
      notify: { slackWebhookUrl: "https://hooks.slack.com/test" },
    });

    // Should not throw
    const result = await evalRunWorkflow(input);
    expect(result.runId).toBe("run-1");
    expect(result.results).toHaveLength(2);
  });

  it("exposes progress via progressQuery handler", async () => {
    mockExecuteChild.mockResolvedValue(makeCaseOutput());

    await evalRunWorkflow(makeInput());

    // The setHandler should have been called for the progress query
    expect(handlers.progress).toBeDefined();

    // After workflow completion, progress should reflect final state
    const progress = handlers.progress() as {
      completed: number;
      total: number;
      passed: number;
      failed: number;
      results: unknown[];
    };
    expect(progress.completed).toBe(2);
    expect(progress.total).toBe(2);
    expect(progress.results).toHaveLength(2);
  });
});

describe("parallelEvalRunWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(handlers)) {
      delete handlers[key];
    }
  });

  it("processes items in batches with configured parallelism", async () => {
    mockExecuteChild.mockResolvedValue(makeCaseOutput());

    const input = {
      ...makeInput({
        dataset: {
          items: [
            { input: { query: "a" } },
            { input: { query: "b" } },
            { input: { query: "c" } },
            { input: { query: "d" } },
            { input: { query: "e" } },
          ],
        },
      }),
      parallelism: 2,
    };

    const result = await parallelEvalRunWorkflow(input);

    // All 5 items should be processed
    expect(result.results).toHaveLength(5);
    expect(result.summary.total).toBe(5);

    // executeChild should be called once per item
    expect(mockExecuteChild).toHaveBeenCalledTimes(5);
  });

  it("defaults parallelism to 5", async () => {
    mockExecuteChild.mockResolvedValue(makeCaseOutput());

    const input = makeInput({
      dataset: {
        items: Array.from({ length: 7 }, (_, i) => ({
          input: { query: `q${i}` },
        })),
      },
    });

    const result = await parallelEvalRunWorkflow(input);

    expect(result.results).toHaveLength(7);
    expect(mockExecuteChild).toHaveBeenCalledTimes(7);
  });

  it("handles mixed pass/fail in batches", async () => {
    const passCase = makeCaseOutput({ passed: true });
    const failCase = makeCaseOutput({
      passed: false,
      agentResult: {
        traceId: "trace-fail",
        status: "failed",
        iterations: 0,
        reason: "Error",
      },
      scores: [],
    });

    // Alternate pass/fail
    mockExecuteChild
      .mockResolvedValueOnce(passCase)
      .mockResolvedValueOnce(failCase)
      .mockResolvedValueOnce(passCase);

    const input = {
      ...makeInput({
        dataset: {
          items: [
            { input: { query: "a" } },
            { input: { query: "b" } },
            { input: { query: "c" } },
          ],
        },
      }),
      parallelism: 2,
    };

    const result = await parallelEvalRunWorkflow(input);
    expect(result.results).toHaveLength(3);
    expect(result.summary.total).toBe(3);
  });

  it("handles errors in child workflows within batches", async () => {
    mockExecuteChild
      .mockResolvedValueOnce(makeCaseOutput())
      .mockRejectedValueOnce(new Error("batch error"));

    const input = {
      ...makeInput({
        dataset: {
          items: [
            { input: { query: "a" } },
            { input: { query: "b" } },
          ],
        },
      }),
      parallelism: 2,
    };

    const result = await parallelEvalRunWorkflow(input);

    expect(result.results).toHaveLength(2);
    const failedResult = result.results.find((r) => r.result.status === "failed");
    expect(failedResult).toBeDefined();
    expect(failedResult!.result.reason).toBe("batch error");
  });
});

describe("calculateSummary (via evalRunWorkflow)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(handlers)) {
      delete handlers[key];
    }
  });

  it("computes correct averages with all passing cases", async () => {
    const caseOutput = makeCaseOutput({
      scores: [
        { name: "accuracy", value: 1.0, reason: "Perfect" },
        { name: "latency", value: 0.8, reason: "Fast" },
      ],
    });
    mockExecuteChild.mockResolvedValue(caseOutput);

    const result = await evalRunWorkflow(makeInput());

    // avgScore = (1.0 + 0.8 + 1.0 + 0.8) / 4 = 0.9
    expect(result.summary.avgScore).toBeCloseTo(0.9);
    expect(result.summary.passed).toBe(2);
    expect(result.summary.failed).toBe(0);
  });

  it("computes correct averages with mixed scores", async () => {
    const highCase = makeCaseOutput({
      passed: true,
      scores: [{ name: "accuracy", value: 0.9, reason: "Good" }],
    });
    const lowCase = makeCaseOutput({
      passed: false,
      scores: [{ name: "accuracy", value: 0.3, reason: "Bad" }],
    });

    mockExecuteChild
      .mockResolvedValueOnce(highCase)
      .mockResolvedValueOnce(lowCase);

    const result = await evalRunWorkflow(makeInput());

    // avgScore = (0.9 + 0.3) / 2 = 0.6
    expect(result.summary.avgScore).toBeCloseTo(0.6);
    // passed: cases with avg score >= 0.7
    expect(result.summary.passed).toBe(1); // only the 0.9 case
    expect(result.summary.failed).toBe(1); // the 0.3 case
  });

  it("handles zero scores correctly", async () => {
    const noScoresCase = makeCaseOutput({
      passed: true,
      scores: [],
    });
    mockExecuteChild.mockResolvedValue(noScoresCase);

    const result = await evalRunWorkflow(makeInput());

    expect(result.summary.avgScore).toBe(0);
    // No scores, status not failed => passed by default
    expect(result.summary.passed).toBe(2);
  });
});
