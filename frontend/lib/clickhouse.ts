/**
 * ClickHouse Client
 *
 * Provides connection to ClickHouse for trace/span/score storage.
 */

import { type ClickHouseClient, createClient } from '@clickhouse/client'

// Singleton client instance
let client: ClickHouseClient | null = null

/**
 * Get or create ClickHouse client
 */
export function getClickHouseClient(): ClickHouseClient {
  if (!client) {
    client = createClient({
      url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
      username: process.env.CLICKHOUSE_USER || 'default',
      password: process.env.CLICKHOUSE_PASSWORD || '',
      database: process.env.CLICKHOUSE_DATABASE || 'neon',
    })
  }
  return client
}

/**
 * Trace record as stored in ClickHouse
 */
export interface TraceRecord {
  project_id: string
  trace_id: string
  name: string
  timestamp: string
  end_time: string | null
  duration_ms: number
  status: 'unset' | 'ok' | 'error'
  metadata: Record<string, string>
  agent_id: string | null
  agent_version: string | null
  workflow_id: string | null
  run_id: string | null
  total_tokens: number
  total_cost: number
  llm_calls: number
  tool_calls: number
}

/**
 * Span record as stored in ClickHouse
 */
export interface SpanRecord {
  project_id: string
  trace_id: string
  span_id: string
  parent_span_id: string | null
  name: string
  kind: 'internal' | 'server' | 'client' | 'producer' | 'consumer'
  span_type: 'span' | 'generation' | 'tool' | 'retrieval' | 'event'
  timestamp: string
  end_time: string | null
  duration_ms: number
  status: 'unset' | 'ok' | 'error'
  status_message: string
  model: string | null
  model_parameters: Record<string, string>
  input: string
  output: string
  input_tokens: number | null
  output_tokens: number | null
  total_tokens: number | null
  cost_usd: number | null
  tool_name: string | null
  tool_input: string
  tool_output: string
  attributes: Record<string, string>
}

/**
 * Score record as stored in ClickHouse
 */
export interface ScoreRecord {
  project_id: string
  score_id: string
  trace_id: string
  span_id: string | null
  run_id: string | null
  case_id: string | null
  name: string
  value: number
  score_type: 'numeric' | 'categorical' | 'boolean'
  string_value: string | null
  comment: string
  source: 'api' | 'sdk' | 'annotation' | 'eval' | 'temporal'
  config_id: string | null
  author_id: string | null
  timestamp: string
}

/**
 * Insert traces into ClickHouse
 */
export async function insertTraces(traces: TraceRecord[]): Promise<void> {
  const ch = getClickHouseClient()
  await ch.insert({
    table: 'traces',
    values: traces,
    format: 'JSONEachRow',
  })
}

/**
 * Insert spans into ClickHouse
 */
export async function insertSpans(spans: SpanRecord[]): Promise<void> {
  const ch = getClickHouseClient()
  await ch.insert({
    table: 'spans',
    values: spans,
    format: 'JSONEachRow',
  })
}

/**
 * Insert scores into ClickHouse
 */
export async function insertScores(scores: ScoreRecord[]): Promise<void> {
  const ch = getClickHouseClient()
  await ch.insert({
    table: 'scores',
    values: scores,
    format: 'JSONEachRow',
  })
}

/**
 * Query traces with filters
 */
export async function queryTraces(params: {
  projectId: string
  status?: 'ok' | 'error'
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}): Promise<TraceRecord[]> {
  const ch = getClickHouseClient()

  const conditions = [`project_id = {projectId:String}`]
  if (params.status) {
    conditions.push(`status = {status:String}`)
  }
  if (params.startDate) {
    conditions.push(`timestamp >= {startDate:DateTime64(3)}`)
  }
  if (params.endDate) {
    conditions.push(`timestamp <= {endDate:DateTime64(3)}`)
  }

  const query = `
    SELECT *
    FROM traces
    WHERE ${conditions.join(' AND ')}
    ORDER BY timestamp DESC
    LIMIT {limit:UInt32}
    OFFSET {offset:UInt32}
  `

  const result = await ch.query({
    query,
    query_params: {
      projectId: params.projectId,
      status: params.status || '',
      startDate: params.startDate || '1970-01-01',
      endDate: params.endDate || '2100-01-01',
      limit: params.limit || 50,
      offset: params.offset || 0,
    },
    format: 'JSONEachRow',
  })

  return result.json<TraceRecord>()
}

/**
 * Get a single trace with all its spans
 */
export async function getTraceWithSpans(
  projectId: string,
  traceId: string,
): Promise<{ trace: TraceRecord; spans: SpanRecord[] } | null> {
  const ch = getClickHouseClient()

  // Get trace
  const traceResult = await ch.query({
    query: `
      SELECT * FROM traces
      WHERE project_id = {projectId:String} AND trace_id = {traceId:String}
      LIMIT 1
    `,
    query_params: { projectId, traceId },
    format: 'JSONEachRow',
  })

  const traces = await traceResult.json<TraceRecord>()
  if (traces.length === 0) {
    return null
  }

  // Get spans
  const spansResult = await ch.query({
    query: `
      SELECT * FROM spans
      WHERE project_id = {projectId:String} AND trace_id = {traceId:String}
      ORDER BY timestamp ASC
    `,
    query_params: { projectId, traceId },
    format: 'JSONEachRow',
  })

  const spans = await spansResult.json<SpanRecord>()

  return { trace: traces[0], spans }
}

/**
 * Get scores for a trace
 */
export async function getScoresForTrace(
  projectId: string,
  traceId: string,
): Promise<ScoreRecord[]> {
  const ch = getClickHouseClient()

  const result = await ch.query({
    query: `
      SELECT * FROM scores
      WHERE project_id = {projectId:String} AND trace_id = {traceId:String}
      ORDER BY timestamp DESC
    `,
    query_params: { projectId, traceId },
    format: 'JSONEachRow',
  })

  return result.json<ScoreRecord>()
}

/**
 * Get daily statistics
 */
export async function getDailyStats(
  projectId: string,
  startDate: string,
  endDate: string,
): Promise<
  {
    date: string
    trace_count: number
    error_count: number
    total_tokens: number
    total_cost: number
  }[]
> {
  const ch = getClickHouseClient()

  const result = await ch.query({
    query: `
      SELECT
        date,
        sum(trace_count) as trace_count,
        sum(error_count) as error_count,
        sum(total_tokens) as total_tokens,
        sum(total_cost) as total_cost
      FROM daily_stats_mv
      WHERE project_id = {projectId:String}
        AND date >= {startDate:Date}
        AND date <= {endDate:Date}
      GROUP BY date
      ORDER BY date ASC
    `,
    query_params: { projectId, startDate, endDate },
    format: 'JSONEachRow',
  })

  return result.json()
}

/**
 * Span summary for list view (without large payload fields)
 */
export interface SpanSummary {
  project_id: string
  trace_id: string
  span_id: string
  parent_span_id: string | null
  name: string
  kind: 'internal' | 'server' | 'client' | 'producer' | 'consumer'
  span_type: 'span' | 'generation' | 'tool' | 'retrieval' | 'event'
  timestamp: string
  end_time: string | null
  duration_ms: number
  status: 'unset' | 'ok' | 'error'
  status_message: string
  model: string | null
  input_tokens: number | null
  output_tokens: number | null
  total_tokens: number | null
  cost_usd: number | null
  tool_name: string | null
}

/**
 * Span details (large payload fields loaded lazily)
 */
export interface SpanDetails {
  span_id: string
  input: string
  output: string
  tool_input: string
  tool_output: string
  model_parameters: Record<string, string>
  attributes: Record<string, string>
}

/**
 * Get trace with span summaries (without large payloads)
 */
export async function getTraceWithSpanSummaries(
  projectId: string,
  traceId: string,
): Promise<{ trace: TraceRecord; spans: SpanSummary[] } | null> {
  const ch = getClickHouseClient()

  // Get trace
  const traceResult = await ch.query({
    query: `
      SELECT * FROM traces
      WHERE project_id = {projectId:String} AND trace_id = {traceId:String}
      LIMIT 1
    `,
    query_params: { projectId, traceId },
    format: 'JSONEachRow',
  })

  const traces = await traceResult.json<TraceRecord>()
  if (traces.length === 0) {
    return null
  }

  // Get span summaries without large payload fields
  const spansResult = await ch.query({
    query: `
      SELECT
        project_id, trace_id, span_id, parent_span_id, name, kind, span_type,
        timestamp, end_time, duration_ms, status, status_message, model,
        input_tokens, output_tokens, total_tokens, cost_usd, tool_name
      FROM spans
      WHERE project_id = {projectId:String} AND trace_id = {traceId:String}
      ORDER BY timestamp ASC
    `,
    query_params: { projectId, traceId },
    format: 'JSONEachRow',
  })

  const spans = await spansResult.json<SpanSummary>()

  return { trace: traces[0], spans }
}

/**
 * Get single span full details
 */
export async function getSpanDetails(
  projectId: string,
  spanId: string,
): Promise<SpanDetails | null> {
  const ch = getClickHouseClient()

  const result = await ch.query({
    query: `
      SELECT
        span_id, input, output, tool_input, tool_output,
        model_parameters, attributes
      FROM spans
      WHERE project_id = {projectId:String} AND span_id = {spanId:String}
      LIMIT 1
    `,
    query_params: { projectId, spanId },
    format: 'JSONEachRow',
  })

  const spans = await result.json<SpanDetails>()
  return spans.length > 0 ? spans[0] : null
}
