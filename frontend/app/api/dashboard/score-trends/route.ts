/**
 * Score Trends API Route
 *
 * Returns score trends with avg, min, max per scorer per day.
 */

import { type NextRequest, NextResponse } from 'next/server'

import { getScoreTrends } from '@/lib/clickhouse'
import { logger } from '@/lib/logger'

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
 * GET /api/dashboard/score-trends
 *
 * Query parameters:
 * - projectId: Project ID (default: 'default')
 * - days: Number of days to look back (default: 7)
 * - startDate: Explicit start date (YYYY-MM-DD)
 * - endDate: Explicit end date (YYYY-MM-DD)
 * - scorerName: Filter to a specific scorer
 */
export async function GET(request: NextRequest) {
  const startTime = performance.now()

  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId') || 'default'
    const days = Number.parseInt(searchParams.get('days') || '7', 10)
    const scorerName = searchParams.get('scorerName') || undefined

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

    const trends = await getScoreTrends(
      projectId,
      startDate,
      endDate,
      scorerName,
    )

    const queryTimeMs = Math.round(performance.now() - startTime)

    return NextResponse.json(
      { trends, queryTimeMs },
      {
        headers: {
          'X-Query-Time-Ms': String(queryTimeMs),
          'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
        },
      },
    )
  } catch (error) {
    logger.error({ err: error }, 'Score trends API error')

    // Graceful degradation when ClickHouse is unavailable
    const isClickHouseError =
      error instanceof Error &&
      (error.message.includes('ECONNREFUSED') ||
        error.message.includes('connect') ||
        error.message.includes('timeout') ||
        error.message.includes('ETIMEDOUT'))

    if (isClickHouseError) {
      return NextResponse.json({
        trends: [],
        queryTimeMs: 0,
        warning: 'ClickHouse not available. Start it to see score trends.',
      })
    }

    return NextResponse.json(
      { error: 'Failed to fetch score trends' },
      { status: 500 },
    )
  }
}
