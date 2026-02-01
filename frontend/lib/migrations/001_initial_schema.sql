-- Migration: 001_initial_schema
-- Description: Create base tables for traces, spans, and scores
-- Date: 2025-01-31
--
-- This migration creates the foundational ClickHouse tables for the Neon platform.
-- For fresh installations, run this before other migrations.
-- For existing installations, this can be skipped if tables already exist.

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

    -- Aggregated stats
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

    -- General attributes
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
