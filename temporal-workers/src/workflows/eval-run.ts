/**
 * Eval Run Workflow
 *
 * Orchestrates batch evaluation of agent performance.
 * Runs evaluation cases using the evalCaseWorkflow with configurable parallelism.
 *
 * Features:
 * - Sequential or parallel case execution
 * - Progress tracking via queries
 * - Automatic retry of failed cases
 * - Summary statistics with pass/fail counts
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
import { evalCaseWorkflow } from "./eval-case";
import type {
  EvalRunInput,
  EvalRunResult,
  EvalCaseResult,
  EvalCaseInput,
  EvalCaseOutput,
  EmitCheckpointManifest,
  EvalRunCheckpointEnvelope,
} from "../types";

// ============================================================================
// ACTIVITY PROXIES
// ============================================================================

const { emitSpan, sendNotifications } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
  retry: {
    initialInterval: "1s",
    maximumInterval: "10s",
    maximumAttempts: 3,
  },
});

const { captureEvalRunCheckpoint } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "1s",
    maximumInterval: "30s",
    maximumAttempts: 3,
  },
});

// ============================================================================
// QUERIES & SIGNALS
// ============================================================================

/** Query for overall progress */
export const progressQuery = defineQuery<{
  completed: number;
  total: number;
  passed: number;
  failed: number;
  results: EvalCaseResult[];
}>("progress");

/** Signal to cancel the entire run */
export const cancelRunSignal = defineSignal("cancelRun");

/** Signal to pause/resume processing */
export const pauseSignal = defineSignal<[boolean]>("pause");

// ============================================================================
// MAIN WORKFLOW
// ============================================================================

/**
 * Eval Run Workflow
 *
 * Orchestrates evaluation of an agent across a dataset:
 * 1. For each dataset item, runs evalCaseWorkflow as a child workflow
 * 2. Tracks progress and aggregates results
 * 3. Returns summary with pass/fail statistics
 *
 * Benefits of using Temporal:
 * - Evaluations can run for hours/days safely
 * - Automatic retry on failures
 * - Progress preserved if worker crashes
 * - Can be paused/resumed via signals
 */
export async function evalRunWorkflow(
  params: EvalRunInput
): Promise<EvalRunResult> {
  const traceId = `eval-run-${params.runId}`;
  const replaySource = params.restoreFrom;
  const restoredCheckpoint = params.restoredCheckpoint;
  const restoredState =
    replaySource?.mode === "restore" ? restoredCheckpoint?.state : undefined;
  const sanitizedInput = sanitizeEvalRunInput(params);
  const results: EvalCaseResult[] = restoredState?.results
    ? restoredState.results.map((result) => ({
        caseIndex: result.caseIndex,
        result: { ...result.result },
        scores: result.scores.map((score) => ({ ...score })),
      }))
    : [];
  const total = params.dataset.items.length;
  let completed = restoredState?.completed ?? results.length;
  let passed = restoredState?.passed ?? countPassedResults(results);
  let failed = restoredState?.failed ?? countFailedResults(results);
  let cancelled = false;
  let paused = false;
  let status: "running" | "completed" | "failed" | "cancelled" =
    restoredState?.status ?? "running";
  let error: string | undefined = restoredState?.error;
  let nextCaseIndex = Math.min(restoredState?.nextCaseIndex ?? completed, total);

  // Set up query handler
  setHandler(progressQuery, () => ({
    completed,
    total,
    passed,
    failed,
    results: [...results],
  }));

  // Set up signal handlers
  setHandler(cancelRunSignal, () => {
    cancelled = true;
  });
  setHandler(pauseSignal, (shouldPause: boolean) => {
    paused = shouldPause;
  });

  const persistCheckpoint = async (
    name: string,
    checkpointStatus: "running" | "completed" | "failed" | "cancelled",
    sequence: number,
  ): Promise<void> => {
    const manifest = buildEvalRunCheckpointManifest({
      traceId,
      input: sanitizedInput,
      restoredCheckpoint,
      status: checkpointStatus,
      name,
      sequence,
    });

    const result = await captureEvalRunCheckpoint({
      projectId: params.projectId,
      traceId,
      runId: params.runId,
      agentId: params.agentId,
      agentVersion: params.agentVersion,
      workflowId: workflowInfo().workflowId,
      workflowRunId: workflowInfo().runId,
      input: sanitizedInput,
      state: {
        status: checkpointStatus,
        completed,
        total,
        passed,
        failed,
        nextCaseIndex,
        results,
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
      stateSnapshots: [result.snapshot],
      attributes: {
        "checkpoint.id": result.manifest.checkpointId,
        "checkpoint.mode": result.manifest.restore.mode,
        "eval.run.status": checkpointStatus,
        "eval.run.completed": String(completed),
        "eval.run.total": String(total),
      },
    });
  };

  // Emit eval run start span
  await emitSpan({
    traceId,
    spanType: "span",
    name: `eval-run:${params.runId}`,
    attributes: {
      "eval.run_id": params.runId,
      "eval.dataset_size": String(total),
      "eval.agent_id": params.agentId,
      "eval.agent_version": params.agentVersion,
      "eval.scorers": params.scorers.join(","),
    },
  });

  if (restoredCheckpoint) {
    const replayManifest = buildEvalRunReplayManifest(
      restoredCheckpoint,
      replaySource?.mode
    );
    await emitSpan({
      traceId,
      spanType: "event",
      name: "eval-run-restored",
      stateSnapshots: [
        {
          snapshotId: restoredCheckpoint.checkpointId,
          name: restoredCheckpoint.metadata?.checkpointName || "restored",
          stateType: "eval_run",
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
        "eval.run.restore_completed": String(completed),
        "eval.run.restore_total": String(total),
      },
    });
  } else {
    await persistCheckpoint("run-start", status, 1);
  }

  // Run evaluation cases sequentially
  for (let i = nextCaseIndex; i < params.dataset.items.length; i++) {
    // Check for cancellation
    if (cancelled) {
      status = "cancelled";
      break;
    }

    // Wait if paused
    if (paused) {
      await condition(() => !paused || cancelled, "24 hours");
      if (cancelled) break;
    }

    const item = params.dataset.items[i];
    const caseId = `${params.runId}-case-${i}`;

    // Build case input
    const caseInput: EvalCaseInput = {
      caseId,
      runId: params.runId,
      projectId: params.projectId,
      agentId: params.agentId,
      agentVersion: params.agentVersion,
      input: item.input,
      expected: item.expected,
      tools: params.tools,
      scorers: params.scorers,
      mode: "full",
      maxIterations: 10,
    };

    try {
      // Run case as child workflow
      const caseOutput = await executeChild(evalCaseWorkflow, {
        workflowId: caseId,
        args: [caseInput],
        parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_ABANDON,
      });

      // Convert to EvalCaseResult format
      const caseResult: EvalCaseResult = {
        caseIndex: i,
        result: caseOutput.agentResult || {
          traceId: caseOutput.traceId,
          status: caseOutput.status === "completed" ? "completed" : "failed",
          iterations: 0,
          reason: caseOutput.error,
        },
        scores: caseOutput.scores.map((s) => ({
          name: s.name,
          value: s.value,
          reason: s.reason,
        })),
      };

      results.push(caseResult);

      // Update counters
      if (caseOutput.passed) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      // Record failed case
      results.push({
        caseIndex: i,
        result: {
          traceId: `${caseId}-failed`,
          status: "failed",
          iterations: 0,
          reason: error instanceof Error ? error.message : "Unknown error",
        },
        scores: [],
      });
      failed++;
    }

    completed++;
    nextCaseIndex = i + 1;
    status = "running";
    await persistCheckpoint(`case-${i}-complete`, status, completed + 1);
  }

  // Calculate summary
  const summary = calculateSummary(results, params.scorers);

  if (cancelled) {
    status = "cancelled";
    await persistCheckpoint("cancelled", status, total + 2);
  } else {
    status = "completed";
    await persistCheckpoint("completed", status, total + 2);
  }

  // Emit eval run complete span
  await emitSpan({
    traceId,
    spanType: "span",
    name: "eval-run-complete",
    attributes: {
      "eval.total": String(summary.total),
      "eval.passed": String(summary.passed),
      "eval.failed": String(summary.failed),
      "eval.avg_score": String(summary.avgScore.toFixed(3)),
      "eval.cancelled": String(cancelled),
    },
  });

  // Send notifications if configured
  if (params.notify && (params.notify.slackWebhookUrl || params.notify.webhookUrl)) {
    const info = workflowInfo();
    const durationMs = Date.now() - new Date(info.startTime).getTime();

    try {
      await sendNotifications(
        {
          runId: params.runId,
          projectId: params.projectId,
          agentId: params.agentId,
          agentVersion: params.agentVersion,
          total: summary.total,
          passed: summary.passed,
          failed: summary.failed,
          avgScore: summary.avgScore,
          duration: durationMs,
        },
        params.notify
      );
    } catch (notifyError) {
      // Log but don't fail the workflow for notification errors
      console.error("Failed to send notifications:", notifyError);
    }
  }

  return {
    runId: params.runId,
    results,
    summary,
    ...(replaySource?.checkpointId
      ? { restoredFromCheckpointId: replaySource.checkpointId }
      : {}),
  };
}

// ============================================================================
// PARALLEL EVAL RUN
// ============================================================================

/**
 * Parallel Eval Run Workflow
 *
 * Runs evaluation cases in parallel for faster execution.
 * Use when LLM rate limits allow concurrent requests.
 */
export async function parallelEvalRunWorkflow(
  params: EvalRunInput & { parallelism?: number }
): Promise<EvalRunResult> {
  const results: EvalCaseResult[] = [];
  const total = params.dataset.items.length;
  let completed = 0;
  let passed = 0;
  let failed = 0;
  const parallelism = params.parallelism ?? 5;

  setHandler(progressQuery, () => ({
    completed,
    total,
    passed,
    failed,
    results: [...results],
  }));

  // Emit start span
  await emitSpan({
    traceId: `eval-run-${params.runId}`,
    spanType: "span",
    name: `parallel-eval-run:${params.runId}`,
    attributes: {
      "eval.run_id": params.runId,
      "eval.dataset_size": String(total),
      "eval.parallelism": String(parallelism),
    },
  });

  // Process in batches
  for (let batch = 0; batch < total; batch += parallelism) {
    const batchItems = params.dataset.items.slice(batch, batch + parallelism);

    const batchPromises = batchItems.map(async (item, i) => {
      const caseIndex = batch + i;
      const caseId = `${params.runId}-case-${caseIndex}`;

      const caseInput: EvalCaseInput = {
        caseId,
        runId: params.runId,
        projectId: params.projectId,
        agentId: params.agentId,
        agentVersion: params.agentVersion,
        input: item.input,
        expected: item.expected,
        tools: params.tools,
        scorers: params.scorers,
        mode: "full",
        maxIterations: 10,
      };

      try {
        const caseOutput = await executeChild(evalCaseWorkflow, {
          workflowId: caseId,
          args: [caseInput],
          parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_ABANDON,
        });

        return {
          caseIndex,
          result: caseOutput.agentResult || {
            traceId: caseOutput.traceId,
            status: caseOutput.status === "completed" ? "completed" as const : "failed" as const,
            iterations: 0,
            reason: caseOutput.error,
          },
          scores: caseOutput.scores.map((s) => ({
            name: s.name,
            value: s.value,
            reason: s.reason,
          })),
          passed: caseOutput.passed,
        };
      } catch (error) {
        return {
          caseIndex,
          result: {
            traceId: `${caseId}-failed`,
            status: "failed" as const,
            iterations: 0,
            reason: error instanceof Error ? error.message : "Unknown error",
          },
          scores: [],
          passed: false,
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);

    for (const br of batchResults) {
      results.push({
        caseIndex: br.caseIndex,
        result: br.result,
        scores: br.scores,
      });
      if (br.passed) {
        passed++;
      } else {
        failed++;
      }
      completed++;
    }
  }

  const summary = calculateSummary(results, params.scorers);

  return {
    runId: params.runId,
    results,
    summary,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function sanitizeEvalRunInput(
  params: EvalRunInput
): Omit<EvalRunInput, "restoreFrom" | "restoredCheckpoint"> {
  const { restoreFrom: _restoreFrom, restoredCheckpoint: _restoredCheckpoint, ...input } =
    params;
  return input;
}

function countPassedResults(results: EvalCaseResult[]): number {
  return results.filter((result) => {
    if (result.result.status === "failed") {
      return false;
    }
    if (result.scores.length === 0) {
      return true;
    }
    const caseAvg =
      result.scores.reduce((sum, score) => sum + score.value, 0) /
      result.scores.length;
    return caseAvg >= 0.7;
  }).length;
}

function countFailedResults(results: EvalCaseResult[]): number {
  return results.length - countPassedResults(results);
}

function buildEvalRunCheckpointManifest(params: {
  traceId: string;
  input: Omit<EvalRunInput, "restoreFrom" | "restoredCheckpoint">;
  restoredCheckpoint?: EvalRunCheckpointEnvelope;
  status: "running" | "completed" | "failed" | "cancelled";
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
    stateType: "eval_run",
    runtime: {
      projectId: params.input.projectId,
      traceId: params.traceId,
      workflowId: workflowInfo().workflowId,
      workflowRunId: workflowInfo().runId,
      agentId: params.input.agentId,
      agentVersion: params.input.agentVersion,
      capturedAt: new Date().toISOString(),
      sequence: params.sequence,
    },
    restore: {
      mode: params.restoredCheckpoint ? "replay" : "restore",
      target: "workflow",
      requiresApproval: false,
      replaysSideEffects: true,
    },
    integrity: {
      schemaVersion: "1",
    },
    metadata: {
      status: params.status,
      checkpointName: params.name,
      runId: params.input.runId,
      ...(params.restoredCheckpoint
        ? {
            sourceCheckpointId: params.restoredCheckpoint.checkpointId,
            sourceTraceId: params.restoredCheckpoint.traceId,
          }
        : {}),
    },
  };
}

function buildEvalRunReplayManifest(
  checkpoint: EvalRunCheckpointEnvelope,
  mode?: "restore" | "replay"
): EmitCheckpointManifest {
  return {
    format: "neon.checkpoint.v1",
    checkpointId: checkpoint.checkpointId,
    snapshotId: checkpoint.checkpointId,
    name: checkpoint.metadata?.checkpointName || "restored",
    stateType: "eval_run",
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
      agentId: checkpoint.agentId,
      agentVersion: checkpoint.agentVersion,
      capturedAt: checkpoint.capturedAt,
      sequence: checkpoint.state.completed + 1,
    },
    restore: {
      mode: mode ?? "replay",
      target: "workflow",
      requiresApproval: false,
      replaysSideEffects: true,
    },
    integrity: {
      schemaVersion: "1",
    },
    metadata: checkpoint.metadata,
  };
}

/**
 * Calculate summary statistics from evaluation results
 */
function calculateSummary(
  results: EvalCaseResult[],
  scorerNames: string[]
): {
  total: number;
  passed: number;
  failed: number;
  avgScore: number;
} {
  const total = results.length;
  const failedCases = results.filter((r) => r.result.status === "failed").length;

  // Calculate average score across all scorers
  let totalScore = 0;
  let scoreCount = 0;

  for (const result of results) {
    for (const score of result.scores) {
      totalScore += score.value;
      scoreCount++;
    }
  }

  const avgScore = scoreCount > 0 ? totalScore / scoreCount : 0;

  // Consider a case "passed" if avg score >= 0.7
  const passedCases = results.filter((r) => {
    if (r.result.status === "failed") return false;
    if (r.scores.length === 0) return true; // No scores = passed by default
    const caseAvg =
      r.scores.reduce((sum, s) => sum + s.value, 0) / r.scores.length;
    return caseAvg >= 0.7;
  }).length;

  return {
    total,
    passed: passedCases,
    failed: total - passedCases,
    avgScore,
  };
}
