/**
 * Eval Runs API
 *
 * POST /api/runs - Start a new evaluation run
 * GET /api/runs - List recent evaluation runs
 */

import { type NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/lib/logger'
import { type AuthResult, withAuth } from '@/lib/middleware/auth'
import { withRateLimit } from '@/lib/middleware/rate-limit'
import {
  listEvalRuns,
  type StartEvalRunParams,
  startEvalRunWorkflow,
} from '@/lib/temporal'
import { validateBody } from '@/lib/validation/middleware'
import { createRunSchema } from '@/lib/validation/schemas'

/**
 * POST /api/runs
 *
 * Start a new evaluation run via Temporal workflow.
 */
export const POST = withRateLimit(
  withAuth(async (request: NextRequest, auth: AuthResult) => {
    try {
      const projectId = auth.workspaceId
      if (!projectId) {
        return NextResponse.json(
          { error: 'Workspace context required' },
          { status: 400 },
        )
      }

      const body = await request.json()

      // Validate request body
      const validation = validateBody(createRunSchema, body)
      if (!validation.success) return validation.response
      const data = validation.data

      // Validate that projectId matches auth workspace if provided
      if (data.projectId && data.projectId !== projectId) {
        return NextResponse.json(
          { error: 'projectId does not match authenticated workspace' },
          { status: 403 },
        )
      }

      // Generate run ID
      const runId = data.runId || uuidv4()

      // Build workflow params - always use auth workspace as projectId
      const params: StartEvalRunParams = {
        runId,
        projectId,
        agentId: data.agentId,
        agentVersion: data.agentVersion || 'latest',
        dataset: data.dataset,
        tools: data.tools || [],
        scorers: data.scorers,
        parallel: data.parallel || false,
        parallelism: data.parallelism || 5,
      }

      // Start the workflow
      const result = await startEvalRunWorkflow(params)

      return NextResponse.json({
        message: 'Eval run started successfully',
        runId: result.runId,
        workflowId: result.workflowId,
        status: 'RUNNING',
        dataset_size: params.dataset.items.length,
        scorers: params.scorers,
        parallel: params.parallel,
      })
    } catch (error) {
      logger.error({ err: error }, 'Error starting eval run')

      // Check if it's a Temporal connection error
      if (error instanceof Error && error.message.includes('UNAVAILABLE')) {
        return NextResponse.json(
          {
            error: 'Temporal service unavailable',
            details:
              'The workflow engine is not reachable. Please ensure Temporal is running.',
          },
          { status: 503 },
        )
      }

      return NextResponse.json(
        { error: 'Failed to start eval run', details: String(error) },
        { status: 500 },
      )
    }
  }),
)

/**
 * GET /api/runs
 *
 * List recent evaluation runs.
 *
 * Query params:
 * - limit: number (default 50)
 * - status: "RUNNING" | "COMPLETED" | "FAILED"
 */
export const GET = withRateLimit(
  withAuth(async (request: NextRequest, auth: AuthResult) => {
    const projectId = auth.workspaceId
    if (!projectId) {
      return NextResponse.json(
        { error: 'Workspace context required' },
        { status: 400 },
      )
    }

    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const status = searchParams.get('status') as
      | 'RUNNING'
      | 'COMPLETED'
      | 'FAILED'
      | 'CANCELLED'
      | 'TERMINATED'
      | 'TIMED_OUT'
      | null
    const statusFilter = searchParams.get('status_filter') as typeof status

    try {
      const result = await listEvalRuns({
        limit,
        offset,
        status: status || statusFilter || undefined,
      })

      return NextResponse.json({
        items: result.items,
        count: result.items.length,
        hasMore: result.hasMore,
        limit,
        offset,
      })
    } catch (error) {
      logger.error({ err: error }, 'Error listing eval runs')

      // Return empty list when Temporal isn't available (graceful degradation)
      const isTemporalError =
        error instanceof Error &&
        (error.message.includes('UNAVAILABLE') ||
          error.message.includes('connect') ||
          error.message.includes('deadline') ||
          error.message.includes('timeout'))

      if (isTemporalError) {
        return NextResponse.json({
          items: [],
          count: 0,
          limit,
          warning: 'Temporal service not available. Start it to see eval runs.',
        })
      }

      return NextResponse.json(
        { error: 'Failed to list eval runs', details: String(error) },
        { status: 500 },
      )
    }
  }),
)
