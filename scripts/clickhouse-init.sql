-- ClickHouse initialization for Neon platform
-- Trace and span storage for agent observability
--
-- =============================================================================
-- INDEX STRATEGY
-- =============================================================================
-- ClickHouse uses "skip indexes" (data skipping indexes) rather than traditional
-- B-tree indexes. These indexes work by storing aggregated values for blocks of
-- data (granules), allowing ClickHouse to skip entire blocks during queries.
--
-- Index Types:
-- - bloom_filter(fp_rate): For equality checks on high-cardinality string columns.
--   Uses probabilistic membership testing. Lower fp_rate = more accurate but larger.
--   We use 0.01 (1% false positive rate) as a good balance.
--
-- - set(N): For equality checks on low-cardinality columns (enums, status).
--   Stores up to N distinct values per granule. N=8 works well for our enums.
--
-- - minmax: For range queries on ordered columns (timestamp).
--   Stores min/max values per granule. Very compact and effective.
--
-- Granularity:
-- - GRANULARITY 4: For high-selectivity columns (trace_id, span_id)
-- - GRANULARITY 8: For low-cardinality columns (status, type enums)
--
-- Primary Key Ordering:
-- Tables are ordered by (project_id, ...) to ensure project isolation is fast.
-- Secondary ordering by timestamp enables efficient time-range queries.
-- =============================================================================

-- Create database
CREATE DATABASE IF NOT EXISTS neon;

-- =============================================================================
-- TRACES TABLE
-- =============================================================================
-- Parent container for agent executions. Each trace represents a complete
-- agent workflow or request.
--
-- Query patterns:
--   - List traces by project with time range: project_id + timestamp range
--   - Direct trace lookup: trace_id equality
--   - Filter by status: status equality
--   - Filter by agent: agent_id equality
--   - Filter by run: run_id equality (evaluation runs)
--
CREATE TABLE IF NOT EXISTS neon.traces
(
    project_id String,
    trace_id String,
    name String,
    timestamp DateTime64(3),
    end_time Nullable(DateTime64(3)),
    duration_ms UInt64,
    status Enum8('unset' = 0, 'ok' = 1, 'error' = 2),
    metadata Map(String, String),

    -- Agent execution context
    agent_id Nullable(String),
    agent_version Nullable(String),
    workflow_id Nullable(String),
    run_id Nullable(String),

    -- Aggregated stats (updated on trace completion)
    total_tokens UInt64 DEFAULT 0,
    total_cost Decimal(12, 6) DEFAULT 0,
    llm_calls UInt16 DEFAULT 0,
    tool_calls UInt16 DEFAULT 0,

    -- Partitioning key
    _date Date MATERIALIZED toDate(timestamp),

    -- Skip indexes for common query patterns
    INDEX idx_trace_id trace_id TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_run_id run_id TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_agent_id agent_id TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_status status TYPE set(8) GRANULARITY 8,
    INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 4
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(_date)
ORDER BY (project_id, timestamp, trace_id)
TTL _date + INTERVAL 90 DAY;

-- =============================================================================
-- SPANS TABLE
-- =============================================================================
-- Individual operations within a trace. Spans represent LLM calls, tool
-- executions, retrievals, and other discrete operations.
--
-- Query patterns:
--   - Spans for trace: project_id + trace_id (covered by primary key)
--   - Direct span lookup: span_id equality
--   - Parent lookup: parent_span_id equality (hierarchy)
--   - Filter by type: span_type equality
--   - Filter by model: model equality
--   - Filter by tool: tool_name equality
--
CREATE TABLE IF NOT EXISTS neon.spans
(
    project_id String,
    trace_id String,
    span_id String,
    parent_span_id Nullable(String),
    name String,
    kind Enum8('internal' = 0, 'server' = 1, 'client' = 2, 'producer' = 3, 'consumer' = 4),
    span_type Enum8('span' = 0, 'generation' = 1, 'tool' = 2, 'retrieval' = 3, 'event' = 4),
    component_type Nullable(Enum8('prompt' = 0, 'retrieval' = 1, 'tool' = 2, 'reasoning' = 3, 'planning' = 4, 'memory' = 5, 'routing' = 6, 'other' = 7)),
    timestamp DateTime64(3),
    end_time Nullable(DateTime64(3)),
    duration_ms UInt64,
    status Enum8('unset' = 0, 'ok' = 1, 'error' = 2),
    status_message String DEFAULT '',

    -- LLM generation fields
    model Nullable(String),
    model_parameters Map(String, String),
    input String DEFAULT '',
    output String DEFAULT '',
    input_tokens Nullable(UInt32),
    output_tokens Nullable(UInt32),
    total_tokens Nullable(UInt32),
    cost_usd Nullable(Decimal(10, 6)),

    -- Tool call fields
    tool_name Nullable(String),
    tool_input String DEFAULT '',
    tool_output String DEFAULT '',

    -- General attributes (from OTel)
    attributes Map(String, String),

    -- Partitioning key
    _date Date MATERIALIZED toDate(timestamp),

    -- Skip indexes for common query patterns
    INDEX idx_span_id span_id TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_parent_span_id parent_span_id TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_span_type span_type TYPE set(8) GRANULARITY 8,
    INDEX idx_component_type component_type TYPE set(8) GRANULARITY 8,
    INDEX idx_status status TYPE set(8) GRANULARITY 8,
    INDEX idx_model model TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_tool_name tool_name TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 4
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(_date)
ORDER BY (project_id, trace_id, timestamp, span_id)
TTL _date + INTERVAL 90 DAY;

-- =============================================================================
-- SCORES TABLE
-- =============================================================================
-- Evaluation scores attached to traces or spans. Scores can come from
-- automated evaluators, human annotations, or the SDK.
--
-- Query patterns:
--   - Scores for trace: project_id + trace_id (covered by primary key)
--   - Scores for span: span_id equality
--   - Scores by name: name equality
--   - Scores by run: run_id equality (evaluation runs)
--   - Filter by source: source equality
--   - Filter by type: score_type equality
--
CREATE TABLE IF NOT EXISTS neon.scores
(
    project_id String,
    score_id String,
    trace_id String,
    span_id Nullable(String),
    run_id Nullable(String),
    case_id Nullable(String),

    name String,
    value Float64,
    score_type Enum8('numeric' = 0, 'categorical' = 1, 'boolean' = 2),
    string_value Nullable(String),
    comment String DEFAULT '',

    source Enum8('api' = 0, 'sdk' = 1, 'annotation' = 2, 'eval' = 3, 'temporal' = 4),
    config_id Nullable(String),
    author_id Nullable(String),

    timestamp DateTime64(3),

    _date Date MATERIALIZED toDate(timestamp),

    -- Skip indexes for common query patterns
    INDEX idx_span_id span_id TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_run_id run_id TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_name name TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_case_id case_id TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_config_id config_id TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_source source TYPE set(8) GRANULARITY 8,
    INDEX idx_score_type score_type TYPE set(8) GRANULARITY 8,
    INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 4
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(_date)
ORDER BY (project_id, trace_id, timestamp, score_id)
TTL _date + INTERVAL 90 DAY;

-- =============================================================================
-- PROMPTS TABLE
-- =============================================================================
-- Versioned prompt templates for prompt management.
-- Supports text and chat prompt types with variable interpolation.
--
-- Query patterns:
--   - Get prompt by ID: project_id + prompt_id
--   - Get prompt by name: project_id + name + version
--   - List production prompts: project_id + is_production
--   - Filter by tags: tags array contains
--
CREATE TABLE IF NOT EXISTS neon.prompts
(
    project_id String,
    prompt_id String,
    name String,
    description String DEFAULT '',
    type Enum8('text' = 0, 'chat' = 1),
    template String DEFAULT '',
    messages String DEFAULT '[]',      -- JSON array for chat prompts
    variables String DEFAULT '{}',     -- JSON object of variable definitions
    config String DEFAULT '{}',        -- JSON object for model config
    tags Array(String) DEFAULT [],
    is_production UInt8 DEFAULT 0,
    version UInt32 DEFAULT 1,
    commit_message String DEFAULT '',
    created_by String DEFAULT '',
    created_at DateTime64(3) DEFAULT now64(3),
    updated_at DateTime64(3) DEFAULT now64(3),
    parent_version_id String DEFAULT '',
    variant String DEFAULT 'default',

    _date Date MATERIALIZED toDate(created_at),

    INDEX idx_name name TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_is_production is_production TYPE set(2) GRANULARITY 8,
    INDEX idx_tags tags TYPE bloom_filter(0.01) GRANULARITY 4
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(_date)
ORDER BY (project_id, name, version)
TTL _date + INTERVAL 365 DAY;

-- =============================================================================
-- MATERIALIZED VIEWS
-- =============================================================================
-- Materialized views auto-update on INSERT to base tables.
-- We use two engine types:
-- - SummingMergeTree: For simple additive aggregations (counts, sums)
-- - AggregatingMergeTree: For complex aggregations (avg, percentiles, min/max)
--
-- IMPORTANT: When querying AggregatingMergeTree views, use the *Merge() functions:
--   avgMerge(avg_state), minMerge(min_state), quantileMerge(0.5)(p50_state), etc.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Basic Analytics Views
-- -----------------------------------------------------------------------------

-- Daily statistics per project (for basic dashboard overview)
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

-- -----------------------------------------------------------------------------
-- Dashboard Views (required by /api/dashboard/* endpoints)
-- -----------------------------------------------------------------------------

-- Enhanced Score Trends with min/max (for score trend charts)
-- Used by: /api/dashboard/score-trends
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

-- Duration Statistics with percentiles (for performance monitoring)
-- Used by: /api/dashboard/duration-stats
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

-- Run-level Score Aggregations (for pass/fail calculations)
-- Used by: backfill operations
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

-- Daily Run Summary (for dashboard summary cards)
-- Used by: /api/dashboard/summary, useDashboard hook
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

-- Scorer Performance Stats (for scorer analysis)
-- Used by: /api/dashboard endpoints, analysis page
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
