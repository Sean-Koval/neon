/**
 * Individual Eval Run API
 *
 * GET /api/runs/:id - Get eval run details and status
 * DELETE /api/runs/:id - Cancel a running eval
 */

import { type NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { type AuthResult, withAuth } from '@/lib/middleware/auth'
import { withRateLimit } from '@/lib/middleware/rate-limit'
import { cancelWorkflow, getWorkflowStatus } from '@/lib/temporal'

/**
 * GET /api/runs/:id
 *
 * Get detailed status and progress for an eval run.
 */
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

        // Workflow ID format is "eval-run-{runId}"
        const workflowId = id.startsWith('eval-run-') ? id : `eval-run-${id}`

        const status = await getWorkflowStatus(workflowId)

        return NextResponse.json({
          id: status.runId,
          workflowId: status.workflowId,
          status: status.status,
          startTime: status.startTime,
          closeTime: status.closeTime,
          progress: status.progress,
          result: status.result,
          error: status.error,
        })
      } catch (error) {
        logger.error({ err: error }, 'Error getting eval run')

        // Check for workflow not found
        if (error instanceof Error && error.message.includes('not found')) {
          return NextResponse.json(
            { error: 'Eval run not found' },
            { status: 404 },
          )
        }

        // Check if it's a Temporal connection error
        if (error instanceof Error && error.message.includes('UNAVAILABLE')) {
          return NextResponse.json(
            {
              error: 'Temporal service unavailable',
              details: 'The workflow engine is not reachable.',
            },
            { status: 503 },
          )
        }

        return NextResponse.json(
          { error: 'Failed to get eval run', details: String(error) },
          { status: 500 },
        )
      }
    },
  ),
)

/**
 * DELETE /api/runs/:id
 *
 * Cancel a running eval run.
 */
export const DELETE = withRateLimit(
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

        // Workflow ID format is "eval-run-{runId}"
        const workflowId = id.startsWith('eval-run-') ? id : `eval-run-${id}`

        // First check the workflow status
        const status = await getWorkflowStatus(workflowId)

        if (status.status !== 'RUNNING') {
          return NextResponse.json(
            {
              error: 'Cannot cancel eval run',
              details: `Workflow is ${status.status}, not RUNNING`,
            },
            { status: 400 },
          )
        }

        // Cancel the workflow
        await cancelWorkflow(workflowId)

        return NextResponse.json({
          message: 'Eval run cancelled successfully',
          id: status.runId,
          workflowId: status.workflowId,
          previousStatus: status.status,
          newStatus: 'CANCELLED',
        })
      } catch (error) {
        logger.error({ err: error }, 'Error cancelling eval run')

        // Check for workflow not found
        if (error instanceof Error && error.message.includes('not found')) {
          return NextResponse.json(
            { error: 'Eval run not found' },
            { status: 404 },
          )
        }

        return NextResponse.json(
          { error: 'Failed to cancel eval run', details: String(error) },
          { status: 500 },
        )
      }
    },
  ),
)
