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

export interface EvalRunCheckpointCaseResult {
  caseIndex: number;
  result: {
    traceId: string;
    status: "running" | "awaiting_approval" | "completed" | "rejected" | "failed" | "cancelled";
    output?: string;
    iterations: number;
    reason?: string;
    restoredFromCheckpointId?: string;
  };
  scores: Array<{
    name: string;
    value: number;
    reason?: string;
  }>;
}

export interface EvalRunCheckpointState {
  status: "running" | "completed" | "failed" | "cancelled";
  completed: number;
  total: number;
  passed: number;
  failed: number;
  nextCaseIndex: number;
  results: EvalRunCheckpointCaseResult[];
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
  input: EvalRunInput;
  state: EvalRunCheckpointState;
  metadata?: Record<string, string>;
}

export interface EvalRunReplaySource {
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
  agentResult?: {
    traceId: string;
    status: "running" | "awaiting_approval" | "completed" | "rejected" | "failed" | "cancelled";
    output?: string;
    iterations: number;
    reason?: string;
    restoredFromCheckpointId?: string;
  };
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

export interface EvalCaseInput {
  caseId?: string;
  runId?: string;
  projectId: string;
  agentId: string;
  agentVersion?: string;
  input: Record<string, unknown> | string;
  expected?: Record<string, unknown>;
  tools?: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
  scorers: string[];
  configId?: string;
  thresholds?: Record<string, number>;
  mode?: "full" | "lightweight";
  maxIterations?: number;
  model?: string;
  systemPrompt?: string;
  traceId?: string;
  restoreFrom?: EvalCaseReplaySource;
  restoredCheckpoint?: EvalCaseCheckpointEnvelope;
}

export interface EvalRunInput {
  runId: string;
  projectId: string;
  agentId: string;
  agentVersion?: string;
  dataset: {
    items: DatasetItem[];
  };
  tools: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
  scorers: string[];
  notify?: {
    slackWebhookUrl?: string;
    webhookUrl?: string;
    dashboardUrl?: string;
    notifyOnSuccess?: boolean;
    notifyOnFailure?: boolean;
    scoreThreshold?: number;
  };
  parallelism?: number;
  restoreFrom?: EvalRunReplaySource;
  restoredCheckpoint?: EvalRunCheckpointEnvelope;
}
