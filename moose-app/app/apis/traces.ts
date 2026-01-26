/**
 * Trace Query APIs
 *
 * These APIs query ClickHouse for trace data.
 * Auto-generated type-safe endpoints via MooseStack.
 */

import type { Trace, TraceResponse } from "../datamodels/traces";
import type { SpanWithChildren } from "../datamodels/spans";

/**
 * Request parameters for listing traces
 */
export interface ListTracesRequest {
  project_id: string;
  limit?: number;
  offset?: number;
  status?: "ok" | "error";
  start_date?: string;
  end_date?: string;
  agent_id?: string;
  search?: string;
}

/**
 * Summary trace info for list views
 */
export interface TraceSummary {
  trace_id: string;
  name: string;
  timestamp: string;
  duration_ms: number;
  status: string;
  total_tokens: number;
  tool_calls: number;
  llm_calls: number;
  agent_id: string | null;
  agent_version: string | null;
}

/**
 * List traces with optional filtering
 *
 * @route GET /api/traces
 */
export async function listTraces(
  req: ListTracesRequest,
  clickhouse: ClickHouseClient
): Promise<TraceSummary[]> {
  const {
    project_id,
    limit = 50,
    offset = 0,
    status,
    start_date,
    end_date,
    agent_id,
    search,
  } = req;

  // Build query with optional filters
  let query = `
    SELECT
      trace_id,
      any(name) as name,
      min(timestamp) as timestamp,
      sum(duration_ms) as duration_ms,
      anyIf(status, status != 'unset') as status,
      sumIf(total_tokens, span_type = 'generation') as total_tokens,
      countIf(span_type = 'tool') as tool_calls,
      countIf(span_type = 'generation') as llm_calls,
      any(agent_id) as agent_id,
      any(agent_version) as agent_version
    FROM spans
    WHERE project_id = {project_id:String}
  `;

  const params: Record<string, unknown> = { project_id };

  if (status) {
    query += ` AND status = {status:String}`;
    params.status = status;
  }

  if (start_date) {
    query += ` AND timestamp >= {start_date:DateTime64(3)}`;
    params.start_date = start_date;
  }

  if (end_date) {
    query += ` AND timestamp <= {end_date:DateTime64(3)}`;
    params.end_date = end_date;
  }

  if (agent_id) {
    query += ` AND agent_id = {agent_id:String}`;
    params.agent_id = agent_id;
  }

  if (search) {
    query += ` AND (name ILIKE {search:String} OR trace_id ILIKE {search:String})`;
    params.search = `%${search}%`;
  }

  query += `
    GROUP BY trace_id
    ORDER BY timestamp DESC
    LIMIT {limit:UInt32}
    OFFSET {offset:UInt32}
  `;
  params.limit = limit;
  params.offset = offset;

  const result = await clickhouse.query(query, params);
  return result.rows as TraceSummary[];
}

/**
 * Request parameters for getting a single trace
 */
export interface GetTraceRequest {
  project_id: string;
  trace_id: string;
}

/**
 * Full trace detail with span tree
 */
export interface TraceDetail {
  trace: TraceResponse;
  spans: SpanWithChildren[];
  scores: import("../datamodels/scores").ScoreResponse[];
}

/**
 * Get a single trace with all spans and scores
 *
 * @route GET /api/traces/:traceId
 */
export async function getTrace(
  req: GetTraceRequest,
  clickhouse: ClickHouseClient
): Promise<TraceDetail | null> {
  const { project_id, trace_id } = req;

  // Get trace metadata
  const traceQuery = `
    SELECT *
    FROM traces
    WHERE project_id = {project_id:String}
      AND trace_id = {trace_id:String}
    LIMIT 1
  `;
  const traceResult = await clickhouse.query(traceQuery, {
    project_id,
    trace_id,
  });

  if (traceResult.rows.length === 0) {
    return null;
  }

  // Get all spans for this trace
  const spansQuery = `
    SELECT *
    FROM spans
    WHERE project_id = {project_id:String}
      AND trace_id = {trace_id:String}
    ORDER BY timestamp ASC
  `;
  const spansResult = await clickhouse.query(spansQuery, {
    project_id,
    trace_id,
  });

  // Get all scores for this trace
  const scoresQuery = `
    SELECT *
    FROM scores
    WHERE project_id = {project_id:String}
      AND trace_id = {trace_id:String}
    ORDER BY timestamp ASC
  `;
  const scoresResult = await clickhouse.query(scoresQuery, {
    project_id,
    trace_id,
  });

  // Build span tree
  const spans = buildSpanTree(spansResult.rows as import("../datamodels/spans").SpanResponse[]);

  return {
    trace: traceResult.rows[0] as TraceResponse,
    spans,
    scores: scoresResult.rows as import("../datamodels/scores").ScoreResponse[],
  };
}

/**
 * Build a tree structure from flat spans list
 */
function buildSpanTree(spans: import("../datamodels/spans").SpanResponse[]): SpanWithChildren[] {
  const spanMap = new Map<string, SpanWithChildren>();
  const roots: SpanWithChildren[] = [];

  // First pass: create map with empty children arrays
  for (const span of spans) {
    spanMap.set(span.span_id, { ...span, children: [] });
  }

  // Second pass: build tree structure
  for (const span of spans) {
    const node = spanMap.get(span.span_id)!;
    if (span.parent_span_id && spanMap.has(span.parent_span_id)) {
      spanMap.get(span.parent_span_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Get trace count for a project
 *
 * @route GET /api/traces/count
 */
export async function getTraceCount(
  req: { project_id: string; start_date?: string; end_date?: string },
  clickhouse: ClickHouseClient
): Promise<{ count: number }> {
  let query = `
    SELECT uniqExact(trace_id) as count
    FROM spans
    WHERE project_id = {project_id:String}
  `;
  const params: Record<string, unknown> = { project_id: req.project_id };

  if (req.start_date) {
    query += ` AND timestamp >= {start_date:DateTime64(3)}`;
    params.start_date = req.start_date;
  }

  if (req.end_date) {
    query += ` AND timestamp <= {end_date:DateTime64(3)}`;
    params.end_date = req.end_date;
  }

  const result = await clickhouse.query(query, params);
  return { count: (result.rows[0] as { count: number }).count };
}

/**
 * Search traces by content
 *
 * @route GET /api/traces/search
 */
export async function searchTraces(
  req: {
    project_id: string;
    query: string;
    limit?: number;
  },
  clickhouse: ClickHouseClient
): Promise<TraceSummary[]> {
  const { project_id, query, limit = 20 } = req;

  // Search in span inputs, outputs, and names
  const searchQuery = `
    SELECT
      trace_id,
      any(name) as name,
      min(timestamp) as timestamp,
      sum(duration_ms) as duration_ms,
      anyIf(status, status != 'unset') as status,
      sumIf(total_tokens, span_type = 'generation') as total_tokens,
      countIf(span_type = 'tool') as tool_calls,
      countIf(span_type = 'generation') as llm_calls,
      any(agent_id) as agent_id,
      any(agent_version) as agent_version
    FROM spans
    WHERE project_id = {project_id:String}
      AND (
        input ILIKE {query:String}
        OR output ILIKE {query:String}
        OR name ILIKE {query:String}
        OR tool_input ILIKE {query:String}
        OR tool_output ILIKE {query:String}
      )
    GROUP BY trace_id
    ORDER BY timestamp DESC
    LIMIT {limit:UInt32}
  `;

  const result = await clickhouse.query(searchQuery, {
    project_id,
    query: `%${query}%`,
    limit,
  });

  return result.rows as TraceSummary[];
}

// Type for ClickHouse client (would be provided by MooseStack)
interface ClickHouseClient {
  query(
    sql: string,
    params?: Record<string, unknown>
  ): Promise<{ rows: unknown[] }>;
}
