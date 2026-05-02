import { createHash, randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'

import type { CheckpointManifest } from '@/lib/traces/trace-bundle'

export type CheckpointRestoreMode = 'restore' | 'replay'

export interface BaseCheckpointEnvelope {
  format: 'neon.checkpoint-body.v1'
  kind: string
  checkpointId: string
  traceId: string
  projectId: string
  capturedAt: string
  workflowId?: string
  workflowRunId?: string
  metadata?: Record<string, string>
}

export interface AgentCheckpointToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface AgentCheckpointMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCallId?: string
}

export interface AgentRunCheckpointState {
  iteration: number
  maxIterations: number
  status: 'running' | 'awaiting_approval' | 'completed' | 'rejected' | 'failed' | 'cancelled'
  messages: AgentCheckpointMessage[]
  requireApproval: boolean
  tools: AgentCheckpointToolDefinition[]
}

export interface AgentRunCheckpointEnvelope extends BaseCheckpointEnvelope {
  kind: 'agent_run'
  agentId: string
  agentVersion?: string
  state: AgentRunCheckpointState
  input: Record<string, unknown>
}

export interface AgentReplaySource {
  checkpointId: string
  traceId: string
  mode?: CheckpointRestoreMode
}

export interface AgentReplayWorkflowInput {
  projectId: string
  agentId: string
  agentVersion?: string
  input: Record<string, unknown>
  tools?: AgentCheckpointToolDefinition[]
  maxIterations?: number
  requireApproval?: boolean
  restoreFrom?: AgentReplaySource
  restoredCheckpoint?: AgentRunCheckpointEnvelope
}

export interface EvalCaseScoreSnapshot {
  name: string
  value: number
  reason?: string
  passed?: boolean
}

export interface EvalCaseAgentResult {
  traceId: string
  status:
    | 'running'
    | 'awaiting_approval'
    | 'completed'
    | 'rejected'
    | 'failed'
    | 'cancelled'
  output?: string
  iterations: number
  reason?: string
  restoredFromCheckpointId?: string
}

export interface EvalCaseWorkflowInput {
  caseId?: string
  runId?: string
  projectId: string
  agentId: string
  agentVersion?: string
  input: Record<string, unknown> | string
  expected?: Record<string, unknown>
  tools?: AgentCheckpointToolDefinition[]
  scorers: string[]
  configId?: string
  thresholds?: Record<string, number>
  mode?: 'full' | 'lightweight'
  maxIterations?: number
  model?: string
  systemPrompt?: string
  traceId?: string
  restoreFrom?: EvalCaseReplaySource
  restoredCheckpoint?: EvalCaseCheckpointEnvelope
}

export interface EvalCaseCheckpointState {
  status:
    | 'pending'
    | 'running_agent'
    | 'scoring'
    | 'completed'
    | 'failed'
    | 'cancelled'
  scores: EvalCaseScoreSnapshot[]
  agentResult?: EvalCaseAgentResult
  error?: string
}

export interface EvalCaseCheckpointEnvelope extends BaseCheckpointEnvelope {
  kind: 'eval_case'
  caseId?: string
  runId?: string
  agentId: string
  agentVersion?: string
  input: Omit<EvalCaseWorkflowInput, 'restoreFrom' | 'restoredCheckpoint'>
  state: EvalCaseCheckpointState
}

export interface EvalCaseReplaySource {
  checkpointId: string
  traceId: string
  mode?: CheckpointRestoreMode
}

export interface EvalRunDatasetItem {
  input: Record<string, unknown>
  expected?: Record<string, unknown>
}

export interface EvalRunNotifyConfig {
  slackWebhookUrl?: string
  webhookUrl?: string
  dashboardUrl?: string
  notifyOnSuccess?: boolean
  notifyOnFailure?: boolean
  scoreThreshold?: number
}

export interface EvalRunCaseResult {
  caseIndex: number
  result: EvalCaseAgentResult
  scores: EvalCaseScoreSnapshot[]
}

export interface EvalRunWorkflowInput {
  runId: string
  projectId: string
  agentId: string
  agentVersion?: string
  dataset: {
    items: EvalRunDatasetItem[]
  }
  tools: AgentCheckpointToolDefinition[]
  scorers: string[]
  notify?: EvalRunNotifyConfig
  parallelism?: number
  restoreFrom?: EvalRunReplaySource
  restoredCheckpoint?: EvalRunCheckpointEnvelope
}

export interface EvalRunCheckpointState {
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  completed: number
  total: number
  passed: number
  failed: number
  nextCaseIndex: number
  results: EvalRunCaseResult[]
  error?: string
}

export interface EvalRunCheckpointEnvelope extends BaseCheckpointEnvelope {
  kind: 'eval_run'
  runId: string
  agentId: string
  agentVersion?: string
  input: Omit<EvalRunWorkflowInput, 'restoreFrom' | 'restoredCheckpoint'>
  state: EvalRunCheckpointState
}

export interface EvalRunReplaySource {
  checkpointId: string
  traceId: string
  mode?: CheckpointRestoreMode
}

export interface ProgressiveRolloutAgentConfig {
  agentId: string
  agentVersion: string
  tools: AgentCheckpointToolDefinition[]
}

export interface ProgressiveRolloutDatasetItem {
  input: Record<string, unknown>
  expected?: Record<string, unknown>
}

export interface ProgressiveRolloutReplaySource {
  checkpointId: string
  traceId: string
  mode?: CheckpointRestoreMode
}

export interface ProgressiveRolloutWorkflowInput {
  rolloutId: string
  projectId: string
  currentAgent: ProgressiveRolloutAgentConfig
  newAgent: ProgressiveRolloutAgentConfig
  dataset: {
    items: ProgressiveRolloutDatasetItem[]
  }
  scorers: string[]
  stages: number[]
  minimumScore: number
  stageDurationMs: number
  restoreFrom?: ProgressiveRolloutReplaySource
  restoredCheckpoint?: ProgressiveRolloutCheckpointEnvelope
}

export interface ProgressiveRolloutStageResult {
  stage: number
  percentage: number
  score: number
  passed: boolean
  runId: string
}

export interface ProgressiveRolloutCheckpointState {
  status: 'running' | 'completed' | 'aborted' | 'failed'
  currentStageIndex: number
  currentPercentage: number
  stages: number[]
  scores: number[]
  stageResults: ProgressiveRolloutStageResult[]
  nextStageIndex: number
  abortReason?: string
  error?: string
}

export interface ProgressiveRolloutCheckpointEnvelope extends BaseCheckpointEnvelope {
  kind: 'progressive_rollout'
  rolloutId: string
  input: Omit<
    ProgressiveRolloutWorkflowInput,
    'restoreFrom' | 'restoredCheckpoint'
  >
  state: ProgressiveRolloutCheckpointState
}

export type TrainingLoopStage =
  | 'idle'
  | 'collecting'
  | 'curating'
  | 'optimizing'
  | 'evaluating'
  | 'deploying'
  | 'monitoring'

export interface TrainingLoopWorkflowInput {
  projectId: string
  suiteId: string
  promptId: string
  strategy: 'coordinate_ascent' | 'example_selection' | 'reflection'
  trigger: 'regression' | 'signal_threshold' | 'manual'
  maxIterations?: number
  improvementThreshold?: number
  signalTypes?: string[]
  timeWindow?: { startDate: string; endDate: string }
  restoreFrom?: TrainingLoopReplaySource
  restoredCheckpoint?: TrainingLoopCheckpointEnvelope
}

export interface TrainingLoopStageResult {
  iteration: number
  stage: TrainingLoopStage
  status: 'completed' | 'skipped' | 'failed'
  metrics: Record<string, number>
  durationMs: number
  timestamp: string
}

export interface TrainingLoopCheckpointState {
  status: 'running' | 'completed' | 'failed' | 'aborted'
  currentStage: TrainingLoopStage
  currentIteration: number
  maxIterations: number
  baselineScore: number
  currentMetrics: Record<string, number>
  stageHistory: TrainingLoopStageResult[]
  collectedSignals: unknown[]
  curatedData: unknown[]
  approvalStatus: 'idle' | 'pending' | 'approved' | 'rejected'
  error?: string
}

export interface TrainingLoopCheckpointEnvelope extends BaseCheckpointEnvelope {
  kind: 'training_loop'
  loopId: string
  promptId: string
  suiteId: string
  input: Omit<TrainingLoopWorkflowInput, 'restoreFrom' | 'restoredCheckpoint'>
  state: TrainingLoopCheckpointState
}

export interface TrainingLoopReplaySource {
  checkpointId: string
  traceId: string
  mode?: CheckpointRestoreMode
}

export type StoredCheckpointEnvelope =
  | AgentRunCheckpointEnvelope
  | EvalCaseCheckpointEnvelope
  | EvalRunCheckpointEnvelope
  | ProgressiveRolloutCheckpointEnvelope
  | TrainingLoopCheckpointEnvelope

export interface PersistAgentCheckpointParams {
  projectId: string
  traceId: string
  workflowId?: string
  workflowRunId?: string
  agentId: string
  agentVersion?: string
  input: AgentReplayWorkflowInput['input']
  state: AgentRunCheckpointState
  manifest: CheckpointManifest
  metadata?: Record<string, string>
}

export interface PersistEvalCaseCheckpointParams {
  projectId: string
  traceId: string
  workflowId?: string
  workflowRunId?: string
  caseId?: string
  runId?: string
  agentId: string
  agentVersion?: string
  input: Omit<EvalCaseWorkflowInput, 'restoreFrom' | 'restoredCheckpoint'>
  state: EvalCaseCheckpointState
  manifest: CheckpointManifest
  metadata?: Record<string, string>
}

export interface PersistEvalRunCheckpointParams {
  projectId: string
  traceId: string
  workflowId?: string
  workflowRunId?: string
  runId: string
  agentId: string
  agentVersion?: string
  input: Omit<EvalRunWorkflowInput, 'restoreFrom' | 'restoredCheckpoint'>
  state: EvalRunCheckpointState
  manifest: CheckpointManifest
  metadata?: Record<string, string>
}

export interface PersistTrainingLoopCheckpointParams {
  projectId: string
  traceId: string
  workflowId?: string
  workflowRunId?: string
  loopId: string
  promptId: string
  suiteId: string
  input: Omit<TrainingLoopWorkflowInput, 'restoreFrom' | 'restoredCheckpoint'>
  state: TrainingLoopCheckpointState
  manifest: CheckpointManifest
  metadata?: Record<string, string>
}

export interface PersistProgressiveRolloutCheckpointParams {
  projectId: string
  traceId: string
  workflowId?: string
  workflowRunId?: string
  rolloutId: string
  input: Omit<
    ProgressiveRolloutWorkflowInput,
    'restoreFrom' | 'restoredCheckpoint'
  >
  state: ProgressiveRolloutCheckpointState
  manifest: CheckpointManifest
  metadata?: Record<string, string>
}

export interface StoredAgentCheckpoint {
  manifest: CheckpointManifest
  envelope: AgentRunCheckpointEnvelope
  path: string
}

export interface StoredEvalCaseCheckpoint {
  manifest: CheckpointManifest
  envelope: EvalCaseCheckpointEnvelope
  path: string
}

export interface StoredEvalRunCheckpoint {
  manifest: CheckpointManifest
  envelope: EvalRunCheckpointEnvelope
  path: string
}

export interface StoredTrainingLoopCheckpoint {
  manifest: CheckpointManifest
  envelope: TrainingLoopCheckpointEnvelope
  path: string
}

export interface StoredProgressiveRolloutCheckpoint {
  manifest: CheckpointManifest
  envelope: ProgressiveRolloutCheckpointEnvelope
  path: string
}

export interface StoredCheckpoint {
  manifest: CheckpointManifest
  envelope: StoredCheckpointEnvelope
  path: string
}

export interface StartWorkflowFromCheckpointRequest {
  kind: StoredCheckpointEnvelope['kind']
  checkpointId: string
  sourceTraceId: string
  mode: CheckpointRestoreMode
  workflowName: string
  workflowId: string
  args: unknown[]
  memo?: Record<string, unknown>
}

export interface StartReplayFromCheckpointParams {
  projectId: string
  checkpointId: string
  overrides?: Record<string, unknown>
  mode?: CheckpointRestoreMode
}

export class UnsupportedCheckpointKindError extends Error {
  readonly kind: string

  constructor(kind: string) {
    super(`Checkpoint kind '${kind}' does not support runtime restore yet`)
    this.name = 'UnsupportedCheckpointKindError'
    this.kind = kind
  }
}

function isStoredAgentCheckpoint(
  stored: StoredCheckpoint,
): stored is StoredAgentCheckpoint {
  return stored.envelope.kind === 'agent_run'
}

function isStoredEvalCaseCheckpoint(
  stored: StoredCheckpoint,
): stored is StoredEvalCaseCheckpoint {
  return stored.envelope.kind === 'eval_case'
}

function isStoredEvalRunCheckpoint(
  stored: StoredCheckpoint,
): stored is StoredEvalRunCheckpoint {
  return stored.envelope.kind === 'eval_run'
}

function isStoredTrainingLoopCheckpoint(
  stored: StoredCheckpoint,
): stored is StoredTrainingLoopCheckpoint {
  return stored.envelope.kind === 'training_loop'
}

function isStoredProgressiveRolloutCheckpoint(
  stored: StoredCheckpoint,
): stored is StoredProgressiveRolloutCheckpoint {
  return stored.envelope.kind === 'progressive_rollout'
}

function getCheckpointRoot(): string {
  return (
    process.env.NEON_CHECKPOINT_DIR ||
    path.join(process.cwd(), '.neon', 'checkpoints')
  )
}

function getCheckpointPath(projectId: string, checkpointId: string): string {
  return path.join(getCheckpointRoot(), projectId, `${checkpointId}.json`)
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function writeJSONAtomic(targetPath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  const tempPath = `${targetPath}.${randomUUID()}.tmp`
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), 'utf8')
  await fs.rename(tempPath, targetPath)
}

function buildBodyUri(checkpointId: string): string {
  return `/api/checkpoints/${checkpointId}`
}

export async function persistAgentCheckpoint(
  params: PersistAgentCheckpointParams,
): Promise<StoredAgentCheckpoint> {
  const capturedAt = params.manifest.runtime.capturedAt || new Date().toISOString()
  const envelope: AgentRunCheckpointEnvelope = {
    format: 'neon.checkpoint-body.v1',
    kind: 'agent_run',
    checkpointId: params.manifest.checkpointId,
    traceId: params.traceId,
    projectId: params.projectId,
    agentId: params.agentId,
    agentVersion: params.agentVersion,
    capturedAt,
    workflowId: params.workflowId,
    workflowRunId: params.workflowRunId,
    state: params.state,
    input: params.input,
    metadata: params.metadata,
  }

  const serialized = JSON.stringify(envelope)
  const contentHash = `sha256:${sha256(serialized)}`
  const checkpointPath = getCheckpointPath(
    params.projectId,
    params.manifest.checkpointId,
  )

  const manifest: CheckpointManifest = {
    ...params.manifest,
    payload: {
      kind: 'uri',
      uri: buildBodyUri(params.manifest.checkpointId),
      mimeType: 'application/json',
      contentHash,
      sizeBytes: Buffer.byteLength(serialized),
    },
    integrity: {
      ...params.manifest.integrity,
      contentHash,
    },
    runtime: {
      ...params.manifest.runtime,
      projectId: params.projectId,
      traceId: params.traceId,
      capturedAt,
    },
  }

  await writeJSONAtomic(checkpointPath, {
    manifest,
    envelope,
  })

  return {
    manifest,
    envelope,
    path: checkpointPath,
  }
}

export async function persistEvalCaseCheckpoint(
  params: PersistEvalCaseCheckpointParams,
): Promise<StoredEvalCaseCheckpoint> {
  const capturedAt = params.manifest.runtime.capturedAt || new Date().toISOString()
  const envelope: EvalCaseCheckpointEnvelope = {
    format: 'neon.checkpoint-body.v1',
    kind: 'eval_case',
    checkpointId: params.manifest.checkpointId,
    traceId: params.traceId,
    projectId: params.projectId,
    capturedAt,
    workflowId: params.workflowId,
    workflowRunId: params.workflowRunId,
    caseId: params.caseId,
    runId: params.runId,
    agentId: params.agentId,
    agentVersion: params.agentVersion,
    input: params.input,
    state: params.state,
    metadata: params.metadata,
  }

  const serialized = JSON.stringify(envelope)
  const contentHash = `sha256:${sha256(serialized)}`
  const checkpointPath = getCheckpointPath(
    params.projectId,
    params.manifest.checkpointId,
  )

  const manifest: CheckpointManifest = {
    ...params.manifest,
    payload: {
      kind: 'uri',
      uri: buildBodyUri(params.manifest.checkpointId),
      mimeType: 'application/json',
      contentHash,
      sizeBytes: Buffer.byteLength(serialized),
    },
    integrity: {
      ...params.manifest.integrity,
      contentHash,
    },
    runtime: {
      ...params.manifest.runtime,
      projectId: params.projectId,
      traceId: params.traceId,
      workflowId: params.workflowId,
      workflowRunId: params.workflowRunId,
      agentId: params.agentId,
      agentVersion: params.agentVersion,
      capturedAt,
    },
  }

  await writeJSONAtomic(checkpointPath, {
    manifest,
    envelope,
  })

  return {
    manifest,
    envelope,
    path: checkpointPath,
  }
}

export async function persistEvalRunCheckpoint(
  params: PersistEvalRunCheckpointParams,
): Promise<StoredEvalRunCheckpoint> {
  const capturedAt = params.manifest.runtime.capturedAt || new Date().toISOString()
  const envelope: EvalRunCheckpointEnvelope = {
    format: 'neon.checkpoint-body.v1',
    kind: 'eval_run',
    checkpointId: params.manifest.checkpointId,
    traceId: params.traceId,
    projectId: params.projectId,
    capturedAt,
    workflowId: params.workflowId,
    workflowRunId: params.workflowRunId,
    runId: params.runId,
    agentId: params.agentId,
    agentVersion: params.agentVersion,
    input: params.input,
    state: params.state,
    metadata: params.metadata,
  }

  const serialized = JSON.stringify(envelope)
  const contentHash = `sha256:${sha256(serialized)}`
  const checkpointPath = getCheckpointPath(
    params.projectId,
    params.manifest.checkpointId,
  )

  const manifest: CheckpointManifest = {
    ...params.manifest,
    payload: {
      kind: 'uri',
      uri: buildBodyUri(params.manifest.checkpointId),
      mimeType: 'application/json',
      contentHash,
      sizeBytes: Buffer.byteLength(serialized),
    },
    integrity: {
      ...params.manifest.integrity,
      contentHash,
    },
    runtime: {
      ...params.manifest.runtime,
      projectId: params.projectId,
      traceId: params.traceId,
      workflowId: params.workflowId,
      workflowRunId: params.workflowRunId,
      agentId: params.agentId,
      agentVersion: params.agentVersion,
      capturedAt,
    },
  }

  await writeJSONAtomic(checkpointPath, {
    manifest,
    envelope,
  })

  return {
    manifest,
    envelope,
    path: checkpointPath,
  }
}

export async function persistTrainingLoopCheckpoint(
  params: PersistTrainingLoopCheckpointParams,
): Promise<StoredTrainingLoopCheckpoint> {
  const capturedAt = params.manifest.runtime.capturedAt || new Date().toISOString()
  const envelope: TrainingLoopCheckpointEnvelope = {
    format: 'neon.checkpoint-body.v1',
    kind: 'training_loop',
    checkpointId: params.manifest.checkpointId,
    traceId: params.traceId,
    projectId: params.projectId,
    capturedAt,
    workflowId: params.workflowId,
    workflowRunId: params.workflowRunId,
    loopId: params.loopId,
    promptId: params.promptId,
    suiteId: params.suiteId,
    input: params.input,
    state: params.state,
    metadata: params.metadata,
  }

  const serialized = JSON.stringify(envelope)
  const contentHash = `sha256:${sha256(serialized)}`
  const checkpointPath = getCheckpointPath(
    params.projectId,
    params.manifest.checkpointId,
  )

  const manifest: CheckpointManifest = {
    ...params.manifest,
    payload: {
      kind: 'uri',
      uri: buildBodyUri(params.manifest.checkpointId),
      mimeType: 'application/json',
      contentHash,
      sizeBytes: Buffer.byteLength(serialized),
    },
    integrity: {
      ...params.manifest.integrity,
      contentHash,
    },
    runtime: {
      ...params.manifest.runtime,
      projectId: params.projectId,
      traceId: params.traceId,
      workflowId: params.workflowId,
      workflowRunId: params.workflowRunId,
      agentId: params.promptId,
      capturedAt,
    },
  }

  await writeJSONAtomic(checkpointPath, {
    manifest,
    envelope,
  })

  return {
    manifest,
    envelope,
    path: checkpointPath,
  }
}

export async function persistProgressiveRolloutCheckpoint(
  params: PersistProgressiveRolloutCheckpointParams,
): Promise<StoredProgressiveRolloutCheckpoint> {
  const capturedAt = params.manifest.runtime.capturedAt || new Date().toISOString()
  const envelope: ProgressiveRolloutCheckpointEnvelope = {
    format: 'neon.checkpoint-body.v1',
    kind: 'progressive_rollout',
    checkpointId: params.manifest.checkpointId,
    traceId: params.traceId,
    projectId: params.projectId,
    capturedAt,
    workflowId: params.workflowId,
    workflowRunId: params.workflowRunId,
    rolloutId: params.rolloutId,
    input: params.input,
    state: params.state,
    metadata: params.metadata,
  }

  const serialized = JSON.stringify(envelope)
  const contentHash = `sha256:${sha256(serialized)}`
  const checkpointPath = getCheckpointPath(
    params.projectId,
    params.manifest.checkpointId,
  )

  const manifest: CheckpointManifest = {
    ...params.manifest,
    payload: {
      kind: 'uri',
      uri: buildBodyUri(params.manifest.checkpointId),
      mimeType: 'application/json',
      contentHash,
      sizeBytes: Buffer.byteLength(serialized),
    },
    integrity: {
      ...params.manifest.integrity,
      contentHash,
    },
    runtime: {
      ...params.manifest.runtime,
      projectId: params.projectId,
      traceId: params.traceId,
      workflowId: params.workflowId,
      workflowRunId: params.workflowRunId,
      agentId: params.input.newAgent.agentId,
      agentVersion: params.input.newAgent.agentVersion,
      capturedAt,
    },
  }

  await writeJSONAtomic(checkpointPath, {
    manifest,
    envelope,
  })

  return {
    manifest,
    envelope,
    path: checkpointPath,
  }
}

export async function readCheckpoint(params: {
  projectId: string
  checkpointId: string
}): Promise<StoredCheckpoint | null> {
  const checkpointPath = getCheckpointPath(params.projectId, params.checkpointId)

  try {
    const raw = await fs.readFile(checkpointPath, 'utf8')
    const parsed = JSON.parse(raw) as StoredCheckpoint
    return {
      manifest: parsed.manifest,
      envelope: parsed.envelope,
      path: checkpointPath,
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export async function readAgentCheckpoint(params: {
  projectId: string
  checkpointId: string
}): Promise<StoredAgentCheckpoint | null> {
  const stored = await readCheckpoint(params)
  if (!stored) {
    return null
  }

  if (stored.envelope.kind !== 'agent_run') {
    throw new UnsupportedCheckpointKindError(stored.envelope.kind)
  }

  return stored as StoredAgentCheckpoint
}

export async function readEvalCaseCheckpoint(params: {
  projectId: string
  checkpointId: string
}): Promise<StoredEvalCaseCheckpoint | null> {
  const stored = await readCheckpoint(params)
  if (!stored) {
    return null
  }

  if (stored.envelope.kind !== 'eval_case') {
    throw new UnsupportedCheckpointKindError(stored.envelope.kind)
  }

  return stored as StoredEvalCaseCheckpoint
}

export async function readEvalRunCheckpoint(params: {
  projectId: string
  checkpointId: string
}): Promise<StoredEvalRunCheckpoint | null> {
  const stored = await readCheckpoint(params)
  if (!stored) {
    return null
  }

  if (stored.envelope.kind !== 'eval_run') {
    throw new UnsupportedCheckpointKindError(stored.envelope.kind)
  }

  return stored as StoredEvalRunCheckpoint
}

export async function readTrainingLoopCheckpoint(params: {
  projectId: string
  checkpointId: string
}): Promise<StoredTrainingLoopCheckpoint | null> {
  const stored = await readCheckpoint(params)
  if (!stored) {
    return null
  }

  if (stored.envelope.kind !== 'training_loop') {
    throw new UnsupportedCheckpointKindError(stored.envelope.kind)
  }

  return stored as StoredTrainingLoopCheckpoint
}

export async function readProgressiveRolloutCheckpoint(params: {
  projectId: string
  checkpointId: string
}): Promise<StoredProgressiveRolloutCheckpoint | null> {
  const stored = await readCheckpoint(params)
  if (!stored) {
    return null
  }

  if (stored.envelope.kind !== 'progressive_rollout') {
    throw new UnsupportedCheckpointKindError(stored.envelope.kind)
  }

  return stored as StoredProgressiveRolloutCheckpoint
}

function buildAgentReplayInputFromCheckpoint(
  stored: StoredAgentCheckpoint,
  params: StartReplayFromCheckpointParams,
): AgentReplayWorkflowInput {
  const overrides = params.overrides as
    | Partial<
        Pick<
          AgentReplayWorkflowInput,
          'agentVersion' | 'maxIterations' | 'requireApproval' | 'tools' | 'input'
        >
      >
    | undefined

  return {
    projectId: params.projectId,
    agentId: stored.envelope.agentId,
    agentVersion:
      overrides?.agentVersion ?? stored.envelope.agentVersion ?? 'latest',
    input: overrides?.input ?? stored.envelope.input,
    tools: overrides?.tools ?? stored.envelope.state.tools,
    maxIterations:
      overrides?.maxIterations ?? stored.envelope.state.maxIterations,
    requireApproval:
      overrides?.requireApproval ?? stored.envelope.state.requireApproval,
    restoreFrom: {
      checkpointId: stored.manifest.checkpointId,
      traceId: stored.envelope.traceId,
      mode: params.mode ?? 'replay',
    },
    restoredCheckpoint: stored.envelope,
  }
}

function buildEvalCaseReplayInputFromCheckpoint(
  stored: StoredEvalCaseCheckpoint,
  params: StartReplayFromCheckpointParams,
): EvalCaseWorkflowInput {
  const overrides = params.overrides as
    | Partial<
        Pick<
          EvalCaseWorkflowInput,
          | 'agentVersion'
          | 'input'
          | 'tools'
          | 'scorers'
          | 'thresholds'
          | 'mode'
          | 'maxIterations'
          | 'model'
          | 'systemPrompt'
          | 'expected'
        >
      >
    | undefined

  return {
    ...stored.envelope.input,
    projectId: params.projectId,
    agentVersion:
      overrides?.agentVersion ?? stored.envelope.agentVersion ?? stored.envelope.input.agentVersion,
    input: overrides?.input ?? stored.envelope.input.input,
    expected: overrides?.expected ?? stored.envelope.input.expected,
    tools: overrides?.tools ?? stored.envelope.input.tools,
    scorers: overrides?.scorers ?? stored.envelope.input.scorers,
    thresholds: overrides?.thresholds ?? stored.envelope.input.thresholds,
    mode: overrides?.mode ?? stored.envelope.input.mode,
    maxIterations:
      overrides?.maxIterations ?? stored.envelope.input.maxIterations,
    model: overrides?.model ?? stored.envelope.input.model,
    systemPrompt:
      overrides?.systemPrompt ?? stored.envelope.input.systemPrompt,
    restoreFrom: {
      checkpointId: stored.manifest.checkpointId,
      traceId: stored.envelope.traceId,
      mode: params.mode ?? 'replay',
    },
    restoredCheckpoint: stored.envelope,
  }
}

function buildEvalRunReplayInputFromCheckpoint(
  stored: StoredEvalRunCheckpoint,
  params: StartReplayFromCheckpointParams,
): EvalRunWorkflowInput {
  const overrides = params.overrides as
    | Partial<
        Pick<
          EvalRunWorkflowInput,
          | 'runId'
          | 'agentVersion'
          | 'dataset'
          | 'tools'
          | 'scorers'
          | 'notify'
          | 'parallelism'
        >
      >
    | undefined

  const replayMode = params.mode ?? 'replay'
  const sourceRunId = stored.envelope.runId || stored.envelope.input.runId
  const replayRunId =
    overrides?.runId ?? `${sourceRunId}-${replayMode}-${Date.now()}`

  return {
    ...stored.envelope.input,
    runId: replayRunId,
    projectId: params.projectId,
    agentVersion:
      overrides?.agentVersion ??
      stored.envelope.agentVersion ??
      stored.envelope.input.agentVersion,
    dataset: overrides?.dataset ?? stored.envelope.input.dataset,
    tools: overrides?.tools ?? stored.envelope.input.tools,
    scorers: overrides?.scorers ?? stored.envelope.input.scorers,
    notify: overrides?.notify ?? stored.envelope.input.notify,
    parallelism: overrides?.parallelism ?? stored.envelope.input.parallelism,
    restoreFrom: {
      checkpointId: stored.manifest.checkpointId,
      traceId: stored.envelope.traceId,
      mode: replayMode,
    },
    restoredCheckpoint: stored.envelope,
  }
}

function buildTrainingLoopReplayInputFromCheckpoint(
  stored: StoredTrainingLoopCheckpoint,
  params: StartReplayFromCheckpointParams,
): TrainingLoopWorkflowInput {
  const overrides = params.overrides as
    | Partial<
        Pick<
          TrainingLoopWorkflowInput,
          | 'suiteId'
          | 'promptId'
          | 'strategy'
          | 'trigger'
          | 'maxIterations'
          | 'improvementThreshold'
          | 'signalTypes'
          | 'timeWindow'
        >
      >
    | undefined

  return {
    ...stored.envelope.input,
    projectId: params.projectId,
    suiteId: overrides?.suiteId ?? stored.envelope.input.suiteId,
    promptId: overrides?.promptId ?? stored.envelope.input.promptId,
    strategy: overrides?.strategy ?? stored.envelope.input.strategy,
    trigger: overrides?.trigger ?? stored.envelope.input.trigger,
    maxIterations:
      overrides?.maxIterations ?? stored.envelope.input.maxIterations,
    improvementThreshold:
      overrides?.improvementThreshold ??
      stored.envelope.input.improvementThreshold,
    signalTypes: overrides?.signalTypes ?? stored.envelope.input.signalTypes,
    timeWindow: overrides?.timeWindow ?? stored.envelope.input.timeWindow,
    restoreFrom: {
      checkpointId: stored.manifest.checkpointId,
      traceId: stored.envelope.traceId,
      mode: params.mode ?? 'replay',
    },
    restoredCheckpoint: stored.envelope,
  }
}

function buildProgressiveRolloutReplayInputFromCheckpoint(
  stored: StoredProgressiveRolloutCheckpoint,
  params: StartReplayFromCheckpointParams,
): ProgressiveRolloutWorkflowInput {
  const overrides = params.overrides as
    | Partial<
        Pick<
          ProgressiveRolloutWorkflowInput,
          | 'rolloutId'
          | 'currentAgent'
          | 'newAgent'
          | 'dataset'
          | 'scorers'
          | 'stages'
          | 'minimumScore'
          | 'stageDurationMs'
        >
      >
    | undefined

  const replayMode = params.mode ?? 'replay'
  const sourceRolloutId =
    stored.envelope.rolloutId || stored.envelope.input.rolloutId
  const replayRolloutId =
    overrides?.rolloutId ?? `${sourceRolloutId}-${replayMode}-${Date.now()}`

  return {
    ...stored.envelope.input,
    rolloutId: replayRolloutId,
    projectId: params.projectId,
    currentAgent: overrides?.currentAgent ?? stored.envelope.input.currentAgent,
    newAgent: overrides?.newAgent ?? stored.envelope.input.newAgent,
    dataset: overrides?.dataset ?? stored.envelope.input.dataset,
    scorers: overrides?.scorers ?? stored.envelope.input.scorers,
    stages: overrides?.stages ?? stored.envelope.input.stages,
    minimumScore:
      overrides?.minimumScore ?? stored.envelope.input.minimumScore,
    stageDurationMs:
      overrides?.stageDurationMs ?? stored.envelope.input.stageDurationMs,
    restoreFrom: {
      checkpointId: stored.manifest.checkpointId,
      traceId: stored.envelope.traceId,
      mode: replayMode,
    },
    restoredCheckpoint: stored.envelope,
  }
}

export async function buildWorkflowStartRequestFromCheckpoint(
  params: StartReplayFromCheckpointParams,
): Promise<StartWorkflowFromCheckpointRequest | null> {
  const stored = await readCheckpoint(params)
  if (!stored) {
    return null
  }

  switch (stored.envelope.kind) {
    case 'agent_run': {
      if (!isStoredAgentCheckpoint(stored)) {
        throw new UnsupportedCheckpointKindError(stored.envelope.kind)
      }
      const replayInput = buildAgentReplayInputFromCheckpoint(stored, params)
      const checkpointId = replayInput.restoreFrom?.checkpointId || stored.manifest.checkpointId

      return {
        kind: stored.envelope.kind,
        checkpointId,
        sourceTraceId: replayInput.restoreFrom?.traceId ?? stored.envelope.traceId,
        mode: replayInput.restoreFrom?.mode ?? params.mode ?? 'replay',
        workflowName: 'agentRunWorkflow',
        workflowId: `agent-replay-${params.projectId}-${checkpointId}-${Date.now()}`,
        args: [replayInput],
        memo: {
          agentId: replayInput.agentId,
          agentVersion: replayInput.agentVersion || 'latest',
          checkpointId,
          sourceTraceId: replayInput.restoreFrom?.traceId,
          replayMode: replayInput.restoreFrom?.mode || 'replay',
        },
      }
    }
    case 'eval_case': {
      if (!isStoredEvalCaseCheckpoint(stored)) {
        throw new UnsupportedCheckpointKindError(stored.envelope.kind)
      }
      const replayInput = buildEvalCaseReplayInputFromCheckpoint(stored, params)
      const checkpointId =
        replayInput.restoreFrom?.checkpointId || stored.manifest.checkpointId

      return {
        kind: stored.envelope.kind,
        checkpointId,
        sourceTraceId:
          replayInput.restoreFrom?.traceId ?? stored.envelope.traceId,
        mode: replayInput.restoreFrom?.mode ?? params.mode ?? 'replay',
        workflowName: 'evalCaseWorkflow',
        workflowId: `eval-case-replay-${params.projectId}-${checkpointId}-${Date.now()}`,
        args: [replayInput],
        memo: {
          agentId: replayInput.agentId,
          agentVersion: replayInput.agentVersion || 'eval',
          checkpointId,
          sourceTraceId: replayInput.restoreFrom?.traceId,
          replayMode: replayInput.restoreFrom?.mode || 'replay',
          caseId: replayInput.caseId,
          runId: replayInput.runId,
        },
      }
    }
    case 'eval_run': {
      if (!isStoredEvalRunCheckpoint(stored)) {
        throw new UnsupportedCheckpointKindError(stored.envelope.kind)
      }
      const replayInput = buildEvalRunReplayInputFromCheckpoint(stored, params)
      const checkpointId =
        replayInput.restoreFrom?.checkpointId || stored.manifest.checkpointId

      return {
        kind: stored.envelope.kind,
        checkpointId,
        sourceTraceId:
          replayInput.restoreFrom?.traceId ?? stored.envelope.traceId,
        mode: replayInput.restoreFrom?.mode ?? params.mode ?? 'replay',
        workflowName: 'evalRunWorkflow',
        workflowId: `eval-run-replay-${params.projectId}-${checkpointId}-${Date.now()}`,
        args: [replayInput],
        memo: {
          agentId: replayInput.agentId,
          agentVersion: replayInput.agentVersion || 'eval',
          checkpointId,
          sourceTraceId: replayInput.restoreFrom?.traceId,
          replayMode: replayInput.restoreFrom?.mode || 'replay',
          sourceRunId: stored.envelope.runId,
          replayRunId: replayInput.runId,
        },
      }
    }
    case 'training_loop': {
      if (!isStoredTrainingLoopCheckpoint(stored)) {
        throw new UnsupportedCheckpointKindError(stored.envelope.kind)
      }
      const replayInput = buildTrainingLoopReplayInputFromCheckpoint(
        stored,
        params,
      )
      const checkpointId =
        replayInput.restoreFrom?.checkpointId || stored.manifest.checkpointId

      return {
        kind: stored.envelope.kind,
        checkpointId,
        sourceTraceId:
          replayInput.restoreFrom?.traceId ?? stored.envelope.traceId,
        mode: replayInput.restoreFrom?.mode ?? params.mode ?? 'replay',
        workflowName: 'trainingLoopWorkflow',
        workflowId: `training-loop-replay-${params.projectId}-${checkpointId}-${Date.now()}`,
        args: [replayInput],
        memo: {
          checkpointId,
          sourceTraceId: replayInput.restoreFrom?.traceId,
          replayMode: replayInput.restoreFrom?.mode || 'replay',
          loopId: stored.envelope.loopId,
          promptId: replayInput.promptId,
          suiteId: replayInput.suiteId,
        },
      }
    }
    case 'progressive_rollout': {
      if (!isStoredProgressiveRolloutCheckpoint(stored)) {
        throw new UnsupportedCheckpointKindError(stored.envelope.kind)
      }
      const replayInput = buildProgressiveRolloutReplayInputFromCheckpoint(
        stored,
        params,
      )
      const checkpointId =
        replayInput.restoreFrom?.checkpointId || stored.manifest.checkpointId

      return {
        kind: stored.envelope.kind,
        checkpointId,
        sourceTraceId:
          replayInput.restoreFrom?.traceId ?? stored.envelope.traceId,
        mode: replayInput.restoreFrom?.mode ?? params.mode ?? 'replay',
        workflowName: 'progressiveRolloutWorkflow',
        workflowId: `progressive-rollout-replay-${params.projectId}-${checkpointId}-${Date.now()}`,
        args: [replayInput],
        memo: {
          checkpointId,
          sourceTraceId: replayInput.restoreFrom?.traceId,
          replayMode: replayInput.restoreFrom?.mode || 'replay',
          sourceRolloutId: stored.envelope.rolloutId,
          replayRolloutId: replayInput.rolloutId,
          newAgentId: replayInput.newAgent.agentId,
          newAgentVersion: replayInput.newAgent.agentVersion,
        },
      }
    }
  }

  const unsupportedKind = stored.envelope as { kind: string }
  throw new UnsupportedCheckpointKindError(unsupportedKind.kind)
}

export async function buildReplayInputFromCheckpoint(
  params: StartReplayFromCheckpointParams,
): Promise<AgentReplayWorkflowInput | null> {
  const stored = await readAgentCheckpoint({
    projectId: params.projectId,
    checkpointId: params.checkpointId,
  })
  if (!stored) {
    return null
  }

  return buildAgentReplayInputFromCheckpoint(stored, params)
}
