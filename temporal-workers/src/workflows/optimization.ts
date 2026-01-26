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
} from "@temporalio/workflow";
import type * as activities from "../activities";
import { evalRunWorkflow } from "./eval-run";
import type { EvalRunResult, ToolDefinition, DatasetItem } from "../types";

const { emitSpan } = proxyActivities<typeof activities>({
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
  stageResults: Array<{
    stage: number;
    percentage: number;
    score: number;
    passed: boolean;
  }>;
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
  const stageResults: ProgressiveRolloutResult["stageResults"] = [];
  let currentStage = 0;
  const scores: number[] = [];

  setHandler(rolloutProgressQuery, () => ({
    currentStage,
    currentPercentage: params.stages[currentStage] ?? 0,
    scores: [...scores],
  }));

  // Emit rollout start span
  await emitSpan({
    traceId: `rollout-${params.rolloutId}`,
    spanType: "span",
    name: `progressive-rollout:${params.rolloutId}`,
    attributes: {
      "rollout.id": params.rolloutId,
      "rollout.new_agent": `${params.newAgent.agentId}@${params.newAgent.agentVersion}`,
      "rollout.stages": params.stages.join(","),
    },
  });

  for (let i = 0; i < params.stages.length; i++) {
    currentStage = i;
    const percentage = params.stages[i];

    // Run evaluation at this stage
    const evalResult = await executeChild(evalRunWorkflow, {
      workflowId: `${params.rolloutId}-stage-${i}`,
      args: [
        {
          runId: `${params.rolloutId}-stage-${i}`,
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
    });

    if (!passed) {
      // Abort rollout
      await emitSpan({
        traceId: `rollout-${params.rolloutId}`,
        spanType: "event",
        name: "rollout-aborted",
        attributes: {
          "rollout.stage": String(i),
          "rollout.score": String(stageScore),
          "rollout.minimum_score": String(params.minimumScore),
        },
      });

      return {
        rolloutId: params.rolloutId,
        finalStage: i,
        completed: false,
        aborted: true,
        abortReason: `Score ${stageScore.toFixed(2)} below minimum ${params.minimumScore} at stage ${i} (${percentage}%)`,
        stageResults,
      };
    }

    // Wait before next stage (unless this is the last stage)
    if (i < params.stages.length - 1) {
      await sleep(params.stageDurationMs);
    }
  }

  // Rollout complete
  await emitSpan({
    traceId: `rollout-${params.rolloutId}`,
    spanType: "span",
    name: "rollout-complete",
    attributes: {
      "rollout.final_score": String(scores[scores.length - 1]),
    },
  });

  return {
    rolloutId: params.rolloutId,
    finalStage: params.stages.length - 1,
    completed: true,
    aborted: false,
    stageResults,
  };
}
