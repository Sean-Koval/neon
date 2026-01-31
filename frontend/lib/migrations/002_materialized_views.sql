-- Migration 002: Dashboard Materialized Views
--
-- Creates materialized views optimized for dashboard queries:
-- 1. Enhanced score trends with min/max values
-- 2. Duration statistics with percentiles
-- 3. Run-level aggregations for pass/fail tracking
--
-- These views auto-update on INSERT to base tables.
-- Use SummingMergeTree for simple counts, AggregatingMergeTree for complex aggregates.

-- ============================================================================
-- Enhanced Score Trends (with min/max)
-- ============================================================================
-- The existing score_trends_mv only has avg. This view adds min/max for trend analysis.
-- Uses AggregatingMergeTree to support min/max aggregation functions.

CREATE MATERIALIZED VIEW IF NOT EXISTS neon.score_trends_full_mv
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (project_id, name, date)
AS SELECT
    project_id,
    name,
    toDate(timestamp) as date,
    avgState(value) as avg_score_state,
    minState(value) as min_score_state,
    maxState(value) as max_score_state,
    countState() as score_count_state
FROM neon.scores
GROUP BY project_id, name, date;

-- ============================================================================
-- Duration Statistics (percentiles)
-- ============================================================================
-- Provides p50, p95, p99 percentiles for trace durations per day.
-- Essential for performance monitoring and SLA tracking.

CREATE MATERIALIZED VIEW IF NOT EXISTS neon.duration_stats_mv
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (project_id, date)
AS SELECT
    project_id,
    toDate(timestamp) as date,
    avgState(duration_ms) as avg_duration_state,
    quantileState(0.5)(duration_ms) as p50_state,
    quantileState(0.95)(duration_ms) as p95_state,
    quantileState(0.99)(duration_ms) as p99_state,
    minState(duration_ms) as min_duration_state,
    maxState(duration_ms) as max_duration_state,
    countState() as trace_count_state
FROM neon.traces
GROUP BY project_id, date;

-- ============================================================================
-- Run-level Score Aggregations
-- ============================================================================
-- Aggregates scores by run_id for dashboard pass/fail calculations.
-- A run "passes" if its average score >= threshold (typically 0.7).

CREATE MATERIALIZED VIEW IF NOT EXISTS neon.run_scores_mv
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (project_id, run_id, date)
AS SELECT
    project_id,
    run_id,
    toDate(timestamp) as date,
    avgState(value) as avg_score_state,
    minState(value) as min_score_state,
    countState() as score_count_state,
    countIfState(value >= 0.7) as passed_scores_state,
    countIfState(value < 0.7) as failed_scores_state
FROM neon.scores
WHERE run_id IS NOT NULL
GROUP BY project_id, run_id, date;

-- ============================================================================
-- Daily Run Summary (for dashboard cards)
-- ============================================================================
-- Pre-aggregates daily run counts with pass/fail status.
-- Uses status field from traces (ok = passed, error = failed).

CREATE MATERIALIZED VIEW IF NOT EXISTS neon.daily_run_summary_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (project_id, date)
AS SELECT
    project_id,
    toDate(timestamp) as date,
    count() as total_runs,
    countIf(status = 'ok') as passed_runs,
    countIf(status = 'error') as failed_runs,
    sum(duration_ms) as total_duration_ms,
    sum(total_tokens) as total_tokens,
    sum(total_cost) as total_cost
FROM neon.traces
WHERE run_id IS NOT NULL
GROUP BY project_id, date;

-- ============================================================================
-- Scorer Performance Stats
-- ============================================================================
-- Tracks scorer-level performance metrics for analysis.

CREATE MATERIALIZED VIEW IF NOT EXISTS neon.scorer_stats_mv
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (project_id, name, date)
AS SELECT
    project_id,
    name,
    source,
    toDate(timestamp) as date,
    avgState(value) as avg_score_state,
    minState(value) as min_score_state,
    maxState(value) as max_score_state,
    countState() as score_count_state,
    countIfState(value >= 0.7) as passed_count_state,
    countIfState(value < 0.7) as failed_count_state
FROM neon.scores
GROUP BY project_id, name, source, date;

-- ============================================================================
-- Backfill Commands (run after creating views)
-- ============================================================================
-- These INSERT SELECT statements populate views with existing data.
-- Run these manually after creating the views.

-- Backfill score_trends_full_mv:
-- INSERT INTO neon.score_trends_full_mv
-- SELECT project_id, name, toDate(timestamp) as date,
--        avgState(value), minState(value), maxState(value), countState()
-- FROM neon.scores
-- GROUP BY project_id, name, date;

-- Backfill duration_stats_mv:
-- INSERT INTO neon.duration_stats_mv
-- SELECT project_id, toDate(timestamp) as date,
--        avgState(duration_ms), quantileState(0.5)(duration_ms),
--        quantileState(0.95)(duration_ms), quantileState(0.99)(duration_ms),
--        minState(duration_ms), maxState(duration_ms), countState()
-- FROM neon.traces
-- GROUP BY project_id, date;

-- Backfill run_scores_mv:
-- INSERT INTO neon.run_scores_mv
-- SELECT project_id, run_id, toDate(timestamp) as date,
--        avgState(value), minState(value), countState(),
--        countIfState(value >= 0.7), countIfState(value < 0.7)
-- FROM neon.scores
-- WHERE run_id IS NOT NULL
-- GROUP BY project_id, run_id, date;

-- Backfill daily_run_summary_mv:
-- INSERT INTO neon.daily_run_summary_mv
-- SELECT project_id, toDate(timestamp) as date,
--        count(), countIf(status = 'ok'), countIf(status = 'error'),
--        sum(duration_ms), sum(total_tokens), sum(total_cost)
-- FROM neon.traces
-- WHERE run_id IS NOT NULL
-- GROUP BY project_id, date;

-- Backfill scorer_stats_mv:
-- INSERT INTO neon.scorer_stats_mv
-- SELECT project_id, name, source, toDate(timestamp) as date,
--        avgState(value), minState(value), maxState(value), countState(),
--        countIfState(value >= 0.7), countIfState(value < 0.7)
-- FROM neon.scores
-- GROUP BY project_id, name, source, date;
