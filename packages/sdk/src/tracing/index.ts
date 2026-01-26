/**
 * Tracing Utilities
 *
 * Helpers for manual span creation and decorators.
 */

import type { SpanType } from "@neon/shared";

/**
 * Trace context for span creation
 */
export interface TraceContext {
  traceId: string;
  parentSpanId?: string;
}

// Global trace context (thread-local style)
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
  type?: SpanType;
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
  const context = getCurrentContext();
  const spanId = `span-${crypto.randomUUID()}`;
  const startTime = Date.now();

  try {
    const result = await fn();

    // Emit span if we have a context
    if (context) {
      await emitSpanToApi({
        traceId: context.traceId,
        spanId,
        parentSpanId: context.parentSpanId,
        name,
        spanType: options?.type ?? "span",
        status: "ok",
        durationMs: Date.now() - startTime,
        attributes: options?.attributes,
      });
    }

    return result;
  } catch (error) {
    // Emit error span
    if (context) {
      await emitSpanToApi({
        traceId: context.traceId,
        spanId,
        parentSpanId: context.parentSpanId,
        name,
        spanType: options?.type ?? "span",
        status: "error",
        statusMessage: error instanceof Error ? error.message : "Unknown error",
        durationMs: Date.now() - startTime,
        attributes: options?.attributes,
      });
    }
    throw error;
  }
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
  const context: TraceContext = { traceId };

  return withContext(context, async () => {
    return span(name, fn, { attributes: metadata });
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
    attributes?: Record<string, string>;
  }
): Promise<T> {
  return span(name, fn, {
    type: "generation",
    attributes: {
      ...options?.attributes,
      ...(options?.model && { model: options.model }),
    },
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
    attributes?: Record<string, string>;
  }
): Promise<T> {
  return span(name, fn, {
    type: "tool",
    attributes: {
      ...options?.attributes,
      ...(options?.toolName && { tool_name: options.toolName }),
    },
  });
}

// ==================== Decorators ====================

/**
 * Decorator for tracing a method
 *
 * @example
 * ```typescript
 * class MyService {
 *   @traced('process')
 *   async process(input: string): Promise<string> {
 *     return input.toUpperCase();
 *   }
 * }
 * ```
 */
export function traced(name?: string): MethodDecorator {
  return function (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const spanName = name || String(propertyKey);

    descriptor.value = async function (...args: unknown[]) {
      return span(spanName, async () => {
        return originalMethod.apply(this, args);
      });
    };

    return descriptor;
  };
}

/**
 * Decorator for scoring a method's trace
 *
 * @example
 * ```typescript
 * class MyAgent {
 *   @scored(['tool_selection', 'response_quality'])
 *   async run(query: string): Promise<string> {
 *     return this.process(query);
 *   }
 * }
 * ```
 */
export function scored(scorers: string[]): MethodDecorator {
  return function (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const context = getCurrentContext();
      const result = await originalMethod.apply(this, args);

      // Schedule scoring (non-blocking)
      if (context) {
        scheduleScoring(context.traceId, scorers).catch(console.error);
      }

      return result;
    };

    return descriptor;
  };
}

// ==================== Internal Helpers ====================

const NEON_API_URL = process.env.NEON_API_URL || "http://localhost:4000";
const NEON_API_KEY = process.env.NEON_API_KEY || "";

/**
 * Emit a span to the Neon API
 */
async function emitSpanToApi(span: {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  spanType: SpanType;
  status: "ok" | "error";
  statusMessage?: string;
  durationMs: number;
  attributes?: Record<string, string>;
}): Promise<void> {
  if (!NEON_API_KEY) {
    // No API key, skip emission
    return;
  }

  try {
    await fetch(`${NEON_API_URL}/api/spans`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NEON_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(span),
    });
  } catch {
    // Silently fail - tracing should not break the application
  }
}

/**
 * Schedule scoring for a trace
 */
async function scheduleScoring(
  traceId: string,
  scorers: string[]
): Promise<void> {
  if (!NEON_API_KEY) return;

  try {
    await fetch(`${NEON_API_URL}/api/scores/schedule`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NEON_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ traceId, scorers }),
    });
  } catch {
    // Silently fail
  }
}
