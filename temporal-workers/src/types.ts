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
  restoreFrom?: AgentReplaySource;
  restoredCheckpoint?: AgentRunCheckpointEnvelope;
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
  restoredFromCheckpointId?: string;
}

export interface AgentRunCheckpointState {
  iteration: number;
  maxIterations: number;
  status: AgentStatus;
  messages: Message[];
  requireApproval: boolean;
  tools: ToolDefinition[];
}

export interface AgentRunCheckpointEnvelope {
  format: "neon.checkpoint-body.v1";
  kind: "agent_run";
  checkpointId: string;
  traceId: string;
  projectId: string;
  agentId: string;
  agentVersion?: string;
  capturedAt: string;
  workflowId?: string;
  workflowRunId?: string;
  state: AgentRunCheckpointState;
  input: Record<string, unknown>;
  metadata?: Record<string, string>;
}

export interface AgentReplaySource {
  checkpointId: string;
  traceId: string;
  mode?: "restore" | "replay";
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
 * Skill selection context for span emission
 */
export interface EmitSkillSelectionContext {
  /** The skill/tool that was selected */
  selectedSkill: string;
  /** Category of the selected skill */
  skillCategory?: "code" | "search" | "file" | "data" | "communication" | "browser" | "system" | "custom";
  /** Confidence score (0-1) in the selection */
  selectionConfidence?: number;
  /** Reasoning for why this skill was selected */
  selectionReason?: string;
  /** Other skills that were considered but not selected */
  alternativesConsidered?: string[];
  /** Scores for alternatives */
  alternativeScores?: number[];
}

/**
 * MCP execution context for span emission
 */
export interface EmitMCPContext {
  /** MCP server identifier */
  serverId: string;
  /** MCP server URL or path */
  serverUrl?: string;
  /** Tool identifier within the MCP server */
  toolId: string;
  /** MCP protocol version */
  protocolVersion?: string;
  /** Transport mechanism used */
  transport?: "stdio" | "http" | "websocket";
  /** Capabilities exposed by the server */
  capabilities?: string[];
  /** MCP-specific error code if failed */
  errorCode?: string;
}

/**
 * Decision metadata for span emission
 */
export interface EmitDecisionMetadata {
  /** Whether this action was explicitly requested by the user */
  wasUserInitiated?: boolean;
  /** Whether this is a fallback action after a failure */
  isFallback?: boolean;
  /** Number of retry attempts for this operation */
  retryCount?: number;
  /** ID of the original span this is retrying */
  originalSpanId?: string;
  /** Whether approval was required for this action */
  requiredApproval?: boolean;
  /** Whether approval was granted */
  approvalGranted?: boolean;
}

export interface EmitSessionContext {
  sessionId: string;
  conversationId?: string;
  userId?: string;
  threadId?: string;
}

export interface EmitMessageContentPart {
  type: "text" | "image" | "audio" | "tool_call" | "tool_result" | "json" | "other";
  text?: string;
  mimeType?: string;
  data?: string;
  metadata?: Record<string, string>;
}

export interface EmitMessageToolCall {
  id: string;
  name: string;
  arguments?: string;
}

export interface EmitTraceMessage {
  role: "system" | "user" | "assistant" | "tool" | "developer" | "other";
  content: string;
  messageId?: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: EmitMessageToolCall[];
  parts?: EmitMessageContentPart[];
  metadata?: Record<string, string>;
}

export interface EmitHandoffMetadata {
  handoffType: "handoff" | "delegation" | "routing";
  fromAgentId?: string;
  toAgentId: string;
  fromSpanId?: string;
  toSpanId?: string;
  reason?: string;
  taskDescription?: string;
  contextSummary?: string;
  messageId?: string;
  metadata?: Record<string, string>;
}

export interface EmitArtifactReference {
  artifactId?: string;
  name: string;
  kind: "file" | "document" | "image" | "audio" | "json" | "url" | "other";
  uri?: string;
  mimeType?: string;
  contentHash?: string;
  sizeBytes?: number;
  metadata?: Record<string, string>;
}

export interface EmitCheckpointPayloadReference {
  kind: "uri" | "artifact" | "inline" | "reference";
  uri?: string;
  artifactId?: string;
  mimeType?: string;
  contentHash?: string;
  sizeBytes?: number;
}

export interface EmitCheckpointRuntimeIdentity {
  projectId?: string;
  traceId?: string;
  workflowId?: string;
  workflowRunId?: string;
  agentId?: string;
  agentVersion?: string;
  sessionId?: string;
  threadId?: string;
  spanId?: string;
  parentSpanId?: string;
  capturedAt?: string;
  sequence?: number;
}

export interface EmitCheckpointRestoreSemantics {
  mode: "resume" | "restore" | "replay";
  target: "workflow" | "agent" | "span" | "session";
  entrySpanId?: string;
  requiresApproval?: boolean;
  replaysSideEffects?: boolean;
}

export interface EmitCheckpointIntegrity {
  schemaVersion: string;
  contentHash?: string;
  metadataHash?: string;
  redactionApplied?: boolean;
}

export interface EmitCheckpointManifest {
  format: "neon.checkpoint.v1";
  checkpointId: string;
  snapshotId: string;
  name?: string;
  stateType?: string;
  payload?: EmitCheckpointPayloadReference;
  runtime: EmitCheckpointRuntimeIdentity;
  restore: EmitCheckpointRestoreSemantics;
  integrity: EmitCheckpointIntegrity;
  metadata?: Record<string, string>;
}

export interface EmitStateSnapshotReference {
  snapshotId: string;
  name?: string;
  stateType?: string;
  uri?: string;
  contentHash?: string;
  artifactIds?: string[];
  metadata?: Record<string, string>;
  checkpoint?: EmitCheckpointManifest;
}

export interface EmitEvalAnnotation {
  annotationId?: string;
  name: string;
  evaluatorType?: "human" | "llm_judge" | "rule" | "dataset" | "system";
  status?: "expected" | "observed" | "pass" | "fail" | "note";
  value?: string;
  score?: number;
  comment?: string;
  referenceSpanId?: string;
  metadata?: Record<string, string>;
}

/**
 * Input for span emission activity
 */
export interface EmitSpanParams {
  traceId: string;
  spanId?: string;
  parentSpanId?: string;
  spanType: "span" | "generation" | "tool" | "retrieval" | "event";
  componentType?: "prompt" | "retrieval" | "tool" | "reasoning" | "planning" | "memory" | "routing" | "skill" | "mcp" | "other";
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
  session?: EmitSessionContext;
  inputMessages?: EmitTraceMessage[];
  outputMessages?: EmitTraceMessage[];
  handoff?: EmitHandoffMetadata;
  stateSnapshots?: EmitStateSnapshotReference[];
  artifacts?: EmitArtifactReference[];
  evalAnnotations?: EmitEvalAnnotation[];
  // Skill selection context (for debugging skill/tool selection)
  skillSelection?: EmitSkillSelectionContext;
  // MCP execution context (for MCP tool calls)
  mcpContext?: EmitMCPContext;
  // Decision metadata (for understanding execution decisions)
  decisionMetadata?: EmitDecisionMetadata;
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
  parallelism?: number;
  restoreFrom?: EvalRunReplaySource;
  restoredCheckpoint?: EvalRunCheckpointEnvelope;
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
  restoredFromCheckpointId?: string;
}

export interface EvalRunCheckpointState {
  status: "running" | "completed" | "failed" | "cancelled";
  completed: number;
  total: number;
  passed: number;
  failed: number;
  nextCaseIndex: number;
  results: EvalCaseResult[];
  error?: string;
}

export interface EvalRunCheckpointEnvelope {
  format: "neon.checkpoint-body.v1";
  kind: "eval_run";
  checkpointId: string;
  traceId: string;
  projectId: string;
  runId: string;
  agentId: string;
  agentVersion?: string;
  capturedAt: string;
  workflowId?: string;
  workflowRunId?: string;
  input: Omit<EvalRunInput, "restoreFrom" | "restoredCheckpoint">;
  state: EvalRunCheckpointState;
  metadata?: Record<string, string>;
}

export interface EvalRunReplaySource {
  checkpointId: string;
  traceId: string;
  mode?: "restore" | "replay";
}

export interface ProgressiveRolloutInput {
  rolloutId: string;
  projectId: string;
  currentAgent: {
    agentId: string;
    agentVersion: string;
    tools: ToolDefinition[];
  };
  newAgent: {
    agentId: string;
    agentVersion: string;
    tools: ToolDefinition[];
  };
  dataset: {
    items: DatasetItem[];
  };
  scorers: string[];
  stages: number[];
  minimumScore: number;
  stageDurationMs: number;
  restoreFrom?: ProgressiveRolloutReplaySource;
  restoredCheckpoint?: ProgressiveRolloutCheckpointEnvelope;
}

export interface ProgressiveRolloutStageResult {
  stage: number;
  percentage: number;
  score: number;
  passed: boolean;
  runId: string;
}

export interface ProgressiveRolloutResult {
  rolloutId: string;
  finalStage: number;
  completed: boolean;
  aborted: boolean;
  abortReason?: string;
  stageResults: ProgressiveRolloutStageResult[];
  restoredFromCheckpointId?: string;
}

export interface ProgressiveRolloutCheckpointState {
  status: "running" | "completed" | "aborted" | "failed";
  currentStageIndex: number;
  currentPercentage: number;
  stages: number[];
  scores: number[];
  stageResults: ProgressiveRolloutStageResult[];
  nextStageIndex: number;
  abortReason?: string;
  error?: string;
}

export interface ProgressiveRolloutCheckpointEnvelope {
  format: "neon.checkpoint-body.v1";
  kind: "progressive_rollout";
  checkpointId: string;
  traceId: string;
  projectId: string;
  rolloutId: string;
  capturedAt: string;
  workflowId?: string;
  workflowRunId?: string;
  input: Omit<ProgressiveRolloutInput, "restoreFrom" | "restoredCheckpoint">;
  state: ProgressiveRolloutCheckpointState;
  metadata?: Record<string, string>;
}

export interface ProgressiveRolloutReplaySource {
  checkpointId: string;
  traceId: string;
  mode?: "restore" | "replay";
}

export type TrainingLoopStage =
  | "idle"
  | "collecting"
  | "curating"
  | "optimizing"
  | "evaluating"
  | "deploying"
  | "monitoring";

export interface TrainingLoopInput {
  projectId: string;
  suiteId: string;
  promptId: string;
  strategy: "coordinate_ascent" | "example_selection" | "reflection";
  trigger: "regression" | "signal_threshold" | "manual";
  maxIterations?: number;
  improvementThreshold?: number;
  signalTypes?: string[];
  timeWindow?: { startDate: string; endDate: string };
  restoreFrom?: TrainingLoopReplaySource;
  restoredCheckpoint?: TrainingLoopCheckpointEnvelope;
}

export interface TrainingLoopStageResult {
  iteration: number;
  stage: TrainingLoopStage;
  status: "completed" | "skipped" | "failed";
  metrics: Record<string, number>;
  durationMs: number;
  timestamp: string;
}

export interface TrainingLoopStatus {
  stage: TrainingLoopStage;
  progress: number;
  metrics: Record<string, number>;
  history: TrainingLoopStageResult[];
  isPaused: boolean;
  currentIteration: number;
  maxIterations: number;
}

export interface TrainingLoopResult {
  loopId: string;
  status: "completed" | "aborted" | "failed";
  stages: TrainingLoopStageResult[];
  improvement: number;
  totalDurationMs: number;
  iterations: number;
  restoredFromCheckpointId?: string;
}

export interface TrainingLoopCheckpointState {
  status: "running" | "completed" | "failed" | "aborted";
  currentStage: TrainingLoopStage;
  currentIteration: number;
  maxIterations: number;
  baselineScore: number;
  currentMetrics: Record<string, number>;
  stageHistory: TrainingLoopStageResult[];
  collectedSignals: unknown[];
  curatedData: unknown[];
  approvalStatus: "idle" | "pending" | "approved" | "rejected";
  error?: string;
}

export interface TrainingLoopCheckpointEnvelope {
  format: "neon.checkpoint-body.v1";
  kind: "training_loop";
  checkpointId: string;
  traceId: string;
  projectId: string;
  loopId: string;
  promptId: string;
  suiteId: string;
  capturedAt: string;
  workflowId?: string;
  workflowRunId?: string;
  input: Omit<TrainingLoopInput, "restoreFrom" | "restoredCheckpoint">;
  state: TrainingLoopCheckpointState;
  metadata?: Record<string, string>;
}

export interface TrainingLoopReplaySource {
  checkpointId: string;
  traceId: string;
  mode?: "restore" | "replay";
}

export interface EvalCaseCheckpointState {
  status: "pending" | "running_agent" | "scoring" | "completed" | "failed" | "cancelled";
  scores: Array<{
    name: string;
    value: number;
    reason?: string;
    passed?: boolean;
  }>;
  agentResult?: AgentRunResult;
  error?: string;
}

export interface EvalCaseCheckpointEnvelope {
  format: "neon.checkpoint-body.v1";
  kind: "eval_case";
  checkpointId: string;
  traceId: string;
  projectId: string;
  caseId?: string;
  runId?: string;
  agentId: string;
  agentVersion?: string;
  capturedAt: string;
  workflowId?: string;
  workflowRunId?: string;
  input: EvalCaseInput;
  state: EvalCaseCheckpointState;
  metadata?: Record<string, string>;
}

export interface EvalCaseReplaySource {
  checkpointId: string;
  traceId: string;
  mode?: "restore" | "replay";
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
  /** Source checkpoint metadata when restoring or replaying */
  restoreFrom?: EvalCaseReplaySource;
  /** Persisted checkpoint body for workflow restore */
  restoredCheckpoint?: EvalCaseCheckpointEnvelope;
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
