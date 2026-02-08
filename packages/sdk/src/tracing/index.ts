/**
 * Tracing Utilities
 *
 * Local context management for structuring async evaluation code.
 * Uses AsyncLocalStorage for proper async context isolation.
 */

import { AsyncLocalStorage } from "node:async_hooks";

import type { NeonExporter } from "./exporter.js";
import type { BufferedSpan } from "./offline-buffer.js";

/**
 * Trace context for span tracking
 */
export interface TraceContext {
  traceId: string;
  parentSpanId?: string;
}

// AsyncLocalStorage for proper async context isolation
const asyncLocalStorage = new AsyncLocalStorage<TraceContext>();

/**
 * Get the current trace context
 */
export function getCurrentContext(): TraceContext | null {
  return asyncLocalStorage.getStore() ?? null;
}

/**
 * Set the current trace context
 *
 * Note: Prefer withContext() for scoped context. This uses enterWith()
 * which affects the current async context going forward.
 */
export function setCurrentContext(context: TraceContext | null): void {
  if (context) {
    asyncLocalStorage.enterWith(context);
  }
}

/**
 * Run a function with a trace context
 */
export async function withContext<T>(
  context: TraceContext,
  fn: () => Promise<T>
): Promise<T> {
  return asyncLocalStorage.run(context, fn);
}

// =============================================================================
// Global Exporter Registry
// =============================================================================

let globalExporter: NeonExporter | null = null;

/**
 * Set the global exporter for span data
 */
export function setGlobalExporter(exporter: NeonExporter): void {
  globalExporter = exporter;
}

/**
 * Get the global exporter
 */
export function getGlobalExporter(): NeonExporter | null {
  return globalExporter;
}

/**
 * Reset the global exporter (useful for testing)
 */
export function resetGlobalExporter(): void {
  globalExporter = null;
}

/**
 * Component type for attribution in compound AI systems
 */
export type ComponentType =
  | "prompt"
  | "retrieval"
  | "tool"
  | "reasoning"
  | "planning"
  | "memory"
  | "routing"
  | "skill"
  | "mcp"
  | "other";

/**
 * Span options
 */
export interface SpanOptions {
  type?: "span" | "generation" | "tool";
  componentType?: ComponentType;
  attributes?: Record<string, string>;
}

/**
 * Create a traced span around a function
 *
 * @example
 * ```typescript
 * const result = await span('process-data', async () => {
 *   return processData(input);
 * });
 * ```
 */
export async function span<T>(
  name: string,
  fn: () => Promise<T>,
  options?: SpanOptions
): Promise<T> {
  const ctx = getCurrentContext();
  const spanId = crypto.randomUUID();
  const startTime = new Date().toISOString();

  const newCtx: TraceContext = ctx
    ? { traceId: ctx.traceId, parentSpanId: spanId }
    : { traceId: `trace-${crypto.randomUUID()}`, parentSpanId: spanId };

  return withContext(newCtx, async () => {
    try {
      const result = await fn();
      if (globalExporter) {
        globalExporter.addSpan({
          traceId: newCtx.traceId,
          spanId,
          parentSpanId: ctx?.parentSpanId,
          name,
          startTime,
          endTime: new Date().toISOString(),
          status: "ok",
          type: options?.type || "span",
          componentType: options?.componentType,
          attributes: options?.attributes || {},
        } satisfies Omit<BufferedSpan, "bufferedAt" | "flushAttempts">);
      }
      return result;
    } catch (error) {
      if (globalExporter) {
        globalExporter.addSpan({
          traceId: newCtx.traceId,
          spanId,
          parentSpanId: ctx?.parentSpanId,
          name,
          startTime,
          endTime: new Date().toISOString(),
          status: "error",
          statusMessage:
            error instanceof Error ? error.message : String(error),
          type: options?.type || "span",
          componentType: options?.componentType,
          attributes: options?.attributes || {},
        } satisfies Omit<BufferedSpan, "bufferedAt" | "flushAttempts">);
      }
      throw error;
    }
  });
}

/**
 * Create a trace around a function
 *
 * @example
 * ```typescript
 * const result = await trace('my-operation', async () => {
 *   return doSomething();
 * });
 * ```
 */
export async function trace<T>(
  name: string,
  fn: () => Promise<T>,
  metadata?: Record<string, string>
): Promise<T> {
  const traceId = `trace-${crypto.randomUUID()}`;
  const spanId = crypto.randomUUID();
  const startTime = new Date().toISOString();
  const context: TraceContext = { traceId, parentSpanId: spanId };

  return withContext(context, async () => {
    try {
      const result = await fn();
      if (globalExporter) {
        globalExporter.addSpan({
          traceId,
          spanId,
          name,
          startTime,
          endTime: new Date().toISOString(),
          status: "ok",
          type: "span",
          attributes: metadata || {},
        } satisfies Omit<BufferedSpan, "bufferedAt" | "flushAttempts">);
      }
      return result;
    } catch (error) {
      if (globalExporter) {
        globalExporter.addSpan({
          traceId,
          spanId,
          name,
          startTime,
          endTime: new Date().toISOString(),
          status: "error",
          statusMessage:
            error instanceof Error ? error.message : String(error),
          type: "span",
          attributes: metadata || {},
        } satisfies Omit<BufferedSpan, "bufferedAt" | "flushAttempts">);
      }
      throw error;
    }
  });
}

/**
 * Create a generation span (for LLM calls)
 */
export async function generation<T>(
  name: string,
  fn: () => Promise<T>,
  options?: {
    model?: string;
    input?: string;
    componentType?: ComponentType;
    attributes?: Record<string, string>;
  }
): Promise<T> {
  const attrs: Record<string, string> = { ...(options?.attributes || {}) };
  if (options?.model) attrs["gen_ai.request.model"] = options.model;
  if (options?.input) attrs["gen_ai.prompt"] = options.input;
  return span(name, fn, {
    type: "generation",
    componentType: options?.componentType,
    attributes: attrs,
  });
}

/**
 * Create a tool span
 */
export async function tool<T>(
  name: string,
  fn: () => Promise<T>,
  options?: {
    toolName?: string;
    toolInput?: string;
    componentType?: ComponentType;
    attributes?: Record<string, string>;
  }
): Promise<T> {
  const attrs: Record<string, string> = { ...(options?.attributes || {}) };
  if (options?.toolName) attrs["tool.name"] = options.toolName;
  if (options?.toolInput) attrs["tool.input"] = options.toolInput;
  return span(name, fn, {
    type: "tool",
    componentType: options?.componentType ?? "tool",
    attributes: attrs,
  });
}

/**
 * Retrieval chunk for structured RAG context
 */
export interface RetrievalChunk {
  content: string;
  source: string;
  relevance_score?: number;
  position?: number;
  metadata?: Record<string, string>;
}

/**
 * Create a retrieval span (for RAG operations)
 */
export async function retrieval<T>(
  name: string,
  fn: () => Promise<T>,
  options?: {
    query?: string;
    topK?: number;
    chunks?: RetrievalChunk[];
    attributes?: Record<string, string>;
  }
): Promise<T> {
  const attrs: Record<string, string> = { ...(options?.attributes || {}) };
  if (options?.query) attrs["retrieval.query"] = options.query;
  if (options?.topK != null) attrs["retrieval.top_k"] = String(options.topK);
  if (options?.chunks) {
    attrs["retrieval.chunk_count"] = String(options.chunks.length);
    try {
      attrs["retrieval.chunks"] = JSON.stringify(options.chunks).slice(0, 50000);
    } catch {
      // Ignore serialization errors
    }
  }
  return span(name, fn, {
    type: "span",
    componentType: "retrieval",
    attributes: attrs,
  });
}

/**
 * Create a reasoning span (for chain-of-thought, planning steps)
 */
export async function reasoning<T>(
  name: string,
  fn: () => Promise<T>,
  options?: {
    attributes?: Record<string, string>;
  }
): Promise<T> {
  return span(name, fn, {
    type: "span",
    componentType: "reasoning",
    attributes: options?.attributes,
  });
}

/**
 * Create a planning span (for high-level task decomposition)
 */
export async function planning<T>(
  name: string,
  fn: () => Promise<T>,
  options?: {
    attributes?: Record<string, string>;
  }
): Promise<T> {
  return span(name, fn, {
    type: "span",
    componentType: "planning",
    attributes: options?.attributes,
  });
}

/**
 * Create a prompt span (for prompt construction)
 */
export async function prompt<T>(
  name: string,
  fn: () => Promise<T>,
  options?: {
    template?: string;
    attributes?: Record<string, string>;
  }
): Promise<T> {
  const attrs: Record<string, string> = { ...(options?.attributes || {}) };
  if (options?.template) attrs["prompt.template"] = options.template;
  return span(name, fn, {
    type: "span",
    componentType: "prompt",
    attributes: attrs,
  });
}

/**
 * Create a routing span (for agent orchestration)
 */
export async function routing<T>(
  name: string,
  fn: () => Promise<T>,
  options?: {
    attributes?: Record<string, string>;
  }
): Promise<T> {
  return span(name, fn, {
    type: "span",
    componentType: "routing",
    attributes: options?.attributes,
  });
}

/**
 * Create a memory span (for memory access and management)
 */
export async function memory<T>(
  name: string,
  fn: () => Promise<T>,
  options?: {
    attributes?: Record<string, string>;
  }
): Promise<T> {
  return span(name, fn, {
    type: "span",
    componentType: "memory",
    attributes: options?.attributes,
  });
}

/**
 * Create an MCP span (for MCP server operations)
 */
export async function mcp<T>(
  name: string,
  fn: () => Promise<T>,
  options?: {
    serverId?: string;
    toolId?: string;
    transport?: "stdio" | "http" | "websocket";
    attributes?: Record<string, string>;
  }
): Promise<T> {
  return span(name, fn, {
    type: "tool",
    componentType: "mcp",
    attributes: {
      ...(options?.attributes || {}),
      ...(options?.serverId ? { "mcp.server_id": options.serverId } : {}),
      ...(options?.toolId ? { "mcp.tool_id": options.toolId } : {}),
      ...(options?.transport ? { "mcp.transport": options.transport } : {}),
    },
  });
}

// Re-export MCP tracing utilities
export {
  withMCPTracing,
  mcpToolCall,
  MCPHealthTracker,
  type MCPClient,
  type MCPTracingConfig,
  type MCPToolCallResult,
  type MCPServerHealth,
  type MCPConnectionEvent,
} from "./mcp.js";

// Offline buffer exports
export {
  OfflineBuffer,
  createOfflineBuffer,
  createAndInitializeOfflineBuffer,
  createBufferableSpan,
  getGlobalBuffer,
  resetGlobalBuffer,
  isBufferHealthy,
  type BufferedSpan,
  type FlushStrategy,
  type OfflineBufferConfig,
  type FlushResult,
  type BufferStats,
} from "./offline-buffer.js";

// NeonExporter for OTLP span export
export {
  NeonExporter,
  createNeonExporter,
  type NeonExporterConfig,
} from "./exporter.js";

// W3C Trace Context propagation
export {
  injectTraceContext,
  extractTraceContext,
  formatTraceparent,
  parseTraceparent,
} from "./propagation.js";
