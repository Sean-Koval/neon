/**
 * Analytics materialized views for MooseStack
 *
 * These views pre-aggregate data for efficient dashboard queries.
 * ClickHouse materialized views update automatically as data is inserted.
 */

/**
 * Daily statistics per project
 */
export interface DailyStats {
  project_id: string;
  date: Date;
  trace_count: number;
  error_count: number;
  total_duration_ms: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  tool_call_count: number;
  llm_call_count: number;
}

/**
 * Materialized view for daily statistics
 */
export const dailyStatsMVDDL = `
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_stats_mv
TO daily_stats
AS SELECT
  project_id,
  toDate(timestamp) as date,
  uniqExact(trace_id) as trace_count,
  countIf(status = 'error') as error_count,
  sum(duration_ms) as total_duration_ms,
  sumIf(input_tokens, span_type = 'generation') as total_input_tokens,
  sumIf(output_tokens, span_type = 'generation') as total_output_tokens,
  sumIf(total_tokens, span_type = 'generation') as total_tokens,
  sumIf(cost_usd, span_type = 'generation') as total_cost_usd,
  countIf(span_type = 'tool') as tool_call_count,
  countIf(span_type = 'generation') as llm_call_count
FROM spans
GROUP BY project_id, date
`;

/**
 * Target table for daily stats materialized view
 */
export const dailyStatsTableDDL = `
CREATE TABLE IF NOT EXISTS daily_stats (
  project_id String,
  date Date,
  trace_count UInt64,
  error_count UInt64,
  total_duration_ms Int64,
  total_input_tokens Int64,
  total_output_tokens Int64,
  total_tokens Int64,
  total_cost_usd Float64,
  tool_call_count UInt64,
  llm_call_count UInt64
) ENGINE = SummingMergeTree()
ORDER BY (project_id, date)
`;

/**
 * Score trends by scorer name
 */
export interface ScoreTrend {
  project_id: string;
  name: string;
  date: Date;
  avg_score: number;
  min_score: number;
  max_score: number;
  count: number;
}

/**
 * Materialized view for score trends
 */
export const scoreTrendsMVDDL = `
CREATE MATERIALIZED VIEW IF NOT EXISTS score_trends_mv
TO score_trends
AS SELECT
  project_id,
  name,
  toDate(timestamp) as date,
  avg(value) as avg_score,
  min(value) as min_score,
  max(value) as max_score,
  count() as count
FROM scores
GROUP BY project_id, name, date
`;

/**
 * Target table for score trends materialized view
 */
export const scoreTrendsTableDDL = `
CREATE TABLE IF NOT EXISTS score_trends (
  project_id String,
  name String,
  date Date,
  avg_score Float64,
  min_score Float64,
  max_score Float64,
  count UInt64
) ENGINE = SummingMergeTree()
ORDER BY (project_id, name, date)
`;

/**
 * Model usage statistics
 */
export interface ModelUsage {
  project_id: string;
  model: string;
  date: Date;
  call_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  avg_latency_ms: number;
  error_count: number;
}

/**
 * Materialized view for model usage
 */
export const modelUsageMVDDL = `
CREATE MATERIALIZED VIEW IF NOT EXISTS model_usage_mv
TO model_usage
AS SELECT
  project_id,
  model,
  toDate(timestamp) as date,
  count() as call_count,
  sum(input_tokens) as total_input_tokens,
  sum(output_tokens) as total_output_tokens,
  sum(cost_usd) as total_cost_usd,
  avg(duration_ms) as avg_latency_ms,
  countIf(status = 'error') as error_count
FROM spans
WHERE span_type = 'generation' AND model IS NOT NULL
GROUP BY project_id, model, date
`;

/**
 * Target table for model usage materialized view
 */
export const modelUsageTableDDL = `
CREATE TABLE IF NOT EXISTS model_usage (
  project_id String,
  model String,
  date Date,
  call_count UInt64,
  total_input_tokens Int64,
  total_output_tokens Int64,
  total_cost_usd Float64,
  avg_latency_ms Float64,
  error_count UInt64
) ENGINE = SummingMergeTree()
ORDER BY (project_id, model, date)
`;

/**
 * Tool usage statistics
 */
export interface ToolUsage {
  project_id: string;
  tool_name: string;
  date: Date;
  call_count: number;
  success_count: number;
  error_count: number;
  avg_latency_ms: number;
}

/**
 * Materialized view for tool usage
 */
export const toolUsageMVDDL = `
CREATE MATERIALIZED VIEW IF NOT EXISTS tool_usage_mv
TO tool_usage
AS SELECT
  project_id,
  tool_name,
  toDate(timestamp) as date,
  count() as call_count,
  countIf(status = 'ok') as success_count,
  countIf(status = 'error') as error_count,
  avg(duration_ms) as avg_latency_ms
FROM spans
WHERE span_type = 'tool' AND tool_name IS NOT NULL
GROUP BY project_id, tool_name, date
`;

/**
 * Target table for tool usage materialized view
 */
export const toolUsageTableDDL = `
CREATE TABLE IF NOT EXISTS tool_usage (
  project_id String,
  tool_name String,
  date Date,
  call_count UInt64,
  success_count UInt64,
  error_count UInt64,
  avg_latency_ms Float64
) ENGINE = SummingMergeTree()
ORDER BY (project_id, tool_name, date)
`;

/**
 * Response types for analytics queries
 */
export interface DailyStatsResponse extends Omit<DailyStats, "date"> {
  date: string;
}

export interface ScoreTrendResponse extends Omit<ScoreTrend, "date"> {
  date: string;
}

export interface ModelUsageResponse extends Omit<ModelUsage, "date"> {
  date: string;
}

export interface ToolUsageResponse extends Omit<ToolUsage, "date"> {
  date: string;
}
