/**
 * Trace data model for MooseStack
 *
 * Traces represent the parent container for an agent execution.
 * They are the top-level entity that spans belong to.
 */

import { Key } from "@514labs/moose-lib";

/**
 * Trace status indicating the outcome of the execution
 */
export type TraceStatus = "unset" | "ok" | "error";

/**
 * Trace represents a complete agent execution
 *
 * Traces can come from:
 * 1. External agents via OTel (Mode 1: BYOA)
 * 2. Temporal workflows (Mode 2: Managed)
 */
export interface Trace {
  /** Project identifier for multi-tenant isolation */
  project_id: Key<string>;

  /** Unique trace identifier (UUID or OTel trace ID) */
  trace_id: Key<string>;

  /** Human-readable name for the trace */
  name: string;

  /** Start timestamp of the trace */
  timestamp: Date;

  /** End timestamp (null if still running) */
  end_time: Date | null;

  /** Total duration in milliseconds */
  duration_ms: number;

  /** Overall status of the trace */
  status: TraceStatus;

  /** Arbitrary key-value metadata */
  metadata: Record<string, string>;

  // Agent execution context
  /** Agent definition ID (if managed execution) */
  agent_id: string | null;

  /** Agent version (semantic versioning) */
  agent_version: string | null;

  /** Temporal workflow ID (if managed execution) */
  workflow_id: string | null;

  /** Temporal run ID (if managed execution) */
  workflow_run_id: string | null;

  // Aggregated stats (computed from spans)
  /** Total input tokens across all LLM calls */
  total_input_tokens: number;

  /** Total output tokens across all LLM calls */
  total_output_tokens: number;

  /** Total cost in USD */
  total_cost_usd: number | null;

  /** Number of tool calls in this trace */
  tool_call_count: number;

  /** Number of LLM generation calls */
  llm_call_count: number;
}

/**
 * ClickHouse table definition for traces
 *
 * Uses ReplacingMergeTree for upsert behavior on duplicate trace_ids.
 * Partitioned by month for efficient time-range queries.
 */
export const tracesTableDDL = `
CREATE TABLE IF NOT EXISTS traces (
  project_id String,
  trace_id String,
  name String,
  timestamp DateTime64(3),
  end_time Nullable(DateTime64(3)),
  duration_ms Int64,
  status Enum8('unset' = 0, 'ok' = 1, 'error' = 2),
  metadata Map(String, String),
  agent_id Nullable(String),
  agent_version Nullable(String),
  workflow_id Nullable(String),
  workflow_run_id Nullable(String),
  total_input_tokens Int64 DEFAULT 0,
  total_output_tokens Int64 DEFAULT 0,
  total_cost_usd Nullable(Float64),
  tool_call_count Int32 DEFAULT 0,
  llm_call_count Int32 DEFAULT 0
) ENGINE = ReplacingMergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (project_id, trace_id)
`;

/**
 * Input type for creating/updating traces via the ingest API
 */
export interface TraceInput {
  project_id: string;
  trace_id: string;
  name: string;
  timestamp: string | Date;
  end_time?: string | Date | null;
  duration_ms?: number;
  status?: TraceStatus;
  metadata?: Record<string, string>;
  agent_id?: string;
  agent_version?: string;
  workflow_id?: string;
  workflow_run_id?: string;
}

/**
 * Response type for trace queries
 */
export interface TraceResponse extends Omit<Trace, "timestamp" | "end_time"> {
  timestamp: string;
  end_time: string | null;
}
