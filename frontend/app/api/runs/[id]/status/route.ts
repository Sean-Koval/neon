/**
 * Eval Run Status API
 *
 * GET /api/runs/:id/status - Get lightweight status (for polling)
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getWorkflowStatus } from '@/lib/temporal'

/**
 * GET /api/runs/:id/status
 *
 * Get lightweight status for polling.
 * Returns only essential fields for efficient updates.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    // Workflow ID format is "eval-run-{runId}"
    const workflowId = id.startsWith('eval-run-') ? id : `eval-run-${id}`

    const status = await getWorkflowStatus(workflowId)

    // Return lightweight response for polling
    const response: Record<string, unknown> = {
      id: status.runId,
      status: status.status,
      isRunning: status.status === 'RUNNING',
      isComplete: status.status === 'COMPLETED',
      isFailed:
        status.status === 'FAILED' ||
        status.status === 'CANCELLED' ||
        status.status === 'TERMINATED',
    }

    // Include progress if available
    if (status.progress) {
      response.progress = {
        completed: status.progress.completed,
        total: status.progress.total,
        passed: status.progress.passed,
        failed: status.progress.failed,
        percentComplete:
          status.progress.total > 0
            ? Math.round(
                (status.progress.completed / status.progress.total) * 100,
              )
            : 0,
      }
    }

    // Include summary if completed
    if (status.status === 'COMPLETED' && status.result) {
      const result = status.result as {
        summary?: {
          total: number
          passed: number
          failed: number
          avgScore: number
        }
      }
      if (result.summary) {
        response.summary = result.summary
      }
    }

    // Include error if failed
    if (status.error) {
      response.error = status.error
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error getting eval run status:', error)

    // Check for workflow not found
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: 'Eval run not found' }, { status: 404 })
    }

    // Check if it's a Temporal connection error
    if (error instanceof Error && error.message.includes('UNAVAILABLE')) {
      return NextResponse.json(
        {
          error: 'Temporal service unavailable',
          status: 'UNKNOWN',
          isRunning: false,
          isComplete: false,
          isFailed: true,
        },
        { status: 503 },
      )
    }

    return NextResponse.json(
      { error: 'Failed to get status', details: String(error) },
      { status: 500 },
    )
  }
}
