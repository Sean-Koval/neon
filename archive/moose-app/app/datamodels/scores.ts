/**
 * Score data model for MooseStack
 *
 * Scores represent evaluation results attached to traces or spans.
 * They can come from automated evaluators (LLM judges, rule-based)
 * or manual human annotations.
 */

import { Key } from "@514labs/moose-lib";

/**
 * Score data type
 */
export type ScoreDataType = "numeric" | "categorical" | "boolean";

/**
 * Source of the score
 */
export type ScoreSource =
  | "api" // Direct API call
  | "sdk" // @neon/sdk
  | "annotation" // Human annotation via UI
  | "eval" // Automated evaluation run
  | "temporal"; // Temporal workflow scorer

/**
 * Score represents an evaluation result attached to a trace or span
 */
export interface Score {
  /** Project identifier for multi-tenant isolation */
  project_id: Key<string>;

  /** Unique score identifier */
  score_id: Key<string>;

  /** Parent trace identifier */
  trace_id: string;

  /** Optional span identifier (for span-level scoring) */
  span_id: string | null;

  /** Score name (e.g., "tool_selection", "response_quality") */
  name: string;

  /** Numeric value (0-1 for normalized scores, index for categorical) */
  value: number;

  /** Score data type */
  score_type: ScoreDataType;

  /** String value for categorical scores */
  string_value: string | null;

  /** Human-readable comment or reasoning */
  comment: string;

  /** Source of the score */
  source: ScoreSource;

  /** Reference to score configuration used */
  config_id: string | null;

  /** When the score was created */
  timestamp: Date;

  /** User ID for human annotations */
  author_id: string | null;

  /** Eval run ID if from batch evaluation */
  eval_run_id: string | null;
}

/**
 * ClickHouse table definition for scores
 */
export const scoresTableDDL = `
CREATE TABLE IF NOT EXISTS scores (
  project_id String,
  score_id String,
  trace_id String,
  span_id Nullable(String),
  name String,
  value Float64,
  score_type Enum8('numeric' = 0, 'categorical' = 1, 'boolean' = 2),
  string_value Nullable(String),
  comment String DEFAULT '',
  source Enum8('api' = 0, 'sdk' = 1, 'annotation' = 2, 'eval' = 3, 'temporal' = 4),
  config_id Nullable(String),
  timestamp DateTime64(3),
  author_id Nullable(String),
  eval_run_id Nullable(String)
) ENGINE = ReplacingMergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (project_id, trace_id, score_id)
`;

/**
 * Score configuration defines HOW to evaluate (reusable template)
 */
export interface ScoreConfig {
  /** Project identifier */
  project_id: Key<string>;

  /** Unique config identifier */
  config_id: Key<string>;

  /** Config name (e.g., "tool_selection") */
  name: string;

  /** Score data type */
  data_type: ScoreDataType;

  /** Description of what this scorer evaluates */
  description: string;

  /** Evaluator configuration */
  evaluator_type: "llm_judge" | "rule_based" | "custom" | null;

  /** Model for LLM judge evaluators */
  evaluator_model: string | null;

  /** Prompt template for LLM judge evaluators */
  evaluator_prompt: string | null;

  /** Threshold for pass/fail determination */
  threshold: number | null;

  /** Categories for categorical scores */
  categories: string[];

  /** When the config was created */
  created_at: Date;

  /** When the config was last updated */
  updated_at: Date;
}

/**
 * ClickHouse table definition for score configs
 */
export const scoreConfigsTableDDL = `
CREATE TABLE IF NOT EXISTS score_configs (
  project_id String,
  config_id String,
  name String,
  data_type Enum8('numeric' = 0, 'categorical' = 1, 'boolean' = 2),
  description String DEFAULT '',
  evaluator_type Nullable(Enum8('llm_judge' = 0, 'rule_based' = 1, 'custom' = 2)),
  evaluator_model Nullable(String),
  evaluator_prompt Nullable(String),
  threshold Nullable(Float64),
  categories Array(String),
  created_at DateTime64(3),
  updated_at DateTime64(3)
) ENGINE = ReplacingMergeTree()
ORDER BY (project_id, config_id)
`;

/**
 * Input type for creating scores via the API
 */
export interface ScoreInput {
  project_id: string;
  trace_id: string;
  span_id?: string | null;
  name: string;
  value: number;
  score_type?: ScoreDataType;
  string_value?: string;
  comment?: string;
  source?: ScoreSource;
  config_id?: string;
  author_id?: string;
  eval_run_id?: string;
}

/**
 * Response type for score queries
 */
export interface ScoreResponse extends Omit<Score, "timestamp"> {
  timestamp: string;
}

/**
 * Dataset for batch evaluation
 * Stored in PostgreSQL (metadata database) not ClickHouse
 */
export interface Dataset {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  /** Array of trace IDs to evaluate */
  trace_ids: string[];
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

/**
 * Evaluation run status
 */
export type EvalRunStatus = "pending" | "running" | "completed" | "failed";

/**
 * Evaluation run tracks batch evaluation progress
 * Stored in PostgreSQL (metadata database) not ClickHouse
 */
export interface EvalRun {
  id: string;
  project_id: string;
  dataset_id: string;
  score_config_ids: string[];
  status: EvalRunStatus;
  progress_completed: number;
  progress_total: number;
  error_message: string | null;
  /** Temporal workflow ID for this run */
  workflow_id: string | null;
  created_at: Date;
  completed_at: Date | null;
}
