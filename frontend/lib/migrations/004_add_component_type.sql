-- Migration: 004_add_component_type
-- Description: Add component_type column to spans table for component attribution
-- Date: 2026-02-01
--
-- This migration adds component-level attribution support to spans.
-- Components help identify which part of a compound AI system a span belongs to:
-- - prompt: Prompt construction and formatting
-- - retrieval: RAG/document retrieval operations
-- - tool: Tool selection and execution
-- - reasoning: Chain-of-thought, planning, or reasoning steps
-- - planning: High-level task decomposition and planning
-- - memory: Memory access and management
-- - routing: Agent routing and orchestration
-- - other: Unclassified or custom components

-- Add component_type column to spans table
ALTER TABLE neon.spans
ADD COLUMN IF NOT EXISTS component_type Nullable(Enum8('prompt' = 0, 'retrieval' = 1, 'tool' = 2, 'reasoning' = 3, 'planning' = 4, 'memory' = 5, 'routing' = 6, 'other' = 7));

-- Add skip index for component_type queries
ALTER TABLE neon.spans
ADD INDEX IF NOT EXISTS idx_component_type component_type TYPE set(8) GRANULARITY 8;

-- ============================================================================
-- Component Score Aggregation
-- ============================================================================
-- Aggregates scores by component type for attribution analysis.
-- Links scores to spans via span_id, then groups by the span's component_type.
-- This enables queries like "which component type has the lowest scores?"

CREATE MATERIALIZED VIEW IF NOT EXISTS neon.component_score_stats_mv
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (project_id, component_type, date)
AS SELECT
    s.project_id as project_id,
    sp.component_type as component_type,
    toDate(s.timestamp) as date,
    avgState(s.value) as avg_score_state,
    minState(s.value) as min_score_state,
    maxState(s.value) as max_score_state,
    countState() as score_count_state,
    countIfState(s.value >= 0.7) as passed_count_state,
    countIfState(s.value < 0.7) as failed_count_state
FROM neon.scores s
INNER JOIN neon.spans sp ON s.span_id = sp.span_id AND s.project_id = sp.project_id
WHERE sp.component_type IS NOT NULL
GROUP BY s.project_id, sp.component_type, date;

-- ============================================================================
-- Component Performance Statistics
-- ============================================================================
-- Tracks component-level performance metrics (duration, error rates).
-- Useful for identifying slow or error-prone components.

CREATE MATERIALIZED VIEW IF NOT EXISTS neon.component_performance_mv
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (project_id, component_type, date)
AS SELECT
    project_id,
    component_type,
    toDate(timestamp) as date,
    countState() as span_count_state,
    avgState(duration_ms) as avg_duration_state,
    quantileState(0.95)(duration_ms) as p95_duration_state,
    countIfState(status = 'error') as error_count_state
FROM neon.spans
WHERE component_type IS NOT NULL
GROUP BY project_id, component_type, date;

-- ============================================================================
-- Backfill Commands (run after creating views)
-- ============================================================================

-- Backfill component_score_stats_mv:
-- INSERT INTO neon.component_score_stats_mv
-- SELECT s.project_id, sp.component_type, toDate(s.timestamp) as date,
--        avgState(s.value), minState(s.value), maxState(s.value), countState(),
--        countIfState(s.value >= 0.7), countIfState(s.value < 0.7)
-- FROM neon.scores s
-- INNER JOIN neon.spans sp ON s.span_id = sp.span_id AND s.project_id = sp.project_id
-- WHERE sp.component_type IS NOT NULL
-- GROUP BY s.project_id, sp.component_type, date;

-- Backfill component_performance_mv:
-- INSERT INTO neon.component_performance_mv
-- SELECT project_id, component_type, toDate(timestamp) as date,
--        countState(), avgState(duration_ms), quantileState(0.95)(duration_ms),
--        countIfState(status = 'error')
-- FROM neon.spans
-- WHERE component_type IS NOT NULL
-- GROUP BY project_id, component_type, date;
