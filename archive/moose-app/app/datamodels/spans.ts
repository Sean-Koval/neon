/**
 * Span data model for MooseStack
 *
 * Spans represent individual operations within a trace.
 * They follow OTel semantic conventions with extensions for AI/LLM operations.
 */

import { Key } from "@514labs/moose-lib";

/**
 * Span kind following OTel specification
 */
export type SpanKind =
  | "internal"
  | "server"
  | "client"
  | "producer"
  | "consumer";

/**
 * Extended span type for AI agent operations
 */
export type SpanType =
  | "span" // Generic span
  | "generation" // LLM generation call
  | "tool" // Tool/function call
  | "retrieval" // RAG retrieval operation
  | "event"; // Discrete event (no duration)

/**
 * Span status following OTel specification
 */
export type SpanStatus = "unset" | "ok" | "error";

/**
 * Span represents an individual operation within a trace
 *
 * Spans form a tree structure via parent_span_id, allowing
 * visualization of the full execution flow.
 */
export interface Span {
  /** Project identifier for multi-tenant isolation */
  project_id: Key<string>;

  /** Parent trace identifier */
  trace_id: string;

  /** Unique span identifier */
  span_id: Key<string>;

  /** Parent span ID (null for root spans) */
  parent_span_id: string | null;

  /** Human-readable operation name */
  name: string;

  /** OTel span kind */
  kind: SpanKind;

  /** Extended type for AI operations */
  span_type: SpanType;

  /** Start timestamp */
  timestamp: Date;

  /** End timestamp (null if still running) */
  end_time: Date | null;

  /** Duration in milliseconds */
  duration_ms: number;

  /** Status of the operation */
  status: SpanStatus;

  /** Status message (typically error details) */
  status_message: string;

  // LLM Generation fields (populated when span_type = 'generation')
  /** Model identifier (e.g., "claude-3-5-sonnet") */
  model: string | null;

  /** Model parameters (temperature, max_tokens, etc.) */
  model_parameters: Record<string, string>;

  /** Input to the LLM (messages, prompt) */
  input: string;

  /** Output from the LLM */
  output: string;

  /** Input token count */
  input_tokens: number | null;

  /** Output token count */
  output_tokens: number | null;

  /** Total token count */
  total_tokens: number | null;

  /** Estimated cost in USD */
  cost_usd: number | null;

  // Tool call fields (populated when span_type = 'tool')
  /** Tool/function name */
  tool_name: string | null;

  /** Tool input (JSON stringified) */
  tool_input: string;

  /** Tool output (JSON stringified) */
  tool_output: string;

  // General attributes
  /** Arbitrary key-value attributes (OTel compatible) */
  attributes: Record<string, string>;
}

/**
 * ClickHouse table definition for spans
 *
 * Uses ReplacingMergeTree for upsert behavior.
 * Indexed on (project_id, trace_id, span_id) for efficient queries.
 */
export const spansTableDDL = `
CREATE TABLE IF NOT EXISTS spans (
  project_id String,
  trace_id String,
  span_id String,
  parent_span_id Nullable(String),
  name String,
  kind Enum8('internal' = 0, 'server' = 1, 'client' = 2, 'producer' = 3, 'consumer' = 4),
  span_type Enum8('span' = 0, 'generation' = 1, 'tool' = 2, 'retrieval' = 3, 'event' = 4),
  timestamp DateTime64(3),
  end_time Nullable(DateTime64(3)),
  duration_ms Int64,
  status Enum8('unset' = 0, 'ok' = 1, 'error' = 2),
  status_message String DEFAULT '',
  -- LLM generation fields
  model Nullable(String),
  model_parameters Map(String, String),
  input String DEFAULT '',
  output String DEFAULT '',
  input_tokens Nullable(Int32),
  output_tokens Nullable(Int32),
  total_tokens Nullable(Int32),
  cost_usd Nullable(Float64),
  -- Tool call fields
  tool_name Nullable(String),
  tool_input String DEFAULT '',
  tool_output String DEFAULT '',
  -- General attributes
  attributes Map(String, String)
) ENGINE = ReplacingMergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (project_id, trace_id, span_id)
`;

/**
 * Input type for creating spans via the ingest API
 */
export interface SpanInput {
  project_id: string;
  trace_id: string;
  span_id: string;
  parent_span_id?: string | null;
  name: string;
  kind?: SpanKind;
  span_type?: SpanType;
  timestamp: string | Date;
  end_time?: string | Date | null;
  duration_ms?: number;
  status?: SpanStatus;
  status_message?: string;
  // LLM fields
  model?: string;
  model_parameters?: Record<string, string>;
  input?: string;
  output?: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cost_usd?: number;
  // Tool fields
  tool_name?: string;
  tool_input?: string;
  tool_output?: string;
  // Attributes
  attributes?: Record<string, string>;
}

/**
 * Response type for span queries
 */
export interface SpanResponse extends Omit<Span, "timestamp" | "end_time"> {
  timestamp: string;
  end_time: string | null;
}

/**
 * Span with children for tree rendering
 */
export interface SpanWithChildren extends SpanResponse {
  children: SpanWithChildren[];
}
