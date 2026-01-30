/**
 * Dashboard Summary API Route
 *
 * Lightweight endpoint for fetching just the summary stats.
 * Optimized for fast initial page load.
 */

import { type NextRequest, NextResponse } from 'next/server'

import { getDashboardSummary } from '@/lib/clickhouse'

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
    console.error('Summary API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch summary' },
      { status: 500 },
    )
  }
}
