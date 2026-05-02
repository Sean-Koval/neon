/**
 * Trace Import API
 *
 * POST /api/traces/import - Import a previously exported trace bundle into the
 * authenticated workspace while preserving trace/span lineage.
 */

import { type NextRequest, NextResponse } from 'next/server'
import {
  insertScores,
  insertSpans,
  insertTraces,
  type ScoreRecord,
  type SpanRecord,
  type TraceRecord,
} from '@/lib/clickhouse'
import { logger } from '@/lib/logger'
import { type AuthResult, withAuth } from '@/lib/middleware/auth'
import { withRateLimit } from '@/lib/middleware/rate-limit'
import {
  buildTraceCheckpointsFromSpans,
  buildTraceEventsFromSpans,
  isTraceBundle,
} from '@/lib/traces/trace-bundle'

function normalizeTrace(trace: TraceRecord, projectId: string): TraceRecord {
  return {
    ...trace,
    project_id: projectId,
  }
}

function normalizeSpans(
  spans: SpanRecord[],
  projectId: string,
  traceId: string,
): SpanRecord[] {
  return spans.map((span) => ({
    ...span,
    project_id: projectId,
    trace_id: traceId,
  }))
}

function normalizeScores(
  scores: ScoreRecord[],
  projectId: string,
  traceId: string,
  runId: string | null,
): ScoreRecord[] {
  return scores.map((score) => ({
    ...score,
    project_id: projectId,
    trace_id: traceId,
    run_id: score.run_id ?? runId,
  }))
}

export const POST = withRateLimit(
  withAuth(async (request: NextRequest, auth: AuthResult) => {
    try {
      const projectId = auth.workspaceId
      if (!projectId) {
        return NextResponse.json(
          { error: 'Workspace context required' },
          { status: 400 },
        )
      }

      const body: unknown = await request.json()
      if (!isTraceBundle(body)) {
        return NextResponse.json(
          { error: 'Invalid trace bundle payload' },
          { status: 400 },
        )
      }

      const trace = normalizeTrace(body.trace, projectId)
      const spans = normalizeSpans(body.spans, projectId, trace.trace_id)
      const scores = normalizeScores(
        body.scores,
        projectId,
        trace.trace_id,
        trace.run_id,
      )

      const invalidSpan = spans.find((span) => !span.span_id)
      if (invalidSpan) {
        return NextResponse.json(
          { error: 'Bundle contains a span without span_id' },
          { status: 400 },
        )
      }

      await Promise.all([
        insertTraces([trace]),
        insertSpans(spans),
        scores.length > 0 ? insertScores(scores) : Promise.resolve(),
      ])

      return NextResponse.json({
        message: 'Trace bundle imported successfully',
        traceId: trace.trace_id,
        spans: spans.length,
        scores: scores.length,
        events: buildTraceEventsFromSpans(spans).length,
        checkpoints: buildTraceCheckpointsFromSpans(spans).length,
      })
    } catch (error) {
      logger.error({ err: error }, 'Error importing trace bundle')
      return NextResponse.json(
        { error: 'Failed to import trace bundle', details: String(error) },
        { status: 500 },
      )
    }
  }),
)
