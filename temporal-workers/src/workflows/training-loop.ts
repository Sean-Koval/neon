/**
 * Training Loop Workflow
 *
 * Orchestrates the closed-loop training cycle for agent improvement.
 * Implements a state machine that progresses through stages:
 * IDLE → COLLECTING → CURATING → OPTIMIZING → EVALUATING → DEPLOYING → MONITORING
 *
 * Features:
 * - Event-driven triggers (regression, signal threshold, manual)
 * - Approval gates with auto-approve/reject thresholds
 * - Pause/resume/abort signal handling
 * - Regression-triggered re-entry for continuous improvement
 * - Full observability via span emission at each stage
 */

import {
  proxyActivities,
  executeChild,
  ParentClosePolicy,
  defineQuery,
  defineSignal,
  setHandler,
  condition,
  workflowInfo,
} from "@temporalio/workflow";
import type * as activities from "../activities";
import { evalRunWorkflow } from "./eval-run";
import { progressiveRolloutWorkflow } from "./optimization";

// ============================================================================
// ACTIVITY PROXIES
// ============================================================================

const {
  collectSignals,
  curateTrainingData,
  runOptimization,
  checkRegressionStatus,
  recordLoopIteration,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "1s",
    maximumInterval: "30s",
    maximumAttempts: 5,
  },
});

// ============================================================================
// TYPES
// ============================================================================

export type TrainingLoopStage =
  | "idle"
  | "collecting"
  | "curating"
  | "optimizing"
  | "evaluating"
  | "deploying"
  | "monitoring";

export interface TrainingLoopInput {
  projectId: string;
  suiteId: string;
  promptId: string;
  strategy: "coordinate_ascent" | "example_selection" | "reflection";
  trigger: "regression" | "signal_threshold" | "manual";
  maxIterations?: number;
  improvementThreshold?: number;
  signalTypes?: string[];
  timeWindow?: { startDate: string; endDate: string };
}

export interface TrainingLoopResult {
  loopId: string;
  status: "completed" | "aborted" | "failed";
  stages: StageResult[];
  improvement: number;
  totalDurationMs: number;
  iterations: number;
}

export interface StageResult {
  stage: TrainingLoopStage;
  status: "completed" | "skipped" | "failed";
  metrics: Record<string, number>;
  durationMs: number;
  timestamp: Date;
}

export interface TrainingLoopStatus {
  stage: TrainingLoopStage;
  progress: number;
  metrics: Record<string, number>;
  history: StageResult[];
  isPaused: boolean;
  currentIteration: number;
  maxIterations: number;
}

// ============================================================================
// SIGNALS & QUERIES
// ============================================================================

export const pauseSignal = defineSignal("trainingPause");
export const resumeSignal = defineSignal("trainingResume");
export const abortSignal = defineSignal("trainingAbort");
export const approveSignal = defineSignal("trainingApprove");
export const rejectSignal = defineSignal("trainingReject");
export const skipStageSignal = defineSignal("trainingSkipStage");

export const getLoopStatusQuery = defineQuery<TrainingLoopStatus>("getLoopStatus");

// ============================================================================
// MAIN WORKFLOW
// ============================================================================

/**
 * Training Loop Workflow
 *
 * Runs a closed-loop training cycle:
 * 1. COLLECTING: Gather preference signals from ClickHouse
 * 2. CURATING: Filter, dedup, quality-check training data
 * 3. OPTIMIZING: Run optimization strategy to produce candidate prompt
 * 4. EVALUATING: Run eval suite on candidate with approval gates
 * 5. DEPLOYING: Progressive rollout of approved candidate
 * 6. MONITORING: Watch for regression, auto-rollback + re-trigger if needed
 */
export async function trainingLoopWorkflow(
  input: TrainingLoopInput
): Promise<TrainingLoopResult> {
  const info = workflowInfo();
  const loopId = info.workflowId;
  const startTime = Date.now();
  const maxIterations = input.maxIterations ?? 3;
  const improvementThreshold = input.improvementThreshold ?? 0.02;

  // Workflow state
  let currentStage: TrainingLoopStage = "idle";
  let isPaused = false;
  let isAborted = false;
  let isApproved = false;
  let isRejected = false;
  let skipStage = false;
  let currentIteration = 0;
  const stageHistory: StageResult[] = [];
  const currentMetrics: Record<string, number> = {};
  let baselineScore = 0;

  // ---- Signal handlers ----
  setHandler(pauseSignal, () => {
    isPaused = true;
  });
  setHandler(resumeSignal, () => {
    isPaused = false;
  });
  setHandler(abortSignal, () => {
    isAborted = true;
  });
  setHandler(approveSignal, () => {
    isApproved = true;
  });
  setHandler(rejectSignal, () => {
    isRejected = true;
  });
  setHandler(skipStageSignal, () => {
    skipStage = true;
  });

  // ---- Query handler ----
  setHandler(getLoopStatusQuery, (): TrainingLoopStatus => ({
    stage: currentStage,
    progress: stageHistory.length / 6,
    metrics: { ...currentMetrics },
    history: [...stageHistory],
    isPaused,
    currentIteration,
    maxIterations,
  }));

  // ---- Helper: check pause/abort between stages ----
  async function checkPauseAbort(): Promise<boolean> {
    if (isAborted) return true;
    if (isPaused) {
      await condition(() => !isPaused || isAborted);
      if (isAborted) return true;
    }
    return false;
  }

  // ---- Helper: record stage result ----
  function recordStage(
    stage: TrainingLoopStage,
    status: "completed" | "skipped" | "failed",
    metrics: Record<string, number>,
    stageStart: number
  ): StageResult {
    const result: StageResult = {
      stage,
      status,
      metrics,
      durationMs: Date.now() - stageStart,
      timestamp: new Date(),
    };
    stageHistory.push(result);
    return result;
  }

  // ---- Main loop ----
  while (currentIteration < maxIterations) {
    currentIteration++;

    // --- STAGE 1: COLLECTING ---
    currentStage = "collecting";
    let stageStart = Date.now();

    if (await checkPauseAbort()) break;

    if (skipStage) {
      recordStage("collecting", "skipped", {}, stageStart);
      skipStage = false;
    } else {
      const timeWindow = input.timeWindow ?? {
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date().toISOString(),
      };
      const signalTypes = input.signalTypes ?? ["preference", "feedback", "correction"];

      const collectResult = await collectSignals(
        input.projectId,
        timeWindow,
        signalTypes
      );

      currentMetrics.signalCount = collectResult.count;
      await recordLoopIteration(loopId, "collecting", { signalCount: collectResult.count });
      recordStage("collecting", "completed", { signalCount: collectResult.count }, stageStart);
    }

    // --- STAGE 2: CURATING ---
    currentStage = "curating";
    stageStart = Date.now();

    if (await checkPauseAbort()) break;

    let curatedData: unknown[] = [];
    if (skipStage) {
      recordStage("curating", "skipped", {}, stageStart);
      skipStage = false;
    } else {
      const curateResult = await curateTrainingData([], {
        minQuality: 0.7,
        maxSamples: 1000,
        balanceClasses: true,
      });

      curatedData = curateResult.curatedData;
      currentMetrics.qualityScore = curateResult.qualityScore;
      currentMetrics.curatedCount = curateResult.curatedData.length;

      await recordLoopIteration(loopId, "curating", {
        qualityScore: curateResult.qualityScore,
        curatedCount: curateResult.curatedData.length,
      });

      // Auto-approve curation if quality > 0.7
      if (curateResult.qualityScore <= 0.7) {
        recordStage("curating", "failed", { qualityScore: curateResult.qualityScore }, stageStart);
        break;
      }

      recordStage("curating", "completed", {
        qualityScore: curateResult.qualityScore,
        curatedCount: curateResult.curatedData.length,
      }, stageStart);
    }

    // --- STAGE 3: OPTIMIZING ---
    currentStage = "optimizing";
    stageStart = Date.now();

    if (await checkPauseAbort()) break;

    let candidateScore = 0;
    if (skipStage) {
      recordStage("optimizing", "skipped", {}, stageStart);
      skipStage = false;
    } else {
      const optimizeResult = await runOptimization(
        curatedData,
        input.strategy,
        input.promptId
      );

      candidateScore = optimizeResult.candidateScore;
      currentMetrics.candidateScore = candidateScore;

      await recordLoopIteration(loopId, "optimizing", {
        candidateScore,
      });

      recordStage("optimizing", "completed", { candidateScore }, stageStart);
    }

    // --- STAGE 4: EVALUATING ---
    currentStage = "evaluating";
    stageStart = Date.now();

    if (await checkPauseAbort()) break;

    if (skipStage) {
      recordStage("evaluating", "skipped", {}, stageStart);
      skipStage = false;
    } else {
      // Run eval suite via child workflow
      const evalResult = await executeChild(evalRunWorkflow, {
        workflowId: `${loopId}-eval-${currentIteration}`,
        args: [
          {
            runId: `${loopId}-eval-${currentIteration}`,
            projectId: input.projectId,
            agentId: input.promptId,
            agentVersion: `iteration-${currentIteration}`,
            dataset: { items: [{ input: { prompt: "test" } }] },
            tools: [],
            scorers: ["quality"],
          },
        ],
        parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
      });

      const evalScore = evalResult.summary.avgScore;
      currentMetrics.evalScore = evalScore;

      // Set baseline from first iteration
      if (baselineScore === 0) {
        baselineScore = evalScore > 0 ? evalScore : 1;
      }

      const scoreRatio = evalScore / baselineScore;

      await recordLoopIteration(loopId, "evaluating", {
        evalScore,
        baselineScore,
        scoreRatio,
      });

      // Approval gates
      if (scoreRatio >= 1 + improvementThreshold) {
        // Auto-approve: score exceeds baseline by threshold
        recordStage("evaluating", "completed", { evalScore, decision: 1 }, stageStart);
      } else if (scoreRatio >= 1 - improvementThreshold) {
        // Edge case: within threshold of baseline, pause for human review
        isApproved = false;
        isRejected = false;

        await condition(() => isApproved || isRejected || isAborted);

        if (isAborted || isRejected) {
          recordStage("evaluating", "failed", { evalScore, decision: -1 }, stageStart);
          break;
        }

        recordStage("evaluating", "completed", { evalScore, decision: 0 }, stageStart);
      } else {
        // Auto-reject: score below baseline by more than threshold
        recordStage("evaluating", "failed", { evalScore, decision: -1 }, stageStart);
        break;
      }
    }

    // --- STAGE 5: DEPLOYING ---
    currentStage = "deploying";
    stageStart = Date.now();

    if (await checkPauseAbort()) break;

    if (skipStage) {
      recordStage("deploying", "skipped", {}, stageStart);
      skipStage = false;
    } else {
      const rolloutResult = await executeChild(progressiveRolloutWorkflow, {
        workflowId: `${loopId}-rollout-${currentIteration}`,
        args: [
          {
            rolloutId: `${loopId}-rollout-${currentIteration}`,
            projectId: input.projectId,
            currentAgent: {
              agentId: input.promptId,
              agentVersion: "current",
              tools: [],
            },
            newAgent: {
              agentId: input.promptId,
              agentVersion: `iteration-${currentIteration}`,
              tools: [],
            },
            dataset: { items: [{ input: { prompt: "test" } }] },
            scorers: ["quality"],
            stages: [10, 25, 50, 100],
            minimumScore: 0.7,
            stageDurationMs: 60000,
          },
        ],
        parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
      });

      currentMetrics.rolloutCompleted = rolloutResult.completed ? 1 : 0;

      await recordLoopIteration(loopId, "deploying", {
        rolloutCompleted: rolloutResult.completed ? 1 : 0,
        finalStage: rolloutResult.finalStage,
      });

      if (!rolloutResult.completed) {
        recordStage("deploying", "failed", { rolloutCompleted: 0 }, stageStart);
        break;
      }

      recordStage("deploying", "completed", {
        rolloutCompleted: 1,
        finalStage: rolloutResult.finalStage,
      }, stageStart);
    }

    // --- STAGE 6: MONITORING ---
    currentStage = "monitoring";
    stageStart = Date.now();

    if (await checkPauseAbort()) break;

    if (skipStage) {
      recordStage("monitoring", "skipped", {}, stageStart);
      skipStage = false;
    } else {
      const regressionResult = await checkRegressionStatus(input.suiteId, 10);

      currentMetrics.hasRegression = regressionResult.hasRegression ? 1 : 0;

      await recordLoopIteration(loopId, "monitoring", {
        hasRegression: regressionResult.hasRegression ? 1 : 0,
      });

      if (regressionResult.hasRegression) {
        recordStage("monitoring", "completed", { hasRegression: 1 }, stageStart);
        // Regression detected: re-trigger the loop (continue to next iteration)
        continue;
      }

      recordStage("monitoring", "completed", { hasRegression: 0 }, stageStart);
    }

    // No regression — loop is done
    break;
  }

  currentStage = "idle";
  const totalDurationMs = Date.now() - startTime;

  // Calculate overall improvement
  const evalScores = stageHistory
    .filter((s) => s.stage === "evaluating" && s.status === "completed")
    .map((s) => s.metrics.evalScore ?? 0);
  const improvement =
    evalScores.length > 0 && baselineScore > 0
      ? (evalScores[evalScores.length - 1] - baselineScore) / baselineScore
      : 0;

  const status: TrainingLoopResult["status"] = isAborted
    ? "aborted"
    : stageHistory.some((s) => s.status === "failed")
      ? "failed"
      : "completed";

  return {
    loopId,
    status,
    stages: stageHistory,
    improvement,
    totalDurationMs,
    iterations: currentIteration,
  };
}
