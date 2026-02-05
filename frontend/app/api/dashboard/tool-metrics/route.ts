/**
 * Tool Metrics API Route
 *
 * Endpoint for fetching tool/skill execution statistics.
 * Aggregates from the spans table where span_type = 'tool'.
 */

import { type NextRequest, NextResponse } from 'next/server'

import { getToolMetrics } from '@/lib/clickhouse'

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
 * GET /api/dashboard/tool-metrics
 *
 * Query parameters:
 * - projectId: Project ID (default: 'default')
 * - days: Number of days to look back (default: 7)
 *
 * Returns:
 * - tools: Array of tool metrics with call count, success rate, latency
 * - summary: Aggregate statistics across all tools
 * - queryTimeMs: Query execution time for performance monitoring
 */
export async function GET(request: NextRequest) {
  const startTime = performance.now()

  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId') || 'default'
    const days = Number.parseInt(searchParams.get('days') || '7', 10)

    const { startDate, endDate } = getDateRange(days)
    const { tools, summary } = await getToolMetrics(
      projectId,
      startDate,
      endDate,
    )

    const queryTimeMs = Math.round(performance.now() - startTime)

    return NextResponse.json(
      { tools, summary, queryTimeMs },
      {
        headers: {
          'X-Query-Time-Ms': String(queryTimeMs),
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        },
      },
    )
  } catch (error) {
    console.error('Tool metrics API error:', error)

    // Graceful degradation when ClickHouse is unavailable
    const isClickHouseError =
      error instanceof Error &&
      (error.message.includes('ECONNREFUSED') ||
        error.message.includes('connect') ||
        error.message.includes('timeout') ||
        error.message.includes('ETIMEDOUT'))

    if (isClickHouseError) {
      return NextResponse.json({
        tools: [],
        summary: {
          totalCalls: 0,
          totalTools: 0,
          overallSuccessRate: 0,
          avgLatencyMs: 0,
        },
        queryTimeMs: 0,
        warning: 'ClickHouse not available. Start it to see tool metrics.',
      })
    }

    return NextResponse.json(
      { error: 'Failed to fetch tool metrics' },
      { status: 500 },
    )
  }
}
