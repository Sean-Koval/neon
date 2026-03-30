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
import { redactString, redactTraceAttributes, isTraceMaskingEnabled } from '@/lib/tracing/redaction'
import { validateBody } from '@/lib/validation/middleware'
import { createSpanSchema } from '@/lib/validation/schemas'

function addJSONAttribute(
  attributes: Record<string, string>,
  key: string,
  value: unknown,
): void {
  try {
    attributes[key] = JSON.stringify(value)
  } catch {
    // Ignore serialization failures and continue ingesting the span.
  }
}

function normalizeAttributes(span: Record<string, unknown>): Record<string, string> {
  const attributes: Record<string, string> = {}

  for (const [key, value] of Object.entries((span.attributes || {}) as Record<string, unknown>)) {
    if (value == null) continue
    attributes[key] = String(value)
  }

  const session = span.session as
    | { sessionId: string; conversationId?: string; userId?: string; threadId?: string }
    | null
    | undefined
  if (session) {
    attributes['session.id'] = session.sessionId
    if (session.conversationId) attributes['gen_ai.conversation.id'] = session.conversationId
    if (session.userId) attributes['enduser.id'] = session.userId
    if (session.threadId) attributes['neon.thread.id'] = session.threadId
    addJSONAttribute(attributes, 'neon.session', session)
  }

  if (Array.isArray(span.input_messages) && span.input_messages.length > 0) {
    addJSONAttribute(attributes, 'gen_ai.input.messages', span.input_messages)
  }

  if (Array.isArray(span.output_messages) && span.output_messages.length > 0) {
    addJSONAttribute(attributes, 'gen_ai.output.messages', span.output_messages)
  }

  if (span.handoff) {
    const handoff = span.handoff as Record<string, unknown>
    if (typeof handoff.handoffType === 'string') attributes['neon.handoff.type'] = handoff.handoffType
    if (typeof handoff.toAgentId === 'string') attributes['neon.handoff.to_agent'] = handoff.toAgentId
    if (typeof handoff.fromAgentId === 'string') attributes['neon.handoff.from_agent'] = handoff.fromAgentId
    if (typeof handoff.reason === 'string') attributes['neon.handoff.reason'] = handoff.reason
    if (typeof handoff.taskDescription === 'string') {
      attributes['neon.handoff.task_description'] = handoff.taskDescription
    }
    addJSONAttribute(attributes, 'neon.handoff', handoff)
  }

  if (Array.isArray(span.state_snapshots) && span.state_snapshots.length > 0) {
    addJSONAttribute(attributes, 'neon.state_snapshots', span.state_snapshots)
  }

  if (Array.isArray(span.artifacts) && span.artifacts.length > 0) {
    addJSONAttribute(attributes, 'neon.artifacts', span.artifacts)
  }

  if (Array.isArray(span.eval_annotations) && span.eval_annotations.length > 0) {
    addJSONAttribute(attributes, 'neon.eval.annotations', span.eval_annotations)
  }

  if (span.skill_selection) addJSONAttribute(attributes, 'neon.skill_selection', span.skill_selection)
  if (span.mcp_context) addJSONAttribute(attributes, 'neon.mcp_context', span.mcp_context)
  if (span.decision_metadata) {
    addJSONAttribute(attributes, 'neon.decision_metadata', span.decision_metadata)
  }

  return redactTraceAttributes(attributes)
}

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
      input:
        isTraceMaskingEnabled() && typeof span.input === 'string'
          ? redactString(span.input)
          : (span.input || ''),
      output:
        isTraceMaskingEnabled() && typeof span.output === 'string'
          ? redactString(span.output)
          : (span.output || ''),
      input_tokens: span.input_tokens ?? null,
      output_tokens: span.output_tokens ?? null,
      total_tokens: span.total_tokens ?? null,
      cost_usd: span.cost_usd ?? null,
      tool_name: span.tool_name ?? null,
      tool_input:
        isTraceMaskingEnabled() && typeof span.tool_input === 'string'
          ? redactString(span.tool_input)
          : (span.tool_input || ''),
      tool_output:
        isTraceMaskingEnabled() && typeof span.tool_output === 'string'
          ? redactString(span.tool_output)
          : (span.tool_output || ''),
      attributes: normalizeAttributes(span as Record<string, unknown>),
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
