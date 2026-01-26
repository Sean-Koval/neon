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

/**
 * POST /api/runs
 *
 * Start a new evaluation run via Temporal workflow.
 *
 * Request body:
 * {
 *   projectId: string;
 *   agentId: string;
 *   agentVersion?: string;
 *   dataset: { items: Array<{ input, expected? }> };
 *   tools?: ToolDefinition[];
 *   scorers: string[];
 *   parallel?: boolean;
 *   parallelism?: number;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 },
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

    // Build workflow params
    const params: StartEvalRunParams = {
      runId,
      projectId: body.projectId,
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
}

/**
 * GET /api/runs
 *
 * List recent evaluation runs.
 *
 * Query params:
 * - limit: number (default 50)
 * - status: "RUNNING" | "COMPLETED" | "FAILED"
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '50')
    const status = searchParams.get('status') as
      | 'RUNNING'
      | 'COMPLETED'
      | 'FAILED'
      | null

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
      { error: 'Failed to list eval runs', details: String(error) },
      { status: 500 },
    )
  }
}
