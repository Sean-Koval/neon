-- Migration: 002_materialized_views
-- Description: Create materialized views for dashboard aggregations
-- Date: 2025-01-31
-- Task: PERF-002
--
-- These materialized views pre-aggregate data for efficient dashboard queries.
-- They use SummingMergeTree for incremental aggregation.

-- Daily statistics per project (for dashboard overview)
CREATE MATERIALIZED VIEW IF NOT EXISTS neon.daily_stats_mv
ENGINE = SummingMergeTree()
ORDER BY (project_id, date)
AS SELECT
    project_id,
    toDate(timestamp) as date,
    count() as trace_count,
    countIf(status = 'error') as error_count,
    sum(duration_ms) as total_duration_ms,
    sum(total_tokens) as total_tokens,
    sum(total_cost) as total_cost
FROM neon.traces
GROUP BY project_id, date;

-- Model usage statistics (for cost tracking)
CREATE MATERIALIZED VIEW IF NOT EXISTS neon.model_usage_mv
ENGINE = SummingMergeTree()
ORDER BY (project_id, model_name, date)
AS SELECT
    project_id,
    coalesce(model, 'unknown') as model_name,
    toDate(timestamp) as date,
    count() as call_count,
    sum(total_tokens) as total_tokens,
    sum(cost_usd) as total_cost
FROM neon.spans
WHERE span_type = 'generation' AND model IS NOT NULL
GROUP BY project_id, model_name, date;

-- Score trends (for quality monitoring)
CREATE MATERIALIZED VIEW IF NOT EXISTS neon.score_trends_mv
ENGINE = SummingMergeTree()
ORDER BY (project_id, name, date)
AS SELECT
    project_id,
    name,
    toDate(timestamp) as date,
    avg(value) as avg_score,
    count() as score_count
FROM neon.scores
GROUP BY project_id, name, date;
