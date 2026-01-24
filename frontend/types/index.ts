/**
 * Frontend type definitions matching API models
 */

// Enums
export type EvalRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
export type TriggerType = 'manual' | 'ci' | 'scheduled'
export type ScorerType =
  | 'tool_selection'
  | 'reasoning'
  | 'grounding'
  | 'efficiency'
  | 'custom'

// Eval Run Summary
export interface EvalRunSummary {
  total_cases: number
  passed: number
  failed: number
  errored: number
  avg_score: number
  scores_by_type: Record<string, number>
  execution_time_ms: number
}

// Eval Run
export interface EvalRun {
  id: string
  suite_id: string
  suite_name: string
  project_id: string
  agent_version: string | null
  trigger: TriggerType
  trigger_ref: string | null
  status: EvalRunStatus
  config: Record<string, unknown> | null
  summary: EvalRunSummary | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface EvalRunList {
  items: EvalRun[]
  total: number
}

// Comparison models
export interface RegressionDetail {
  case_name: string
  scorer: string
  baseline_score: number
  candidate_score: number
  delta: number
}

export interface ImprovementDetail {
  case_name: string
  scorer: string
  baseline_score: number
  candidate_score: number
  delta: number
}

export interface CompareRequest {
  baseline_run_id: string
  candidate_run_id: string
  threshold: number
}

export interface CompareResponse {
  baseline: EvalRun
  candidate: EvalRun
  passed: boolean
  overall_delta: number
  regressions: RegressionDetail[]
  improvements: ImprovementDetail[]
  unchanged: number
}

// Eval Case (simplified for listing)
export interface EvalCase {
  id: string
  name: string
  description: string | null
  suite_id: string
}

// Eval Suite
export interface EvalSuite {
  id: string
  name: string
  description: string | null
  agent_id: string
  project_id: string
  default_scorers: ScorerType[]
  cases: EvalCase[]
  created_at: string
  updated_at: string
}

export interface EvalSuiteList {
  items: EvalSuite[]
  total: number
}

// Grouped runs for display
export interface GroupedRuns {
  suiteName: string
  suiteId: string
  runs: EvalRun[]
}
