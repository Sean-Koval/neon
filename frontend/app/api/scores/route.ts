/**
 * Scores API
 *
 * POST /api/scores - Create a new score
 * GET /api/scores - List scores for a trace
 */

import { type NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import type { ScoreRecord } from '@/lib/clickhouse'
import { batchInsertScores } from '@/lib/clickhouse-batch'
import { createScoreSchema } from '@/lib/validation/schemas'
import { validateBody } from '@/lib/validation/middleware'
import { withRateLimit } from '@/lib/middleware/rate-limit'
import { WRITE_LIMIT, READ_LIMIT } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

export const POST = withRateLimit(async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate request body
    const validation = validateBody(createScoreSchema, body)
    if (!validation.success) return validation.response
    const data = validation.data

    // Get project ID from header or body
    const projectId =
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
}, WRITE_LIMIT)

export const GET = withRateLimit(async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    const projectId =
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

    // Import getScoresForTrace
    const { getScoresForTrace } = await import('@/lib/clickhouse')
    const scores = await getScoresForTrace(projectId, traceId)

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
}, READ_LIMIT)
