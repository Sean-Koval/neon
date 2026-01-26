/**
 * Evaluation Types
 *
 * Types for evaluation runs, datasets, and results.
 */

import type { ScoreDataType } from "./score";

/**
 * Dataset item
 */
export interface DatasetItem {
  input: Record<string, unknown>;
  expected?: Record<string, unknown>;
}

/**
 * Dataset for batch evaluation
 */
export interface Dataset {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  items: DatasetItem[];
  traceIds?: string[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Evaluation run status
 */
export type EvalRunStatus = "pending" | "running" | "completed" | "failed";

/**
 * Evaluation run
 */
export interface EvalRun {
  id: string;
  projectId: string;
  datasetId?: string;
  scoreConfigIds: string[];
  agentId?: string;
  agentVersion?: string;
  status: EvalRunStatus;
  progress: {
    completed: number;
    total: number;
  };
  workflowId?: string;
  createdAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

/**
 * Evaluation case result
 */
export interface EvalCaseResult {
  caseIndex: number;
  traceId: string;
  status: "passed" | "failed" | "error";
  scores: Array<{
    name: string;
    value: number;
    reason?: string;
  }>;
  durationMs?: number;
}

/**
 * Evaluation run result
 */
export interface EvalRunResult {
  runId: string;
  results: EvalCaseResult[];
  summary: EvalRunSummary;
}

/**
 * Evaluation run summary
 */
export interface EvalRunSummary {
  total: number;
  passed: number;
  failed: number;
  avgScore: number;
  passRate: number;
  scoresByName: Record<string, {
    avg: number;
    min: number;
    max: number;
    count: number;
  }>;
}

/**
 * Input for creating a dataset
 */
export interface CreateDatasetInput {
  projectId: string;
  name: string;
  description?: string;
  items?: DatasetItem[];
  traceIds?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Input for starting an evaluation run
 */
export interface StartEvalRunInput {
  projectId: string;
  datasetId?: string;
  traceIds?: string[];
  scoreConfigIds: string[];
  agentId?: string;
  agentVersion?: string;
}

/**
 * Scorer definition for SDK
 */
export interface ScorerDefinition {
  name: string;
  description?: string;
  dataType: ScoreDataType;
  evaluator: {
    type: "llm_judge" | "rule_based" | "custom";
    model?: string;
    prompt?: string;
    check?: (trace: unknown) => boolean | number;
  };
  threshold?: number;
}

/**
 * Test case definition for SDK
 */
export interface TestDefinition {
  name: string;
  input: Record<string, unknown>;
  expected?: {
    toolCalls?: string[];
    outputContains?: string[];
    output?: string;
  };
  scorers?: string[];
  timeout?: number;
}

/**
 * Test suite definition for SDK
 */
export interface SuiteDefinition {
  name: string;
  tests: TestDefinition[];
  datasets?: Dataset[];
  scorers?: Record<string, ScorerDefinition>;
  config?: {
    parallel?: number;
    timeout?: number;
  };
}
