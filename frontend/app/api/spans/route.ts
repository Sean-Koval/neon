/**
 * Spans API
 *
 * POST /api/spans - Insert a single span (for Temporal workers)
 * POST /api/spans/batch - Insert multiple spans
 */

import { type NextRequest, NextResponse } from 'next/server'
import { type SpanRecord } from '@/lib/clickhouse'
import { batchInsertSpans } from '@/lib/clickhouse-batch'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Get project ID from header or body
    const projectId =
      request.headers.get('x-project-id') ||
      body.project_id ||
      '00000000-0000-0000-0000-000000000001'

    // Handle both single span and array
    const spans: SpanRecord[] = Array.isArray(body) ? body : [body]

    // Ensure all spans have project_id
    const normalizedSpans = spans.map((span) => ({
      ...span,
      project_id: span.project_id || projectId,
      // Ensure required fields have defaults
      kind: span.kind || 'internal',
      status_message: span.status_message || '',
      model_parameters: span.model_parameters || {},
      input: span.input || '',
      output: span.output || '',
      tool_input: span.tool_input || '',
      tool_output: span.tool_output || '',
      attributes: span.attributes || {},
    }))

    await batchInsertSpans(normalizedSpans)

    return NextResponse.json({
      message: 'Span(s) inserted successfully',
      count: normalizedSpans.length,
    })
  } catch (error) {
    console.error('Error inserting span:', error)
    return NextResponse.json(
      { error: 'Failed to insert span', details: String(error) },
      { status: 500 },
    )
  }
}
