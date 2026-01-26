/**
 * Agent Types
 *
 * Types for agent definitions and execution.
 */

/**
 * Tool definition
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Agent definition
 */
export interface AgentDefinition {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  version: string;
  tools: ToolDefinition[];
  systemPrompt?: string;
  model?: string;
  config?: {
    maxIterations?: number;
    requireApproval?: boolean;
    timeout?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Agent execution status
 */
export type AgentStatus =
  | "running"
  | "awaiting_approval"
  | "completed"
  | "rejected"
  | "failed"
  | "cancelled";

/**
 * Agent execution progress
 */
export interface AgentProgress {
  iteration: number;
  maxIterations: number;
  status: AgentStatus;
}

/**
 * Agent execution result
 */
export interface AgentRunResult {
  traceId: string;
  status: AgentStatus;
  output?: string;
  iterations: number;
  reason?: string;
  durationMs: number;
}

/**
 * Input for starting an agent run
 */
export interface StartAgentRunInput {
  projectId: string;
  agentId: string;
  agentVersion?: string;
  input: Record<string, unknown>;
  tools?: ToolDefinition[];
  maxIterations?: number;
  requireApproval?: boolean;
}

/**
 * Message in a conversation
 */
export interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
}

/**
 * Tool call from LLM
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Workflow status from Temporal
 */
export interface WorkflowStatus {
  workflowId: string;
  runId: string;
  status: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "TERMINATED" | "TIMED_OUT";
  startTime: Date;
  closeTime?: Date;
  memo?: Record<string, unknown>;
}
