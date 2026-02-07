/**
 * Trace Query API
 *
 * GET /api/traces - List traces with filters
 */

import { type NextRequest, NextResponse } from 'next/server'
import { traces } from '@/lib/db/clickhouse'
import { logger } from '@/lib/logger'
import { type AuthResult, withAuth } from '@/lib/middleware/auth'
import { withRateLimit } from '@/lib/middleware/rate-limit'

export const GET = withRateLimit(
  withAuth(async (request: NextRequest, auth: AuthResult) => {
    try {
      const projectId = auth.workspaceId
      if (!projectId) {
        return NextResponse.json(
          { error: 'Workspace context required' },
          { status: 400 },
        )
      }

      const searchParams = request.nextUrl.searchParams
      const status = searchParams.get('status') as 'ok' | 'error' | null
      const startDate = searchParams.get('start_date')
      const endDate = searchParams.get('end_date')
      const limit = parseInt(searchParams.get('limit') || '50', 10)
      const offset = parseInt(searchParams.get('offset') || '0', 10)

      const { data: traceResults } = await traces.listTraces({
        projectId,
        status: status || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        limit: Math.min(limit, 100),
        offset,
      })

      return NextResponse.json({
        items: traceResults,
        count: traceResults.length,
        limit,
        offset,
      })
    } catch (error) {
      logger.error({ err: error }, 'Error querying traces')
      return NextResponse.json(
        { error: 'Failed to query traces', details: String(error) },
        { status: 500 },
      )
    }
  }),
)
