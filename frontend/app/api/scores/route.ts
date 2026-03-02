/**
 * Scores API
 *
 * POST /api/scores - Create a new score
 * GET /api/scores - List scores for a trace
 */

import { type NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { batchInsertScores } from '@/lib/clickhouse-batch'
import type { ScoreRecord } from '@/lib/db/clickhouse'
import { logger } from '@/lib/logger'
import { withAuth, type AuthResult } from '@/lib/middleware/auth'
import { withRateLimit } from '@/lib/middleware/rate-limit'
import { READ_LIMIT, WRITE_LIMIT } from '@/lib/rate-limit'
import { validateBody } from '@/lib/validation/middleware'
import { createScoreSchema } from '@/lib/validation/schemas'

export const POST = withRateLimit(withAuth(async function POST(request: NextRequest, auth: AuthResult) {
  try {
    const body = await request.json()

    // Validate request body
    const validation = validateBody(createScoreSchema, body)
    if (!validation.success) return validation.response
    const data = validation.data

    // Get project ID from auth, header, or body
    const projectId =
      auth.workspaceId ||
      request.headers.get('x-project-id') ||
      data.project_id ||
      '00000000-0000-0000-0000-000000000001'

    const score: ScoreRecord = {
      project_id: projectId,
      score_id: data.score_id || uuidv4(),
      trace_id: data.trace_id,
      span_id: data.span_id || null,
      run_id: data.run_id || null,
      case_id: data.case_id || null,
      name: data.name,
      value: data.value,
      score_type: data.score_type || 'numeric',
      string_value: data.string_value || null,
      comment: data.comment || '',
      source: data.source || 'api',
      config_id: data.config_id || null,
      author_id: data.author_id || null,
      timestamp: new Date().toISOString(),
    }

    await batchInsertScores([score])

    return NextResponse.json({
      message: 'Score created successfully',
      score_id: score.score_id,
    })
  } catch (error) {
    logger.error({ err: error }, 'Error creating score')
    return NextResponse.json(
      { error: 'Failed to create score', details: String(error) },
      { status: 500 },
    )
  }
}), WRITE_LIMIT)

export const GET = withRateLimit(withAuth(async function GET(request: NextRequest, auth: AuthResult) {
  try {
    const searchParams = request.nextUrl.searchParams

    const projectId =
      auth.workspaceId ||
      request.headers.get('x-project-id') ||
      searchParams.get('project_id') ||
      '00000000-0000-0000-0000-000000000001'

    const traceId = searchParams.get('trace_id')

    if (!traceId) {
      return NextResponse.json(
        { error: 'trace_id is required' },
        { status: 400 },
      )
    }

    // Import traces module from abstraction layer
    const { traces } = await import('@/lib/db/clickhouse')
    const { data: scores } = await traces.getTraceScores(projectId, traceId)

    return NextResponse.json({
      items: scores,
      count: scores.length,
    })
  } catch (error) {
    logger.error({ err: error }, 'Error fetching scores')
    return NextResponse.json(
      { error: 'Failed to fetch scores', details: String(error) },
      { status: 500 },
    )
  }
}), READ_LIMIT)
