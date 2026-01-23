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
  | "tool_selection"
  | "reasoning"
  | "grounding"
  | "efficiency"
  | "custom";

/**
 * Evaluation run status.
 */
export type EvalRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Status of an individual eval result.
 */
export type EvalResultStatus = "success" | "failed" | "error" | "timeout";

/**
 * How the eval run was triggered.
 */
export type TriggerType = "manual" | "ci" | "scheduled";

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
  name: string;
  /** Optional description (max 2000 chars) */
  description?: string | null;
  /** Agent input (passed to agent.run()) */
  input: Record<string, unknown>;
  /** Tools that should be called (order-independent) */
  expected_tools?: string[] | null;
  /** Tools in exact order (if order matters) */
  expected_tool_sequence?: string[] | null;
  /** Strings that must appear in output */
  expected_output_contains?: string[] | null;
  /** Regex pattern output must match */
  expected_output_pattern?: string | null;
  /** Scorers to run on this case */
  scorers: ScorerType[];
  /** Per-scorer configuration overrides */
  scorer_config?: Record<string, unknown> | null;
  /** Minimum average score to pass (0-1) */
  min_score: number;
  /** Tags for categorization */
  tags: string[];
  /** Timeout in seconds (1-3600) */
  timeout_seconds: number;
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
  id: string;
  /** ID of the parent suite */
  suite_id: string;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
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
  name: string;
  /** Optional description (max 2000 chars) */
  description?: string | null;
  /** Identifier for the agent being tested */
  agent_id: string;
  /** Default scorers to run on cases that don't specify their own */
  default_scorers: ScorerType[];
  /** Default minimum score to pass (0-1) */
  default_min_score: number;
  /** Default timeout in seconds (1-3600) */
  default_timeout_seconds: number;
  /** Run cases in parallel */
  parallel: boolean;
  /** Stop execution after first failure */
  stop_on_failure: boolean;
}

/**
 * Create eval suite request.
 */
export interface EvalSuiteCreate extends EvalSuiteBase {
  /** Optional cases to create with the suite */
  cases?: EvalCaseCreate[] | null;
}

/**
 * Update eval suite request (all fields optional).
 */
export interface EvalSuiteUpdate {
  name?: string;
  description?: string | null;
  agent_id?: string;
  default_scorers?: ScorerType[];
  default_min_score?: number;
  default_timeout_seconds?: number;
  parallel?: boolean;
  stop_on_failure?: boolean;
}

/**
 * Eval suite response with server-generated fields.
 */
export interface EvalSuite extends EvalSuiteBase {
  /** Unique identifier */
  id: string;
  /** ID of the parent project */
  project_id: string;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
  /** Cases in this suite */
  cases: EvalCase[];
}

/**
 * List of eval suites.
 */
export interface EvalSuiteList {
  items: EvalSuite[];
  total: number;
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
  total_cases: number;
  /** Number of cases that passed */
  passed: number;
  /** Number of cases that failed */
  failed: number;
  /** Number of cases that errored */
  errored: number;
  /** Average score across all cases (0-1) */
  avg_score: number;
  /** Average score per scorer type */
  scores_by_type: Record<string, number>;
  /** Total execution time in milliseconds */
  execution_time_ms: number;
}

/**
 * Create eval run request.
 */
export interface EvalRunCreate {
  /** Version identifier (git SHA, tag, etc.) */
  agent_version?: string | null;
  /** How the run was triggered */
  trigger?: TriggerType;
  /** Reference for the trigger (PR number, commit SHA, etc.) */
  trigger_ref?: string | null;
  /** Runtime configuration overrides */
  config?: Record<string, unknown> | null;
}

/**
 * Eval run response.
 *
 * Represents a single execution of an evaluation suite against an agent version.
 */
export interface EvalRun {
  /** Unique identifier */
  id: string;
  /** ID of the suite being run */
  suite_id: string;
  /** Name of the suite being run */
  suite_name: string;
  /** ID of the parent project */
  project_id: string;
  /** Version identifier (git SHA, tag, etc.) */
  agent_version?: string | null;
  /** How the run was triggered */
  trigger: TriggerType;
  /** Reference for the trigger (PR number, commit SHA, etc.) */
  trigger_ref?: string | null;
  /** Current status of the run */
  status: EvalRunStatus;
  /** Runtime configuration overrides */
  config?: Record<string, unknown> | null;
  /** Aggregated summary (populated after completion) */
  summary?: EvalRunSummary | null;
  /** When the run started executing */
  started_at?: string | null;
  /** When the run completed */
  completed_at?: string | null;
  /** When the run was created */
  created_at: string;
}

/**
 * Paginated list of eval runs.
 */
export interface EvalRunList {
  items: EvalRun[];
  total: number;
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
  score: number;
  /** Explanation for the score */
  reason: string;
  /** Supporting evidence for the score */
  evidence: string[];
}

/**
 * Result for a single eval case execution.
 *
 * Contains the agent output, scores from each scorer, and execution metadata.
 */
export interface EvalResult {
  /** Unique identifier */
  id: string;
  /** ID of the parent run */
  run_id: string;
  /** ID of the case that was executed */
  case_id: string;
  /** Name of the case that was executed */
  case_name: string;
  /** MLflow run ID for trace lookup */
  mlflow_run_id?: string | null;
  /** MLflow trace ID for detailed analysis */
  mlflow_trace_id?: string | null;
  /** Execution status */
  status: EvalResultStatus;
  /** Agent output (if successful) */
  output?: Record<string, unknown> | null;
  /** Score per scorer type */
  scores: Record<string, number>;
  /** Detailed score info per scorer */
  score_details?: Record<string, ScoreDetail> | null;
  /** Whether the case passed based on min_score */
  passed: boolean;
  /** Execution time in milliseconds */
  execution_time_ms?: number | null;
  /** Error message if status is error/timeout */
  error?: string | null;
  /** When the result was created */
  created_at: string;
}

/**
 * Paginated list of eval results.
 */
export interface EvalResultList {
  items: EvalResult[];
  total: number;
}

// =============================================================================
// Comparison Models
// =============================================================================

/**
 * Reference to a run (used in compare responses).
 */
export interface RunReference {
  /** Run ID */
  id: string;
  /** Agent version */
  agent_version: string | null;
}

/**
 * Details about a regression or improvement between two runs.
 */
export interface RegressionItem {
  /** Name of the case */
  case_name: string;
  /** Scorer that detected the change */
  scorer: string;
  /** Score in baseline run (0-1) */
  baseline_score: number;
  /** Score in candidate run (0-1) */
  candidate_score: number;
  /** Change in score */
  delta: number;
}

/**
 * Request to compare two eval runs.
 */
export interface CompareRequest {
  /** Run ID to use as baseline */
  baseline_run_id: string;
  /** Run ID to compare against baseline */
  candidate_run_id: string;
  /** Minimum score drop to count as regression (0-1, default 0.05) */
  threshold?: number;
}

/**
 * Response from comparing two eval runs.
 */
export interface CompareResponse {
  /** Baseline run reference */
  baseline: RunReference;
  /** Candidate run reference */
  candidate: RunReference;
  /** True if no significant regressions detected */
  passed: boolean;
  /** Overall change in average score */
  overall_delta: number;
  /** Cases that regressed */
  regressions: RegressionItem[];
  /** Cases that improved */
  improvements: RegressionItem[];
  /** Number of cases with no significant change */
  unchanged: number;
  /** Threshold used for comparison */
  threshold: number;
}

// =============================================================================
// Query Filters
// =============================================================================

/**
 * Filter options for listing runs.
 */
export interface RunsFilter {
  /** Filter by suite ID */
  suite_id?: string;
  /** Filter by run status */
  status?: EvalRunStatus;
  /** Maximum number of results */
  limit?: number;
  /** Number of results to skip */
  offset?: number;
}

/**
 * Filter options for listing results.
 */
export interface ResultsFilter {
  /** Only return failed results */
  failed_only?: boolean;
}
