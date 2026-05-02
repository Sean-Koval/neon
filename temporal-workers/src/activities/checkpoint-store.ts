import type {
  AgentRunInput,
  AgentRunCheckpointEnvelope,
  AgentRunCheckpointState,
  EvalCaseCheckpointEnvelope,
  EvalCaseCheckpointState,
  EvalCaseInput,
  EvalRunCheckpointEnvelope,
  EvalRunCheckpointState,
  EvalRunInput,
  ProgressiveRolloutCheckpointEnvelope,
  ProgressiveRolloutCheckpointState,
  ProgressiveRolloutInput,
  TrainingLoopCheckpointEnvelope,
  TrainingLoopCheckpointState,
  TrainingLoopInput,
  EmitCheckpointManifest,
  EmitStateSnapshotReference,
} from "../types";

const NEON_API_URL = process.env.NEON_API_URL || "http://localhost:3000";

export interface CaptureAgentCheckpointParams {
  projectId: string;
  traceId: string;
  agentId: string;
  agentVersion?: string;
  workflowId?: string;
  workflowRunId?: string;
  input: AgentRunInput["input"];
  state: AgentRunCheckpointState;
  manifest: EmitCheckpointManifest;
  metadata?: Record<string, string>;
}

export interface CaptureAgentCheckpointResult {
  manifest: EmitCheckpointManifest;
  envelope: AgentRunCheckpointEnvelope;
  snapshot: EmitStateSnapshotReference;
}

export interface CaptureEvalCaseCheckpointParams {
  projectId: string;
  traceId: string;
  caseId?: string;
  runId?: string;
  agentId: string;
  agentVersion?: string;
  workflowId?: string;
  workflowRunId?: string;
  input: EvalCaseInput;
  state: EvalCaseCheckpointState;
  manifest: EmitCheckpointManifest;
  metadata?: Record<string, string>;
}

export interface CaptureEvalCaseCheckpointResult {
  manifest: EmitCheckpointManifest;
  envelope: EvalCaseCheckpointEnvelope;
  snapshot: EmitStateSnapshotReference;
}

export interface CaptureEvalRunCheckpointParams {
  projectId: string;
  traceId: string;
  runId: string;
  agentId: string;
  agentVersion?: string;
  workflowId?: string;
  workflowRunId?: string;
  input: Omit<EvalRunInput, "restoreFrom" | "restoredCheckpoint">;
  state: EvalRunCheckpointState;
  manifest: EmitCheckpointManifest;
  metadata?: Record<string, string>;
}

export interface CaptureEvalRunCheckpointResult {
  manifest: EmitCheckpointManifest;
  envelope: EvalRunCheckpointEnvelope;
  snapshot: EmitStateSnapshotReference;
}

export interface CaptureTrainingLoopCheckpointParams {
  projectId: string;
  traceId: string;
  loopId: string;
  promptId: string;
  suiteId: string;
  workflowId?: string;
  workflowRunId?: string;
  input: Omit<TrainingLoopInput, "restoreFrom" | "restoredCheckpoint">;
  state: TrainingLoopCheckpointState;
  manifest: EmitCheckpointManifest;
  metadata?: Record<string, string>;
}

export interface CaptureTrainingLoopCheckpointResult {
  manifest: EmitCheckpointManifest;
  envelope: TrainingLoopCheckpointEnvelope;
  snapshot: EmitStateSnapshotReference;
}

export interface CaptureProgressiveRolloutCheckpointParams {
  projectId: string;
  traceId: string;
  rolloutId: string;
  workflowId?: string;
  workflowRunId?: string;
  input: Omit<ProgressiveRolloutInput, "restoreFrom" | "restoredCheckpoint">;
  state: ProgressiveRolloutCheckpointState;
  manifest: EmitCheckpointManifest;
  metadata?: Record<string, string>;
}

export interface CaptureProgressiveRolloutCheckpointResult {
  manifest: EmitCheckpointManifest;
  envelope: ProgressiveRolloutCheckpointEnvelope;
  snapshot: EmitStateSnapshotReference;
}

function buildHeaders(projectId: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-workspace-id": projectId,
  };

  if (process.env.NEON_API_KEY) {
    headers["x-api-key"] = process.env.NEON_API_KEY;
  }

  return headers;
}

export async function captureAgentCheckpoint(
  params: CaptureAgentCheckpointParams
): Promise<CaptureAgentCheckpointResult> {
  const response = await fetch(`${NEON_API_URL}/api/checkpoints`, {
    method: "POST",
    headers: buildHeaders(params.projectId),
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to capture checkpoint: ${error}`);
  }

  const body = (await response.json()) as {
    manifest: EmitCheckpointManifest;
    envelope: AgentRunCheckpointEnvelope;
  };

  return {
    manifest: body.manifest,
    envelope: body.envelope,
    snapshot: {
      snapshotId: body.manifest.snapshotId,
      name: body.manifest.name,
      stateType: body.manifest.stateType,
      uri: body.manifest.payload?.uri,
      contentHash: body.manifest.integrity.contentHash,
      metadata: body.manifest.metadata,
      checkpoint: body.manifest,
    },
  };
}

export async function captureEvalCaseCheckpoint(
  params: CaptureEvalCaseCheckpointParams
): Promise<CaptureEvalCaseCheckpointResult> {
  const response = await fetch(`${NEON_API_URL}/api/checkpoints`, {
    method: "POST",
    headers: buildHeaders(params.projectId),
    body: JSON.stringify({
      kind: "eval_case",
      ...params,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to capture eval case checkpoint: ${error}`);
  }

  const body = (await response.json()) as {
    manifest: EmitCheckpointManifest;
    envelope: EvalCaseCheckpointEnvelope;
  };

  return {
    manifest: body.manifest,
    envelope: body.envelope,
    snapshot: {
      snapshotId: body.manifest.snapshotId,
      name: body.manifest.name,
      stateType: body.manifest.stateType,
      uri: body.manifest.payload?.uri,
      contentHash: body.manifest.integrity.contentHash,
      metadata: body.manifest.metadata,
      checkpoint: body.manifest,
    },
  };
}

export async function captureEvalRunCheckpoint(
  params: CaptureEvalRunCheckpointParams
): Promise<CaptureEvalRunCheckpointResult> {
  const response = await fetch(`${NEON_API_URL}/api/checkpoints`, {
    method: "POST",
    headers: buildHeaders(params.projectId),
    body: JSON.stringify({
      kind: "eval_run",
      ...params,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to capture eval run checkpoint: ${error}`);
  }

  const body = (await response.json()) as {
    manifest: EmitCheckpointManifest;
    envelope: EvalRunCheckpointEnvelope;
  };

  return {
    manifest: body.manifest,
    envelope: body.envelope,
    snapshot: {
      snapshotId: body.manifest.snapshotId,
      name: body.manifest.name,
      stateType: body.manifest.stateType,
      uri: body.manifest.payload?.uri,
      contentHash: body.manifest.integrity.contentHash,
      metadata: body.manifest.metadata,
      checkpoint: body.manifest,
    },
  };
}

export async function captureTrainingLoopCheckpoint(
  params: CaptureTrainingLoopCheckpointParams
): Promise<CaptureTrainingLoopCheckpointResult> {
  const response = await fetch(`${NEON_API_URL}/api/checkpoints`, {
    method: "POST",
    headers: buildHeaders(params.projectId),
    body: JSON.stringify({
      kind: "training_loop",
      ...params,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to capture training loop checkpoint: ${error}`);
  }

  const body = (await response.json()) as {
    manifest: EmitCheckpointManifest;
    envelope: TrainingLoopCheckpointEnvelope;
  };

  return {
    manifest: body.manifest,
    envelope: body.envelope,
    snapshot: {
      snapshotId: body.manifest.snapshotId,
      name: body.manifest.name,
      stateType: body.manifest.stateType,
      uri: body.manifest.payload?.uri,
      contentHash: body.manifest.integrity.contentHash,
      metadata: body.manifest.metadata,
      checkpoint: body.manifest,
    },
  };
}

export async function captureProgressiveRolloutCheckpoint(
  params: CaptureProgressiveRolloutCheckpointParams
): Promise<CaptureProgressiveRolloutCheckpointResult> {
  const response = await fetch(`${NEON_API_URL}/api/checkpoints`, {
    method: "POST",
    headers: buildHeaders(params.projectId),
    body: JSON.stringify({
      kind: "progressive_rollout",
      ...params,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to capture progressive rollout checkpoint: ${error}`);
  }

  const body = (await response.json()) as {
    manifest: EmitCheckpointManifest;
    envelope: ProgressiveRolloutCheckpointEnvelope;
  };

  return {
    manifest: body.manifest,
    envelope: body.envelope,
    snapshot: {
      snapshotId: body.manifest.snapshotId,
      name: body.manifest.name,
      stateType: body.manifest.stateType,
      uri: body.manifest.payload?.uri,
      contentHash: body.manifest.integrity.contentHash,
      metadata: body.manifest.metadata,
      checkpoint: body.manifest,
    },
  };
}
