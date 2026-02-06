/**
 * Eval Runs API
 *
 * POST /api/runs - Start a new evaluation run
 * GET /api/runs - List recent evaluation runs
 */

import { type NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import {
  listEvalRuns,
  type StartEvalRunParams,
  startEvalRunWorkflow,
} from '@/lib/temporal'
import { withAuth, type AuthResult } from '@/lib/middleware/auth'

/**
 * POST /api/runs
 *
 * Start a new evaluation run via Temporal workflow.
 */
export const POST = withAuth(async (request: NextRequest, auth: AuthResult) => {
  try {
    const projectId = auth.workspaceId
    if (!projectId) {
      return NextResponse.json(
        { error: 'Workspace context required' },
        { status: 400 },
      )
    }

    const body = await request.json()

    // Validate that body.projectId matches auth workspace if provided
    if (body.projectId && body.projectId !== projectId) {
      return NextResponse.json(
        { error: 'projectId does not match authenticated workspace' },
        { status: 403 },
      )
    }

    if (!body.agentId) {
      return NextResponse.json(
        { error: 'agentId is required' },
        { status: 400 },
      )
    }
    if (!body.dataset?.items || body.dataset.items.length === 0) {
      return NextResponse.json(
        { error: 'dataset.items is required and must not be empty' },
        { status: 400 },
      )
    }
    if (!body.scorers || body.scorers.length === 0) {
      return NextResponse.json(
        { error: 'scorers is required and must not be empty' },
        { status: 400 },
      )
    }

    // Generate run ID
    const runId = body.runId || uuidv4()

    // Build workflow params - always use auth workspace as projectId
    const params: StartEvalRunParams = {
      runId,
      projectId,
      agentId: body.agentId,
      agentVersion: body.agentVersion || 'latest',
      dataset: body.dataset,
      tools: body.tools || [],
      scorers: body.scorers,
      parallel: body.parallel || false,
      parallelism: body.parallelism || 5,
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
    console.error('Error starting eval run:', error)

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
})

/**
 * GET /api/runs
 *
 * List recent evaluation runs.
 *
 * Query params:
 * - limit: number (default 50)
 * - status: "RUNNING" | "COMPLETED" | "FAILED"
 */
export const GET = withAuth(async (request: NextRequest, auth: AuthResult) => {
  const projectId = auth.workspaceId
  if (!projectId) {
    return NextResponse.json(
      { error: 'Workspace context required' },
      { status: 400 },
    )
  }

  const searchParams = request.nextUrl.searchParams
  const limit = parseInt(searchParams.get('limit') || '50', 10)
  const status = searchParams.get('status') as
    | 'RUNNING'
    | 'COMPLETED'
    | 'FAILED'
    | null

  try {
    const runs = await listEvalRuns({
      limit,
      status: status || undefined,
    })

    return NextResponse.json({
      items: runs,
      count: runs.length,
      limit,
    })
  } catch (error) {
    console.error('Error listing eval runs:', error)

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
})
