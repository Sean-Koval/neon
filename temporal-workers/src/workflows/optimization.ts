/**
 * Optimization Workflow
 *
 * Orchestrates A/B testing and optimization experiments for agents.
 */

import {
  proxyActivities,
  executeChild,
  ParentClosePolicy,
  defineQuery,
  setHandler,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";
import type * as activities from "../activities";
import { evalRunWorkflow } from "./eval-run";
import type {
  DatasetItem,
  EmitCheckpointManifest,
  EvalRunResult,
  ProgressiveRolloutCheckpointEnvelope,
  ProgressiveRolloutStageResult,
  ToolDefinition,
} from "../types";

const { emitSpan, captureProgressiveRolloutCheckpoint } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "5 minutes",
});

/**
 * A/B Test configuration
 */
export interface ABTestInput {
  experimentId: string;
  projectId: string;
  /** Variant A configuration */
  variantA: {
    agentId: string;
    agentVersion: string;
    tools: ToolDefinition[];
  };
  /** Variant B configuration */
  variantB: {
    agentId: string;
    agentVersion: string;
    tools: ToolDefinition[];
  };
  /** Dataset for evaluation */
  dataset: {
    items: DatasetItem[];
  };
  /** Scorers to use */
  scorers: string[];
  /** Minimum improvement threshold to declare winner (default 0.05 = 5%) */
  significanceThreshold?: number;
}

/**
 * A/B Test result
 */
export interface ABTestResult {
  experimentId: string;
  variantAResult: EvalRunResult;
  variantBResult: EvalRunResult;
  winner: "A" | "B" | "tie";
  improvement: number;
  confidence: number;
  recommendation: string;
}

// Query for A/B test progress
export const abTestProgressQuery = defineQuery<{
  variantAComplete: boolean;
  variantBComplete: boolean;
  variantAScore?: number;
  variantBScore?: number;
}>("abTestProgress");

/**
 * A/B Test Workflow
 *
 * Compares two agent configurations:
 * 1. Runs evaluation on both variants
 * 2. Compares scores
 * 3. Determines winner with statistical significance
 */
export async function abTestWorkflow(params: ABTestInput): Promise<ABTestResult> {
  let variantAComplete = false;
  let variantBComplete = false;
  let variantAScore: number | undefined;
  let variantBScore: number | undefined;

  setHandler(abTestProgressQuery, () => ({
    variantAComplete,
    variantBComplete,
    variantAScore,
    variantBScore,
  }));

  // Emit experiment start span
  await emitSpan({
    traceId: `experiment-${params.experimentId}`,
    spanType: "span",
    name: `ab-test:${params.experimentId}`,
    attributes: {
      "experiment.id": params.experimentId,
      "experiment.variant_a_agent": params.variantA.agentId,
      "experiment.variant_b_agent": params.variantB.agentId,
    },
  });

  // Run both variants in parallel
  const [variantAResult, variantBResult] = await Promise.all([
    // Variant A
    (async () => {
      const result = await executeChild(evalRunWorkflow, {
        workflowId: `${params.experimentId}-variant-a`,
        args: [
          {
            runId: `${params.experimentId}-variant-a`,
            projectId: params.projectId,
            agentId: params.variantA.agentId,
            agentVersion: params.variantA.agentVersion,
            dataset: params.dataset,
            tools: params.variantA.tools,
            scorers: params.scorers,
          },
        ],
        parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_ABANDON,
      });
      variantAComplete = true;
      variantAScore = result.summary.avgScore;
      return result;
    })(),

    // Variant B
    (async () => {
      const result = await executeChild(evalRunWorkflow, {
        workflowId: `${params.experimentId}-variant-b`,
        args: [
          {
            runId: `${params.experimentId}-variant-b`,
            projectId: params.projectId,
            agentId: params.variantB.agentId,
            agentVersion: params.variantB.agentVersion,
            dataset: params.dataset,
            tools: params.variantB.tools,
            scorers: params.scorers,
          },
        ],
        parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_ABANDON,
      });
      variantBComplete = true;
      variantBScore = result.summary.avgScore;
      return result;
    })(),
  ]);

  // Calculate improvement and determine winner
  const threshold = params.significanceThreshold ?? 0.05;
  const improvement =
    variantBResult.summary.avgScore - variantAResult.summary.avgScore;
  const relativeImprovement =
    variantAResult.summary.avgScore > 0
      ? improvement / variantAResult.summary.avgScore
      : improvement;

  let winner: "A" | "B" | "tie";
  let recommendation: string;
  let confidence: number;

  if (Math.abs(relativeImprovement) < threshold) {
    winner = "tie";
    confidence = 1 - Math.abs(relativeImprovement) / threshold;
    recommendation = `No significant difference between variants. Consider running with more data or adjusting the threshold.`;
  } else if (improvement > 0) {
    winner = "B";
    confidence = Math.min(1, relativeImprovement / threshold);
    recommendation = `Variant B (${params.variantB.agentId}@${params.variantB.agentVersion}) outperforms Variant A by ${(relativeImprovement * 100).toFixed(1)}%. Recommend deploying Variant B.`;
  } else {
    winner = "A";
    confidence = Math.min(1, Math.abs(relativeImprovement) / threshold);
    recommendation = `Variant A (${params.variantA.agentId}@${params.variantA.agentVersion}) outperforms Variant B by ${(Math.abs(relativeImprovement) * 100).toFixed(1)}%. Recommend keeping Variant A.`;
  }

  // Emit experiment complete span
  await emitSpan({
    traceId: `experiment-${params.experimentId}`,
    spanType: "span",
    name: "ab-test-complete",
    attributes: {
      "experiment.winner": winner,
      "experiment.improvement": String(improvement),
      "experiment.confidence": String(confidence),
    },
  });

  return {
    experimentId: params.experimentId,
    variantAResult,
    variantBResult,
    winner,
    improvement,
    confidence,
    recommendation,
  };
}

/**
 * Progressive Rollout configuration
 */
export interface ProgressiveRolloutInput {
  rolloutId: string;
  projectId: string;
  /** Current production agent */
  currentAgent: {
    agentId: string;
    agentVersion: string;
    tools: ToolDefinition[];
  };
  /** New agent to roll out */
  newAgent: {
    agentId: string;
    agentVersion: string;
    tools: ToolDefinition[];
  };
  /** Dataset for continuous evaluation */
  dataset: {
    items: DatasetItem[];
  };
  /** Scorers to use */
  scorers: string[];
  /** Rollout stages (percentage of traffic) */
  stages: number[]; // e.g., [10, 25, 50, 100]
  /** Minimum score to continue rollout */
  minimumScore: number;
  /** Time between stages */
  stageDurationMs: number;
  restoreFrom?: {
    checkpointId: string;
    traceId: string;
    mode?: "restore" | "replay";
  };
  restoredCheckpoint?: ProgressiveRolloutCheckpointEnvelope;
}

/**
 * Progressive Rollout result
 */
export interface ProgressiveRolloutResult {
  rolloutId: string;
  finalStage: number;
  completed: boolean;
  aborted: boolean;
  abortReason?: string;
  stageResults: ProgressiveRolloutStageResult[];
  restoredFromCheckpointId?: string;
}

// Query for rollout progress
export const rolloutProgressQuery = defineQuery<{
  currentStage: number;
  currentPercentage: number;
  scores: number[];
}>("rolloutProgress");

/**
 * Progressive Rollout Workflow
 *
 * Gradually rolls out a new agent version:
 * 1. Starts with small traffic percentage
 * 2. Evaluates performance at each stage
 * 3. Increases traffic if performance meets threshold
 * 4. Aborts if performance degrades
 */
export async function progressiveRolloutWorkflow(
  params: ProgressiveRolloutInput
): Promise<ProgressiveRolloutResult> {
  const info = workflowInfo();
  const traceId = `rollout-${params.rolloutId}`;
  const replaySource = params.restoreFrom;
  const restoredCheckpoint = params.restoredCheckpoint;
  const restoredState =
    replaySource?.mode === "restore" ? restoredCheckpoint?.state : undefined;
  const sanitizedInput = sanitizeProgressiveRolloutInput(params);
  const stageResults: ProgressiveRolloutResult["stageResults"] =
    restoredState?.stageResults.map((stage) => ({ ...stage })) ?? [];
  let currentStage = restoredState?.currentStageIndex ?? 0;
  const scores: number[] = restoredState?.scores
    ? [...restoredState.scores]
    : [];
  let workflowStatus: "running" | "completed" | "aborted" | "failed" =
    restoredState?.status ?? "running";
  let abortReason = restoredState?.abortReason;
  let error = restoredState?.error;

  const persistCheckpoint = async (
    name: string,
    sequence: number
  ): Promise<void> => {
    const manifest = buildProgressiveRolloutCheckpointManifest({
      traceId,
      input: sanitizedInput,
      restoredCheckpoint,
      status: workflowStatus,
      stageIndex: currentStage,
      name,
      sequence,
    });

    const checkpoint = await captureProgressiveRolloutCheckpoint({
      projectId: params.projectId,
      traceId,
      rolloutId: params.rolloutId,
      workflowId: info.workflowId,
      workflowRunId: info.runId,
      input: sanitizedInput,
      state: {
        status: workflowStatus,
        currentStageIndex: currentStage,
        currentPercentage: params.stages[currentStage] ?? 0,
        stages: [...params.stages],
        scores: [...scores],
        stageResults: stageResults.map((stage) => ({ ...stage })),
        nextStageIndex:
          workflowStatus === "running"
            ? Math.min(stageResults.length, params.stages.length)
            : stageResults.length,
        ...(abortReason ? { abortReason } : {}),
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
        "rollout.stage": String(currentStage),
        "rollout.stage_count": String(stageResults.length),
      },
    });
  };

  setHandler(rolloutProgressQuery, () => ({
    currentStage,
    currentPercentage: params.stages[currentStage] ?? 0,
    scores: [...scores],
  }));

  // Emit rollout start span
  await emitSpan({
    traceId,
    spanType: "span",
    name: `progressive-rollout:${params.rolloutId}`,
    attributes: {
      "rollout.id": params.rolloutId,
      "rollout.new_agent": `${params.newAgent.agentId}@${params.newAgent.agentVersion}`,
      "rollout.stages": params.stages.join(","),
      ...(replaySource?.checkpointId
        ? {
            "rollout.restored_from_checkpoint": replaySource.checkpointId,
            "rollout.restore_mode": replaySource.mode ?? "replay",
            "rollout.source_trace_id": replaySource.traceId,
          }
        : {}),
    },
  });

  if (replaySource?.checkpointId) {
    await emitSpan({
      traceId,
      spanType: "event",
      name: "progressive-rollout-restored",
      attributes: {
        "rollout.source_checkpoint_id": replaySource.checkpointId,
        "rollout.restore_mode": replaySource.mode ?? "replay",
        "rollout.resumed_stage": String(restoredState?.nextStageIndex ?? 0),
      },
    });
  }

  await persistCheckpoint("rollout-start", 1);

  for (let i = restoredState?.nextStageIndex ?? 0; i < params.stages.length; i++) {
    currentStage = i;
    const percentage = params.stages[i];
    const stageRunId = `${params.rolloutId}-stage-${i}`;

    // Run evaluation at this stage
    const evalResult = await executeChild(evalRunWorkflow, {
      workflowId: stageRunId,
      args: [
        {
          runId: stageRunId,
          projectId: params.projectId,
          agentId: params.newAgent.agentId,
          agentVersion: params.newAgent.agentVersion,
          dataset: params.dataset,
          tools: params.newAgent.tools,
          scorers: params.scorers,
        },
      ],
      parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_ABANDON,
    });

    const stageScore = evalResult.summary.avgScore;
    scores.push(stageScore);

    const passed = stageScore >= params.minimumScore;

    stageResults.push({
      stage: i,
      percentage,
      score: stageScore,
      passed,
      runId: evalResult.runId,
    });

    await persistCheckpoint(`stage-${i}`, i + 2);

    if (!passed) {
      // Abort rollout
      workflowStatus = "aborted";
      abortReason = `Score ${stageScore.toFixed(2)} below minimum ${params.minimumScore} at stage ${i} (${percentage}%)`;

      await emitSpan({
        traceId,
        spanType: "event",
        name: "rollout-aborted",
        attributes: {
          "rollout.stage": String(i),
          "rollout.score": String(stageScore),
          "rollout.minimum_score": String(params.minimumScore),
        },
      });

      await persistCheckpoint(`stage-${i}-aborted`, params.stages.length + i + 2);

      return {
        rolloutId: params.rolloutId,
        finalStage: i,
        completed: false,
        aborted: true,
        abortReason,
        stageResults,
        ...(replaySource?.checkpointId
          ? {
              restoredFromCheckpointId: replaySource.checkpointId,
            }
          : {}),
      };
    }

    // Wait before next stage (unless this is the last stage)
    if (i < params.stages.length - 1) {
      await sleep(params.stageDurationMs);
    }
  }

  // Rollout complete
  workflowStatus = "completed";
  await emitSpan({
    traceId,
    spanType: "span",
    name: "rollout-complete",
    attributes: {
      "rollout.final_score": String(scores[scores.length - 1]),
    },
  });

  await persistCheckpoint("rollout-complete", params.stages.length + 2);

  return {
    rolloutId: params.rolloutId,
    finalStage: params.stages.length - 1,
    completed: true,
    aborted: false,
    stageResults,
    ...(replaySource?.checkpointId
      ? {
          restoredFromCheckpointId: replaySource.checkpointId,
        }
      : {}),
  };
}

function sanitizeProgressiveRolloutInput(
  input: ProgressiveRolloutInput
): Omit<ProgressiveRolloutInput, "restoreFrom" | "restoredCheckpoint"> {
  const { restoreFrom: _restoreFrom, restoredCheckpoint: _restoredCheckpoint, ...sanitized } =
    input;
  return sanitized;
}

function buildProgressiveRolloutCheckpointManifest(params: {
  traceId: string;
  input: Omit<ProgressiveRolloutInput, "restoreFrom" | "restoredCheckpoint">;
  restoredCheckpoint?: ProgressiveRolloutCheckpointEnvelope;
  status: "running" | "completed" | "aborted" | "failed";
  stageIndex: number;
  name: string;
  sequence: number;
}): EmitCheckpointManifest {
  const capturedAt = new Date().toISOString();
  const stateType = "progressive_rollout";

  return {
    format: "neon.checkpoint.v1",
    checkpointId: `${params.traceId}-${params.name}-${params.sequence}`,
    snapshotId: `${params.traceId}-${params.name}-${params.sequence}`,
    name: params.name,
    stateType,
    runtime: {
      projectId: params.input.projectId,
      traceId: params.traceId,
      workflowId: workflowInfo().workflowId,
      workflowRunId: workflowInfo().runId,
      agentId: params.input.newAgent.agentId,
      agentVersion: params.input.newAgent.agentVersion,
      capturedAt,
      sequence: params.sequence,
    },
    restore: {
      mode:
        params.restoredCheckpoint && params.status !== "completed"
          ? "restore"
          : "replay",
      target: "workflow",
      requiresApproval: false,
      replaysSideEffects: true,
    },
    integrity: {
      schemaVersion: "1",
    },
    metadata: {
      "rollout.id": params.input.rolloutId,
      "rollout.stage": String(params.stageIndex),
      "rollout.status": params.status,
      ...(params.restoredCheckpoint
        ? {
            sourceCheckpointId: params.restoredCheckpoint.checkpointId,
          }
        : {}),
    },
  };
}
