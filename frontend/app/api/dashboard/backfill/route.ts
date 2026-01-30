/**
 * Backfill API Route
 *
 * Triggers backfill of materialized views with existing data.
 * Should only be run once after creating the views, or when needed.
 */

import { type NextRequest, NextResponse } from 'next/server'

import { backfillMaterializedViews } from '@/lib/clickhouse'

/**
 * POST /api/dashboard/backfill
 *
 * Query parameters:
 * - projectId: Optional project ID to backfill only that project
 *
 * Headers:
 * - X-Admin-Key: Required admin key for authorization
 */
export async function POST(request: NextRequest) {
  const startTime = performance.now()

  // Basic authorization check
  const adminKey = request.headers.get('X-Admin-Key')
  const expectedKey = process.env.ADMIN_API_KEY

  if (!expectedKey || adminKey !== expectedKey) {
    return NextResponse.json(
      { error: 'Unauthorized - admin key required' },
      { status: 401 },
    )
  }

  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId') || undefined

    const results = await backfillMaterializedViews(projectId)

    const queryTimeMs = Math.round(performance.now() - startTime)

    return NextResponse.json({
      success: true,
      message: 'Materialized views backfilled successfully',
      results,
      queryTimeMs,
    })
  } catch (error) {
    console.error('Backfill error:', error)

    const queryTimeMs = Math.round(performance.now() - startTime)

    return NextResponse.json(
      {
        error: 'Failed to backfill materialized views',
        message: error instanceof Error ? error.message : 'Unknown error',
        queryTimeMs,
      },
      { status: 500 },
    )
  }
}
