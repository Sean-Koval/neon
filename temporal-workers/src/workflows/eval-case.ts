/**
 * Eval Case Workflow
 *
 * Executes a single evaluation test case with the following steps:
 * 1. Initialize trace context
 * 2. Execute the agent (full workflow or lightweight mode)
 * 3. Run configured scorers against the trace
 * 4. Determine pass/fail based on thresholds
 * 5. Return detailed results
 *
 * This workflow can be:
 * - Run standalone for single test execution
 * - Called as a child workflow from evalRunWorkflow
 * - Used for debugging specific test cases
 */

import {
  proxyActivities,
  executeChild,
  ParentClosePolicy,
  defineQuery,
  defineSignal,
  setHandler,
  workflowInfo,
  sleep,
} from "@temporalio/workflow";
import type * as activities from "../activities";
import { agentRunWorkflow } from "./agent-run";
import type {
  EvalCaseInput,
  EvalCaseOutput,
  AgentRunResult,
  EmitCheckpointManifest,
  EvalCaseCheckpointEnvelope,
  Message,
  ToolDefinition,
} from "../types";

// ============================================================================
// ACTIVITY PROXIES
// ============================================================================

const { llmCall, executeTool, emitSpan, scoreTrace } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "1s",
    maximumInterval: "30s",
    maximumAttempts: 5,
  },
});

const { captureEvalCaseCheckpoint } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "1s",
    maximumInterval: "30s",
    maximumAttempts: 3,
  },
});

// Scoring activities with longer timeout (LLM judges can be slow)
const { scoreTrace: scoreTraceWithRetry } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  retry: {
    initialInterval: "2s",
    maximumInterval: "1m",
    maximumAttempts: 3,
  },
});

// ============================================================================
// WORKFLOW QUERIES & SIGNALS
// ============================================================================

/** Query current execution status */
export const statusQuery = defineQuery<EvalCaseStatus>("status");

/** Query current scores (may be partial during execution) */
export const scoresQuery = defineQuery<ScoreSnapshot[]>("scores");

/** Signal to cancel execution */
export const cancelSignal = defineSignal("cancel");

// ============================================================================
// TYPES
// ============================================================================

export type EvalCaseStatus =
  | "pending"
  | "running_agent"
  | "scoring"
  | "completed"
  | "failed"
  | "cancelled";

export interface ScoreSnapshot {
  name: string;
  value: number;
  reason?: string;
  passed?: boolean;
}

// ============================================================================
// MAIN WORKFLOW
// ============================================================================

/**
 * Eval Case Workflow
 *
 * Executes a single test case and returns detailed results including:
 * - Agent execution trace
 * - All scores with reasoning
 * - Pass/fail determination
 * - Timing information
 */
export async function evalCaseWorkflow(
  input: EvalCaseInput
): Promise<EvalCaseOutput> {
  const startTime = Date.now();
  const workflowId = workflowInfo().workflowId;
  const traceId = input.traceId || `eval-case-${workflowId}`;
  const replaySource = input.restoreFrom;
  const restoredCheckpoint = input.restoredCheckpoint;
  const restoredState =
    replaySource?.mode === "restore" ? restoredCheckpoint?.state : undefined;

  // State
  let status: EvalCaseStatus = restoredState?.status ?? "pending";
  let scores: ScoreSnapshot[] = restoredState?.scores
    ? restoredState.scores.map((score) => ({ ...score }))
    : [];
  let cancelled = false;
  let agentResult: AgentRunResult | null = restoredState?.agentResult ?? null;
  let error: string | undefined = restoredState?.error;

  // Set up query handlers
  setHandler(statusQuery, () => status);
  setHandler(scoresQuery, () => [...scores]);
  setHandler(cancelSignal, () => {
    cancelled = true;
  });

  const persistCheckpoint = async (
    name: string,
    checkpointStatus: EvalCaseStatus
  ): Promise<void> => {
    const manifest = buildCheckpointManifest({
      traceId,
      input,
      restoredCheckpoint,
      status: checkpointStatus,
      name,
      sequence: checkpointSequence(checkpointStatus),
    });

    const result = await captureEvalCaseCheckpoint({
      projectId: input.projectId,
      traceId,
      caseId: input.caseId,
      runId: input.runId,
      agentId: input.agentId,
      agentVersion: input.agentVersion,
      workflowId: workflowInfo().workflowId,
      workflowRunId: workflowInfo().runId,
      input,
      state: {
        status: checkpointStatus,
        scores,
        ...(agentResult ? { agentResult } : {}),
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
        status: checkpointStatus,
      },
    });
  };

  try {
    // ========================================================================
    // STEP 1: Emit case start span
    // ========================================================================
    await emitSpan({
      traceId,
      spanType: "span",
      name: `eval-case:${input.caseId || workflowId}`,
      attributes: {
        "eval.case_id": input.caseId || workflowId,
        "eval.run_id": input.runId || "",
        "eval.agent_id": input.agentId,
        "eval.mode": input.mode || "full",
        "eval.scorers": input.scorers.join(","),
      },
    });

    if (restoredCheckpoint) {
      const replayManifest = buildReplayManifest(
        restoredCheckpoint,
        replaySource?.mode
      );
      await emitSpan({
        traceId,
        spanType: "event",
        name: "eval-case-restored",
        stateSnapshots: [
          {
            snapshotId: restoredCheckpoint.checkpointId,
            name: restoredCheckpoint.metadata?.checkpointName || "restored",
            stateType: "eval_case",
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
          "eval.case.restore_status": restoredState?.status ?? "pending",
        },
      });
    } else {
      await persistCheckpoint("case-start", status);
    }

    if (cancelled) {
      return buildOutput("cancelled", traceId, startTime, scores, undefined, "Cancelled before agent execution");
    }

    // ========================================================================
    // STEP 2: Execute agent
    // ========================================================================
    if (!(restoredState && agentResult)) {
      status = "running_agent";

      if (input.mode === "lightweight") {
        // Lightweight mode: Single LLM call without full agent loop
        agentResult = await runLightweightAgent(input, traceId);
      } else {
        // Full mode: Run complete agent workflow
        agentResult = await runFullAgent(input, traceId);
      }

      await persistCheckpoint("agent-complete", status);
    } else {
      await emitSpan({
        traceId,
        spanType: "event",
        name: "eval-case-agent-restored",
        attributes: {
          "neon.replay.source_checkpoint_id":
            replaySource?.checkpointId ??
            restoredCheckpoint?.checkpointId ??
            "",
          "eval.case.restore_status": restoredState.status,
          "eval.case.agent_trace_id": agentResult.traceId,
        },
      });
    }

    if (cancelled) {
      return buildOutput("cancelled", traceId, startTime, scores, agentResult, "Cancelled after agent execution");
    }

    // Check if agent failed
    if (agentResult.status === "failed") {
      return buildOutput("failed", traceId, startTime, scores, agentResult, agentResult.reason || "Agent execution failed");
    }

    // ========================================================================
    // STEP 3: Run scorers
    // ========================================================================
    const canReuseCompletedScores =
      replaySource?.mode === "restore" &&
      restoredState?.status === "completed" &&
      restoredState.scores.length > 0;

    if (!canReuseCompletedScores) {
      status = "scoring";

      const scoreResults = await scoreTraceWithRetry({
        traceId: agentResult.traceId,
        projectId: input.projectId,
        scorers: input.scorers,
        expected: input.expected,
        configId: input.configId,
      });

      // Convert to ScoreSnapshot with pass/fail
      scores = scoreResults.map((s) => ({
        name: s.name,
        value: s.value,
        reason: s.reason,
        passed: determinePassFail(s.name, s.value, input.thresholds),
      }));
      await persistCheckpoint("scored", status);
    }

    if (cancelled) {
      return buildOutput("cancelled", traceId, startTime, scores, agentResult, "Cancelled after scoring");
    }

    // ========================================================================
    // STEP 4: Determine overall pass/fail
    // ========================================================================
    status = "completed";
    const passed = scores.every((s) => s.passed !== false);
    await persistCheckpoint("completed", status);

    return buildOutput(
      "completed",
      traceId,
      startTime,
      scores,
      agentResult,
      undefined,
      passed
    );

  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    status = "failed";

    // Emit error span
    await emitSpan({
      traceId,
      spanType: "event",
      name: "eval-case-error",
      status: "error",
      statusMessage: error,
    });

    await persistCheckpoint("failed", status);

    return buildOutput("failed", traceId, startTime, scores, agentResult, error);
  }
}

// ============================================================================
// AGENT EXECUTION MODES
// ============================================================================

/**
 * Run agent in full mode using the agentRunWorkflow
 */
async function runFullAgent(
  input: EvalCaseInput,
  traceId: string
): Promise<AgentRunResult> {
  // Normalize input to Record<string, unknown>
  const normalizedInput: Record<string, unknown> = typeof input.input === "string"
    ? { query: input.input }
    : input.input;

  const result = await executeChild(agentRunWorkflow, {
    workflowId: `${workflowInfo().workflowId}-agent`,
    args: [
      {
        projectId: input.projectId,
        agentId: input.agentId,
        agentVersion: input.agentVersion || "eval",
        input: normalizedInput,
        tools: input.tools || [],
        maxIterations: input.maxIterations || 10,
        requireApproval: false, // Never require approval during eval
      },
    ],
    parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
  });

  return result;
}

/**
 * Run agent in lightweight mode - single LLM call without full agent loop
 * Useful for simple Q&A evaluation without tool usage
 */
async function runLightweightAgent(
  input: EvalCaseInput,
  traceId: string
): Promise<AgentRunResult> {
  const startTime = Date.now();

  try {
    // Build messages from input
    const messages: Message[] = [
      {
        role: "user",
        content: typeof input.input === "string"
          ? input.input
          : JSON.stringify(input.input),
      },
    ];

    // If there's a system prompt, we'll include it in the user message
    if (input.systemPrompt) {
      messages[0].content = `${input.systemPrompt}\n\n${messages[0].content}`;
    }

    // Single LLM call
    const llmResult = await llmCall({
      traceId,
      messages,
      tools: input.tools || [],
      model: input.model || "claude-3-5-sonnet-20241022",
    });

    // If there are tool calls, execute them (one iteration only)
    if (llmResult.toolCalls && llmResult.toolCalls.length > 0 && input.tools?.length) {
      for (const toolCall of llmResult.toolCalls) {
        await executeTool({
          traceId,
          toolName: toolCall.name,
          toolInput: toolCall.arguments,
        });
      }
    }

    return {
      traceId,
      status: "completed",
      output: llmResult.content,
      iterations: 1,
    };
  } catch (err) {
    return {
      traceId,
      status: "failed",
      iterations: 0,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function checkpointSequence(status: EvalCaseStatus): number {
  switch (status) {
    case "pending":
      return 1;
    case "running_agent":
      return 2;
    case "scoring":
      return 3;
    case "completed":
      return 4;
    case "failed":
      return 5;
    case "cancelled":
      return 6;
  }
}

function buildCheckpointManifest(params: {
  traceId: string;
  input: EvalCaseInput;
  restoredCheckpoint?: EvalCaseCheckpointEnvelope;
  status: EvalCaseStatus;
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
    stateType: "eval_case",
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
      replaysSideEffects: params.input.mode !== "lightweight",
    },
    integrity: {
      schemaVersion: "1",
    },
    metadata: {
      status: params.status,
      checkpointName: params.name,
      ...(params.input.caseId ? { caseId: params.input.caseId } : {}),
      ...(params.input.runId ? { runId: params.input.runId } : {}),
      ...(params.restoredCheckpoint
        ? {
            sourceCheckpointId: params.restoredCheckpoint.checkpointId,
            sourceTraceId: params.restoredCheckpoint.traceId,
          }
        : {}),
    },
  };
}

function buildReplayManifest(
  checkpoint: EvalCaseCheckpointEnvelope,
  mode: "restore" | "replay" | undefined
): EmitCheckpointManifest {
  return {
    format: "neon.checkpoint.v1",
    checkpointId: checkpoint.checkpointId,
    snapshotId: checkpoint.checkpointId,
    name: checkpoint.metadata?.checkpointName || "restored",
    stateType: "eval_case",
    payload: {
      kind: "uri",
      uri: `/api/checkpoints/${checkpoint.checkpointId}`,
    },
    runtime: {
      projectId: checkpoint.projectId,
      traceId: checkpoint.traceId,
      workflowId: checkpoint.workflowId,
      workflowRunId: checkpoint.workflowRunId,
      agentId: checkpoint.agentId,
      agentVersion: checkpoint.agentVersion,
      capturedAt: checkpoint.capturedAt,
    },
    restore: {
      mode: mode ?? "replay",
      target: "workflow",
      requiresApproval: false,
      replaysSideEffects: checkpoint.input.mode !== "lightweight",
    },
    integrity: {
      schemaVersion: "1",
    },
    metadata: checkpoint.metadata,
  };
}

/**
 * Determine if a score passes based on thresholds
 */
function determinePassFail(
  scorerName: string,
  value: number,
  thresholds?: Record<string, number>
): boolean {
  // Check scorer-specific threshold
  if (thresholds?.[scorerName] !== undefined) {
    return value >= thresholds[scorerName];
  }

  // Check default threshold
  if (thresholds?.default !== undefined) {
    return value >= thresholds.default;
  }

  // Default: 0.7 is passing
  return value >= 0.7;
}

/**
 * Build the output object
 */
function buildOutput(
  status: EvalCaseStatus,
  traceId: string,
  startTime: number,
  scores: ScoreSnapshot[],
  agentResult?: AgentRunResult | null,
  error?: string,
  passed?: boolean
): EvalCaseOutput {
  const durationMs = Date.now() - startTime;
  const avgScore = scores.length > 0
    ? scores.reduce((sum, s) => sum + s.value, 0) / scores.length
    : 0;

  // Determine passed if not explicitly set
  if (passed === undefined && status === "completed") {
    passed = scores.every((s) => s.passed !== false);
  }

  return {
    status,
    traceId,
    agentResult: agentResult || undefined,
    scores,
    passed: passed ?? false,
    avgScore,
    durationMs,
    error,
    metadata: {
      workflowId: workflowInfo().workflowId,
      runId: workflowInfo().runId,
    },
  };
}

// ============================================================================
// UTILITY WORKFLOWS
// ============================================================================

/**
 * Retry a failed eval case
 * Useful for re-running specific cases that failed due to transient errors
 */
export async function retryEvalCaseWorkflow(
  originalOutput: EvalCaseOutput,
  input: EvalCaseInput
): Promise<EvalCaseOutput> {
  // Wait a bit before retrying (exponential backoff handled by Temporal)
  await sleep("5 seconds");

  // Run the case again
  return evalCaseWorkflow({
    ...input,
    traceId: undefined, // Generate new trace ID
    caseId: `${input.caseId}-retry`,
  });
}
