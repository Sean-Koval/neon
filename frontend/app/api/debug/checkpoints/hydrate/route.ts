import { type NextRequest, NextResponse } from 'next/server'
import { traces } from '@/lib/db/clickhouse'
import { logger } from '@/lib/logger'
import { type AuthResult, withAuth } from '@/lib/middleware/auth'
import { withRateLimit } from '@/lib/middleware/rate-limit'
import {
  broadcastToTrace,
  hydrateSessionState,
} from '../../stream/route'
import {
  buildTraceCheckpointsFromSpans,
  type CheckpointManifest,
  type TraceCheckpointRecord,
} from '@/lib/traces/trace-bundle'

interface HydrateCheckpointRequest {
  traceId?: string
  checkpointId?: string
  snapshotId?: string
  mode?: CheckpointManifest['restore']['mode']
  manifest?: CheckpointManifest
}

function isCheckpointManifest(value: unknown): value is CheckpointManifest {
  const candidate = value as Partial<CheckpointManifest>
  return (
    candidate?.format === 'neon.checkpoint.v1' &&
    typeof candidate.checkpointId === 'string' &&
    typeof candidate.snapshotId === 'string' &&
    !!candidate.runtime &&
    !!candidate.restore &&
    !!candidate.integrity
  )
}

function resolveRequestedCheckpoint(
  checkpoints: TraceCheckpointRecord[],
  body: HydrateCheckpointRequest,
): TraceCheckpointRecord | undefined {
  if (body.checkpointId) {
    return checkpoints.find(
      (checkpoint) => checkpoint.manifest.checkpointId === body.checkpointId,
    )
  }

  if (body.snapshotId) {
    return checkpoints.find(
      (checkpoint) => checkpoint.manifest.snapshotId === body.snapshotId,
    )
  }

  if (isCheckpointManifest(body.manifest)) {
    return checkpoints.find(
      (checkpoint) =>
        checkpoint.manifest.checkpointId === body.manifest?.checkpointId ||
        checkpoint.manifest.snapshotId === body.manifest?.snapshotId,
    )
  }

  return undefined
}

export const POST = withRateLimit(
  withAuth(async (request: NextRequest, auth: AuthResult) => {
    try {
      const body: HydrateCheckpointRequest = await request.json()
      const projectId = auth.workspaceId
      const traceId = body.traceId ?? body.manifest?.runtime.traceId

      if (!projectId) {
        return NextResponse.json(
          { error: 'Workspace context required' },
          { status: 400 },
        )
      }

      if (!traceId) {
        return NextResponse.json(
          {
            error:
              'Missing required field: traceId (or manifest.runtime.traceId)',
          },
          { status: 400 },
        )
      }

      if (!body.checkpointId && !body.snapshotId && !isCheckpointManifest(body.manifest)) {
        return NextResponse.json(
          {
            error:
              'Missing required checkpoint selector: checkpointId, snapshotId, or manifest',
          },
          { status: 400 },
        )
      }

      const { data: result } = await traces.getTraceSummary(projectId, traceId)
      if (!result) {
        return NextResponse.json({ error: 'Trace not found' }, { status: 404 })
      }

      const checkpoints = buildTraceCheckpointsFromSpans(
        result.spans,
        result.trace,
      )
      if (checkpoints.length === 0) {
        return NextResponse.json(
          { error: 'Trace has no checkpoints to hydrate' },
          { status: 404 },
        )
      }

      const resolvedCheckpoint = resolveRequestedCheckpoint(checkpoints, body)
      if (!resolvedCheckpoint) {
        return NextResponse.json(
          { error: 'Checkpoint not found for trace' },
          { status: 404 },
        )
      }

      const manifest = {
        ...resolvedCheckpoint.manifest,
        restore: {
          ...resolvedCheckpoint.manifest.restore,
          mode: body.mode ?? resolvedCheckpoint.manifest.restore.mode,
        },
      }

      const sessionState = hydrateSessionState(traceId, manifest)
      const hydratedAt = sessionState.hydratedAt ?? new Date().toISOString()

      broadcastToTrace(traceId, {
        type: 'hydrated',
        traceId,
        timestamp: hydratedAt,
        payload: {
          state: sessionState.state,
          message: `Hydrated checkpoint ${manifest.checkpointId}`,
          sessionState,
          data: {
            manifest,
            checkpointId: manifest.checkpointId,
            snapshotId: manifest.snapshotId,
            requestedMode: manifest.restore.mode,
            integrity: manifest.integrity,
            runtime: manifest.runtime,
            payload: sessionState.hydratedFrom?.payload,
            source: resolvedCheckpoint.source,
            hydratedAt,
          },
        },
      })

      return NextResponse.json({
        success: true,
        trace: result.trace,
        checkpoint: {
          ...resolvedCheckpoint,
          manifest,
          restore: manifest.restore,
        },
        sessionState,
      })
    } catch (error) {
      logger.error({ err: error }, 'Error hydrating checkpoint debug session')
      return NextResponse.json(
        {
          error: 'Failed to hydrate checkpoint debug session',
          details: String(error),
        },
        { status: 500 },
      )
    }
  }),
)
