/**
 * Analytics Query APIs
 *
 * APIs for querying pre-aggregated analytics data from materialized views.
 */

import type {
  DailyStatsResponse,
  ScoreTrendResponse,
  ModelUsageResponse,
  ToolUsageResponse,
} from "../datamodels/analytics";

/**
 * Time range for analytics queries
 */
export interface TimeRange {
  start_date: string;
  end_date: string;
}

/**
 * Get daily statistics for a project
 *
 * @route GET /api/analytics/daily-stats
 */
export async function getDailyStats(
  req: { project_id: string } & TimeRange,
  clickhouse: ClickHouseClient
): Promise<DailyStatsResponse[]> {
  const query = `
    SELECT
      project_id,
      date,
      sum(trace_count) as trace_count,
      sum(error_count) as error_count,
      sum(total_duration_ms) as total_duration_ms,
      sum(total_input_tokens) as total_input_tokens,
      sum(total_output_tokens) as total_output_tokens,
      sum(total_tokens) as total_tokens,
      sum(total_cost_usd) as total_cost_usd,
      sum(tool_call_count) as tool_call_count,
      sum(llm_call_count) as llm_call_count
    FROM daily_stats
    WHERE project_id = {project_id:String}
      AND date >= {start_date:Date}
      AND date <= {end_date:Date}
    GROUP BY project_id, date
    ORDER BY date ASC
  `;

  const result = await clickhouse.query(query, req);
  return result.rows as DailyStatsResponse[];
}

/**
 * Get score trends for a project
 *
 * @route GET /api/analytics/score-trends
 */
export async function getScoreTrends(
  req: { project_id: string; name?: string } & TimeRange,
  clickhouse: ClickHouseClient
): Promise<ScoreTrendResponse[]> {
  let query = `
    SELECT
      project_id,
      name,
      date,
      avg(avg_score) as avg_score,
      min(min_score) as min_score,
      max(max_score) as max_score,
      sum(count) as count
    FROM score_trends
    WHERE project_id = {project_id:String}
      AND date >= {start_date:Date}
      AND date <= {end_date:Date}
  `;
  const params: Record<string, unknown> = { ...req };

  if (req.name) {
    query += ` AND name = {name:String}`;
  }

  query += `
    GROUP BY project_id, name, date
    ORDER BY date ASC, name ASC
  `;

  const result = await clickhouse.query(query, params);
  return result.rows as ScoreTrendResponse[];
}

/**
 * Get model usage statistics
 *
 * @route GET /api/analytics/model-usage
 */
export async function getModelUsage(
  req: { project_id: string; model?: string } & TimeRange,
  clickhouse: ClickHouseClient
): Promise<ModelUsageResponse[]> {
  let query = `
    SELECT
      project_id,
      model,
      date,
      sum(call_count) as call_count,
      sum(total_input_tokens) as total_input_tokens,
      sum(total_output_tokens) as total_output_tokens,
      sum(total_cost_usd) as total_cost_usd,
      avg(avg_latency_ms) as avg_latency_ms,
      sum(error_count) as error_count
    FROM model_usage
    WHERE project_id = {project_id:String}
      AND date >= {start_date:Date}
      AND date <= {end_date:Date}
  `;
  const params: Record<string, unknown> = { ...req };

  if (req.model) {
    query += ` AND model = {model:String}`;
  }

  query += `
    GROUP BY project_id, model, date
    ORDER BY date ASC, model ASC
  `;

  const result = await clickhouse.query(query, params);
  return result.rows as ModelUsageResponse[];
}

/**
 * Get tool usage statistics
 *
 * @route GET /api/analytics/tool-usage
 */
export async function getToolUsage(
  req: { project_id: string; tool_name?: string } & TimeRange,
  clickhouse: ClickHouseClient
): Promise<ToolUsageResponse[]> {
  let query = `
    SELECT
      project_id,
      tool_name,
      date,
      sum(call_count) as call_count,
      sum(success_count) as success_count,
      sum(error_count) as error_count,
      avg(avg_latency_ms) as avg_latency_ms
    FROM tool_usage
    WHERE project_id = {project_id:String}
      AND date >= {start_date:Date}
      AND date <= {end_date:Date}
  `;
  const params: Record<string, unknown> = { ...req };

  if (req.tool_name) {
    query += ` AND tool_name = {tool_name:String}`;
  }

  query += `
    GROUP BY project_id, tool_name, date
    ORDER BY date ASC, tool_name ASC
  `;

  const result = await clickhouse.query(query, params);
  return result.rows as ToolUsageResponse[];
}

/**
 * Get summary statistics for the dashboard
 *
 * @route GET /api/analytics/summary
 */
export async function getDashboardSummary(
  req: { project_id: string } & TimeRange,
  clickhouse: ClickHouseClient
): Promise<DashboardSummary> {
  const [dailyStats, scoreStats, modelStats] = await Promise.all([
    // Aggregate daily stats
    clickhouse.query(
      `
      SELECT
        sum(trace_count) as total_traces,
        sum(error_count) as total_errors,
        sum(total_tokens) as total_tokens,
        sum(total_cost_usd) as total_cost
      FROM daily_stats
      WHERE project_id = {project_id:String}
        AND date >= {start_date:Date}
        AND date <= {end_date:Date}
    `,
      req
    ),

    // Aggregate score stats
    clickhouse.query(
      `
      SELECT
        count() as total_scores,
        avg(avg_score) as overall_avg_score
      FROM score_trends
      WHERE project_id = {project_id:String}
        AND date >= {start_date:Date}
        AND date <= {end_date:Date}
    `,
      req
    ),

    // Top models by usage
    clickhouse.query(
      `
      SELECT
        model,
        sum(call_count) as calls,
        sum(total_cost_usd) as cost
      FROM model_usage
      WHERE project_id = {project_id:String}
        AND date >= {start_date:Date}
        AND date <= {end_date:Date}
      GROUP BY model
      ORDER BY calls DESC
      LIMIT 5
    `,
      req
    ),
  ]);

  const daily = dailyStats.rows[0] as {
    total_traces: number;
    total_errors: number;
    total_tokens: number;
    total_cost: number;
  };

  const scores = scoreStats.rows[0] as {
    total_scores: number;
    overall_avg_score: number;
  };

  return {
    total_traces: daily?.total_traces ?? 0,
    total_errors: daily?.total_errors ?? 0,
    error_rate: daily?.total_traces
      ? (daily.total_errors / daily.total_traces) * 100
      : 0,
    total_tokens: daily?.total_tokens ?? 0,
    total_cost_usd: daily?.total_cost ?? 0,
    total_scores: scores?.total_scores ?? 0,
    avg_score: scores?.overall_avg_score ?? 0,
    top_models: modelStats.rows as Array<{
      model: string;
      calls: number;
      cost: number;
    }>,
  };
}

/**
 * Dashboard summary response
 */
export interface DashboardSummary {
  total_traces: number;
  total_errors: number;
  error_rate: number;
  total_tokens: number;
  total_cost_usd: number;
  total_scores: number;
  avg_score: number;
  top_models: Array<{
    model: string;
    calls: number;
    cost: number;
  }>;
}

/**
 * Get cost breakdown by model
 *
 * @route GET /api/analytics/cost-breakdown
 */
export async function getCostBreakdown(
  req: { project_id: string } & TimeRange,
  clickhouse: ClickHouseClient
): Promise<CostBreakdown[]> {
  const query = `
    SELECT
      model,
      sum(total_input_tokens) as input_tokens,
      sum(total_output_tokens) as output_tokens,
      sum(total_cost_usd) as cost,
      sum(call_count) as calls
    FROM model_usage
    WHERE project_id = {project_id:String}
      AND date >= {start_date:Date}
      AND date <= {end_date:Date}
    GROUP BY model
    ORDER BY cost DESC
  `;

  const result = await clickhouse.query(query, req);
  return result.rows as CostBreakdown[];
}

/**
 * Cost breakdown by model
 */
export interface CostBreakdown {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost: number;
  calls: number;
}

/**
 * Get latency percentiles for performance analysis
 *
 * @route GET /api/analytics/latency
 */
export async function getLatencyPercentiles(
  req: { project_id: string; span_type?: string } & TimeRange,
  clickhouse: ClickHouseClient
): Promise<LatencyPercentiles> {
  let query = `
    SELECT
      quantile(0.5)(duration_ms) as p50,
      quantile(0.90)(duration_ms) as p90,
      quantile(0.95)(duration_ms) as p95,
      quantile(0.99)(duration_ms) as p99,
      avg(duration_ms) as avg,
      max(duration_ms) as max
    FROM spans
    WHERE project_id = {project_id:String}
      AND timestamp >= {start_date:DateTime64(3)}
      AND timestamp <= {end_date:DateTime64(3)}
  `;
  const params: Record<string, unknown> = { ...req };

  if (req.span_type) {
    query += ` AND span_type = {span_type:String}`;
  }

  const result = await clickhouse.query(query, params);
  return result.rows[0] as LatencyPercentiles;
}

/**
 * Latency percentiles response
 */
export interface LatencyPercentiles {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  avg: number;
  max: number;
}

// Type for ClickHouse client (would be provided by MooseStack)
interface ClickHouseClient {
  query(
    sql: string,
    params?: Record<string, unknown>
  ): Promise<{ rows: unknown[] }>;
}
