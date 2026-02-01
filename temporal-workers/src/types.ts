/**
 * Shared types for Temporal workers
 */

/**
 * Tool definition for agent execution
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
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
 * Tool call from LLM response
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
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
 * Progress information for agent execution
 */
export interface AgentProgress {
  iteration: number;
  maxIterations: number;
}

/**
 * Input for agent run workflow
 */
export interface AgentRunInput {
  projectId: string;
  agentId: string;
  agentVersion: string;
  input: Record<string, unknown>;
  tools: ToolDefinition[];
  maxIterations?: number;
  requireApproval?: boolean;
}

/**
 * Result from agent run workflow
 */
export interface AgentRunResult {
  traceId: string;
  status: AgentStatus;
  output?: string;
  iterations: number;
  reason?: string;
}

/**
 * Input for LLM call activity
 */
export interface LLMCallParams {
  traceId: string;
  messages: Message[];
  tools: ToolDefinition[];
  model: string;
}

/**
 * Result from LLM call activity
 */
export interface LLMCallResult {
  content: string;
  toolCalls?: ToolCall[];
}

/**
 * Input for tool execution activity
 */
export interface ToolExecuteParams {
  traceId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

/**
 * Input for span emission activity
 */
export interface EmitSpanParams {
  traceId: string;
  spanId?: string;
  parentSpanId?: string;
  spanType: "span" | "generation" | "tool" | "retrieval" | "event";
  name: string;
  input?: string;
  output?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  status?: "unset" | "ok" | "error";
  statusMessage?: string;
  toolName?: string;
  toolInput?: string;
  toolOutput?: string;
  attributes?: Record<string, string>;
}

/**
 * Input for score trace activity
 */
export interface ScoreTraceParams {
  traceId: string;
  projectId: string;
  scorers: string[];
  configId?: string;
  expected?: Record<string, unknown>;
}

/**
 * Scorer definition for configuring evaluation metrics
 *
 * Types:
 * - rule_based: Fast, deterministic (contains, regex, tool_selection)
 * - llm_judge: Uses Claude to evaluate quality metrics
 * - custom: User-defined scoring logic
 */
export interface ScorerDefinition {
  name: string;
  type: "llm_judge" | "rule_based" | "custom";
  /** Description of what this scorer evaluates */
  description?: string;
  /** Model for LLM judge (default: claude-3-haiku) */
  model?: string;
  /** Custom prompt for LLM judge */
  prompt?: string;
  /** Rules/parameters for rule-based scorers */
  rules?: Record<string, unknown>;
  /** Pass threshold for pass/fail determination (0-1) */
  threshold?: number;
  /** Categories for categorical scores */
  categories?: string[];
}

/**
 * Dataset item for evaluation
 */
export interface DatasetItem {
  input: Record<string, unknown>;
  expected?: Record<string, unknown>;
}

/**
 * Notification configuration for eval runs
 */
export interface NotifyConfig {
  /** Slack webhook URL */
  slackWebhookUrl?: string;
  /** Generic webhook URL */
  webhookUrl?: string;
  /** Dashboard URL for linking to results */
  dashboardUrl?: string;
  /** Whether to send on success */
  notifyOnSuccess?: boolean;
  /** Whether to send on failure (default: true) */
  notifyOnFailure?: boolean;
  /** Score threshold below which to notify */
  scoreThreshold?: number;
}

/**
 * Input for eval run workflow
 */
export interface EvalRunInput {
  runId: string;
  projectId: string;
  agentId: string;
  agentVersion: string;
  dataset: {
    items: DatasetItem[];
  };
  tools: ToolDefinition[];
  scorers: string[];
  /** Notification configuration (optional) */
  notify?: NotifyConfig;
}

/**
 * Result from a single eval case
 */
export interface EvalCaseResult {
  caseIndex: number;
  result: AgentRunResult;
  scores: Array<{
    name: string;
    value: number;
    reason?: string;
  }>;
}

/**
 * Result from eval run workflow
 */
export interface EvalRunResult {
  runId: string;
  results: EvalCaseResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    avgScore: number;
  };
}

// ============================================================================
// EVAL CASE WORKFLOW TYPES
// ============================================================================

/**
 * Input for a single eval case workflow
 */
export interface EvalCaseInput {
  /** Unique case identifier */
  caseId?: string;
  /** Parent eval run ID (if part of a batch) */
  runId?: string;
  /** Project ID for storing results */
  projectId: string;
  /** Agent ID being evaluated */
  agentId: string;
  /** Agent version being evaluated */
  agentVersion?: string;
  /** Test input (passed to agent) */
  input: Record<string, unknown> | string;
  /** Expected output/behavior for scoring */
  expected?: Record<string, unknown>;
  /** Tools available to the agent */
  tools?: ToolDefinition[];
  /** Scorers to run */
  scorers: string[];
  /** Score config ID (for referencing stored configs) */
  configId?: string;
  /** Pass/fail thresholds per scorer or default */
  thresholds?: Record<string, number>;
  /** Execution mode: full agent loop or lightweight single call */
  mode?: "full" | "lightweight";
  /** Max iterations for full mode */
  maxIterations?: number;
  /** Model to use (for lightweight mode) */
  model?: string;
  /** System prompt (for lightweight mode) */
  systemPrompt?: string;
  /** Custom trace ID (auto-generated if not provided) */
  traceId?: string;
}

/**
 * Output from a single eval case workflow
 */
export interface EvalCaseOutput {
  /** Execution status */
  status: "pending" | "running_agent" | "scoring" | "completed" | "failed" | "cancelled";
  /** Trace ID for this case */
  traceId: string;
  /** Agent execution result (if completed) */
  agentResult?: AgentRunResult;
  /** All scores with pass/fail */
  scores: Array<{
    name: string;
    value: number;
    reason?: string;
    passed?: boolean;
  }>;
  /** Overall pass/fail */
  passed: boolean;
  /** Average score across all scorers */
  avgScore: number;
  /** Total execution time in ms */
  durationMs: number;
  /** Error message (if failed) */
  error?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}
