/**
 * Eval Run Control API
 *
 * POST /api/runs/:id/control - Control a running eval (pause/resume)
 */

import { type NextRequest, NextResponse } from 'next/server'
import {
  cancelWorkflow,
  getWorkflowStatus,
  pauseEvalRun,
  resumeEvalRun,
} from '@/lib/temporal'
import { withAuth, type AuthResult } from '@/lib/middleware/auth'
import { logger } from '@/lib/logger'

/**
 * POST /api/runs/:id/control
 *
 * Control a running eval run.
 *
 * Request body:
 * {
 *   action: "pause" | "resume" | "cancel"
 * }
 */
export const POST = withAuth(
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

      const { id } = await params
      const body = await request.json()

      // Validate action
      const validActions = ['pause', 'resume', 'cancel']
      if (!body.action || !validActions.includes(body.action)) {
        return NextResponse.json(
          {
            error: 'Invalid action',
            details: `Action must be one of: ${validActions.join(', ')}`,
          },
          { status: 400 },
        )
      }

      // Workflow ID format is "eval-run-{runId}"
      const workflowId = id.startsWith('eval-run-') ? id : `eval-run-${id}`

      // Get current status
      const status = await getWorkflowStatus(workflowId)

      // Check if workflow can be controlled
      if (status.status !== 'RUNNING') {
        return NextResponse.json(
          {
            error: 'Cannot control eval run',
            details: `Workflow is ${status.status}, not RUNNING`,
          },
          { status: 400 },
        )
      }

      // Execute the action
      switch (body.action) {
        case 'pause':
          await pauseEvalRun(workflowId)
          return NextResponse.json({
            message: 'Eval run paused',
            id: status.runId,
            workflowId: status.workflowId,
            action: 'pause',
          })

        case 'resume':
          await resumeEvalRun(workflowId)
          return NextResponse.json({
            message: 'Eval run resumed',
            id: status.runId,
            workflowId: status.workflowId,
            action: 'resume',
          })

        case 'cancel':
          await cancelWorkflow(workflowId)
          return NextResponse.json({
            message: 'Eval run cancelled',
            id: status.runId,
            workflowId: status.workflowId,
            action: 'cancel',
          })

        default:
          return NextResponse.json(
            { error: 'Unknown action' },
            { status: 400 },
          )
      }
    } catch (error) {
      logger.error({ err: error }, 'Error controlling eval run')

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
        { error: 'Failed to control eval run', details: String(error) },
        { status: 500 },
      )
    }
  },
)
