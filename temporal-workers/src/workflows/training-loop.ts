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
import type {
  EmitCheckpointManifest,
  TrainingLoopCheckpointEnvelope,
  TrainingLoopInput,
  TrainingLoopResult,
  TrainingLoopStage,
  TrainingLoopStageResult,
  TrainingLoopStatus,
} from "../types";

// ============================================================================
// ACTIVITY PROXIES
// ============================================================================

const {
  collectSignals,
  curateTrainingData,
  runOptimization,
  checkRegressionStatus,
  recordLoopIteration,
  emitSpan,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "1s",
    maximumInterval: "30s",
    maximumAttempts: 5,
  },
});

const { captureTrainingLoopCheckpoint } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "1s",
    maximumInterval: "30s",
    maximumAttempts: 3,
  },
});

// ============================================================================
// TYPES
// ============================================================================
export type {
  TrainingLoopInput,
  TrainingLoopResult,
  TrainingLoopStage,
  TrainingLoopStageResult as StageResult,
  TrainingLoopStatus,
} from "../types";

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
  const traceId = `training-loop-${loopId}`;
  const startTime = Date.now();
  const replaySource = input.restoreFrom;
  const restoredCheckpoint = input.restoredCheckpoint;
  const restoredState =
    replaySource?.mode === "restore" ? restoredCheckpoint?.state : undefined;
  const sanitizedInput = sanitizeTrainingLoopInput(input);
  const maxIterations =
    restoredState?.maxIterations ?? input.maxIterations ?? 3;
  const improvementThreshold = input.improvementThreshold ?? 0.02;

  let currentStage: TrainingLoopStage =
    restoredState?.currentStage ?? "idle";
  let isPaused = false;
  let isAborted = restoredState?.status === "aborted";
  let isApproved = restoredState?.approvalStatus === "approved";
  let isRejected = restoredState?.approvalStatus === "rejected";
  let approvalStatus = restoredState?.approvalStatus ?? "idle";
  let skipStage = false;
  let currentIteration = restoredState?.currentIteration ?? 0;
  const stageHistory: TrainingLoopStageResult[] = restoredState?.stageHistory
    ? restoredState.stageHistory.map((stage) => ({ ...stage }))
    : [];
  const currentMetrics: Record<string, number> = {
    ...(restoredState?.currentMetrics ?? {}),
  };
  let baselineScore = restoredState?.baselineScore ?? 0;
  let collectedSignals =
    (restoredState?.collectedSignals?.map((signal) => ({ ...(signal as object) })) as unknown as Awaited<
      ReturnType<typeof collectSignals>
    >["signals"]) ?? [];
  let curatedData =
    (restoredState?.curatedData?.map((item) => ({ ...(item as object) })) as unknown as Awaited<
      ReturnType<typeof curateTrainingData>
    >["curatedData"]) ?? [];
  let workflowStatus: "running" | "completed" | "failed" | "aborted" =
    restoredState?.status ?? "running";
  let error: string | undefined = restoredState?.error;

  setHandler(pauseSignal, () => {
    isPaused = true;
  });
  setHandler(resumeSignal, () => {
    isPaused = false;
  });
  setHandler(abortSignal, () => {
    isAborted = true;
    workflowStatus = "aborted";
  });
  setHandler(approveSignal, () => {
    isApproved = true;
    approvalStatus = "approved";
  });
  setHandler(rejectSignal, () => {
    isRejected = true;
    approvalStatus = "rejected";
  });
  setHandler(skipStageSignal, () => {
    skipStage = true;
  });

  setHandler(getLoopStatusQuery, (): TrainingLoopStatus => ({
    stage: currentStage,
    progress: stageHistory.length / 6,
    metrics: { ...currentMetrics },
    history: [...stageHistory],
    isPaused,
    currentIteration,
    maxIterations,
  }));

  const persistCheckpoint = async (
    name: string,
    sequence: number,
  ): Promise<void> => {
    const manifest = buildTrainingLoopCheckpointManifest({
      traceId,
      input: sanitizedInput,
      restoredCheckpoint,
      status: workflowStatus,
      stage: currentStage,
      name,
      sequence,
    });

    const checkpoint = await captureTrainingLoopCheckpoint({
      projectId: input.projectId,
      traceId,
      loopId,
      promptId: input.promptId,
      suiteId: input.suiteId,
      workflowId: workflowInfo().workflowId,
      workflowRunId: workflowInfo().runId,
      input: sanitizedInput,
      state: {
        status: workflowStatus,
        currentStage,
        currentIteration,
        maxIterations,
        baselineScore,
        currentMetrics,
        stageHistory,
        collectedSignals,
        curatedData,
        approvalStatus,
        ...(error ? { error } : {}),
      },
      manifest,
      metadata: {
        ...(replaySource?.checkpointId
          ? {
              sourceCheckpointId: replaySource.checkpointId,
              sourceTraceId: replaySource.traceId,
            }
          : {}),
      },
    });

    await emitSpan({
      traceId,
      spanType: "event",
      name: `checkpoint:${name}`,
      stateSnapshots: [checkpoint.snapshot],
      attributes: {
        "checkpoint.id": checkpoint.manifest.checkpointId,
        "checkpoint.mode": checkpoint.manifest.restore.mode,
        "training.stage": currentStage,
        "training.iteration": String(currentIteration),
      },
    });
  };

  async function checkPauseAbort(): Promise<boolean> {
    if (isAborted) {
      workflowStatus = "aborted";
      return true;
    }
    if (isPaused) {
      await condition(() => !isPaused || isAborted);
      if (isAborted) {
        workflowStatus = "aborted";
        return true;
      }
    }
    return false;
  }

  function recordStage(
    stage: TrainingLoopStage,
    status: "completed" | "skipped" | "failed",
    metrics: Record<string, number>,
    stageStart: number,
  ): TrainingLoopStageResult {
    const result: TrainingLoopStageResult = {
      iteration: currentIteration,
      stage,
      status,
      metrics,
      durationMs: Date.now() - stageStart,
      timestamp: new Date().toISOString(),
    };
    stageHistory.push(result);
    return result;
  }

  const resumeStage = determineResumeStage(restoredState);
  let stageCursor: TrainingLoopStage =
    restoredState ? resumeStage : "collecting";
  let incrementIterationOnEntry =
    !restoredState ||
    (restoredState?.currentStage === "monitoring" &&
      restoredState.currentMetrics.hasRegression === 1);

  await emitSpan({
    traceId,
    spanType: "span",
    name: `training-loop:${loopId}`,
    attributes: {
      "training.loop_id": loopId,
      "training.project_id": input.projectId,
      "training.prompt_id": input.promptId,
      "training.suite_id": input.suiteId,
      "training.trigger": input.trigger,
    },
  });

  if (restoredCheckpoint) {
    const replayManifest = buildTrainingLoopReplayManifest(
      restoredCheckpoint,
      replaySource?.mode,
    );
    await emitSpan({
      traceId,
      spanType: "event",
      name: "training-loop-restored",
      stateSnapshots: [
        {
          snapshotId: restoredCheckpoint.checkpointId,
          name: restoredCheckpoint.metadata?.checkpointName || "restored",
          stateType: "training_loop",
          checkpoint: replayManifest,
          uri: replayManifest.payload?.uri,
          contentHash: replayManifest.integrity.contentHash,
        },
      ],
      attributes: {
        "neon.replay.source_checkpoint_id":
          replaySource?.checkpointId ?? restoredCheckpoint.checkpointId,
        "neon.replay.source_trace_id":
          replaySource?.traceId ?? restoredCheckpoint.traceId,
        "neon.replay.mode": replaySource?.mode ?? "replay",
        "training.resume_stage": stageCursor,
        "training.resume_iteration": String(currentIteration),
      },
    });
  } else {
    await persistCheckpoint("loop-start", 1);
  }

  while (currentIteration < maxIterations) {
    if (incrementIterationOnEntry) {
      currentIteration++;
    } else {
      incrementIterationOnEntry = true;
    }

    if (stageCursor === "collecting") {
      currentStage = "collecting";
      let stageStart = Date.now();
      if (await checkPauseAbort()) {
        break;
      }
      if (skipStage) {
        recordStage("collecting", "skipped", {}, stageStart);
        skipStage = false;
      } else {
        const timeWindow = input.timeWindow ?? {
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString(),
        };
        const signalTypes =
          input.signalTypes ?? ["preference", "feedback", "correction"];
        const collectResult = await collectSignals(
          input.projectId,
          timeWindow,
          signalTypes,
        );
        collectedSignals = collectResult.signals.map((signal) => ({ ...signal }));
        currentMetrics.signalCount = collectResult.count;
        await recordLoopIteration(loopId, "collecting", {
          signalCount: collectResult.count,
        });
        recordStage(
          "collecting",
          "completed",
          { signalCount: collectResult.count },
          stageStart,
        );
      }
      workflowStatus = "running";
      await persistCheckpoint(`iter-${currentIteration}-collecting`, stageHistory.length + 1);
      stageCursor = "curating";
    }

    if (stageCursor === "curating") {
      currentStage = "curating";
      let stageStart = Date.now();
      if (await checkPauseAbort()) {
        break;
      }
      if (skipStage) {
        curatedData = [];
        recordStage("curating", "skipped", {}, stageStart);
        skipStage = false;
      } else {
        const curateResult = await curateTrainingData(collectedSignals, {
          minQuality: 0.7,
          maxSamples: 1000,
          balanceClasses: true,
        });
        curatedData = curateResult.curatedData.map((item) => ({ ...item }));
        currentMetrics.qualityScore = curateResult.qualityScore;
        currentMetrics.curatedCount = curateResult.curatedData.length;
        await recordLoopIteration(loopId, "curating", {
          qualityScore: curateResult.qualityScore,
          curatedCount: curateResult.curatedData.length,
        });
        if (curateResult.qualityScore <= 0.7) {
          workflowStatus = "failed";
          error = "Curated data quality below threshold";
          recordStage(
            "curating",
            "failed",
            { qualityScore: curateResult.qualityScore },
            stageStart,
          );
          await persistCheckpoint(`iter-${currentIteration}-curating-failed`, stageHistory.length + 1);
          break;
        }
        recordStage(
          "curating",
          "completed",
          {
            qualityScore: curateResult.qualityScore,
            curatedCount: curateResult.curatedData.length,
          },
          stageStart,
        );
      }
      workflowStatus = "running";
      await persistCheckpoint(`iter-${currentIteration}-curating`, stageHistory.length + 1);
      stageCursor = "optimizing";
    }

    if (stageCursor === "optimizing") {
      currentStage = "optimizing";
      let stageStart = Date.now();
      if (await checkPauseAbort()) {
        break;
      }
      if (skipStage) {
        recordStage("optimizing", "skipped", {}, stageStart);
        skipStage = false;
      } else {
        const optimizeResult = await runOptimization(
          curatedData,
          input.strategy,
          input.promptId,
        );
        currentMetrics.candidateScore = optimizeResult.candidateScore;
        await recordLoopIteration(loopId, "optimizing", {
          candidateScore: optimizeResult.candidateScore,
        });
        recordStage(
          "optimizing",
          "completed",
          { candidateScore: optimizeResult.candidateScore },
          stageStart,
        );
      }
      workflowStatus = "running";
      await persistCheckpoint(`iter-${currentIteration}-optimizing`, stageHistory.length + 1);
      stageCursor = "evaluating";
    }

    if (stageCursor === "evaluating") {
      currentStage = "evaluating";
      let stageStart = Date.now();
      if (await checkPauseAbort()) {
        break;
      }
      if (skipStage) {
        recordStage("evaluating", "skipped", {}, stageStart);
        skipStage = false;
      } else if (approvalStatus === "pending") {
        await condition(() => isApproved || isRejected || isAborted);
        if (isAborted || isRejected) {
          workflowStatus = isAborted ? "aborted" : "failed";
          recordStage(
            "evaluating",
            "failed",
            { evalScore: currentMetrics.evalScore ?? 0, decision: -1 },
            stageStart,
          );
          await persistCheckpoint(`iter-${currentIteration}-evaluating-failed`, stageHistory.length + 1);
          break;
        }
        approvalStatus = "approved";
        isApproved = false;
        recordStage(
          "evaluating",
          "completed",
          { evalScore: currentMetrics.evalScore ?? 0, decision: 0 },
          stageStart,
        );
      } else {
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
        if (baselineScore === 0) {
          baselineScore = evalScore > 0 ? evalScore : 1;
        }
        const scoreRatio = evalScore / baselineScore;
        await recordLoopIteration(loopId, "evaluating", {
          evalScore,
          baselineScore,
          scoreRatio,
        });
        if (scoreRatio >= 1 + improvementThreshold) {
          approvalStatus = "approved";
          recordStage(
            "evaluating",
            "completed",
            { evalScore, decision: 1 },
            stageStart,
          );
        } else if (scoreRatio >= 1 - improvementThreshold) {
          approvalStatus = "pending";
          workflowStatus = "running";
          await persistCheckpoint(`iter-${currentIteration}-approval-pending`, stageHistory.length + 1);
          await condition(() => isApproved || isRejected || isAborted);
          if (isAborted || isRejected) {
            workflowStatus = isAborted ? "aborted" : "failed";
            approvalStatus = isRejected ? "rejected" : approvalStatus;
            recordStage(
              "evaluating",
              "failed",
              { evalScore, decision: -1 },
              stageStart,
            );
            await persistCheckpoint(`iter-${currentIteration}-evaluating-failed`, stageHistory.length + 1);
            break;
          }
          approvalStatus = "approved";
          isApproved = false;
          recordStage(
            "evaluating",
            "completed",
            { evalScore, decision: 0 },
            stageStart,
          );
        } else {
          workflowStatus = "failed";
          approvalStatus = "rejected";
          error = "Evaluation score regressed below approval threshold";
          recordStage(
            "evaluating",
            "failed",
            { evalScore, decision: -1 },
            stageStart,
          );
          await persistCheckpoint(`iter-${currentIteration}-evaluating-failed`, stageHistory.length + 1);
          break;
        }
      }
      workflowStatus = "running";
      approvalStatus = "idle";
      await persistCheckpoint(`iter-${currentIteration}-evaluating`, stageHistory.length + 1);
      stageCursor = "deploying";
    }

    if (stageCursor === "deploying") {
      currentStage = "deploying";
      let stageStart = Date.now();
      if (await checkPauseAbort()) {
        break;
      }
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
          workflowStatus = "failed";
          error = "Progressive rollout did not complete";
          recordStage(
            "deploying",
            "failed",
            { rolloutCompleted: 0 },
            stageStart,
          );
          await persistCheckpoint(`iter-${currentIteration}-deploying-failed`, stageHistory.length + 1);
          break;
        }
        recordStage(
          "deploying",
          "completed",
          {
            rolloutCompleted: 1,
            finalStage: rolloutResult.finalStage,
          },
          stageStart,
        );
      }
      workflowStatus = "running";
      await persistCheckpoint(`iter-${currentIteration}-deploying`, stageHistory.length + 1);
      stageCursor = "monitoring";
    }

    if (stageCursor === "monitoring") {
      currentStage = "monitoring";
      let stageStart = Date.now();
      if (await checkPauseAbort()) {
        break;
      }
      let hasRegression = false;
      if (skipStage) {
        recordStage("monitoring", "skipped", {}, stageStart);
        skipStage = false;
      } else {
        const regressionResult = await checkRegressionStatus(input.suiteId, 10);
        hasRegression = regressionResult.hasRegression;
        currentMetrics.hasRegression = hasRegression ? 1 : 0;
        await recordLoopIteration(loopId, "monitoring", {
          hasRegression: hasRegression ? 1 : 0,
        });
        recordStage(
          "monitoring",
          "completed",
          { hasRegression: hasRegression ? 1 : 0 },
          stageStart,
        );
      }
      workflowStatus = "running";
      await persistCheckpoint(`iter-${currentIteration}-monitoring`, stageHistory.length + 1);
      if (currentMetrics.hasRegression === 1) {
        stageCursor = "collecting";
        continue;
      }
      workflowStatus = "completed";
      break;
    }
  }

  currentStage = "idle";
  const totalDurationMs = Date.now() - startTime;
  const improvement = calculateTrainingImprovement(stageHistory, baselineScore);
  const status: TrainingLoopResult["status"] = isAborted
    ? "aborted"
    : workflowStatus === "failed" ||
        stageHistory.some((s) => s.status === "failed")
      ? "failed"
      : "completed";

  workflowStatus = status === "aborted" ? "aborted" : status === "failed" ? "failed" : "completed";
  await persistCheckpoint(`loop-${workflowStatus}`, stageHistory.length + 2);

  return {
    loopId,
    status,
    stages: stageHistory,
    improvement,
    totalDurationMs,
    iterations: currentIteration,
    ...(replaySource?.checkpointId
      ? { restoredFromCheckpointId: replaySource.checkpointId }
      : {}),
  };
}

function sanitizeTrainingLoopInput(
  input: TrainingLoopInput,
): Omit<TrainingLoopInput, "restoreFrom" | "restoredCheckpoint"> {
  const { restoreFrom: _restoreFrom, restoredCheckpoint: _restoredCheckpoint, ...rest } =
    input;
  return rest;
}

function determineResumeStage(
  state?: TrainingLoopCheckpointEnvelope["state"],
): TrainingLoopStage {
  if (!state) {
    return "collecting";
  }

  if (state.status === "completed" || state.status === "failed" || state.status === "aborted") {
    return "monitoring";
  }

  switch (state.currentStage) {
    case "idle":
      return "collecting";
    case "collecting":
      return "curating";
    case "curating":
      return "optimizing";
    case "optimizing":
      return "evaluating";
    case "evaluating":
      return "evaluating";
    case "deploying":
      return "monitoring";
    case "monitoring":
      return state.currentMetrics.hasRegression === 1 ? "collecting" : "monitoring";
  }
}

function buildTrainingLoopCheckpointManifest(params: {
  traceId: string;
  input: Omit<TrainingLoopInput, "restoreFrom" | "restoredCheckpoint">;
  restoredCheckpoint?: TrainingLoopCheckpointEnvelope;
  status: "running" | "completed" | "failed" | "aborted";
  stage: TrainingLoopStage;
  name: string;
  sequence: number;
}): EmitCheckpointManifest {
  const checkpointId =
    `${workflowInfo().workflowId}:${params.sequence}:${params.name}`.replace(/\s+/g, "-");

  return {
    format: "neon.checkpoint.v1",
    checkpointId,
    snapshotId: checkpointId,
    name: params.name,
    stateType: "training_loop",
    runtime: {
      projectId: params.input.projectId,
      traceId: params.traceId,
      workflowId: workflowInfo().workflowId,
      workflowRunId: workflowInfo().runId,
      agentId: params.input.promptId,
      capturedAt: new Date().toISOString(),
      sequence: params.sequence,
    },
    restore: {
      mode: params.restoredCheckpoint ? "replay" : "restore",
      target: "workflow",
      requiresApproval: true,
      replaysSideEffects: true,
    },
    integrity: {
      schemaVersion: "1",
    },
    metadata: {
      status: params.status,
      checkpointName: params.name,
      loopStage: params.stage,
      suiteId: params.input.suiteId,
      promptId: params.input.promptId,
      ...(params.restoredCheckpoint
        ? {
            sourceCheckpointId: params.restoredCheckpoint.checkpointId,
            sourceTraceId: params.restoredCheckpoint.traceId,
          }
        : {}),
    },
  };
}

function buildTrainingLoopReplayManifest(
  checkpoint: TrainingLoopCheckpointEnvelope,
  mode?: "restore" | "replay",
): EmitCheckpointManifest {
  return {
    format: "neon.checkpoint.v1",
    checkpointId: checkpoint.checkpointId,
    snapshotId: checkpoint.checkpointId,
    name: checkpoint.metadata?.checkpointName || "restored",
    stateType: "training_loop",
    payload: {
      kind: "uri",
      uri: `/api/checkpoints/${checkpoint.checkpointId}`,
      mimeType: "application/json",
    },
    runtime: {
      projectId: checkpoint.projectId,
      traceId: checkpoint.traceId,
      workflowId: checkpoint.workflowId,
      workflowRunId: checkpoint.workflowRunId,
      agentId: checkpoint.promptId,
      capturedAt: checkpoint.capturedAt,
      sequence: checkpoint.state.stageHistory.length + 1,
    },
    restore: {
      mode: mode ?? "replay",
      target: "workflow",
      requiresApproval: true,
      replaysSideEffects: true,
    },
    integrity: {
      schemaVersion: "1",
    },
    metadata: checkpoint.metadata,
  };
}

function calculateTrainingImprovement(
  stageHistory: TrainingLoopStageResult[],
  baselineScore: number,
): number {
  const evalScores = stageHistory
    .filter((stage) => stage.stage === "evaluating" && stage.status === "completed")
    .map((stage) => stage.metrics.evalScore ?? 0);

  return evalScores.length > 0 && baselineScore > 0
    ? (evalScores[evalScores.length - 1] - baselineScore) / baselineScore
    : 0;
}
