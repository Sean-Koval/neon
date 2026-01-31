/**
 * Trace Detail API
 *
 * GET /api/traces/:id - Get single trace with span summaries and scores
 *
 * Query params:
 * - project_id: Project ID (required)
 * - full: If 'true', return full span data (default: 'false' for lazy loading)
 */

import { type NextRequest, NextResponse } from 'next/server'
import {
  getScoresForTrace,
  getTraceWithSpanSummaries,
  getTraceWithSpans,
  type SpanRecord,
  type SpanSummary,
} from '@/lib/clickhouse'

/**
 * Build span tree from flat list (works with both full spans and summaries)
 */
function buildSpanTree<
  T extends { span_id: string; parent_span_id: string | null },
>(spans: T[]): Array<T & { children?: T[] }> {
  const spanMap = new Map<string, T & { children?: T[] }>()

  // Create map of all spans
  for (const span of spans) {
    spanMap.set(span.span_id, { ...span, children: [] })
  }

  // Build tree
  const roots: Array<T & { children?: T[] }> = []
  for (const span of spans) {
    const node = spanMap.get(span.span_id)
    if (!node) continue

    if (span.parent_span_id && spanMap.has(span.parent_span_id)) {
      const parent = spanMap.get(span.parent_span_id)
      if (parent) {
        parent.children = parent.children || []
        parent.children.push(node)
      }
    } else {
      roots.push(node)
    }
  }

  return roots
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: traceId } = await params

    // Get project ID from header or query
    const projectId =
      request.headers.get('x-project-id') ||
      request.nextUrl.searchParams.get('project_id') ||
      '00000000-0000-0000-0000-000000000001'

    // Check if full span data is requested (default: lazy loading with summaries)
    const fullData = request.nextUrl.searchParams.get('full') === 'true'

    if (fullData) {
      // Return full span data (backward compatible)
      const result = await getTraceWithSpans(projectId, traceId)

      if (!result) {
        return NextResponse.json({ error: 'Trace not found' }, { status: 404 })
      }

      const scores = await getScoresForTrace(projectId, traceId)
      const spanTree = buildSpanTree<SpanRecord>(result.spans)

      return NextResponse.json({
        trace: result.trace,
        spans: spanTree,
        flatSpans: result.spans,
        scores,
      })
    }

    // Return span summaries for lazy loading (default)
    const result = await getTraceWithSpanSummaries(projectId, traceId)

    if (!result) {
      return NextResponse.json({ error: 'Trace not found' }, { status: 404 })
    }

    // Get scores for trace
    const scores = await getScoresForTrace(projectId, traceId)

    // Build span tree from summaries
    const spanTree = buildSpanTree<SpanSummary>(result.spans)

    return NextResponse.json({
      trace: result.trace,
      spans: spanTree,
      flatSpans: result.spans,
      scores,
    })
  } catch (error) {
    console.error('Error getting trace:', error)
    return NextResponse.json(
      { error: 'Failed to get trace', details: String(error) },
      { status: 500 },
    )
  }
}
