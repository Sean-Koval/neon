import { type NextRequest, NextResponse } from 'next/server'

import { readCheckpoint } from '@/lib/checkpoints/store'
import { logger } from '@/lib/logger'
import { type AuthResult, withAuth } from '@/lib/middleware/auth'
import { withRateLimit } from '@/lib/middleware/rate-limit'

export const GET = withRateLimit(
  withAuth(
    async (
      _request: NextRequest,
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

        return NextResponse.json({
          success: true,
          checkpointId: checkpoint.manifest.checkpointId,
          manifest: checkpoint.manifest,
          envelope: checkpoint.envelope,
        })
      } catch (error) {
        logger.error({ err: error }, 'Error reading checkpoint')
        return NextResponse.json(
          { error: 'Failed to read checkpoint', details: String(error) },
          { status: 500 },
        )
      }
    },
  ),
)
