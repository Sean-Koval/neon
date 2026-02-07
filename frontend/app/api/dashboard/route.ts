/**
 * Dashboard API Route
 *
 * Provides server-side aggregations for the dashboard using ClickHouse
 * materialized views. Designed for <100ms query latency.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/middleware/rate-limit'

import { logger } from '@/lib/logger'
import {
  type DailyRunSummary,
  type DashboardSummary,
  type DurationStats,
  getDailyRunSummary,
  getDashboardSummary,
  getDurationStats,
  getScorerStats,
  getScoreTrends,
  type ScorerStats,
  type ScoreTrendPoint,
} from '@/lib/clickhouse'

// =============================================================================
// Types
// =============================================================================

interface DashboardRequest {
  projectId: string
  startDate: string
  endDate: string
  scorerName?: string
}

interface DashboardResponse {
  summary: DashboardSummary
  scoreTrends: ScoreTrendPoint[]
  durationStats: DurationStats[]
  dailySummary: DailyRunSummary[]
  scorerStats: ScorerStats[]
  queryTimeMs: number
}

// =============================================================================
// Helpers
// =============================================================================

function getDateRange(days: number): { startDate: string; endDate: string } {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  }
}

function parseRequest(request: NextRequest): DashboardRequest {
  const { searchParams } = new URL(request.url)

  const projectId = searchParams.get('projectId') || 'default'
  const days = Number.parseInt(searchParams.get('days') || '7', 10)
  const scorerName = searchParams.get('scorerName') || undefined

  // Allow explicit date range or default to last N days
  const explicitStartDate = searchParams.get('startDate')
  const explicitEndDate = searchParams.get('endDate')

  if (explicitStartDate && explicitEndDate) {
    return {
      projectId,
      startDate: explicitStartDate,
      endDate: explicitEndDate,
      scorerName,
    }
  }

  const { startDate, endDate } = getDateRange(days)
  return { projectId, startDate, endDate, scorerName }
}

// =============================================================================
// GET Handler
// =============================================================================

/**
 * GET /api/dashboard
 *
 * Query parameters:
 * - projectId: Project ID (default: 'default')
 * - days: Number of days to look back (default: 7)
 * - startDate: Explicit start date (YYYY-MM-DD)
 * - endDate: Explicit end date (YYYY-MM-DD)
 * - scorerName: Filter score trends to a specific scorer
 *
 * Returns aggregated dashboard data from materialized views.
 */
export const GET = withRateLimit(async function GET(request: NextRequest) {
  const startTime = performance.now()

  try {
    const { projectId, startDate, endDate, scorerName } = parseRequest(request)

    // Run all queries in parallel for maximum performance
    const [summary, scoreTrends, durationStats, dailySummary, scorerStats] =
      await Promise.all([
        getDashboardSummary(projectId, startDate, endDate),
        getScoreTrends(projectId, startDate, endDate, scorerName),
        getDurationStats(projectId, startDate, endDate),
        getDailyRunSummary(projectId, startDate, endDate),
        getScorerStats(projectId, startDate, endDate),
      ])

    const queryTimeMs = Math.round(performance.now() - startTime)

    const response: DashboardResponse = {
      summary,
      scoreTrends,
      durationStats,
      dailySummary,
      scorerStats,
      queryTimeMs,
    }

    return NextResponse.json(response, {
      headers: {
        'X-Query-Time-Ms': String(queryTimeMs),
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'Dashboard API error')

    const queryTimeMs = Math.round(performance.now() - startTime)

    return NextResponse.json(
      {
        error: 'Failed to fetch dashboard data',
        message: error instanceof Error ? error.message : 'Unknown error',
        queryTimeMs,
      },
      { status: 500 },
    )
  }
})

// =============================================================================
// Individual Endpoints
// =============================================================================

/**
 * GET /api/dashboard/summary
 *
 * Returns only the summary stats for dashboard cards.
 * Fastest endpoint for initial page load.
 */
export async function getSummaryOnly(request: NextRequest) {
  const startTime = performance.now()

  try {
    const { projectId, startDate, endDate } = parseRequest(request)
    const summary = await getDashboardSummary(projectId, startDate, endDate)

    const queryTimeMs = Math.round(performance.now() - startTime)

    return NextResponse.json(
      { summary, queryTimeMs },
      {
        headers: {
          'X-Query-Time-Ms': String(queryTimeMs),
          'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
        },
      },
    )
  } catch (error) {
    logger.error({ err: error }, 'Summary API error')
    return NextResponse.json(
      { error: 'Failed to fetch summary' },
      { status: 500 },
    )
  }
}
