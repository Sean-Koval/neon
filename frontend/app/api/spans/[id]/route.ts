/**
 * Span Detail API
 *
 * GET /api/spans/:id - Get single span details (large payload fields)
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getSpanDetails } from '@/lib/clickhouse'
import { withRateLimit } from '@/lib/middleware/rate-limit'
import { logger } from '@/lib/logger'

export const GET = withRateLimit(async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: spanId } = await params

    // Get project ID from header or query
    const projectId =
      request.headers.get('x-project-id') ||
      request.nextUrl.searchParams.get('project_id') ||
      '00000000-0000-0000-0000-000000000001'

    const details = await getSpanDetails(projectId, spanId)

    if (!details) {
      return NextResponse.json({ error: 'Span not found' }, { status: 404 })
    }

    return NextResponse.json(details)
  } catch (error) {
    logger.error({ err: error }, 'Error getting span details')
    return NextResponse.json(
      { error: 'Failed to get span details', details: String(error) },
      { status: 500 },
    )
  }
})
