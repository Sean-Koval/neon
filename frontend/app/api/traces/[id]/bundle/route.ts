/**
 * Trace Bundle API
 *
 * GET /api/traces/:id/bundle - Export a trace, spans, scores, and derived
 * event/checkpoint views as a single JSON bundle.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { traces } from '@/lib/db/clickhouse'
import { logger } from '@/lib/logger'
import { type AuthResult, withAuth } from '@/lib/middleware/auth'
import { withRateLimit } from '@/lib/middleware/rate-limit'
import { buildTraceBundle } from '@/lib/traces/trace-bundle'

export const GET = withRateLimit(
  withAuth(
    async (
      _request: NextRequest,
      auth: AuthResult,
      { params }: { params: Promise<{ id: string }> },
    ) => {
      try {
        const { id: traceId } = await params

        const projectId = auth.workspaceId
        if (!projectId) {
          return NextResponse.json(
            { error: 'Workspace context required' },
            { status: 400 },
          )
        }

        const { data: result } = await traces.getTrace(projectId, traceId)

        if (!result) {
          return NextResponse.json(
            { error: 'Trace not found' },
            { status: 404 },
          )
        }

        const { data: scores } = await traces.getTraceScores(projectId, traceId)
        const bundle = buildTraceBundle({
          trace: result.trace,
          spans: result.spans,
          scores,
        })

        return NextResponse.json(bundle, {
          headers: {
            'Content-Disposition': `attachment; filename="trace-${traceId}.bundle.json"`,
          },
        })
      } catch (error) {
        logger.error({ err: error }, 'Error exporting trace bundle')
        return NextResponse.json(
          { error: 'Failed to export trace bundle', details: String(error) },
          { status: 500 },
        )
      }
    },
  ),
)
