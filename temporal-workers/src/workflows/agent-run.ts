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
  AgentStatus,
  AgentProgress,
  Message,
} from "../types";

// Proxy activities with retry configuration
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
  const traceId = `trace-${params.projectId}-${workflowInfo().workflowId}`;
  let status: AgentStatus = "running";
  let iteration = 0;
  let cancelled = false;
  let awaitingApproval = false;
  let approvalResult: [boolean, string?] | null = null;

  // Set up query handlers
  setHandler(statusQuery, () => status);
  setHandler(progressQuery, () => ({
    iteration,
    maxIterations: params.maxIterations ?? 10,
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
    },
  });

  // Initialize conversation
  const messages: Message[] = [
    {
      role: "user",
      content: JSON.stringify(params.input),
    },
  ];

  // Agent execution loop
  while (iteration < (params.maxIterations ?? 10) && !cancelled) {
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
      tools: params.tools,
      model: "claude-3-5-sonnet-20241022",
    });

    // Check for tool calls
    if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
      for (const toolCall of llmResponse.toolCalls) {
        // Check if approval is required for sensitive tools
        if (
          params.requireApproval &&
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
    } else {
      // No tool calls, agent is done
      messages.push({
        role: "assistant",
        content: llmResponse.content,
      });
      status = "completed";
      break;
    }
  }

  // Check if we hit max iterations
  if (iteration >= (params.maxIterations ?? 10) && status !== "completed") {
    status = "completed"; // Mark as completed even if max iterations reached
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
