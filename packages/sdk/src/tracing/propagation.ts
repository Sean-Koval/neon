/**
 * W3C Trace Context Propagation
 *
 * Implements W3C Trace Context specification for distributed tracing.
 * @see https://www.w3.org/TR/trace-context/
 *
 * @example
 * ```typescript
 * import { injectTraceContext, extractTraceContext } from '@neon/sdk/tracing';
 *
 * // Inject context into outgoing HTTP headers
 * const headers: Record<string, string> = {};
 * injectTraceContext(headers);
 * await fetch(url, { headers });
 *
 * // Extract context from incoming request headers
 * const ctx = extractTraceContext(req.headers);
 * if (ctx) {
 *   await withContext(ctx, () => handleRequest(req));
 * }
 * ```
 */

import { getCurrentContext, type TraceContext } from "./index.js";

const TRACEPARENT_HEADER = "traceparent";
const TRACESTATE_HEADER = "tracestate";
const VERSION = "00";
const TRACE_FLAGS_SAMPLED = "01";
const ZERO_PARENT = "0000000000000000";

/**
 * Pad or truncate an ID to a specific hex length.
 * W3C trace-id is 32 hex chars, parent-id is 16 hex chars.
 */
function normalizeId(id: string, length: 16 | 32): string {
  // Strip non-hex characters and any prefix like "trace-"
  const hex = id.replace(/[^0-9a-fA-F]/g, "");
  if (hex.length >= length) {
    return hex.slice(0, length).toLowerCase();
  }
  return hex.padStart(length, "0").toLowerCase();
}

/**
 * Inject the current trace context into HTTP headers (W3C traceparent format).
 *
 * Modifies the headers object in-place.
 */
export function injectTraceContext(headers: Record<string, string>): void {
  const ctx = getCurrentContext();
  if (!ctx) return;

  const traceId = normalizeId(ctx.traceId, 32);
  const parentId = ctx.parentSpanId
    ? normalizeId(ctx.parentSpanId, 16)
    : ZERO_PARENT;

  headers[TRACEPARENT_HEADER] =
    `${VERSION}-${traceId}-${parentId}-${TRACE_FLAGS_SAMPLED}`;
}

/**
 * Extract trace context from HTTP headers (W3C traceparent format).
 *
 * Returns null if no valid traceparent header is found.
 */
export function extractTraceContext(
  headers: Record<string, string>
): TraceContext | null {
  const traceparent =
    headers[TRACEPARENT_HEADER] || headers["Traceparent"] || headers["TRACEPARENT"];
  if (!traceparent) return null;

  const parts = traceparent.split("-");
  if (parts.length !== 4) return null;

  const [version, traceId, parentId, _flags] = parts;

  // Only support version 00 currently
  if (version !== "00") return null;

  // Validate hex lengths
  if (traceId.length !== 32 || parentId.length !== 16) return null;
  if (!/^[0-9a-f]{32}$/.test(traceId) || !/^[0-9a-f]{16}$/.test(parentId)) {
    return null;
  }

  return {
    traceId,
    parentSpanId: parentId === ZERO_PARENT ? undefined : parentId,
  };
}

/**
 * Create a traceparent string from a TraceContext.
 */
export function formatTraceparent(ctx: TraceContext): string {
  const traceId = normalizeId(ctx.traceId, 32);
  const parentId = ctx.parentSpanId
    ? normalizeId(ctx.parentSpanId, 16)
    : ZERO_PARENT;

  return `${VERSION}-${traceId}-${parentId}-${TRACE_FLAGS_SAMPLED}`;
}

/**
 * Parse a traceparent string into its components.
 */
export function parseTraceparent(
  traceparent: string
): { version: string; traceId: string; parentId: string; flags: string } | null {
  const parts = traceparent.split("-");
  if (parts.length !== 4) return null;
  return {
    version: parts[0],
    traceId: parts[1],
    parentId: parts[2],
    flags: parts[3],
  };
}
