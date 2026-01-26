/**
 * Score Types
 *
 * Types for evaluation scores and scoring configurations.
 */

/**
 * Score data type
 */
export type ScoreDataType = "numeric" | "categorical" | "boolean";

/**
 * Source of the score
 */
export type ScoreSource =
  | "api"
  | "sdk"
  | "annotation"
  | "eval"
  | "temporal";

/**
 * Score represents an evaluation result
 */
export interface Score {
  scoreId: string;
  projectId: string;
  traceId: string;
  spanId?: string;
  name: string;
  value: number;
  scoreType: ScoreDataType;
  stringValue?: string;
  comment?: string;
  source: ScoreSource;
  configId?: string;
  timestamp: Date;
  authorId?: string;
  evalRunId?: string;
}

/**
 * Score configuration (reusable template)
 */
export interface ScoreConfig {
  configId: string;
  projectId: string;
  name: string;
  dataType: ScoreDataType;
  description?: string;
  evaluator?: {
    type: "llm_judge" | "rule_based" | "custom";
    model?: string;
    prompt?: string;
  };
  threshold?: number;
  categories?: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a score
 */
export interface CreateScoreInput {
  projectId: string;
  traceId: string;
  spanId?: string;
  name: string;
  value: number;
  scoreType?: ScoreDataType;
  stringValue?: string;
  comment?: string;
  source?: ScoreSource;
  configId?: string;
  authorId?: string;
  evalRunId?: string;
}

/**
 * Score summary for aggregation
 */
export interface ScoreSummary {
  name: string;
  avgValue: number;
  minValue: number;
  maxValue: number;
  count: number;
  sources: ScoreSource[];
}

/**
 * Score trend data point
 */
export interface ScoreTrendPoint {
  date: Date;
  avgScore: number;
  count: number;
}
