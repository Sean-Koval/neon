/**
 * Spans API
 *
 * POST /api/spans - Insert a single span (for Temporal workers)
 * POST /api/spans/batch - Insert multiple spans
 */

import { type NextRequest, NextResponse } from 'next/server'
import { batchInsertSpans } from '@/lib/clickhouse-batch'
import type { SpanRecord } from '@/lib/db/clickhouse'
import { logger } from '@/lib/logger'
import { withAuth, type AuthResult } from '@/lib/middleware/auth'
import { withRateLimit } from '@/lib/middleware/rate-limit'
import { BATCH_LIMIT } from '@/lib/rate-limit'
import { validateBody } from '@/lib/validation/middleware'
import { createSpanSchema } from '@/lib/validation/schemas'

export const POST = withRateLimit(withAuth(async function POST(request: NextRequest, auth: AuthResult) {
  try {
    const body = await request.json()

    // Validate request body
    const validation = validateBody(createSpanSchema, body)
    if (!validation.success) return validation.response
    const data = validation.data

    // Get project ID from auth, header, or body
    const projectId =
      auth.workspaceId ||
      request.headers.get('x-project-id') ||
      (Array.isArray(data) ? data[0]?.project_id : data.project_id) ||
      '00000000-0000-0000-0000-000000000001'

    // Handle both single span and array
    const rawSpans = Array.isArray(data) ? data : [data]

    // Ensure all spans have project_id and required defaults
    const normalizedSpans: SpanRecord[] = rawSpans.map((span) => ({
      project_id: span.project_id || projectId,
      trace_id: span.trace_id,
      span_id: span.span_id,
      parent_span_id: span.parent_span_id ?? null,
      name: span.name,
      kind: span.kind || 'internal',
      span_type: span.span_type || 'span',
      timestamp: span.timestamp,
      end_time: span.end_time ?? null,
      duration_ms: span.duration_ms || 0,
      status: span.status || 'unset',
      status_message: span.status_message || '',
      model: span.model ?? null,
      model_parameters: (span.model_parameters || {}) as Record<string, string>,
      input: span.input || '',
      output: span.output || '',
      input_tokens: span.input_tokens ?? null,
      output_tokens: span.output_tokens ?? null,
      total_tokens: span.total_tokens ?? null,
      cost_usd: span.cost_usd ?? null,
      tool_name: span.tool_name ?? null,
      tool_input: span.tool_input || '',
      tool_output: span.tool_output || '',
      attributes: (span.attributes || {}) as Record<string, string>,
    }))

    await batchInsertSpans(normalizedSpans, { immediate: true })

    return NextResponse.json({
      message: 'Span(s) inserted successfully',
      count: normalizedSpans.length,
    })
  } catch (error) {
    logger.error({ err: error }, 'Error inserting span')
    return NextResponse.json(
      { error: 'Failed to insert span', details: String(error) },
      { status: 500 },
    )
  }
}), BATCH_LIMIT)
