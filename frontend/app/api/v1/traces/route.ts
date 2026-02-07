/**
 * OTel Trace Ingestion Endpoint
 *
 * POST /api/v1/traces
 *
 * Accepts OTLP JSON format and transforms to internal format,
 * then stores in ClickHouse.
 */

import { type NextRequest, NextResponse } from 'next/server'
import type { SpanRecord, TraceRecord } from '@/lib/clickhouse'
import { insertSpans, insertTraces } from '@/lib/clickhouse'
import { withAuth, type AuthResult } from '@/lib/middleware/auth'
import { logger } from '@/lib/logger'

/**
 * OTel OTLP Span format (simplified)
 */
interface OTLPSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  kind?: number
  startTimeUnixNano: string
  endTimeUnixNano?: string
  attributes?: Array<{
    key: string
    value: {
      stringValue?: string
      intValue?: string
      doubleValue?: number
      boolValue?: boolean
    }
  }>
  status?: {
    code?: number
    message?: string
  }
}

interface OTLPRequest {
  resourceSpans: Array<{
    resource?: {
      attributes?: Array<{
        key: string
        value: { stringValue?: string }
      }>
    }
    scopeSpans: Array<{
      scope?: {
        name?: string
        version?: string
      }
      spans: OTLPSpan[]
    }>
  }>
}

/**
 * Transform OTel attributes array to object
 */
function attributesToObject(
  attrs?: Array<{
    key: string
    value: {
      stringValue?: string
      intValue?: string
      doubleValue?: number
      boolValue?: boolean
    }
  }>,
): Record<string, string> {
  if (!attrs) return {}
  return attrs.reduce(
    (acc, attr) => {
      const value =
        attr.value.stringValue ||
        attr.value.intValue?.toString() ||
        attr.value.doubleValue?.toString() ||
        attr.value.boolValue?.toString() ||
        ''
      acc[attr.key] = value
      return acc
    },
    {} as Record<string, string>,
  )
}

/**
 * Detect span type from attributes
 */
function detectSpanType(
  attrs: Record<string, string>,
): SpanRecord['span_type'] {
  if (
    attrs['gen_ai.system'] ||
    attrs['llm.system'] ||
    attrs['gen_ai.request.model']
  ) {
    return 'generation'
  }
  if (attrs['tool.name'] || attrs['tool.call.id']) {
    return 'tool'
  }
  if (attrs['retrieval.source'] || attrs['db.system']) {
    return 'retrieval'
  }
  return 'span'
}

/**
 * Map OTel span kind to internal kind
 */
function mapKind(kind?: number): SpanRecord['kind'] {
  const kinds: SpanRecord['kind'][] = [
    'internal',
    'server',
    'client',
    'producer',
    'consumer',
  ]
  return kinds[kind || 0] || 'internal'
}

/**
 * Map OTel status code to internal status
 */
function mapStatus(code?: number): SpanRecord['status'] {
  if (code === 0 || code === undefined) return 'unset'
  if (code === 1) return 'ok'
  return 'error'
}

/**
 * Format date for ClickHouse DateTime64(3)
 */
function formatDateTime(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '')
}

/**
 * Transform OTel span to internal format
 */
function transformSpan(otelSpan: OTLPSpan, projectId: string): SpanRecord {
  const attrs = attributesToObject(otelSpan.attributes)
  const startTime = formatDateTime(
    new Date(Number(otelSpan.startTimeUnixNano) / 1e6),
  )
  const endTime = otelSpan.endTimeUnixNano
    ? formatDateTime(new Date(Number(otelSpan.endTimeUnixNano) / 1e6))
    : null
  const durationMs = otelSpan.endTimeUnixNano
    ? (Number(otelSpan.endTimeUnixNano) - Number(otelSpan.startTimeUnixNano)) /
      1e6
    : 0

  return {
    project_id: projectId,
    trace_id: otelSpan.traceId,
    span_id: otelSpan.spanId,
    parent_span_id: otelSpan.parentSpanId || null,
    name: otelSpan.name,
    kind: mapKind(otelSpan.kind),
    span_type: detectSpanType(attrs),
    timestamp: startTime,
    end_time: endTime,
    duration_ms: Math.round(durationMs),
    status: mapStatus(otelSpan.status?.code),
    status_message: otelSpan.status?.message || '',
    model: attrs['gen_ai.request.model'] || attrs['llm.model'] || null,
    model_parameters: {},
    input: attrs['gen_ai.prompt'] || attrs['llm.input'] || '',
    output: attrs['gen_ai.completion'] || attrs['llm.output'] || '',
    input_tokens: attrs['gen_ai.usage.input_tokens']
      ? parseInt(attrs['gen_ai.usage.input_tokens'], 10)
      : null,
    output_tokens: attrs['gen_ai.usage.output_tokens']
      ? parseInt(attrs['gen_ai.usage.output_tokens'], 10)
      : null,
    total_tokens: attrs['gen_ai.usage.total_tokens']
      ? parseInt(attrs['gen_ai.usage.total_tokens'], 10)
      : null,
    cost_usd: null, // TODO: Calculate based on model
    tool_name: attrs['tool.name'] || null,
    tool_input: attrs['tool.input'] || '',
    tool_output: attrs['tool.output'] || '',
    attributes: attrs,
  }
}

/**
 * Aggregate spans into trace record
 */
function aggregateTrace(spans: SpanRecord[], projectId: string): TraceRecord {
  const rootSpan = spans.find((s) => !s.parent_span_id) || spans[0]
  const timestamps = spans.map((s) => new Date(s.timestamp).getTime())
  const minTime = Math.min(...timestamps)
  const maxTime = Math.max(
    ...spans.map((s) =>
      s.end_time
        ? new Date(s.end_time).getTime()
        : new Date(s.timestamp).getTime(),
    ),
  )

  const totalTokens = spans.reduce((sum, s) => sum + (s.total_tokens || 0), 0)
  const llmCalls = spans.filter((s) => s.span_type === 'generation').length
  const toolCalls = spans.filter((s) => s.span_type === 'tool').length

  const hasError = spans.some((s) => s.status === 'error')

  return {
    project_id: projectId,
    trace_id: rootSpan.trace_id,
    name: rootSpan.name,
    timestamp: formatDateTime(new Date(minTime)),
    end_time: formatDateTime(new Date(maxTime)),
    duration_ms: maxTime - minTime,
    status: hasError ? 'error' : 'ok',
    metadata: {},
    agent_id: null,
    agent_version: null,
    workflow_id: null,
    run_id: null,
    total_tokens: totalTokens,
    total_cost: 0, // TODO: Calculate
    llm_calls: llmCalls,
    tool_calls: toolCalls,
  }
}

/**
 * POST /api/v1/traces
 *
 * Ingest OTel traces
 */
export const POST = withAuth(
  async (request: NextRequest, auth: AuthResult) => {
    try {
      const projectId = auth.workspaceId
      if (!projectId) {
        return NextResponse.json(
          { error: 'Workspace context required' },
          { status: 400 },
        )
      }

      // Parse OTLP request
      const body: OTLPRequest = await request.json()

      if (!body.resourceSpans || body.resourceSpans.length === 0) {
        return NextResponse.json(
          { error: 'No resourceSpans provided' },
          { status: 400 },
        )
      }

      // Transform all spans
      const allSpans: SpanRecord[] = []
      const traceIds = new Set<string>()

      for (const resourceSpan of body.resourceSpans) {
        for (const scopeSpan of resourceSpan.scopeSpans) {
          for (const span of scopeSpan.spans) {
            const transformed = transformSpan(span, projectId)
            allSpans.push(transformed)
            traceIds.add(span.traceId)
          }
        }
      }

      if (allSpans.length === 0) {
        return NextResponse.json(
          { error: 'No spans to ingest' },
          { status: 400 },
        )
      }

      // Group spans by trace and create trace records
      const traces: TraceRecord[] = []
      for (const traceId of traceIds) {
        const traceSpans = allSpans.filter((s) => s.trace_id === traceId)
        traces.push(aggregateTrace(traceSpans, projectId))
      }

      // Insert into ClickHouse (direct insert, no batching)
      await Promise.all([insertTraces(traces), insertSpans(allSpans)])

      return NextResponse.json({
        message: 'Traces ingested successfully',
        traces: traces.length,
        spans: allSpans.length,
      })
    } catch (error) {
      logger.error({ err: error }, 'Error ingesting traces')
      return NextResponse.json(
        { error: 'Failed to ingest traces', details: String(error) },
        { status: 500 },
      )
    }
  },
)
