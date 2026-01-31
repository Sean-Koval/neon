-- Migration: 003_add_indexes
-- Description: Add skip indexes to improve query performance on traces, spans, and scores tables
-- Date: 2025-01-31
--
-- ClickHouse Index Strategy:
-- =========================
-- ClickHouse uses "skip indexes" (data skipping indexes) rather than traditional B-tree indexes.
-- These indexes work by storing aggregated values for blocks of data (granules), allowing
-- ClickHouse to skip entire blocks that don't match the query conditions.
--
-- Index Types Used:
-- - bloom_filter: For equality checks on high-cardinality string columns (trace_id, span_id, etc.)
--   Bloom filters provide probabilistic membership testing with configurable false positive rate.
--   Granularity of 4 balances index size vs skip effectiveness.
--
-- - set(N): For equality checks on low-cardinality columns (status, span_type, source)
--   Stores up to N distinct values per granule. Good for enums.
--   Granularity of 8 since these are often filtered alongside high-cardinality columns.
--
-- - minmax: For range queries on ordered columns (timestamp)
--   Stores min/max values per granule. Very compact and effective for time-range queries.
--   Using larger granularity (4) as timestamp is already in the primary key.
--

-- =============================================================================
-- TRACES TABLE INDEXES
-- =============================================================================
-- Query patterns:
--   - Direct trace lookup: WHERE project_id = X AND trace_id = Y
--   - Status filtering: WHERE project_id = X AND status = Y
--   - Agent filtering: WHERE project_id = X AND agent_id = Y
--   - Run filtering: WHERE project_id = X AND run_id = Y

-- Bloom filter for direct trace_id lookups (bypasses timestamp ordering)
ALTER TABLE neon.traces
    ADD INDEX idx_trace_id trace_id TYPE bloom_filter(0.01) GRANULARITY 4;

-- Bloom filter for run_id filtering (evaluation runs)
ALTER TABLE neon.traces
    ADD INDEX idx_run_id run_id TYPE bloom_filter(0.01) GRANULARITY 4;

-- Bloom filter for agent_id filtering
ALTER TABLE neon.traces
    ADD INDEX idx_agent_id agent_id TYPE bloom_filter(0.01) GRANULARITY 4;

-- Set index for status filtering (3 possible values: unset, ok, error)
ALTER TABLE neon.traces
    ADD INDEX idx_status status TYPE set(8) GRANULARITY 8;

-- Minmax for timestamp range queries (supplements primary key ordering)
ALTER TABLE neon.traces
    ADD INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 4;

-- =============================================================================
-- SPANS TABLE INDEXES
-- =============================================================================
-- Query patterns:
--   - Spans for trace: WHERE project_id = X AND trace_id = Y (covered by primary key)
--   - Direct span lookup: WHERE span_id = Y
--   - Parent span lookup: WHERE parent_span_id = Y
--   - Span type filtering: WHERE span_type = 'generation'
--   - Model filtering: WHERE model = 'gpt-4'
--   - Tool filtering: WHERE tool_name = 'search'

-- Bloom filter for direct span_id lookups
ALTER TABLE neon.spans
    ADD INDEX idx_span_id span_id TYPE bloom_filter(0.01) GRANULARITY 4;

-- Bloom filter for parent_span_id (span hierarchy queries)
ALTER TABLE neon.spans
    ADD INDEX idx_parent_span_id parent_span_id TYPE bloom_filter(0.01) GRANULARITY 4;

-- Set index for span_type filtering (5 values: span, generation, tool, retrieval, event)
ALTER TABLE neon.spans
    ADD INDEX idx_span_type span_type TYPE set(8) GRANULARITY 8;

-- Set index for status filtering
ALTER TABLE neon.spans
    ADD INDEX idx_status status TYPE set(8) GRANULARITY 8;

-- Bloom filter for model filtering (LLM model names)
ALTER TABLE neon.spans
    ADD INDEX idx_model model TYPE bloom_filter(0.01) GRANULARITY 4;

-- Bloom filter for tool_name filtering
ALTER TABLE neon.spans
    ADD INDEX idx_tool_name tool_name TYPE bloom_filter(0.01) GRANULARITY 4;

-- Minmax for timestamp range queries
ALTER TABLE neon.spans
    ADD INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 4;

-- =============================================================================
-- SCORES TABLE INDEXES
-- =============================================================================
-- Query patterns:
--   - Scores for trace: WHERE project_id = X AND trace_id = Y (covered by primary key)
--   - Scores for span: WHERE span_id = Y
--   - Scores by name: WHERE name = 'accuracy'
--   - Scores by run: WHERE run_id = Y
--   - Source filtering: WHERE source = 'eval'
--   - Score type filtering: WHERE score_type = 'numeric'

-- Bloom filter for span_id lookups
ALTER TABLE neon.scores
    ADD INDEX idx_span_id span_id TYPE bloom_filter(0.01) GRANULARITY 4;

-- Bloom filter for run_id filtering (evaluation runs)
ALTER TABLE neon.scores
    ADD INDEX idx_run_id run_id TYPE bloom_filter(0.01) GRANULARITY 4;

-- Bloom filter for score name filtering
ALTER TABLE neon.scores
    ADD INDEX idx_name name TYPE bloom_filter(0.01) GRANULARITY 4;

-- Bloom filter for case_id filtering (test cases)
ALTER TABLE neon.scores
    ADD INDEX idx_case_id case_id TYPE bloom_filter(0.01) GRANULARITY 4;

-- Bloom filter for config_id filtering
ALTER TABLE neon.scores
    ADD INDEX idx_config_id config_id TYPE bloom_filter(0.01) GRANULARITY 4;

-- Set index for source filtering (5 values: api, sdk, annotation, eval, temporal)
ALTER TABLE neon.scores
    ADD INDEX idx_source source TYPE set(8) GRANULARITY 8;

-- Set index for score_type filtering (3 values: numeric, categorical, boolean)
ALTER TABLE neon.scores
    ADD INDEX idx_score_type score_type TYPE set(8) GRANULARITY 8;

-- Minmax for timestamp range queries
ALTER TABLE neon.scores
    ADD INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 4;

-- =============================================================================
-- MATERIALIZE INDEXES
-- =============================================================================
-- For existing data, indexes need to be materialized.
-- This should be done in a maintenance window for large tables.

ALTER TABLE neon.traces MATERIALIZE INDEX idx_trace_id;
ALTER TABLE neon.traces MATERIALIZE INDEX idx_run_id;
ALTER TABLE neon.traces MATERIALIZE INDEX idx_agent_id;
ALTER TABLE neon.traces MATERIALIZE INDEX idx_status;
ALTER TABLE neon.traces MATERIALIZE INDEX idx_timestamp;

ALTER TABLE neon.spans MATERIALIZE INDEX idx_span_id;
ALTER TABLE neon.spans MATERIALIZE INDEX idx_parent_span_id;
ALTER TABLE neon.spans MATERIALIZE INDEX idx_span_type;
ALTER TABLE neon.spans MATERIALIZE INDEX idx_status;
ALTER TABLE neon.spans MATERIALIZE INDEX idx_model;
ALTER TABLE neon.spans MATERIALIZE INDEX idx_tool_name;
ALTER TABLE neon.spans MATERIALIZE INDEX idx_timestamp;

ALTER TABLE neon.scores MATERIALIZE INDEX idx_span_id;
ALTER TABLE neon.scores MATERIALIZE INDEX idx_run_id;
ALTER TABLE neon.scores MATERIALIZE INDEX idx_name;
ALTER TABLE neon.scores MATERIALIZE INDEX idx_case_id;
ALTER TABLE neon.scores MATERIALIZE INDEX idx_config_id;
ALTER TABLE neon.scores MATERIALIZE INDEX idx_source;
ALTER TABLE neon.scores MATERIALIZE INDEX idx_score_type;
ALTER TABLE neon.scores MATERIALIZE INDEX idx_timestamp;
