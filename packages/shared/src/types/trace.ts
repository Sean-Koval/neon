/**
 * Trace Types
 *
 * Core types for trace and span data used throughout the platform.
 */

/**
 * Trace status
 */
export type TraceStatus = "unset" | "ok" | "error";

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
  | "span"
  | "generation"
  | "tool"
  | "retrieval"
  | "event";

/**
 * Component type for attribution in compound AI systems
 * Used to identify which component of the agent system a span belongs to
 */
export type ComponentType =
  | "prompt"      // Prompt construction and formatting
  | "retrieval"   // RAG/document retrieval operations
  | "tool"        // Tool selection and execution
  | "reasoning"   // Chain-of-thought, planning, or reasoning steps
  | "planning"    // High-level task decomposition and planning
  | "memory"      // Memory access and management
  | "routing"     // Agent routing and orchestration
  | "other";      // Unclassified or custom components

/**
 * Span status
 */
export type SpanStatus = "unset" | "ok" | "error";

/**
 * Trace represents a complete agent execution
 */
export interface Trace {
  traceId: string;
  projectId: string;
  name: string;
  timestamp: Date;
  endTime?: Date;
  durationMs: number;
  status: TraceStatus;
  metadata: Record<string, string>;
  // Agent context
  agentId?: string;
  agentVersion?: string;
  workflowId?: string;
  workflowRunId?: string;
  // Aggregated stats
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd?: number;
  toolCallCount: number;
  llmCallCount: number;
}

/**
 * Span represents an individual operation within a trace
 */
export interface Span {
  spanId: string;
  traceId: string;
  projectId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  spanType: SpanType;
  componentType?: ComponentType;  // Component attribution for compound AI systems
  timestamp: Date;
  endTime?: Date;
  durationMs: number;
  status: SpanStatus;
  statusMessage?: string;
  // LLM generation fields
  model?: string;
  modelParameters?: Record<string, string>;
  input?: string;
  output?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  // Tool fields
  toolName?: string;
  toolInput?: string;
  toolOutput?: string;
  // Attributes
  attributes: Record<string, string>;
}

/**
 * Span with children for tree rendering
 */
export interface SpanWithChildren extends Span {
  children: SpanWithChildren[];
}

/**
 * Trace with all spans
 */
export interface TraceWithSpans {
  trace: Trace;
  spans: SpanWithChildren[];
}

/**
 * Trace summary for list views
 */
export interface TraceSummary {
  traceId: string;
  name: string;
  timestamp: Date;
  durationMs: number;
  status: TraceStatus;
  totalTokens: number;
  toolCalls: number;
  llmCalls: number;
  agentId?: string;
  agentVersion?: string;
}

/**
 * Filters for trace queries
 */
export interface TraceFilters {
  projectId: string;
  status?: TraceStatus;
  startDate?: Date;
  endDate?: Date;
  agentId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}
