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
  const results: EvalCaseResult[] = [];
  const total = params.dataset.items.length;
  let completed = 0;
  let passed = 0;
  let failed = 0;
  let cancelled = false;
  let paused = false;

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

  // Emit eval run start span
  await emitSpan({
    traceId: `eval-run-${params.runId}`,
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

  // Run evaluation cases sequentially
  for (let i = 0; i < params.dataset.items.length; i++) {
    // Check for cancellation
    if (cancelled) {
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
  }

  // Calculate summary
  const summary = calculateSummary(results, params.scorers);

  // Emit eval run complete span
  await emitSpan({
    traceId: `eval-run-${params.runId}`,
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
