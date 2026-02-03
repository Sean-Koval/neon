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

// =============================================================================
// Lazy Loading Types (PERF-004)
// =============================================================================

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

// =============================================================================
// Dashboard Aggregation Types
// =============================================================================

/**
 * Score trend data point with min/max values.
 */
export interface ScoreTrendPoint {
  date: string
  name: string
  avg_score: number
  min_score: number
  max_score: number
  score_count: number
}

/**
 * Duration statistics with percentiles.
 */
export interface DurationStats {
  date: string
  avg_duration_ms: number
  p50_ms: number
  p95_ms: number
  p99_ms: number
  min_duration_ms: number
  max_duration_ms: number
  trace_count: number
}

/**
 * Daily run summary for dashboard cards.
 */
export interface DailyRunSummary {
  date: string
  total_runs: number
  passed_runs: number
  failed_runs: number
  total_duration_ms: number
  total_tokens: number
  total_cost: number
}

/**
 * Scorer-level statistics.
 */
export interface ScorerStats {
  name: string
  source: string
  date: string
  avg_score: number
  min_score: number
  max_score: number
  score_count: number
  passed_count: number
  failed_count: number
}

/**
 * Dashboard summary aggregates.
 */
export interface DashboardSummary {
  total_runs: number
  passed_runs: number
  failed_runs: number
  pass_rate: number
  avg_duration_ms: number
  total_tokens: number
  total_cost: number
}

// =============================================================================
// Dashboard Query Functions
// =============================================================================

/**
 * Get enhanced score trends with min/max values.
 * Queries the score_trends_full_mv materialized view.
 */
export async function getScoreTrends(
  projectId: string,
  startDate: string,
  endDate: string,
  scorerName?: string,
): Promise<ScoreTrendPoint[]> {
  const ch = getClickHouseClient()

  const conditions = [
    'project_id = {projectId:String}',
    'date >= {startDate:Date}',
    'date <= {endDate:Date}',
  ]
  if (scorerName) {
    conditions.push('name = {scorerName:String}')
  }

  const result = await ch.query({
    query: `
      SELECT
        date,
        name,
        avgMerge(avg_score_state) as avg_score,
        minMerge(min_score_state) as min_score,
        maxMerge(max_score_state) as max_score,
        countMerge(score_count_state) as score_count
      FROM score_trends_full_mv
      WHERE ${conditions.join(' AND ')}
      GROUP BY date, name
      ORDER BY date ASC, name ASC
    `,
    query_params: {
      projectId,
      startDate,
      endDate,
      scorerName: scorerName || '',
    },
    format: 'JSONEachRow',
  })

  return result.json<ScoreTrendPoint>()
}

/**
 * Get duration statistics with percentiles.
 * Queries the duration_stats_mv materialized view.
 */
export async function getDurationStats(
  projectId: string,
  startDate: string,
  endDate: string,
): Promise<DurationStats[]> {
  const ch = getClickHouseClient()

  const result = await ch.query({
    query: `
      SELECT
        date,
        avgMerge(avg_duration_state) as avg_duration_ms,
        quantileMerge(0.5)(p50_state) as p50_ms,
        quantileMerge(0.95)(p95_state) as p95_ms,
        quantileMerge(0.99)(p99_state) as p99_ms,
        minMerge(min_duration_state) as min_duration_ms,
        maxMerge(max_duration_state) as max_duration_ms,
        countMerge(trace_count_state) as trace_count
      FROM duration_stats_mv
      WHERE project_id = {projectId:String}
        AND date >= {startDate:Date}
        AND date <= {endDate:Date}
      GROUP BY date
      ORDER BY date ASC
    `,
    query_params: { projectId, startDate, endDate },
    format: 'JSONEachRow',
  })

  return result.json<DurationStats>()
}

/**
 * Get daily run summary for dashboard cards.
 * Queries the daily_run_summary_mv materialized view.
 */
export async function getDailyRunSummary(
  projectId: string,
  startDate: string,
  endDate: string,
): Promise<DailyRunSummary[]> {
  const ch = getClickHouseClient()

  const result = await ch.query({
    query: `
      SELECT
        date,
        sum(total_runs) as total_runs,
        sum(passed_runs) as passed_runs,
        sum(failed_runs) as failed_runs,
        sum(total_duration_ms) as total_duration_ms,
        sum(total_tokens) as total_tokens,
        sum(total_cost) as total_cost
      FROM daily_run_summary_mv
      WHERE project_id = {projectId:String}
        AND date >= {startDate:Date}
        AND date <= {endDate:Date}
      GROUP BY date
      ORDER BY date ASC
    `,
    query_params: { projectId, startDate, endDate },
    format: 'JSONEachRow',
  })

  return result.json<DailyRunSummary>()
}

/**
 * Get aggregated dashboard summary for a date range.
 * Combines multiple views for efficient dashboard loading.
 */
export async function getDashboardSummary(
  projectId: string,
  startDate: string,
  endDate: string,
): Promise<DashboardSummary> {
  const ch = getClickHouseClient()

  // Query traces table directly for summary (simpler than fighting with MV engines)
  const result = await ch.query({
    query: `
      SELECT
        count() as total_runs,
        countIf(status = 'ok') as passed_runs,
        countIf(status = 'error') as failed_runs,
        if(count() > 0, countIf(status = 'ok') / count(), 0) as pass_rate,
        if(count() > 0, avg(duration_ms), 0) as avg_duration_ms,
        sum(total_tokens) as total_tokens,
        sum(total_cost) as total_cost
      FROM traces
      WHERE project_id = {projectId:String}
        AND timestamp >= {startDate:Date}
        AND timestamp <= {endDate:Date} + INTERVAL 1 DAY
    `,
    query_params: { projectId, startDate, endDate },
    format: 'JSONEachRow',
  })

  const rows = await result.json<DashboardSummary>()
  return (
    rows[0] || {
      total_runs: 0,
      passed_runs: 0,
      failed_runs: 0,
      pass_rate: 0,
      avg_duration_ms: 0,
      total_tokens: 0,
      total_cost: 0,
    }
  )
}

/**
 * Get scorer statistics.
 * Queries the scorer_stats_mv materialized view.
 */
export async function getScorerStats(
  projectId: string,
  startDate: string,
  endDate: string,
): Promise<ScorerStats[]> {
  const ch = getClickHouseClient()

  const result = await ch.query({
    query: `
      SELECT
        name,
        source,
        date,
        avgMerge(avg_score_state) as avg_score,
        minMerge(min_score_state) as min_score,
        maxMerge(max_score_state) as max_score,
        countMerge(score_count_state) as score_count,
        countMerge(passed_count_state) as passed_count,
        countMerge(failed_count_state) as failed_count
      FROM scorer_stats_mv
      WHERE project_id = {projectId:String}
        AND date >= {startDate:Date}
        AND date <= {endDate:Date}
      GROUP BY name, source, date
      ORDER BY date ASC, name ASC
    `,
    query_params: { projectId, startDate, endDate },
    format: 'JSONEachRow',
  })

  return result.json<ScorerStats>()
}

// =============================================================================
// Backfill Functions
// =============================================================================

/**
 * Backfill all materialized views with existing data.
 * Should be run once after creating the views.
 */
// =============================================================================
// Prompt Types and Functions
// =============================================================================

/**
 * Prompt record as stored in ClickHouse
 */
export interface PromptRecord {
  project_id: string
  prompt_id: string
  name: string
  description: string
  type: 'text' | 'chat'
  template: string
  messages: string // JSON string
  variables: string // JSON string
  config: string // JSON string
  tags: string[] // Array in ClickHouse
  is_production: number // 0 or 1
  version: number
  commit_message: string
  created_by: string
  created_at: string
  updated_at: string
  parent_version_id: string
  variant: string
}

/**
 * Insert a prompt into ClickHouse
 */
export async function insertPrompt(prompt: PromptRecord): Promise<void> {
  const ch = getClickHouseClient()
  await ch.insert({
    table: 'prompts',
    values: [prompt],
    format: 'JSONEachRow',
  })
}

/**
 * Get a prompt by ID
 */
export async function getPromptById(
  projectId: string,
  promptId: string,
): Promise<PromptRecord | null> {
  const ch = getClickHouseClient()

  const result = await ch.query({
    query: `
      SELECT * FROM prompts
      WHERE project_id = {projectId:String} AND prompt_id = {promptId:String}
      ORDER BY version DESC
      LIMIT 1
    `,
    query_params: { projectId, promptId },
    format: 'JSONEachRow',
  })

  const prompts = await result.json<PromptRecord>()
  return prompts.length > 0 ? prompts[0] : null
}

/**
 * Get a prompt by name and optionally version
 */
export async function getPromptByName(
  projectId: string,
  name: string,
  version?: number,
): Promise<PromptRecord | null> {
  const ch = getClickHouseClient()

  let query = `
    SELECT * FROM prompts
    WHERE project_id = {projectId:String} AND name = {name:String}
  `
  const params: Record<string, string | number> = { projectId, name }

  if (version !== undefined) {
    query += ' AND version = {version:UInt32}'
    params.version = version
  }

  query += ' ORDER BY version DESC LIMIT 1'

  const result = await ch.query({
    query,
    query_params: params,
    format: 'JSONEachRow',
  })

  const prompts = await result.json<PromptRecord>()
  return prompts.length > 0 ? prompts[0] : null
}

/**
 * List prompts
 */
export async function listPrompts(params: {
  projectId: string
  tags?: string[]
  isProduction?: boolean
  limit?: number
  offset?: number
}): Promise<PromptRecord[]> {
  const ch = getClickHouseClient()

  const conditions = ['project_id = {projectId:String}']
  const queryParams: Record<string, string | number | string[]> = {
    projectId: params.projectId,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
  }

  if (params.isProduction !== undefined) {
    conditions.push('is_production = {isProduction:UInt8}')
    queryParams.isProduction = params.isProduction ? 1 : 0
  }

  // Get latest version of each prompt
  const result = await ch.query({
    query: `
      SELECT * FROM prompts
      WHERE ${conditions.join(' AND ')}
        AND (name, version) IN (
          SELECT name, max(version)
          FROM prompts
          WHERE project_id = {projectId:String}
          GROUP BY name
        )
      ORDER BY updated_at DESC
      LIMIT {limit:UInt32}
      OFFSET {offset:UInt32}
    `,
    query_params: queryParams,
    format: 'JSONEachRow',
  })

  return result.json<PromptRecord>()
}

/**
 * Get version history for a prompt
 */
export async function getPromptVersionHistory(
  projectId: string,
  name: string,
  limit = 20,
): Promise<PromptRecord[]> {
  const ch = getClickHouseClient()

  const result = await ch.query({
    query: `
      SELECT * FROM prompts
      WHERE project_id = {projectId:String} AND name = {name:String}
      ORDER BY version DESC
      LIMIT {limit:UInt32}
    `,
    query_params: { projectId, name, limit },
    format: 'JSONEachRow',
  })

  return result.json<PromptRecord>()
}

/**
 * Get the latest version number for a prompt
 */
export async function getLatestPromptVersion(
  projectId: string,
  name: string,
): Promise<number> {
  const ch = getClickHouseClient()

  const result = await ch.query({
    query: `
      SELECT max(version) as max_version FROM prompts
      WHERE project_id = {projectId:String} AND name = {name:String}
    `,
    query_params: { projectId, name },
    format: 'JSONEachRow',
  })

  const rows = await result.json<{ max_version: number }>()
  return rows[0]?.max_version ?? 0
}

// =============================================================================
// Cross-Workspace Analytics (Organization-level)
// =============================================================================

/**
 * Organization-level analytics summary across multiple workspaces/projects.
 */
export interface OrgAnalyticsSummary {
  total_workspaces: number
  total_runs: number
  passed_runs: number
  failed_runs: number
  pass_rate: number
  total_tokens: number
  total_cost: number
  avg_duration_ms: number
}

/**
 * Per-workspace analytics breakdown.
 */
export interface WorkspaceAnalytics {
  project_id: string
  total_runs: number
  passed_runs: number
  failed_runs: number
  pass_rate: number
  total_tokens: number
  total_cost: number
  avg_duration_ms: number
}

/**
 * Get aggregated analytics across multiple workspaces.
 */
export async function getOrgAnalyticsSummary(
  projectIds: string[],
  startDate: string,
  endDate: string,
): Promise<OrgAnalyticsSummary> {
  const ch = getClickHouseClient()

  if (projectIds.length === 0) {
    return {
      total_workspaces: 0,
      total_runs: 0,
      passed_runs: 0,
      failed_runs: 0,
      pass_rate: 0,
      total_tokens: 0,
      total_cost: 0,
      avg_duration_ms: 0,
    }
  }

  const result = await ch.query({
    query: `
      SELECT
        uniqExact(project_id) as total_workspaces,
        count() as total_runs,
        countIf(status = 'ok') as passed_runs,
        countIf(status = 'error') as failed_runs,
        if(count() > 0, countIf(status = 'ok') / count(), 0) as pass_rate,
        sum(total_tokens) as total_tokens,
        sum(total_cost) as total_cost,
        if(count() > 0, avg(duration_ms), 0) as avg_duration_ms
      FROM traces
      WHERE project_id IN {projectIds:Array(String)}
        AND timestamp >= {startDate:Date}
        AND timestamp <= {endDate:Date} + INTERVAL 1 DAY
    `,
    query_params: { projectIds, startDate, endDate },
    format: 'JSONEachRow',
  })

  const rows = await result.json<OrgAnalyticsSummary>()
  return (
    rows[0] || {
      total_workspaces: 0,
      total_runs: 0,
      passed_runs: 0,
      failed_runs: 0,
      pass_rate: 0,
      total_tokens: 0,
      total_cost: 0,
      avg_duration_ms: 0,
    }
  )
}

/**
 * Get per-workspace analytics breakdown.
 */
export async function getWorkspaceAnalyticsBreakdown(
  projectIds: string[],
  startDate: string,
  endDate: string,
): Promise<WorkspaceAnalytics[]> {
  const ch = getClickHouseClient()

  if (projectIds.length === 0) {
    return []
  }

  const result = await ch.query({
    query: `
      SELECT
        project_id,
        count() as total_runs,
        countIf(status = 'ok') as passed_runs,
        countIf(status = 'error') as failed_runs,
        if(count() > 0, countIf(status = 'ok') / count(), 0) as pass_rate,
        sum(total_tokens) as total_tokens,
        sum(total_cost) as total_cost,
        if(count() > 0, avg(duration_ms), 0) as avg_duration_ms
      FROM traces
      WHERE project_id IN {projectIds:Array(String)}
        AND timestamp >= {startDate:Date}
        AND timestamp <= {endDate:Date} + INTERVAL 1 DAY
      GROUP BY project_id
      ORDER BY total_runs DESC
    `,
    query_params: { projectIds, startDate, endDate },
    format: 'JSONEachRow',
  })

  return result.json<WorkspaceAnalytics>()
}

/**
 * Get cross-workspace score comparison.
 */
export async function getCrossWorkspaceScoreComparison(
  projectIds: string[],
  scorerName: string,
  startDate: string,
  endDate: string,
): Promise<
  {
    project_id: string
    avg_score: number
    min_score: number
    max_score: number
    score_count: number
  }[]
> {
  const ch = getClickHouseClient()

  if (projectIds.length === 0) {
    return []
  }

  const result = await ch.query({
    query: `
      SELECT
        project_id,
        avg(value) as avg_score,
        min(value) as min_score,
        max(value) as max_score,
        count() as score_count
      FROM scores
      WHERE project_id IN {projectIds:Array(String)}
        AND name = {scorerName:String}
        AND timestamp >= {startDate:Date}
        AND timestamp <= {endDate:Date} + INTERVAL 1 DAY
      GROUP BY project_id
      ORDER BY avg_score DESC
    `,
    query_params: { projectIds, scorerName, startDate, endDate },
    format: 'JSONEachRow',
  })

  return result.json()
}

/**
 * Get cross-workspace daily trends.
 */
export async function getCrossWorkspaceDailyTrends(
  projectIds: string[],
  startDate: string,
  endDate: string,
): Promise<
  {
    date: string
    total_runs: number
    passed_runs: number
    failed_runs: number
    total_tokens: number
    total_cost: number
  }[]
> {
  const ch = getClickHouseClient()

  if (projectIds.length === 0) {
    return []
  }

  const result = await ch.query({
    query: `
      SELECT
        toDate(timestamp) as date,
        count() as total_runs,
        countIf(status = 'ok') as passed_runs,
        countIf(status = 'error') as failed_runs,
        sum(total_tokens) as total_tokens,
        sum(total_cost) as total_cost
      FROM traces
      WHERE project_id IN {projectIds:Array(String)}
        AND timestamp >= {startDate:Date}
        AND timestamp <= {endDate:Date} + INTERVAL 1 DAY
      GROUP BY date
      ORDER BY date ASC
    `,
    query_params: { projectIds, startDate, endDate },
    format: 'JSONEachRow',
  })

  return result.json()
}

export async function backfillMaterializedViews(
  projectId?: string,
): Promise<{ view: string; rows: number }[]> {
  const ch = getClickHouseClient()
  const results: { view: string; rows: number }[] = []

  const projectFilter = projectId ? `WHERE project_id = '${projectId}'` : ''
  const scoresProjectFilter = projectId
    ? `WHERE project_id = '${projectId}'`
    : ''
  const tracesProjectFilter = projectId
    ? `WHERE project_id = '${projectId}'`
    : ''
  const runIdFilter = projectId
    ? `WHERE run_id IS NOT NULL AND project_id = '${projectId}'`
    : 'WHERE run_id IS NOT NULL'

  // Backfill score_trends_full_mv
  await ch.command({
    query: `
      INSERT INTO score_trends_full_mv
      SELECT project_id, name, toDate(timestamp) as date,
             avgState(value), minState(value), maxState(value), countState()
      FROM scores
      ${scoresProjectFilter}
      GROUP BY project_id, name, date
    `,
  })
  const scoreTrendsCount = await ch.query({
    query: `SELECT count() as cnt FROM score_trends_full_mv ${projectFilter}`,
    format: 'JSONEachRow',
  })
  const scoreTrendsRows = await scoreTrendsCount.json<{ cnt: number }>()
  results.push({
    view: 'score_trends_full_mv',
    rows: scoreTrendsRows[0]?.cnt || 0,
  })

  // Backfill duration_stats_mv
  await ch.command({
    query: `
      INSERT INTO duration_stats_mv
      SELECT project_id, toDate(timestamp) as date,
             avgState(duration_ms), quantileState(0.5)(duration_ms),
             quantileState(0.95)(duration_ms), quantileState(0.99)(duration_ms),
             minState(duration_ms), maxState(duration_ms), countState()
      FROM traces
      ${tracesProjectFilter}
      GROUP BY project_id, date
    `,
  })
  const durationCount = await ch.query({
    query: `SELECT count() as cnt FROM duration_stats_mv ${projectFilter}`,
    format: 'JSONEachRow',
  })
  const durationRows = await durationCount.json<{ cnt: number }>()
  results.push({ view: 'duration_stats_mv', rows: durationRows[0]?.cnt || 0 })

  // Backfill run_scores_mv
  await ch.command({
    query: `
      INSERT INTO run_scores_mv
      SELECT project_id, run_id, toDate(timestamp) as date,
             avgState(value), minState(value), countState(),
             countIfState(value >= 0.7), countIfState(value < 0.7)
      FROM scores
      ${runIdFilter}
      GROUP BY project_id, run_id, date
    `,
  })
  const runScoresCount = await ch.query({
    query: `SELECT count() as cnt FROM run_scores_mv ${projectFilter}`,
    format: 'JSONEachRow',
  })
  const runScoresRows = await runScoresCount.json<{ cnt: number }>()
  results.push({ view: 'run_scores_mv', rows: runScoresRows[0]?.cnt || 0 })

  // Backfill daily_run_summary_mv
  await ch.command({
    query: `
      INSERT INTO daily_run_summary_mv
      SELECT project_id, toDate(timestamp) as date,
             count(), countIf(status = 'ok'), countIf(status = 'error'),
             sum(duration_ms), sum(total_tokens), sum(total_cost)
      FROM traces
      ${runIdFilter}
      GROUP BY project_id, date
    `,
  })
  const dailySummaryCount = await ch.query({
    query: `SELECT count() as cnt FROM daily_run_summary_mv ${projectFilter}`,
    format: 'JSONEachRow',
  })
  const dailySummaryRows = await dailySummaryCount.json<{ cnt: number }>()
  results.push({
    view: 'daily_run_summary_mv',
    rows: dailySummaryRows[0]?.cnt || 0,
  })

  // Backfill scorer_stats_mv
  await ch.command({
    query: `
      INSERT INTO scorer_stats_mv
      SELECT project_id, name, source, toDate(timestamp) as date,
             avgState(value), minState(value), maxState(value), countState(),
             countIfState(value >= 0.7), countIfState(value < 0.7)
      FROM scores
      ${scoresProjectFilter}
      GROUP BY project_id, name, source, date
    `,
  })
  const scorerStatsCount = await ch.query({
    query: `SELECT count() as cnt FROM scorer_stats_mv ${projectFilter}`,
    format: 'JSONEachRow',
  })
  const scorerStatsRows = await scorerStatsCount.json<{ cnt: number }>()
  results.push({ view: 'scorer_stats_mv', rows: scorerStatsRows[0]?.cnt || 0 })

  return results
}
