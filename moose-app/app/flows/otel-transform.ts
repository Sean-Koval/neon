/**
 * OTel Transform Flow
 *
 * Transforms OpenTelemetry Protocol (OTLP) traces into Neon's internal format.
 * This enables "Mode 1: BYOA" where agents running anywhere can send traces to Neon.
 *
 * Supports:
 * - Standard OTel spans
 * - Gen AI semantic conventions (for LLM calls)
 * - Custom tool/retrieval attributes
 */

import type { Span, SpanKind, SpanType, SpanStatus, SpanInput } from "../datamodels/spans";
import type { Trace, TraceInput } from "../datamodels/traces";

/**
 * OTLP Span format (simplified)
 *
 * @see https://opentelemetry.io/docs/specs/otlp/
 */
export interface OTLPSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number; // 0=INTERNAL, 1=SERVER, 2=CLIENT, 3=PRODUCER, 4=CONSUMER
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OTLPAttribute[];
  status: {
    code: number; // 0=UNSET, 1=OK, 2=ERROR
    message?: string;
  };
  events?: OTLPEvent[];
}

export interface OTLPAttribute {
  key: string;
  value: {
    stringValue?: string;
    intValue?: string;
    boolValue?: boolean;
    doubleValue?: number;
    arrayValue?: { values: OTLPAttribute["value"][] };
  };
}

export interface OTLPEvent {
  timeUnixNano: string;
  name: string;
  attributes: OTLPAttribute[];
}

/**
 * OTLP Request format
 */
export interface OTLPRequest {
  resourceSpans: Array<{
    resource: {
      attributes: OTLPAttribute[];
    };
    scopeSpans: Array<{
      scope?: {
        name: string;
        version?: string;
      };
      spans: OTLPSpan[];
    }>;
  }>;
}

/**
 * Transform OTLP request to internal spans
 *
 * @param otlp The OTLP request payload
 * @param projectId The project ID from request headers
 * @returns Array of spans in internal format
 */
export function transformOTLPToSpans(
  otlp: OTLPRequest,
  projectId: string
): SpanInput[] {
  const spans: SpanInput[] = [];

  for (const resourceSpan of otlp.resourceSpans) {
    // Extract resource attributes (service.name, etc.)
    const resourceAttrs = attributesToRecord(resourceSpan.resource.attributes);

    for (const scopeSpan of resourceSpan.scopeSpans) {
      for (const span of scopeSpan.spans) {
        spans.push(transformOTLPSpan(span, projectId, resourceAttrs));
      }
    }
  }

  return spans;
}

/**
 * Transform a single OTLP span to internal format
 */
function transformOTLPSpan(
  otel: OTLPSpan,
  projectId: string,
  resourceAttrs: Record<string, string>
): SpanInput {
  const attrs = attributesToRecord(otel.attributes);
  const allAttrs = { ...resourceAttrs, ...attrs };

  // Calculate duration
  const startNano = BigInt(otel.startTimeUnixNano);
  const endNano = BigInt(otel.endTimeUnixNano);
  const durationMs = Number((endNano - startNano) / BigInt(1_000_000));

  // Determine span type from attributes
  const spanType = detectSpanType(allAttrs);

  // Extract LLM-specific fields if this is a generation span
  const llmFields = spanType === "generation" ? extractLLMFields(allAttrs) : {};

  // Extract tool-specific fields if this is a tool span
  const toolFields = spanType === "tool" ? extractToolFields(allAttrs) : {};

  return {
    project_id: projectId,
    trace_id: otel.traceId,
    span_id: otel.spanId,
    parent_span_id: otel.parentSpanId || null,
    name: otel.name,
    kind: mapKind(otel.kind),
    span_type: spanType,
    timestamp: new Date(Number(startNano / BigInt(1_000_000))).toISOString(),
    end_time: new Date(Number(endNano / BigInt(1_000_000))).toISOString(),
    duration_ms: durationMs,
    status: mapStatus(otel.status.code),
    status_message: otel.status.message || "",
    ...llmFields,
    ...toolFields,
    attributes: allAttrs,
  };
}

/**
 * Convert OTLP attributes array to a record
 */
function attributesToRecord(attrs: OTLPAttribute[]): Record<string, string> {
  const record: Record<string, string> = {};

  for (const attr of attrs) {
    const value = attr.value;
    if (value.stringValue !== undefined) {
      record[attr.key] = value.stringValue;
    } else if (value.intValue !== undefined) {
      record[attr.key] = value.intValue;
    } else if (value.boolValue !== undefined) {
      record[attr.key] = String(value.boolValue);
    } else if (value.doubleValue !== undefined) {
      record[attr.key] = String(value.doubleValue);
    } else if (value.arrayValue !== undefined) {
      record[attr.key] = JSON.stringify(
        value.arrayValue.values.map((v) => v.stringValue ?? v.intValue ?? v.boolValue)
      );
    }
  }

  return record;
}

/**
 * Detect span type from attributes
 *
 * Uses Gen AI semantic conventions and common patterns:
 * - gen_ai.* attributes indicate LLM generation
 * - tool.* attributes indicate tool calls
 * - retrieval.* attributes indicate RAG retrieval
 */
function detectSpanType(attrs: Record<string, string>): SpanType {
  // Check for Gen AI semantic conventions
  if (
    attrs["gen_ai.system"] ||
    attrs["gen_ai.request.model"] ||
    attrs["llm.system"] ||
    attrs["llm.request.model"]
  ) {
    return "generation";
  }

  // Check for tool call indicators
  if (attrs["tool.name"] || attrs["function.name"]) {
    return "tool";
  }

  // Check for retrieval indicators
  if (attrs["retrieval.source"] || attrs["db.system"]) {
    return "retrieval";
  }

  // Check for event indicators (no duration expected)
  if (attrs["event.name"]) {
    return "event";
  }

  return "span";
}

/**
 * Extract LLM-specific fields from attributes
 *
 * Supports both Gen AI semantic conventions and common alternatives
 */
function extractLLMFields(attrs: Record<string, string>): Partial<SpanInput> {
  return {
    model: attrs["gen_ai.request.model"] || attrs["llm.request.model"] || null,
    model_parameters: extractModelParameters(attrs),
    input: attrs["gen_ai.prompt"] || attrs["llm.prompts"] || "",
    output: attrs["gen_ai.completion"] || attrs["llm.completions"] || "",
    input_tokens: parseIntOrNull(
      attrs["gen_ai.usage.input_tokens"] || attrs["llm.usage.prompt_tokens"]
    ),
    output_tokens: parseIntOrNull(
      attrs["gen_ai.usage.output_tokens"] || attrs["llm.usage.completion_tokens"]
    ),
    total_tokens: parseIntOrNull(
      attrs["gen_ai.usage.total_tokens"] || attrs["llm.usage.total_tokens"]
    ),
    cost_usd: parseFloatOrNull(attrs["gen_ai.usage.cost"]),
  };
}

/**
 * Extract model parameters from attributes
 */
function extractModelParameters(attrs: Record<string, string>): Record<string, string> {
  const params: Record<string, string> = {};

  const paramKeys = [
    "gen_ai.request.temperature",
    "gen_ai.request.max_tokens",
    "gen_ai.request.top_p",
    "gen_ai.request.top_k",
    "gen_ai.request.stop_sequences",
    "llm.temperature",
    "llm.max_tokens",
  ];

  for (const key of paramKeys) {
    if (attrs[key]) {
      // Normalize key name
      const normalizedKey = key.replace("gen_ai.request.", "").replace("llm.", "");
      params[normalizedKey] = attrs[key];
    }
  }

  return params;
}

/**
 * Extract tool-specific fields from attributes
 */
function extractToolFields(attrs: Record<string, string>): Partial<SpanInput> {
  return {
    tool_name: attrs["tool.name"] || attrs["function.name"] || null,
    tool_input: attrs["tool.input"] || attrs["function.arguments"] || "",
    tool_output: attrs["tool.output"] || attrs["function.result"] || "",
  };
}

/**
 * Map OTLP span kind to internal format
 */
function mapKind(kind: number): SpanKind {
  const kinds: SpanKind[] = ["internal", "server", "client", "producer", "consumer"];
  return kinds[kind] || "internal";
}

/**
 * Map OTLP status code to internal format
 */
function mapStatus(code: number): SpanStatus {
  if (code === 0) return "unset";
  if (code === 1) return "ok";
  return "error";
}

/**
 * Parse integer or return null
 */
function parseIntOrNull(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parse float or return null
 */
function parseFloatOrNull(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Aggregate spans into trace metadata
 *
 * Called after spans are inserted to update trace-level stats
 */
export function aggregateSpansToTrace(
  spans: SpanInput[],
  projectId: string
): TraceInput | null {
  if (spans.length === 0) return null;

  // Group by trace ID
  const traceId = spans[0].trace_id;
  const traceSpans = spans.filter((s) => s.trace_id === traceId);

  // Find the root span (no parent)
  const rootSpan = traceSpans.find((s) => !s.parent_span_id);

  // Calculate aggregates
  const timestamps = traceSpans
    .map((s) => new Date(s.timestamp as string).getTime())
    .filter((t) => !isNaN(t));
  const endTimes = traceSpans
    .map((s) => s.end_time ? new Date(s.end_time as string).getTime() : 0)
    .filter((t) => t > 0);

  const minTimestamp = Math.min(...timestamps);
  const maxEndTime = endTimes.length > 0 ? Math.max(...endTimes) : minTimestamp;

  // Check for any errors
  const hasError = traceSpans.some((s) => s.status === "error");

  return {
    project_id: projectId,
    trace_id: traceId,
    name: rootSpan?.name || `trace-${traceId.slice(0, 8)}`,
    timestamp: new Date(minTimestamp).toISOString(),
    end_time: new Date(maxEndTime).toISOString(),
    duration_ms: maxEndTime - minTimestamp,
    status: hasError ? "error" : "ok",
    metadata: {},
  };
}

/**
 * Validate OTLP request format
 */
export function validateOTLPRequest(data: unknown): data is OTLPRequest {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;

  if (!Array.isArray(obj.resourceSpans)) return false;

  for (const rs of obj.resourceSpans) {
    if (!rs || typeof rs !== "object") return false;
    const rsObj = rs as Record<string, unknown>;

    if (!Array.isArray(rsObj.scopeSpans)) return false;

    for (const ss of rsObj.scopeSpans) {
      if (!ss || typeof ss !== "object") return false;
      const ssObj = ss as Record<string, unknown>;

      if (!Array.isArray(ssObj.spans)) return false;
    }
  }

  return true;
}
