import { type NextRequest, NextResponse } from 'next/server'

import {
  buildWorkflowStartRequestFromCheckpoint,
  readCheckpoint,
  UnsupportedCheckpointKindError,
} from '@/lib/checkpoints/store'
import { logger } from '@/lib/logger'
import { type AuthResult, withAuth } from '@/lib/middleware/auth'
import { withRateLimit } from '@/lib/middleware/rate-limit'
import { startWorkflowFromCheckpoint } from '@/lib/temporal'

interface ReplayCheckpointRequest {
  mode?: 'restore' | 'replay'
  overrides?: Record<string, unknown>
}

export const POST = withRateLimit(
  withAuth(
    async (
      request: NextRequest,
      auth: AuthResult,
      { params }: { params: Promise<{ id: string }> },
    ) => {
      try {
        const projectId = auth.workspaceId
        if (!projectId) {
          return NextResponse.json(
            { error: 'Workspace context required' },
            { status: 400 },
          )
        }

        const body = (await request.json().catch(() => ({}))) as ReplayCheckpointRequest
        const { id } = await params

        const checkpoint = await readCheckpoint({
          projectId,
          checkpointId: id,
        })
        if (!checkpoint) {
          return NextResponse.json(
            { error: 'Checkpoint not found' },
            { status: 404 },
          )
        }

        const workflowStart = await buildWorkflowStartRequestFromCheckpoint({
          projectId,
          checkpointId: id,
          overrides: body.overrides,
          mode: body.mode,
        })

        if (!workflowStart) {
          return NextResponse.json(
            { error: 'Unable to build workflow restore request from checkpoint' },
            { status: 404 },
          )
        }

        const result = await startWorkflowFromCheckpoint(workflowStart)
        return NextResponse.json({
          success: true,
          workflowId: result.workflowId,
          runId: result.runId,
          checkpointId: checkpoint.manifest.checkpointId,
          sourceTraceId: checkpoint.envelope.traceId,
          kind: workflowStart.kind,
          workflowName: workflowStart.workflowName,
          mode: workflowStart.mode,
        })
      } catch (error) {
        if (error instanceof UnsupportedCheckpointKindError) {
          return NextResponse.json(
            { error: error.message, kind: error.kind },
            { status: 422 },
          )
        }

        logger.error({ err: error }, 'Error starting replay from checkpoint')
        return NextResponse.json(
          { error: 'Failed to start replay from checkpoint', details: String(error) },
          { status: 500 },
        )
      }
    },
  ),
)
