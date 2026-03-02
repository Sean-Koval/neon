/**
 * Duration Stats API Route
 *
 * Returns duration statistics with percentiles (p50, p95, p99).
 */

import { type NextRequest, NextResponse } from 'next/server'

import { evals } from '@/lib/db/clickhouse'
import { logger } from '@/lib/logger'
import { withAuth } from '@/lib/middleware/auth'

function getDateRange(days: number): { startDate: string; endDate: string } {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  }
}

/**
 * GET /api/dashboard/duration-stats
 *
 * Query parameters:
 * - projectId: Project ID (default: 'default')
 * - days: Number of days to look back (default: 7)
 * - startDate: Explicit start date (YYYY-MM-DD)
 * - endDate: Explicit end date (YYYY-MM-DD)
 */
export const GET = withAuth(async (request, auth) => {
  const startTime = performance.now()

  try {
    const { searchParams } = new URL(request.url)
    const projectId = auth?.workspaceId || searchParams.get('projectId') || 'default'
    const days = Number.parseInt(searchParams.get('days') || '7', 10)

    const explicitStartDate = searchParams.get('startDate')
    const explicitEndDate = searchParams.get('endDate')

    let startDate: string
    let endDate: string

    if (explicitStartDate && explicitEndDate) {
      startDate = explicitStartDate
      endDate = explicitEndDate
    } else {
      const range = getDateRange(days)
      startDate = range.startDate
      endDate = range.endDate
    }

    const { data: stats } = await evals.getDurationStatsData({
      projectId,
      startDate,
      endDate,
    })

    const queryTimeMs = Math.round(performance.now() - startTime)

    return NextResponse.json(
      { stats, queryTimeMs },
      {
        headers: {
          'X-Query-Time-Ms': String(queryTimeMs),
          'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
        },
      },
    )
  } catch (error) {
    logger.error({ err: error }, 'Duration stats API error')

    // Graceful degradation when ClickHouse is unavailable
    const isClickHouseError =
      error instanceof Error &&
      (error.message.includes('ECONNREFUSED') ||
        error.message.includes('connect') ||
        error.message.includes('timeout') ||
        error.message.includes('ETIMEDOUT'))

    if (isClickHouseError) {
      return NextResponse.json({
        stats: [],
        queryTimeMs: 0,
        warning: 'ClickHouse not available. Start it to see duration stats.',
      })
    }

    return NextResponse.json(
      { error: 'Failed to fetch duration stats' },
      { status: 500 },
    )
  }
})
