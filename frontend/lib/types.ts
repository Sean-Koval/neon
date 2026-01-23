/**
 * Type definitions for Neon API
 * These mirror the Pydantic models from the backend API
 */

// =============================================================================
// Enums
// =============================================================================

export type ScorerType =
  | 'tool_selection'
  | 'reasoning'
  | 'grounding'
  | 'efficiency'
  | 'custom';

export type EvalRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type EvalResultStatus = 'success' | 'failed' | 'error' | 'timeout';

export type TriggerType = 'manual' | 'ci' | 'scheduled';

// =============================================================================
// Eval Case
// =============================================================================

export interface EvalCaseCreate {
  name: string;
  description?: string | null;
  input: Record<string, unknown>;
  expected_tools?: string[] | null;
  expected_tool_sequence?: string[] | null;
  expected_output_contains?: string[] | null;
  expected_output_pattern?: string | null;
  scorers?: ScorerType[];
  scorer_config?: Record<string, unknown> | null;
  min_score?: number;
  tags?: string[];
  timeout_seconds?: number;
}

export interface EvalCase extends EvalCaseCreate {
  id: string;
  suite_id: string;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Eval Suite
// =============================================================================

export interface EvalSuiteCreate {
  name: string;
  description?: string | null;
  agent_id: string;
  default_scorers?: ScorerType[];
  default_min_score?: number;
  default_timeout_seconds?: number;
  parallel?: boolean;
  stop_on_failure?: boolean;
  cases?: EvalCaseCreate[] | null;
}

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

export interface EvalSuite {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  agent_id: string;
  default_scorers: ScorerType[];
  default_min_score: number;
  default_timeout_seconds: number;
  parallel: boolean;
  stop_on_failure: boolean;
  cases: EvalCase[];
  created_at: string;
  updated_at: string;
}

export interface EvalSuiteList {
  items: EvalSuite[];
  total: number;
}

// =============================================================================
// Eval Run
// =============================================================================

export interface EvalRunSummary {
  total_cases: number;
  passed: number;
  failed: number;
  errored: number;
  avg_score: number;
  scores_by_type: Record<string, number>;
  execution_time_ms: number;
}

export interface EvalRunCreate {
  agent_version?: string | null;
  trigger?: TriggerType;
  trigger_ref?: string | null;
  config?: Record<string, unknown> | null;
}

export interface EvalRun {
  id: string;
  suite_id: string;
  suite_name: string;
  project_id: string;
  agent_version: string | null;
  trigger: TriggerType;
  trigger_ref: string | null;
  status: EvalRunStatus;
  config: Record<string, unknown> | null;
  summary: EvalRunSummary | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface EvalRunList {
  items: EvalRun[];
  total: number;
}

// =============================================================================
// Eval Result
// =============================================================================

export interface ScoreDetail {
  score: number;
  reason: string;
  evidence: string[];
}

export interface EvalResult {
  id: string;
  run_id: string;
  case_id: string;
  case_name: string;
  mlflow_run_id: string | null;
  mlflow_trace_id: string | null;
  status: EvalResultStatus;
  output: Record<string, unknown> | null;
  scores: Record<string, number>;
  score_details: Record<string, ScoreDetail> | null;
  passed: boolean;
  execution_time_ms: number | null;
  error: string | null;
  created_at: string;
}

export interface EvalResultList {
  items: EvalResult[];
  total: number;
}

// =============================================================================
// Comparison
// =============================================================================

export interface CompareRequest {
  baseline_run_id: string;
  candidate_run_id: string;
  threshold?: number;
}

export interface RegressionItem {
  case_name: string;
  scorer: string;
  baseline_score: number;
  candidate_score: number;
  delta: number;
}

export interface RunReference {
  id: string;
  agent_version: string | null;
}

export interface CompareResponse {
  baseline: RunReference;
  candidate: RunReference;
  passed: boolean;
  overall_delta: number;
  regressions: RegressionItem[];
  improvements: RegressionItem[];
  unchanged: number;
  threshold: number;
}

// =============================================================================
// Query Filters
// =============================================================================

export interface RunsFilter {
  suite_id?: string;
  status?: EvalRunStatus;
  limit?: number;
  offset?: number;
}

export interface ResultsFilter {
  failed_only?: boolean;
}
