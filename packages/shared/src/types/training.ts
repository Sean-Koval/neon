/**
 * Training Loop Types
 *
 * Shared types for higher-order training orchestration and checkpoint restore.
 */

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

export interface TrainingLoopResult {
  loopId: string;
  status: "completed" | "aborted" | "failed";
  stages: Array<{
    iteration: number;
    stage: TrainingLoopStage;
    status: "completed" | "skipped" | "failed";
    metrics: Record<string, number>;
    durationMs: number;
    timestamp: string;
  }>;
  improvement: number;
  totalDurationMs: number;
  iterations: number;
  restoredFromCheckpointId?: string;
}
