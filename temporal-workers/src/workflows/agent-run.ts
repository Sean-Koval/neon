/**
 * Agent Run Workflow
 *
 * Durable execution workflow for AI agents.
 * Provides automatic retry, state preservation, and human-in-the-loop approval.
 */

import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  workflowInfo,
} from "@temporalio/workflow";
import type * as activities from "../activities";
import type {
  AgentRunInput,
  AgentRunResult,
  AgentRunCheckpointEnvelope,
  AgentStatus,
  AgentProgress,
  Message,
  EmitCheckpointManifest,
  EmitStateSnapshotReference,
  ToolDefinition,
} from "../types";

// Proxy activities with retry configuration
const { llmCall, executeTool, emitSpan, scoreTrace, captureAgentCheckpoint } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "1s",
    maximumInterval: "30s",
    maximumAttempts: 5,
  },
});

// Signals for external control
export const approvalSignal = defineSignal<[boolean, string?]>("approval");
export const cancelSignal = defineSignal("cancel");

// Queries for observability
export const statusQuery = defineQuery<AgentStatus>("status");
export const progressQuery = defineQuery<AgentProgress>("progress");

/**
 * Agent Run Workflow
 *
 * Executes an AI agent with durable execution guarantees:
 * - Automatic retry on LLM/tool failures
 * - State preserved across worker restarts
 * - Human-in-the-loop approval for sensitive operations
 * - Observability via queries and spans
 */
export async function agentRunWorkflow(
  params: AgentRunInput
): Promise<AgentRunResult> {
  const restoredCheckpoint = params.restoredCheckpoint;
  const restoredState = restoredCheckpoint?.state;
  const traceId = `trace-${params.projectId}-${workflowInfo().workflowId}`;
  const maxIterations = params.maxIterations ?? restoredState?.maxIterations ?? 10;
  const tools = params.tools?.length ? params.tools : restoredState?.tools ?? [];
  const requireApproval =
    params.requireApproval ?? restoredState?.requireApproval ?? false;
  let status: AgentStatus = restoredState?.status ?? "running";
  let iteration = restoredState?.iteration ?? 0;
  let cancelled = false;
  let awaitingApproval = false;
  let approvalResult: [boolean, string?] | null = null;
  const replaySource = params.restoreFrom ?? null;

  // Set up query handlers
  setHandler(statusQuery, () => status);
  setHandler(progressQuery, () => ({
    iteration,
    maxIterations,
  }));

  // Set up signal handlers
  setHandler(cancelSignal, () => {
    cancelled = true;
  });
  setHandler(approvalSignal, (approved: boolean, reason?: string) => {
    approvalResult = [approved, reason];
    awaitingApproval = false;
  });

  // Emit trace start span
  await emitSpan({
    traceId,
    spanType: "span",
    name: `agent-run:${params.agentId}`,
    attributes: {
      "agent.id": params.agentId,
      "agent.version": params.agentVersion,
      "workflow.id": workflowInfo().workflowId,
      "workflow.run_id": workflowInfo().runId,
      ...(replaySource?.checkpointId
        ? {
            "neon.replay.source_checkpoint_id": replaySource.checkpointId,
            "neon.replay.source_trace_id": replaySource.traceId,
            "neon.replay.mode": replaySource.mode ?? "replay",
          }
        : {}),
    },
  });

  // Initialize conversation
  const messages: Message[] = restoredState?.messages?.length
    ? [...restoredState.messages]
    : [
        {
          role: "user",
          content: JSON.stringify(params.input),
        },
      ];

  const persistCheckpoint = async (
    name: string,
    checkpointStatus: AgentStatus
  ): Promise<EmitStateSnapshotReference> => {
    const manifest = buildCheckpointManifest({
      traceId,
      params,
      restoredCheckpoint,
      iteration,
      status: checkpointStatus,
      name,
    });

    const result = await captureAgentCheckpoint({
      projectId: params.projectId,
      traceId,
      agentId: params.agentId,
      agentVersion: params.agentVersion,
      workflowId: workflowInfo().workflowId,
      workflowRunId: workflowInfo().runId,
      input: params.input,
      state: {
        iteration,
        maxIterations,
        status: checkpointStatus,
        messages,
        requireApproval,
        tools,
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
        iteration: String(iteration),
        status: checkpointStatus,
      },
    });

    return result.snapshot;
  };

  if (restoredCheckpoint) {
    await emitSpan({
      traceId,
      spanType: "event",
      name: "agent-run-restored",
      stateSnapshots: [
        {
          snapshotId: restoredCheckpoint.checkpointId,
          name: restoredCheckpoint.metadata?.checkpointName || "restored",
          stateType: "agent_run",
          checkpoint: buildReplayManifest(restoredCheckpoint, replaySource?.mode),
          uri:
            buildReplayManifest(restoredCheckpoint, replaySource?.mode).payload
              ?.uri,
          contentHash:
            buildReplayManifest(restoredCheckpoint, replaySource?.mode).integrity
              .contentHash,
        },
      ],
      attributes: {
        "neon.replay.source_checkpoint_id": replaySource?.checkpointId ?? restoredCheckpoint.checkpointId,
        "neon.replay.source_trace_id": replaySource?.traceId ?? restoredCheckpoint.traceId,
        "neon.replay.mode": replaySource?.mode ?? "replay",
        "neon.replay.restored_iteration": String(iteration),
      },
    });
  } else {
    await persistCheckpoint("agent-start", status);
  }

  // Agent execution loop
  while (iteration < maxIterations && !cancelled && status !== "completed") {
    iteration++;

    // Emit iteration span
    await emitSpan({
      traceId,
      spanType: "span",
      name: `iteration-${iteration}`,
      attributes: {
        iteration: String(iteration),
      },
    });

    // Make LLM call
    const llmResponse = await llmCall({
      traceId,
      messages,
      tools,
      model: "claude-3-5-sonnet-20241022",
    });

    // Check for tool calls
    if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
      for (const toolCall of llmResponse.toolCalls) {
        // Check if approval is required for sensitive tools
        if (
          requireApproval &&
          isSensitiveTool(toolCall.name)
        ) {
          status = "awaiting_approval";
          awaitingApproval = true;

          // Emit approval request span
          await emitSpan({
            traceId,
            spanType: "event",
            name: "approval-requested",
            attributes: {
              tool: toolCall.name,
              input: JSON.stringify(toolCall.arguments),
            },
          });

          // Wait for approval (can wait for days)
          await persistCheckpoint(`approval-${iteration}`, status);
          await condition(() => !awaitingApproval, "7 days");

          if (!approvalResult || !approvalResult[0]) {
            status = "rejected";
            return {
              traceId,
              status: "rejected",
              iterations: iteration,
              reason: approvalResult?.[1] || "Approval denied",
            };
          }

          status = "running";
        }

        // Execute the tool
        const toolResult = await executeTool({
          traceId,
          toolName: toolCall.name,
          toolInput: toolCall.arguments,
        });

        // Add tool result to conversation
        messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }

      // Add assistant message with tool calls
      messages.push({
        role: "assistant",
        content: llmResponse.content,
      });

      await persistCheckpoint(`iteration-${iteration}`, status);
    } else {
      // No tool calls, agent is done
      messages.push({
        role: "assistant",
        content: llmResponse.content,
      });
      status = "completed";
      await persistCheckpoint("completed", status);
      break;
    }
  }

  // Check if we hit max iterations
  if (iteration >= maxIterations && status !== "completed") {
    status = "completed"; // Mark as completed even if max iterations reached
    await persistCheckpoint("max-iterations", status);
  }

  // Run automatic evaluation
  await scoreTrace({
    traceId,
    projectId: params.projectId,
    scorers: ["tool_selection", "response_quality", "latency"],
  });

  // Emit trace end span
  await emitSpan({
    traceId,
    spanType: "span",
    name: "agent-run-complete",
    attributes: {
      status,
      iterations: String(iteration),
    },
  });

  return {
    traceId,
    status,
    output: messages[messages.length - 1].content,
    iterations: iteration,
    restoredFromCheckpointId: replaySource?.checkpointId,
  };
}

function buildCheckpointManifest(params: {
  traceId: string;
  params: AgentRunInput;
  restoredCheckpoint?: AgentRunCheckpointEnvelope;
  iteration: number;
  status: AgentStatus;
  name: string;
}): EmitCheckpointManifest {
  const checkpointId =
    `${workflowInfo().workflowId}:${params.iteration}:${params.name}`.replace(/\s+/g, "-");

  return {
    format: "neon.checkpoint.v1",
    checkpointId,
    snapshotId: checkpointId,
    name: params.name,
    stateType: "agent_run",
    runtime: {
      projectId: params.params.projectId,
      traceId: params.traceId,
      workflowId: workflowInfo().workflowId,
      workflowRunId: workflowInfo().runId,
      agentId: params.params.agentId,
      agentVersion: params.params.agentVersion,
      capturedAt: new Date().toISOString(),
      sequence: params.iteration,
    },
    restore: {
      mode: params.restoredCheckpoint ? "replay" : "restore",
      target: "workflow",
      requiresApproval: params.params.requireApproval ?? false,
      replaysSideEffects: true,
    },
    integrity: {
      schemaVersion: "1",
    },
    metadata: {
      status: params.status,
      checkpointName: params.name,
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
  checkpoint: AgentRunCheckpointEnvelope,
  mode: "restore" | "replay" | undefined
): EmitCheckpointManifest {
  return {
    format: "neon.checkpoint.v1",
    checkpointId: checkpoint.checkpointId,
    snapshotId: checkpoint.checkpointId,
    name: checkpoint.metadata?.checkpointName || "restored",
    stateType: "agent_run",
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
      sequence: checkpoint.state.iteration,
    },
    restore: {
      mode: mode ?? "replay",
      target: "workflow",
      requiresApproval: checkpoint.state.requireApproval,
      replaysSideEffects: true,
    },
    integrity: {
      schemaVersion: "1",
    },
    metadata: checkpoint.metadata,
  };
}

/**
 * Check if a tool requires human approval
 */
function isSensitiveTool(toolName: string): boolean {
  const sensitiveTools = [
    "delete",
    "remove",
    "drop",
    "destroy",
    "execute",
    "run",
    "shell",
    "bash",
    "sudo",
    "admin",
    "payment",
    "transfer",
    "send_email",
    "publish",
  ];

  return sensitiveTools.some(
    (sensitive) =>
      toolName.toLowerCase().includes(sensitive) ||
      toolName.startsWith("destructive_")
  );
}
