-- ClickHouse initialization for Neon platform
-- Trace and span storage for agent observability

-- Create database
CREATE DATABASE IF NOT EXISTS neon;

-- Traces table (parent container for agent executions)
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
    _date Date MATERIALIZED toDate(timestamp)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(_date)
ORDER BY (project_id, timestamp, trace_id)
TTL _date + INTERVAL 90 DAY;

-- Spans table (individual operations within a trace)
CREATE TABLE IF NOT EXISTS neon.spans
(
    project_id String,
    trace_id String,
    span_id String,
    parent_span_id Nullable(String),
    name String,
    kind Enum8('internal' = 0, 'server' = 1, 'client' = 2, 'producer' = 3, 'consumer' = 4),
    span_type Enum8('span' = 0, 'generation' = 1, 'tool' = 2, 'retrieval' = 3, 'event' = 4),
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
    _date Date MATERIALIZED toDate(timestamp)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(_date)
ORDER BY (project_id, trace_id, timestamp, span_id)
TTL _date + INTERVAL 90 DAY;

-- Scores table
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

    _date Date MATERIALIZED toDate(timestamp)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(_date)
ORDER BY (project_id, trace_id, timestamp, score_id)
TTL _date + INTERVAL 90 DAY;

-- Materialized view: Daily statistics per project
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

-- Materialized view: Model usage statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS neon.model_usage_mv
ENGINE = SummingMergeTree()
ORDER BY (project_id, model, date)
AS SELECT
    project_id,
    model,
    toDate(timestamp) as date,
    count() as call_count,
    sum(total_tokens) as total_tokens,
    sum(cost_usd) as total_cost
FROM neon.spans
WHERE span_type = 'generation' AND model IS NOT NULL
GROUP BY project_id, model, date;

-- Materialized view: Score trends
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
