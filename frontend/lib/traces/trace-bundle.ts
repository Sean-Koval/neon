import type {
  ScoreRecord,
  SpanRecord,
  SpanSummary,
  TraceRecord,
} from '@/lib/clickhouse'

type TraceSpanLike = Pick<
  SpanSummary,
  | 'project_id'
  | 'trace_id'
  | 'span_id'
  | 'parent_span_id'
  | 'name'
  | 'span_type'
  | 'timestamp'
  | 'end_time'
  | 'duration_ms'
  | 'status'
  | 'status_message'
  | 'attributes'
>

type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue }

export interface CheckpointPayloadReference {
  kind: 'uri' | 'artifact' | 'inline' | 'reference'
  uri?: string
  artifactId?: string
  mimeType?: string
  contentHash?: string
  sizeBytes?: number
}

export interface CheckpointRuntimeIdentity {
  projectId?: string
  traceId?: string
  workflowId?: string
  workflowRunId?: string
  agentId?: string
  agentVersion?: string
  sessionId?: string
  threadId?: string
  spanId?: string
  parentSpanId?: string | null
  capturedAt?: string
  sequence?: number
}

export interface CheckpointRestoreSemantics {
  mode: 'resume' | 'restore' | 'replay'
  target: 'workflow' | 'agent' | 'span' | 'session'
  entrySpanId?: string
  requiresApproval?: boolean
  replaysSideEffects?: boolean
}

export interface CheckpointIntegrity {
  schemaVersion: string
  contentHash?: string
  metadataHash?: string
  redactionApplied?: boolean
}

export interface CheckpointManifest {
  format: 'neon.checkpoint.v1'
  checkpointId: string
  snapshotId: string
  name?: string
  stateType?: string
  payload?: CheckpointPayloadReference
  runtime: CheckpointRuntimeIdentity
  restore: CheckpointRestoreSemantics
  integrity: CheckpointIntegrity
  metadata?: Record<string, string>
}

export interface TraceSnapshotReference {
  snapshotId: string
  name?: string
  stateType?: string
  uri?: string
  contentHash?: string
  artifactIds?: string[]
  metadata?: Record<string, string>
  checkpoint?: CheckpointManifest
}

export interface TraceArtifactReference {
  artifactId?: string
  name?: string
  kind?: string
  uri?: string
  mimeType?: string
  contentHash?: string
  sizeBytes?: number
  metadata?: Record<string, string>
}

export interface TraceEventRecord {
  sequence: number
  traceId: string
  spanId: string
  parentSpanId: string | null
  name: string
  spanType: string
  timestamp: string
  endTime: string | null
  durationMs: number
  status: string
  statusMessage: string
  attributes: Record<string, string>
  session?: JSONValue
  inputMessages?: JSONValue
  outputMessages?: JSONValue
  handoff?: JSONValue
  stateSnapshots?: TraceSnapshotReference[]
  artifacts?: TraceArtifactReference[]
  evalAnnotations?: JSONValue
  decisionMetadata?: JSONValue
}

export interface TraceCheckpointRecord {
  sequence: number
  traceId: string
  spanId: string
  parentSpanId: string | null
  timestamp: string
  spanName: string
  spanStatus: string
  snapshotId: string
  snapshotIndex: number
  name?: string
  stateType?: string
  uri?: string
  contentHash?: string
  artifactIds: string[]
  metadata?: Record<string, string>
  manifest: CheckpointManifest
  payload?: CheckpointPayloadReference
  runtime: CheckpointRuntimeIdentity
  restore: CheckpointRestoreSemantics
  integrity: CheckpointIntegrity
  source: 'embedded' | 'derived'
}

export interface TraceBundle {
  format: 'neon.trace-bundle.v1'
  exportedAt: string
  trace: TraceRecord
  spans: SpanRecord[]
  scores: ScoreRecord[]
  events: TraceEventRecord[]
  checkpoints: TraceCheckpointRecord[]
}

function parseJSONAttribute<T>(attributes: Record<string, string>, key: string): T | undefined {
  const value = attributes[key]
  if (!value) return undefined

  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}

function isCheckpointManifest(value: unknown): value is CheckpointManifest {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Partial<CheckpointManifest>
  return (
    candidate.format === 'neon.checkpoint.v1' &&
    typeof candidate.checkpointId === 'string' &&
    typeof candidate.snapshotId === 'string' &&
    !!candidate.runtime &&
    !!candidate.restore &&
    !!candidate.integrity
  )
}

function deriveCheckpointPayload(
  snapshot: TraceSnapshotReference,
): CheckpointPayloadReference | undefined {
  if (snapshot.uri) {
    return {
      kind: 'uri',
      uri: snapshot.uri,
      contentHash: snapshot.contentHash,
    }
  }

  if (snapshot.artifactIds?.[0]) {
    return {
      kind: 'artifact',
      artifactId: snapshot.artifactIds[0],
      contentHash: snapshot.contentHash,
    }
  }

  if (snapshot.contentHash) {
    return {
      kind: 'reference',
      contentHash: snapshot.contentHash,
    }
  }

  return undefined
}

function buildCheckpointManifest(params: {
  sequence: number
  span: TraceSpanLike
  snapshot: TraceSnapshotReference
  trace?: TraceRecord
}): { manifest: CheckpointManifest; source: 'embedded' | 'derived' } {
  const { sequence, span, snapshot, trace } = params
  const snapshotId = snapshot.snapshotId
  const session =
    parseJSONAttribute<{ sessionId?: string; threadId?: string }>(
      span.attributes,
      'neon.session',
    ) ?? {}

  if (isCheckpointManifest(snapshot.checkpoint)) {
    return {
      manifest: snapshot.checkpoint,
      source: 'embedded',
    }
  }

  const payload = deriveCheckpointPayload(snapshot)
  const manifest: CheckpointManifest = {
    format: 'neon.checkpoint.v1',
    checkpointId: snapshotId,
    snapshotId,
    name: snapshot.name,
    stateType: snapshot.stateType,
    payload,
    runtime: {
      projectId: trace?.project_id ?? span.project_id,
      traceId: trace?.trace_id ?? span.trace_id,
      workflowId: trace?.workflow_id ?? undefined,
      workflowRunId: trace?.run_id ?? undefined,
      agentId: trace?.agent_id ?? undefined,
      agentVersion: trace?.agent_version ?? undefined,
      sessionId: session.sessionId,
      threadId: session.threadId,
      spanId: span.span_id,
      parentSpanId: span.parent_span_id,
      capturedAt: span.timestamp,
      sequence,
    },
    restore: {
      mode: 'restore',
      target: snapshot.stateType === 'session' ? 'session' : 'workflow',
      entrySpanId: span.span_id,
      requiresApproval: false,
      replaysSideEffects: false,
    },
    integrity: {
      schemaVersion: '1',
      contentHash: snapshot.contentHash,
      redactionApplied: false,
    },
    metadata: snapshot.metadata,
  }

  return {
    manifest,
    source: 'derived',
  }
}

export function buildTraceEventsFromSpans(spans: TraceSpanLike[]): TraceEventRecord[] {
  return spans.map((span, index) => ({
    sequence: index,
    traceId: span.trace_id,
    spanId: span.span_id,
    parentSpanId: span.parent_span_id,
    name: span.name,
    spanType: span.span_type,
    timestamp: span.timestamp,
    endTime: span.end_time,
    durationMs: span.duration_ms,
    status: span.status,
    statusMessage: span.status_message,
    attributes: span.attributes,
    session: parseJSONAttribute<JSONValue>(span.attributes, 'neon.session'),
    inputMessages: parseJSONAttribute<JSONValue>(
      span.attributes,
      'gen_ai.input.messages',
    ),
    outputMessages: parseJSONAttribute<JSONValue>(
      span.attributes,
      'gen_ai.output.messages',
    ),
    handoff: parseJSONAttribute<JSONValue>(span.attributes, 'neon.handoff'),
    stateSnapshots: parseJSONAttribute<TraceSnapshotReference[]>(
      span.attributes,
      'neon.state_snapshots',
    ),
    artifacts: parseJSONAttribute<TraceArtifactReference[]>(
      span.attributes,
      'neon.artifacts',
    ),
    evalAnnotations: parseJSONAttribute<JSONValue>(
      span.attributes,
      'neon.eval.annotations',
    ),
    decisionMetadata: parseJSONAttribute<JSONValue>(
      span.attributes,
      'neon.decision_metadata',
    ),
  }))
}

export function buildTraceCheckpointsFromSpans(
  spans: TraceSpanLike[],
  trace?: TraceRecord,
): TraceCheckpointRecord[] {
  const checkpoints: TraceCheckpointRecord[] = []

  for (const [spanIndex, span] of spans.entries()) {
    const snapshots =
      parseJSONAttribute<TraceSnapshotReference[]>(
        span.attributes,
        'neon.state_snapshots',
      ) ?? []

    for (const [snapshotIndex, snapshot] of snapshots.entries()) {
      const snapshotId =
        snapshot.snapshotId ?? `${span.span_id}:checkpoint:${spanIndex}:${snapshotIndex}`
      const { manifest, source } = buildCheckpointManifest({
        sequence: checkpoints.length,
        span,
        snapshot: {
          ...snapshot,
          snapshotId,
        },
        trace,
      })

      checkpoints.push({
        sequence: checkpoints.length,
        traceId: span.trace_id,
        spanId: span.span_id,
        parentSpanId: span.parent_span_id,
        timestamp: span.timestamp,
        spanName: span.name,
        spanStatus: span.status,
        snapshotId,
        snapshotIndex,
        name: snapshot.name,
        stateType: snapshot.stateType,
        uri: snapshot.uri,
        contentHash: snapshot.contentHash,
        artifactIds: snapshot.artifactIds ?? [],
        metadata: snapshot.metadata,
        manifest,
        payload: manifest.payload,
        runtime: manifest.runtime,
        restore: manifest.restore,
        integrity: manifest.integrity,
        source,
      })
    }
  }

  return checkpoints
}

export function buildTraceBundle(params: {
  trace: TraceRecord
  spans: SpanRecord[]
  scores: ScoreRecord[]
}): TraceBundle {
  return {
    format: 'neon.trace-bundle.v1',
    exportedAt: new Date().toISOString(),
    trace: params.trace,
    spans: params.spans,
    scores: params.scores,
    events: buildTraceEventsFromSpans(params.spans),
    checkpoints: buildTraceCheckpointsFromSpans(params.spans, params.trace),
  }
}

export function isTraceBundle(value: unknown): value is TraceBundle {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Partial<TraceBundle>
  return (
    candidate.format === 'neon.trace-bundle.v1' &&
    !!candidate.trace &&
    Array.isArray(candidate.spans) &&
    Array.isArray(candidate.scores)
  )
}
