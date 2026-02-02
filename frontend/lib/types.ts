/**
 * TypeScript types for Neon API entities.
 * These types match the API Pydantic models exactly.
 * Source of truth: api/src/models/eval.py
 */

// =============================================================================
// Enums (as string literal unions)
// =============================================================================

/**
 * Available scorer types for evaluating agent behavior.
 */
export type ScorerType =
  | 'tool_selection'
  | 'reasoning'
  | 'grounding'
  | 'efficiency'
  | 'custom'

/**
 * Evaluation run status.
 */
export type EvalRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

/**
 * Status of an individual eval result.
 */
export type EvalResultStatus = 'success' | 'failed' | 'error' | 'timeout'

/**
 * How the eval run was triggered.
 */
export type TriggerType = 'manual' | 'ci' | 'scheduled'

// =============================================================================
// Eval Case
// =============================================================================

/**
 * Base eval case model.
 *
 * Represents a single test case for agent evaluation. Each case defines:
 * - Input to send to the agent
 * - Expected behavior (tools to call, output patterns)
 * - Scoring configuration and thresholds
 */
export interface EvalCaseBase {
  /** Unique name for the test case */
  name: string
  /** Optional description (max 2000 chars) */
  description?: string | null
  /** Agent input (passed to agent.run()) */
  input: Record<string, unknown>
  /** Tools that should be called (order-independent) */
  expected_tools?: string[] | null
  /** Tools in exact order (if order matters) */
  expected_tool_sequence?: string[] | null
  /** Strings that must appear in output */
  expected_output_contains?: string[] | null
  /** Regex pattern output must match */
  expected_output_pattern?: string | null
  /** Scorers to run on this case */
  scorers: ScorerType[]
  /** Per-scorer configuration overrides */
  scorer_config?: Record<string, unknown> | null
  /** Minimum average score to pass (0-1) */
  min_score: number
  /** Tags for categorization */
  tags: string[]
  /** Timeout in seconds (1-3600) */
  timeout_seconds: number
}

/**
 * Create eval case request.
 */
export interface EvalCaseCreate extends EvalCaseBase {}

/**
 * Eval case response with server-generated fields.
 */
export interface EvalCase extends EvalCaseBase {
  /** Unique identifier */
  id: string
  /** ID of the parent suite */
  suite_id: string
  /** Creation timestamp */
  created_at: string
  /** Last update timestamp */
  updated_at: string
}

// =============================================================================
// Eval Suite
// =============================================================================

/**
 * Base eval suite model.
 *
 * Represents a collection of test cases for evaluating an agent.
 * Provides default configuration that can be overridden per-case.
 */
export interface EvalSuiteBase {
  /** Unique name for the suite */
  name: string
  /** Optional description (max 2000 chars) */
  description?: string | null
  /** Identifier for the agent being tested */
  agent_id: string
  /** Default scorers to run on cases that don't specify their own */
  default_scorers: ScorerType[]
  /** Default minimum score to pass (0-1) */
  default_min_score: number
  /** Default timeout in seconds (1-3600) */
  default_timeout_seconds: number
  /** Run cases in parallel */
  parallel: boolean
  /** Stop execution after first failure */
  stop_on_failure: boolean
}

/**
 * Create eval suite request.
 */
export interface EvalSuiteCreate extends EvalSuiteBase {
  /** Optional cases to create with the suite */
  cases?: EvalCaseCreate[] | null
}

/**
 * Update eval suite request (all fields optional).
 */
export interface EvalSuiteUpdate {
  name?: string
  description?: string | null
  agent_id?: string
  default_scorers?: ScorerType[]
  default_min_score?: number
  default_timeout_seconds?: number
  parallel?: boolean
  stop_on_failure?: boolean
}

/**
 * Eval suite response with server-generated fields.
 */
export interface EvalSuite extends EvalSuiteBase {
  /** Unique identifier */
  id: string
  /** ID of the parent project */
  project_id: string
  /** Creation timestamp */
  created_at: string
  /** Last update timestamp */
  updated_at: string
  /** Cases in this suite */
  cases: EvalCase[]
}

/**
 * List of eval suites.
 */
export interface EvalSuiteList {
  items: EvalSuite[]
  total: number
}

// =============================================================================
// Eval Run
// =============================================================================

/**
 * Summary of an eval run.
 *
 * Provides aggregated statistics for a completed evaluation run.
 */
export interface EvalRunSummary {
  /** Total number of cases in the run */
  total_cases: number
  /** Number of cases that passed */
  passed: number
  /** Number of cases that failed */
  failed: number
  /** Number of cases that errored */
  errored: number
  /** Average score across all cases (0-1) */
  avg_score: number
  /** Average score per scorer type */
  scores_by_type: Record<string, number>
  /** Total execution time in milliseconds */
  execution_time_ms: number
}

/**
 * Create eval run request.
 */
export interface EvalRunCreate {
  /** Version identifier (git SHA, tag, etc.) */
  agent_version?: string | null
  /** How the run was triggered */
  trigger?: TriggerType
  /** Reference for the trigger (PR number, commit SHA, etc.) */
  trigger_ref?: string | null
  /** Runtime configuration overrides */
  config?: Record<string, unknown> | null
}

/**
 * Eval run response.
 *
 * Represents a single execution of an evaluation suite against an agent version.
 */
export interface EvalRun {
  /** Unique identifier */
  id: string
  /** ID of the suite being run */
  suite_id: string
  /** Name of the suite being run */
  suite_name: string
  /** ID of the parent project */
  project_id: string
  /** Version identifier (git SHA, tag, etc.) */
  agent_version?: string | null
  /** How the run was triggered */
  trigger: TriggerType
  /** Reference for the trigger (PR number, commit SHA, etc.) */
  trigger_ref?: string | null
  /** Current status of the run */
  status: EvalRunStatus
  /** Runtime configuration overrides */
  config?: Record<string, unknown> | null
  /** Aggregated summary (populated after completion) */
  summary?: EvalRunSummary | null
  /** When the run started executing */
  started_at?: string | null
  /** When the run completed */
  completed_at?: string | null
  /** When the run was created */
  created_at: string
}

/**
 * Paginated list of eval runs.
 */
export interface EvalRunList {
  items: EvalRun[]
  total: number
}

// =============================================================================
// Eval Result
// =============================================================================

/**
 * Detailed score information from a scorer.
 *
 * Provides the score value along with explanation and supporting evidence.
 */
export interface ScoreDetail {
  /** Score between 0 and 1 */
  score: number
  /** Explanation for the score */
  reason: string
  /** Supporting evidence for the score */
  evidence: string[]
}

/**
 * Result for a single eval case execution.
 *
 * Contains the agent output, scores from each scorer, and execution metadata.
 */
export interface EvalResult {
  /** Unique identifier */
  id: string
  /** ID of the parent run */
  run_id: string
  /** ID of the case that was executed */
  case_id: string
  /** Name of the case that was executed */
  case_name: string
  /** Trace ID for detailed analysis */
  trace_id?: string | null
  /** Execution status */
  status: EvalResultStatus
  /** Agent output (if successful) */
  output?: Record<string, unknown> | null
  /** Score per scorer type */
  scores: Record<string, number>
  /** Detailed score info per scorer */
  score_details?: Record<string, ScoreDetail> | null
  /** Whether the case passed based on min_score */
  passed: boolean
  /** Execution time in milliseconds */
  execution_time_ms?: number | null
  /** Error message if status is error/timeout */
  error?: string | null
  /** When the result was created */
  created_at: string
}

/**
 * Paginated list of eval results.
 */
export interface EvalResultList {
  items: EvalResult[]
  total: number
}

// =============================================================================
// Comparison Models
// =============================================================================

/**
 * Reference to a run (used in compare responses).
 */
export interface RunReference {
  /** Run ID */
  id: string
  /** Agent version */
  agent_version: string | null
}

/**
 * Details about a regression or improvement between two runs.
 */
export interface RegressionItem {
  /** Name of the case */
  case_name: string
  /** Scorer that detected the change */
  scorer: string
  /** Score in baseline run (0-1) */
  baseline_score: number
  /** Score in candidate run (0-1) */
  candidate_score: number
  /** Change in score */
  delta: number
}

/**
 * Request to compare two eval runs.
 */
export interface CompareRequest {
  /** Run ID to use as baseline */
  baseline_run_id: string
  /** Run ID to compare against baseline */
  candidate_run_id: string
  /** Minimum score drop to count as regression (0-1, default 0.05) */
  threshold?: number
}

/**
 * Response from comparing two eval runs.
 */
export interface CompareResponse {
  /** Baseline run reference */
  baseline: RunReference
  /** Candidate run reference */
  candidate: RunReference
  /** True if no significant regressions detected */
  passed: boolean
  /** Overall change in average score */
  overall_delta: number
  /** Cases that regressed */
  regressions: RegressionItem[]
  /** Cases that improved */
  improvements: RegressionItem[]
  /** Number of cases with no significant change */
  unchanged: number
  /** Threshold used for comparison */
  threshold: number
}

// =============================================================================
// Query Filters
// =============================================================================

/**
 * Filter options for listing runs.
 */
export interface RunsFilter {
  /** Filter by suite ID */
  suite_id?: string
  /** Filter by run status */
  status?: EvalRunStatus
  /** Maximum number of results */
  limit?: number
  /** Number of results to skip */
  offset?: number
}

/**
 * Filter options for listing results.
 */
export interface ResultsFilter {
  /** Only return failed results */
  failed_only?: boolean
}

// =============================================================================
// Temporal Workflow Types
// =============================================================================

/**
 * Workflow execution status from Temporal.
 */
export type WorkflowStatus =
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'TERMINATED'
  | 'TIMED_OUT'

/**
 * Progress information for an eval run workflow.
 */
export interface EvalRunProgress {
  /** Number of cases completed */
  completed: number
  /** Total number of cases */
  total: number
  /** Number of cases that passed */
  passed: number
  /** Number of cases that failed */
  failed: number
  /** Results for completed cases */
  results?: Array<{
    caseIndex: number
    result: {
      traceId: string
      status: string
      iterations: number
      reason?: string
    }
    scores: Array<{
      name: string
      value: number
      reason?: string
    }>
  }>
}

/**
 * Dataset item for starting an eval run.
 */
export interface DatasetItem {
  /** Input data for the agent */
  input: Record<string, unknown>
  /** Expected output or behavior */
  expected?: Record<string, unknown>
}

/**
 * Tool definition for agent execution.
 */
export interface ToolDefinition {
  /** Tool name */
  name: string
  /** Tool description */
  description: string
  /** JSON Schema for tool parameters */
  parameters: Record<string, unknown>
}

/**
 * Request to start an eval run via Temporal.
 */
export interface StartEvalRunRequest {
  /** Project ID */
  projectId: string
  /** Agent ID */
  agentId: string
  /** Agent version (optional, defaults to "latest") */
  agentVersion?: string
  /** Dataset of test cases */
  dataset: {
    items: DatasetItem[]
  }
  /** Available tools for the agent */
  tools?: ToolDefinition[]
  /** Scorer names to run */
  scorers: string[]
  /** Run cases in parallel */
  parallel?: boolean
  /** Number of parallel workers */
  parallelism?: number
  /** Optional custom run ID */
  runId?: string
}

/**
 * Response from starting an eval run.
 */
export interface StartEvalRunResponse {
  /** Success message */
  message: string
  /** Generated run ID */
  runId: string
  /** Temporal workflow ID */
  workflowId: string
  /** Initial status */
  status: WorkflowStatus
  /** Number of items in dataset */
  dataset_size: number
  /** Scorers being used */
  scorers: string[]
  /** Whether running in parallel */
  parallel: boolean
}

/**
 * Workflow status response from Temporal.
 */
export interface WorkflowStatusResponse {
  /** Run ID */
  id: string
  /** Temporal workflow ID */
  workflowId: string
  /** Current status */
  status: WorkflowStatus
  /** Workflow start time */
  startTime: string
  /** Workflow close time (if completed) */
  closeTime?: string
  /** Progress information */
  progress?: EvalRunProgress
  /** Final result (if completed) */
  result?: unknown
  /** Error message (if failed) */
  error?: string
}

/**
 * Lightweight status response for polling.
 */
export interface WorkflowStatusPoll {
  /** Run ID */
  id: string
  /** Current status */
  status: WorkflowStatus
  /** Is workflow currently running */
  isRunning: boolean
  /** Is workflow complete (success) */
  isComplete: boolean
  /** Is workflow in a failed state */
  isFailed: boolean
  /** Progress information */
  progress?: {
    completed: number
    total: number
    passed: number
    failed: number
    percentComplete: number
  }
  /** Summary (if completed) */
  summary?: {
    total: number
    passed: number
    failed: number
    avgScore: number
  }
  /** Error message (if failed) */
  error?: string
}

/**
 * Control action for a workflow.
 */
export type WorkflowControlAction = 'pause' | 'resume' | 'cancel'

/**
 * Request to control a workflow.
 */
export interface WorkflowControlRequest {
  /** Action to perform */
  action: WorkflowControlAction
}

/**
 * Response from controlling a workflow.
 */
export interface WorkflowControlResponse {
  /** Success message */
  message: string
  /** Run ID */
  id: string
  /** Workflow ID */
  workflowId: string
  /** Action performed */
  action: WorkflowControlAction
}

/**
 * List of workflow runs.
 */
export interface WorkflowRunList {
  /** List of runs */
  items: WorkflowStatusResponse[]
  /** Number of items returned */
  count: number
  /** Limit used in query */
  limit: number
}

// =============================================================================
// WebSocket / Real-time Types
// =============================================================================

/**
 * WebSocket connection states.
 */
export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error'

/**
 * WebSocket message types.
 */
export type WebSocketMessageType =
  | 'subscribe'
  | 'unsubscribe'
  | 'update'
  | 'error'
  | 'ping'
  | 'pong'
  | 'ack'

/**
 * Base WebSocket message structure.
 */
export interface WebSocketMessage<T = unknown> {
  /** Message type */
  type: WebSocketMessageType
  /** Optional message ID for correlation */
  id?: string
  /** Timestamp */
  timestamp: string
  /** Message payload */
  payload?: T
}

/**
 * Subscribe message payload.
 */
export interface SubscribePayload {
  /** Run ID to subscribe to */
  runId: string
}

/**
 * Unsubscribe message payload.
 */
export interface UnsubscribePayload {
  /** Run ID to unsubscribe from */
  runId: string
}

/**
 * Run status update payload received via WebSocket.
 */
export interface RunStatusUpdate {
  /** Run ID */
  runId: string
  /** Current workflow status */
  status: WorkflowStatus
  /** Progress information */
  progress?: {
    completed: number
    total: number
    passed: number
    failed: number
    percentComplete: number
  }
  /** Summary (when completed) */
  summary?: {
    total: number
    passed: number
    failed: number
    avgScore: number
  }
  /** Error message if failed */
  error?: string
  /** Latest case result if just completed */
  latestResult?: {
    caseIndex: number
    result: {
      traceId: string
      status: string
      iterations: number
      reason?: string
    }
    scores: Array<{
      name: string
      value: number
      reason?: string
    }>
  }
}

/**
 * Error payload from WebSocket.
 */
export interface WebSocketErrorPayload {
  /** Error code */
  code: string
  /** Error message */
  message: string
  /** Additional details */
  details?: unknown
}

/**
 * Acknowledgment payload.
 */
export interface AckPayload {
  /** ID of the acknowledged message */
  messageId: string
  /** Whether the operation was successful */
  success: boolean
  /** Error message if not successful */
  error?: string
}

/**
 * Typed WebSocket messages.
 */
export type SubscribeMessage = WebSocketMessage<SubscribePayload> & {
  type: 'subscribe'
}
export type UnsubscribeMessage = WebSocketMessage<UnsubscribePayload> & {
  type: 'unsubscribe'
}
export type UpdateMessage = WebSocketMessage<RunStatusUpdate> & {
  type: 'update'
}
export type ErrorMessage = WebSocketMessage<WebSocketErrorPayload> & {
  type: 'error'
}
export type PingMessage = WebSocketMessage<void> & { type: 'ping' }
export type PongMessage = WebSocketMessage<void> & { type: 'pong' }
export type AckMessage = WebSocketMessage<AckPayload> & { type: 'ack' }

/**
 * All possible incoming WebSocket messages.
 */
export type IncomingWebSocketMessage =
  | UpdateMessage
  | ErrorMessage
  | PongMessage
  | AckMessage

/**
 * All possible outgoing WebSocket messages.
 */
export type OutgoingWebSocketMessage =
  | SubscribeMessage
  | UnsubscribeMessage
  | PingMessage

/**
 * Options for the useRealtime hook.
 */
export interface UseRealtimeOptions {
  /** WebSocket URL (defaults to auto-detected) */
  wsUrl?: string
  /** Enable WebSocket (defaults to true) */
  enableWebSocket?: boolean
  /** Polling interval in ms when WebSocket unavailable (defaults to 2000) */
  pollingInterval?: number
  /** Reconnect attempts before falling back to polling (defaults to 3) */
  maxReconnectAttempts?: number
  /** Reconnect delay in ms (defaults to 1000, doubles each attempt) */
  reconnectDelay?: number
  /** Ping interval in ms to keep connection alive (defaults to 30000) */
  pingInterval?: number
  /** Callback when connection status changes */
  onConnectionChange?: (status: ConnectionStatus) => void
  /** Callback when an error occurs */
  onError?: (error: WebSocketErrorPayload) => void
}

/**
 * Return type for the useRealtime hook.
 */
export interface UseRealtimeReturn {
  /** Current connection status */
  connectionStatus: ConnectionStatus
  /** Whether using WebSocket (true) or polling fallback (false) */
  isWebSocket: boolean
  /** Subscribe to updates for a run */
  subscribe: (runId: string) => void
  /** Unsubscribe from updates for a run */
  unsubscribe: (runId: string) => void
  /** Get current status for a run */
  getRunStatus: (runId: string) => RunStatusUpdate | undefined
  /** All current run statuses */
  runStatuses: Map<string, RunStatusUpdate>
  /** Reconnect manually */
  reconnect: () => void
}

// =============================================================================
// Prompt Types
// =============================================================================

/**
 * Prompt variable definition.
 */
export interface PromptVariable {
  name: string
  description?: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  required?: boolean
  default?: unknown
}

/**
 * Prompt message in a chat prompt.
 */
export interface PromptMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * Prompt configuration.
 */
export interface PromptConfig {
  model?: string
  temperature?: number
  maxTokens?: number
  stopSequences?: string[]
  parameters?: Record<string, unknown>
}

/**
 * Prompt entity.
 */
export interface Prompt {
  id: string
  project_id: string
  name: string
  description?: string
  type: 'text' | 'chat'
  template?: string
  messages?: PromptMessage[]
  variables?: PromptVariable[]
  config?: PromptConfig
  tags?: string[]
  is_production: boolean
  version: number
  commit_message?: string
  created_by?: string
  created_at: string
  updated_at: string
  parent_version_id?: string
  variant?: string
}

/**
 * Create prompt request.
 */
export interface PromptCreate {
  name: string
  description?: string
  type: 'text' | 'chat'
  template?: string
  messages?: PromptMessage[]
  variables?: PromptVariable[]
  config?: PromptConfig
  tags?: string[]
  is_production?: boolean
  commit_message?: string
}

/**
 * Update prompt request.
 */
export interface PromptUpdate {
  description?: string
  template?: string
  messages?: PromptMessage[]
  variables?: PromptVariable[]
  config?: PromptConfig
  tags?: string[]
  is_production?: boolean
  commit_message?: string
}

/**
 * Prompt list response.
 */
export interface PromptList {
  items: Prompt[]
  total: number
}

/**
 * Prompt version history entry.
 */
export interface PromptVersionEntry {
  id: string
  version: number
  commit_message?: string
  created_by?: string
  created_at: string
  changes?: string[]
}

// =============================================================================
// Human Feedback / RLHF Types
// =============================================================================

/**
 * Type of human feedback.
 */
export type FeedbackType = 'preference' | 'correction' | 'rating'

/**
 * A single response option in a preference comparison.
 */
export interface ResponseOption {
  /** Unique identifier for this response */
  id: string
  /** The response content (markdown supported) */
  content: string
  /** Optional metadata about this response */
  metadata?: Record<string, unknown>
  /** Model/agent that generated this response */
  source?: string
}

/**
 * A comparison pair for A vs B preference collection.
 */
export interface ComparisonPair {
  /** Unique identifier for this comparison */
  id: string
  /** The input/prompt that generated these responses */
  prompt: string
  /** First response option (A) */
  responseA: ResponseOption
  /** Second response option (B) */
  responseB: ResponseOption
  /** Optional context or additional information */
  context?: string
  /** Tags for categorization */
  tags?: string[]
  /** When this comparison was created */
  created_at: string
}

/**
 * User's preference choice.
 */
export type PreferenceChoice = 'A' | 'B' | 'tie' | 'both_bad'

/**
 * Human preference feedback submission.
 */
export interface PreferenceFeedback {
  /** ID of the comparison pair */
  comparison_id: string
  /** User's choice */
  choice: PreferenceChoice
  /** Optional reason for the choice */
  reason?: string
  /** Confidence level (1-5) */
  confidence?: number
  /** Time spent making the decision (ms) */
  decision_time_ms?: number
}

/**
 * Human correction feedback submission.
 */
export interface CorrectionFeedback {
  /** ID of the response being corrected */
  response_id: string
  /** The original response content */
  original_content: string
  /** The corrected/edited content */
  corrected_content: string
  /** Description of changes made */
  change_summary?: string
  /** Categories of corrections (e.g., 'factual', 'tone', 'completeness') */
  correction_types?: string[]
}

/**
 * Create feedback request.
 */
export interface FeedbackCreate {
  /** Type of feedback */
  type: FeedbackType
  /** Preference feedback (when type is 'preference') */
  preference?: PreferenceFeedback
  /** Correction feedback (when type is 'correction') */
  correction?: CorrectionFeedback
  /** Optional user identifier */
  user_id?: string
  /** Session identifier for grouping feedback */
  session_id?: string
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

/**
 * Feedback item response from API.
 */
export interface FeedbackItem {
  /** Unique identifier */
  id: string
  /** Type of feedback */
  type: FeedbackType
  /** Preference feedback data */
  preference?: PreferenceFeedback
  /** Correction feedback data */
  correction?: CorrectionFeedback
  /** User who provided feedback */
  user_id?: string
  /** Session this feedback belongs to */
  session_id?: string
  /** Additional metadata */
  metadata?: Record<string, unknown>
  /** When the feedback was submitted */
  created_at: string
}

/**
 * List of feedback items.
 */
export interface FeedbackList {
  items: FeedbackItem[]
  total: number
}

/**
 * Filter options for listing feedback.
 */
export interface FeedbackFilter {
  /** Filter by feedback type */
  type?: FeedbackType
  /** Filter by user ID */
  user_id?: string
  /** Filter by session ID */
  session_id?: string
  /** Maximum number of results */
  limit?: number
  /** Number of results to skip */
  offset?: number
}

/**
 * List of comparison pairs for feedback collection.
 */
export interface ComparisonPairList {
  items: ComparisonPair[]
  total: number
}

/**
 * Statistics for feedback collection.
 */
export interface FeedbackStats {
  /** Total feedback items */
  total_feedback: number
  /** Breakdown by type */
  by_type: Record<FeedbackType, number>
  /** Preference distribution */
  preference_distribution?: {
    choice_A: number
    choice_B: number
    tie: number
    both_bad: number
  }
  /** Average confidence score */
  avg_confidence?: number
  /** Total corrections */
  total_corrections?: number
}
