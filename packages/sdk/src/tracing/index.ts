/**
 * Tracing Utilities
 *
 * Local context management for structuring async evaluation code.
 * For production tracing to Neon API, use the full @neon/tracing package.
 */

/**
 * Trace context for span tracking
 */
export interface TraceContext {
  traceId: string;
  parentSpanId?: string;
}

// Global trace context (async-local style)
let currentContext: TraceContext | null = null;

/**
 * Get the current trace context
 */
export function getCurrentContext(): TraceContext | null {
  return currentContext;
}

/**
 * Set the current trace context
 */
export function setCurrentContext(context: TraceContext | null): void {
  currentContext = context;
}

/**
 * Run a function with a trace context
 */
export async function withContext<T>(
  context: TraceContext,
  fn: () => Promise<T>
): Promise<T> {
  const previous = currentContext;
  currentContext = context;
  try {
    return await fn();
  } finally {
    currentContext = previous;
  }
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
  _options?: SpanOptions
): Promise<T> {
  // For local eval, just execute the function
  // The span name and options can be used for debugging/logging
  return fn();
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
  _metadata?: Record<string, string>
): Promise<T> {
  const traceId = `trace-${crypto.randomUUID()}`;
  const context: TraceContext = { traceId };

  return withContext(context, fn);
}

/**
 * Create a generation span (for LLM calls)
 */
export async function generation<T>(
  name: string,
  fn: () => Promise<T>,
  _options?: {
    model?: string;
    input?: string;
    componentType?: ComponentType;
    attributes?: Record<string, string>;
  }
): Promise<T> {
  return span(name, fn, {
    type: "generation",
    componentType: _options?.componentType,
    attributes: _options?.attributes,
  });
}

/**
 * Create a tool span
 */
export async function tool<T>(
  name: string,
  fn: () => Promise<T>,
  _options?: {
    toolName?: string;
    toolInput?: string;
    componentType?: ComponentType;
    attributes?: Record<string, string>;
  }
): Promise<T> {
  return span(name, fn, {
    type: "tool",
    componentType: _options?.componentType ?? "tool",
    attributes: _options?.attributes,
  });
}

/**
 * Create a retrieval span (for RAG operations)
 */
export async function retrieval<T>(
  name: string,
  fn: () => Promise<T>,
  _options?: {
    query?: string;
    topK?: number;
    attributes?: Record<string, string>;
  }
): Promise<T> {
  return span(name, fn, {
    type: "span",
    componentType: "retrieval",
    attributes: _options?.attributes,
  });
}

/**
 * Create a reasoning span (for chain-of-thought, planning steps)
 */
export async function reasoning<T>(
  name: string,
  fn: () => Promise<T>,
  _options?: {
    attributes?: Record<string, string>;
  }
): Promise<T> {
  return span(name, fn, {
    type: "span",
    componentType: "reasoning",
    attributes: _options?.attributes,
  });
}

/**
 * Create a planning span (for high-level task decomposition)
 */
export async function planning<T>(
  name: string,
  fn: () => Promise<T>,
  _options?: {
    attributes?: Record<string, string>;
  }
): Promise<T> {
  return span(name, fn, {
    type: "span",
    componentType: "planning",
    attributes: _options?.attributes,
  });
}

/**
 * Create a prompt span (for prompt construction)
 */
export async function prompt<T>(
  name: string,
  fn: () => Promise<T>,
  _options?: {
    template?: string;
    attributes?: Record<string, string>;
  }
): Promise<T> {
  return span(name, fn, {
    type: "span",
    componentType: "prompt",
    attributes: _options?.attributes,
  });
}

/**
 * Create a routing span (for agent orchestration)
 */
export async function routing<T>(
  name: string,
  fn: () => Promise<T>,
  _options?: {
    attributes?: Record<string, string>;
  }
): Promise<T> {
  return span(name, fn, {
    type: "span",
    componentType: "routing",
    attributes: _options?.attributes,
  });
}

/**
 * Create a memory span (for memory access and management)
 */
export async function memory<T>(
  name: string,
  fn: () => Promise<T>,
  _options?: {
    attributes?: Record<string, string>;
  }
): Promise<T> {
  return span(name, fn, {
    type: "span",
    componentType: "memory",
    attributes: _options?.attributes,
  });
}

/**
 * Create an MCP span (for MCP server operations)
 */
export async function mcp<T>(
  name: string,
  fn: () => Promise<T>,
  _options?: {
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
      ...(_options?.attributes || {}),
      ...(_options?.serverId ? { "mcp.server_id": _options.serverId } : {}),
      ...(_options?.toolId ? { "mcp.tool_id": _options.toolId } : {}),
      ...(_options?.transport ? { "mcp.transport": _options.transport } : {}),
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
