/**
 * Dashboard Summary API Route
 *
 * Lightweight endpoint for fetching just the summary stats.
 * Optimized for fast initial page load.
 */

import { type NextRequest, NextResponse } from 'next/server'

import { getDashboardSummary } from '@/lib/clickhouse'
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
 * GET /api/dashboard/summary
 *
 * Query parameters:
 * - projectId: Project ID (default: 'default')
 * - days: Number of days to look back (default: 7)
 */
export async function GET(request: NextRequest) {
  const startTime = performance.now()

  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId') || 'default'
    const days = Number.parseInt(searchParams.get('days') || '7', 10)

    const { startDate, endDate } = getDateRange(days)
    const summary = await getDashboardSummary(projectId, startDate, endDate)

    const queryTimeMs = Math.round(performance.now() - startTime)

    return NextResponse.json(
      { ...summary, queryTimeMs },
      {
        headers: {
          'X-Query-Time-Ms': String(queryTimeMs),
          'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
        },
      },
    )
  } catch (error) {
    logger.error({ err: error }, 'Summary API error')

    // Graceful degradation when ClickHouse is unavailable
    const isClickHouseError =
      error instanceof Error &&
      (error.message.includes('ECONNREFUSED') ||
        error.message.includes('connect') ||
        error.message.includes('timeout') ||
        error.message.includes('ETIMEDOUT'))

    if (isClickHouseError) {
      return NextResponse.json({
        total_runs: 0,
        passed_runs: 0,
        failed_runs: 0,
        pass_rate: 0,
        avg_duration_ms: 0,
        total_tokens: 0,
        total_cost: 0,
        warning: 'ClickHouse not available. Start it to see dashboard stats.',
      })
    }

    return NextResponse.json(
      { error: 'Failed to fetch summary' },
      { status: 500 },
    )
  }
}
