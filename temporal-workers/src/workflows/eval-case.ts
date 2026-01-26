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
  ToolDefinition,
  Message,
  AgentRunResult,
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

  // State
  let status: EvalCaseStatus = "pending";
  let scores: ScoreSnapshot[] = [];
  let cancelled = false;
  let agentResult: AgentRunResult | null = null;
  let error: string | undefined;

  // Set up query handlers
  setHandler(statusQuery, () => status);
  setHandler(scoresQuery, () => [...scores]);
  setHandler(cancelSignal, () => {
    cancelled = true;
  });

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

    if (cancelled) {
      return buildOutput("cancelled", traceId, startTime, scores, undefined, "Cancelled before agent execution");
    }

    // ========================================================================
    // STEP 2: Execute agent
    // ========================================================================
    status = "running_agent";

    if (input.mode === "lightweight") {
      // Lightweight mode: Single LLM call without full agent loop
      agentResult = await runLightweightAgent(input, traceId);
    } else {
      // Full mode: Run complete agent workflow
      agentResult = await runFullAgent(input, traceId);
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

    if (cancelled) {
      return buildOutput("cancelled", traceId, startTime, scores, agentResult, "Cancelled after scoring");
    }

    // ========================================================================
    // STEP 4: Determine overall pass/fail
    // ========================================================================
    status = "completed";
    const passed = scores.every((s) => s.passed !== false);

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
