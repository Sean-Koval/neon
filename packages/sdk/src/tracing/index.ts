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
 * Span options
 */
export interface SpanOptions {
  type?: "span" | "generation" | "tool";
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
    attributes?: Record<string, string>;
  }
): Promise<T> {
  return span(name, fn, { type: "generation" });
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
    attributes?: Record<string, string>;
  }
): Promise<T> {
  return span(name, fn, { type: "tool" });
}
