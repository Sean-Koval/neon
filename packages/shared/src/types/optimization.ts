/**
 * Optimization and rollout orchestration types.
 *
 * Shared types for durable progressive rollout checkpoints and restore.
 */

export interface ProgressiveRolloutAgentConfig {
  agentId: string;
  agentVersion: string;
  tools: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
}

export interface ProgressiveRolloutDatasetItem {
  input: Record<string, unknown>;
  expected?: Record<string, unknown>;
}

export interface ProgressiveRolloutReplaySource {
  checkpointId: string;
  traceId: string;
  mode?: "restore" | "replay";
}

export interface ProgressiveRolloutInput {
  rolloutId: string;
  projectId: string;
  currentAgent: ProgressiveRolloutAgentConfig;
  newAgent: ProgressiveRolloutAgentConfig;
  dataset: {
    items: ProgressiveRolloutDatasetItem[];
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

export interface ProgressiveRolloutResult {
  rolloutId: string;
  finalStage: number;
  completed: boolean;
  aborted: boolean;
  abortReason?: string;
  stageResults: ProgressiveRolloutStageResult[];
  restoredFromCheckpointId?: string;
}
