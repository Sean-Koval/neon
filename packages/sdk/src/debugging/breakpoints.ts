/**
 * Breakpoint Definition API
 *
 * SDK for defining breakpoints on span types, names, or conditions.
 * Breakpoints allow developers to set up inspection points in agent traces
 * for debugging, logging, and analysis.
 *
 * @example
 * ```typescript
 * import { defineBreakpoint, onSpanType, onError, and } from '@neon/sdk';
 *
 * // Break on all tool errors
 * const toolErrorBreakpoint = defineBreakpoint({
 *   name: 'tool-errors',
 *   matcher: and(onSpanType('tool'), onError()),
 *   trigger: 'onExit',
 *   action: { type: 'log', message: 'Tool failed: {{span.toolName}}' },
 * });
 *
 * // Break on specific tool with condition
 * const expensiveCallBreakpoint = defineBreakpoint({
 *   name: 'expensive-llm-calls',
 *   matcher: {
 *     spanType: 'generation',
 *     condition: (span) => (span.totalTokens ?? 0) > 10000,
 *   },
 *   trigger: 'onExit',
 *   action: {
 *     type: 'notify',
 *     handler: (ctx) => console.log(`Large generation: ${ctx.span.totalTokens} tokens`),
 *   },
 * });
 * ```
 */

import type {
  Span,
  SpanWithChildren,
  Trace,
  SpanType,
  SpanStatus,
  ComponentType,
} from "@neon/shared";

// ============================================================================
// Core Types
// ============================================================================

/**
 * When to trigger the breakpoint during span lifecycle
 */
export type BreakpointTrigger =
  | "onEnter" // When span starts
  | "onExit" // When span completes (success or error)
  | "onError"; // Only when span errors

/**
 * Hit condition for controlling when breakpoint actually fires
 */
export type HitCondition =
  | "always" // Fire every time (default)
  | number // Fire only on the Nth hit
  | { every: number } // Fire every N hits
  | { after: number } // Fire after N hits
  | { until: number }; // Fire until N hits, then disable

/**
 * Criteria for matching spans
 */
export interface SpanMatcher {
  /** Match by span type */
  spanType?: SpanType | SpanType[];

  /** Match by component type */
  componentType?: ComponentType | ComponentType[];

  /** Match by span name (exact string or RegExp) */
  name?: string | RegExp;

  /** Match by span name using glob pattern (*, ?, **) */
  nameGlob?: string;

  /** Match by span status */
  status?: SpanStatus | SpanStatus[];

  /** Match by tool name (for tool spans) */
  toolName?: string | RegExp;

  /** Match by model name (for generation spans) */
  model?: string | RegExp;

  /** Match by attributes (value can be exact string or RegExp) */
  attributes?: Record<string, string | RegExp>;

  /** Custom predicate function for complex conditions */
  condition?: (span: Span) => boolean;
}

/**
 * Context provided to breakpoint action handlers
 */
export interface BreakpointContext {
  /** The span that triggered the breakpoint */
  span: Span;

  /** The trace containing the span */
  trace: Trace;

  /** The breakpoint that was triggered */
  breakpoint: Breakpoint;

  /** Number of times this breakpoint has been hit */
  hitCount: number;

  /** Timestamp when the breakpoint was triggered */
  timestamp: Date;

  /** The trigger event that fired this breakpoint */
  trigger: BreakpointTrigger;
}

/**
 * Action to perform when breakpoint is triggered
 */
export type BreakpointAction =
  | { type: "log"; message?: string; level?: "debug" | "info" | "warn" | "error" }
  | { type: "notify"; handler: (context: BreakpointContext) => void | Promise<void> }
  | { type: "capture"; store?: Map<string, BreakpointContext[]> }
  | { type: "custom"; handler: (context: BreakpointContext) => void | Promise<void> };

/**
 * Configuration for defining a breakpoint
 */
export interface BreakpointConfig {
  /** Unique identifier (auto-generated if not provided) */
  id?: string;

  /** Human-readable name */
  name?: string;

  /** Description of what this breakpoint catches */
  description?: string;

  /** Whether the breakpoint is enabled (default: true) */
  enabled?: boolean;

  /** Criteria for matching spans */
  matcher: SpanMatcher;

  /** When to trigger (default: 'onExit') */
  trigger?: BreakpointTrigger | BreakpointTrigger[];

  /** Action to perform when triggered */
  action?: BreakpointAction;

  /** Condition for when to actually fire based on hit count */
  hitCondition?: HitCondition;
}

/**
 * A fully defined breakpoint
 */
export interface Breakpoint {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name?: string;

  /** Description of what this breakpoint catches */
  description?: string;

  /** Whether the breakpoint is enabled */
  enabled: boolean;

  /** Criteria for matching spans */
  matcher: SpanMatcher;

  /** When to trigger */
  triggers: BreakpointTrigger[];

  /** Action to perform when triggered */
  action: BreakpointAction;

  /** Condition for when to actually fire based on hit count */
  hitCondition: HitCondition;
}

// ============================================================================
// Breakpoint Definition
// ============================================================================

let breakpointIdCounter = 0;

/**
 * Reset the breakpoint ID counter (useful for testing)
 */
export function resetBreakpointIdCounter(): void {
  breakpointIdCounter = 0;
}

/**
 * Define a breakpoint for debugging agent traces
 *
 * @example
 * ```typescript
 * const bp = defineBreakpoint({
 *   name: 'slow-generations',
 *   matcher: {
 *     spanType: 'generation',
 *     condition: (span) => span.durationMs > 5000,
 *   },
 *   trigger: 'onExit',
 *   action: { type: 'log', message: 'Slow LLM call detected' },
 * });
 * ```
 */
export function defineBreakpoint(config: BreakpointConfig): Breakpoint {
  const id = config.id ?? `bp-${++breakpointIdCounter}`;

  // Normalize trigger to array
  const triggers: BreakpointTrigger[] = config.trigger
    ? Array.isArray(config.trigger)
      ? config.trigger
      : [config.trigger]
    : ["onExit"];

  return {
    id,
    name: config.name,
    description: config.description,
    enabled: config.enabled ?? true,
    matcher: config.matcher,
    triggers,
    action: config.action ?? { type: "log" },
    hitCondition: config.hitCondition ?? "always",
  };
}

// ============================================================================
// Matcher Factories
// ============================================================================

/**
 * Create a matcher for specific span types
 *
 * @example
 * ```typescript
 * onSpanType('generation')           // Single type
 * onSpanType(['tool', 'generation']) // Multiple types
 * ```
 */
export function onSpanType(type: SpanType | SpanType[]): SpanMatcher {
  return { spanType: type };
}

/**
 * Create a matcher for specific component types
 *
 * @example
 * ```typescript
 * onComponentType('reasoning')
 * onComponentType(['planning', 'reasoning'])
 * ```
 */
export function onComponentType(type: ComponentType | ComponentType[]): SpanMatcher {
  return { componentType: type };
}

/**
 * Create a matcher for span names
 *
 * @example
 * ```typescript
 * onSpanName('process-query')        // Exact match
 * onSpanName(/process-.+/)           // RegExp match
 * ```
 */
export function onSpanName(pattern: string | RegExp): SpanMatcher {
  return { name: pattern };
}

/**
 * Create a matcher for span names using glob patterns
 *
 * @example
 * ```typescript
 * onSpanNameGlob('process-*')        // Matches process-query, process-data
 * onSpanNameGlob('**\/tool-*')       // Matches nested tool spans
 * ```
 */
export function onSpanNameGlob(pattern: string): SpanMatcher {
  return { nameGlob: pattern };
}

/**
 * Create a matcher for tool spans by tool name
 *
 * @example
 * ```typescript
 * onTool('get_weather')              // Exact match
 * onTool(/^get_/)                    // Tools starting with "get_"
 * ```
 */
export function onTool(name: string | RegExp): SpanMatcher {
  return { spanType: "tool", toolName: name };
}

/**
 * Create a matcher for generation spans by model
 *
 * @example
 * ```typescript
 * onModel('gpt-4')
 * onModel(/claude-3/)
 * ```
 */
export function onModel(model: string | RegExp): SpanMatcher {
  return { spanType: "generation", model };
}

/**
 * Create a matcher for errored spans
 */
export function onError(): SpanMatcher {
  return { status: "error" };
}

/**
 * Create a matcher for successful spans
 */
export function onSuccess(): SpanMatcher {
  return { status: "ok" };
}

/**
 * Create a matcher with attribute conditions
 *
 * @example
 * ```typescript
 * onAttribute('env', 'production')
 * onAttribute('request_id', /^req-/)
 * ```
 */
export function onAttribute(key: string, value: string | RegExp): SpanMatcher {
  return { attributes: { [key]: value } };
}

/**
 * Create a matcher with a custom condition
 *
 * @example
 * ```typescript
 * onCondition((span) => span.totalTokens! > 1000)
 * ```
 */
export function onCondition(predicate: (span: Span) => boolean): SpanMatcher {
  return { condition: predicate };
}

// ============================================================================
// Matcher Combinators
// ============================================================================

/**
 * Combine matchers with AND logic (all must match)
 *
 * @example
 * ```typescript
 * and(onSpanType('tool'), onError())  // Tool spans that errored
 * ```
 */
export function and(...matchers: SpanMatcher[]): SpanMatcher {
  return {
    condition: (span) => matchers.every((m) => matchesSpan(m, span)),
  };
}

/**
 * Combine matchers with OR logic (any must match)
 *
 * @example
 * ```typescript
 * or(onSpanType('tool'), onSpanType('generation'))
 * ```
 */
export function or(...matchers: SpanMatcher[]): SpanMatcher {
  return {
    condition: (span) => matchers.some((m) => matchesSpan(m, span)),
  };
}

/**
 * Negate a matcher
 *
 * @example
 * ```typescript
 * not(onError())  // Successful spans only
 * ```
 */
export function not(matcher: SpanMatcher): SpanMatcher {
  return {
    condition: (span) => !matchesSpan(matcher, span),
  };
}

// ============================================================================
// Span Matching Logic
// ============================================================================

/**
 * Convert a glob pattern to a RegExp
 */
function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special regex chars
    .replace(/\*\*/g, "§§") // Temporarily replace **
    .replace(/\*/g, "[^/]*") // * matches anything except /
    .replace(/\?/g, ".") // ? matches single char
    .replace(/§§/g, ".*"); // ** matches anything including /

  return new RegExp(`^${escaped}$`);
}

/**
 * Check if a value matches a string or RegExp pattern
 */
function matchesPattern(
  value: string | undefined | null,
  pattern: string | RegExp
): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof pattern === "string") {
    return value === pattern;
  }
  return pattern.test(value);
}

/**
 * Check if a value is in an array of allowed values
 */
function matchesOneOf<T>(value: T | undefined, allowed: T | T[]): boolean {
  if (value === undefined) {
    return false;
  }
  const arr = Array.isArray(allowed) ? allowed : [allowed];
  return arr.includes(value);
}

/**
 * Check if a span matches a matcher
 */
export function matchesSpan(matcher: SpanMatcher, span: Span): boolean {
  // Check span type
  if (matcher.spanType !== undefined) {
    if (!matchesOneOf(span.spanType, matcher.spanType)) {
      return false;
    }
  }

  // Check component type
  if (matcher.componentType !== undefined) {
    if (!matchesOneOf(span.componentType, matcher.componentType)) {
      return false;
    }
  }

  // Check span name
  if (matcher.name !== undefined) {
    if (!matchesPattern(span.name, matcher.name)) {
      return false;
    }
  }

  // Check span name with glob
  if (matcher.nameGlob !== undefined) {
    const regex = globToRegex(matcher.nameGlob);
    if (!regex.test(span.name)) {
      return false;
    }
  }

  // Check status
  if (matcher.status !== undefined) {
    if (!matchesOneOf(span.status, matcher.status)) {
      return false;
    }
  }

  // Check tool name
  if (matcher.toolName !== undefined) {
    if (!matchesPattern(span.toolName, matcher.toolName)) {
      return false;
    }
  }

  // Check model
  if (matcher.model !== undefined) {
    if (!matchesPattern(span.model, matcher.model)) {
      return false;
    }
  }

  // Check attributes
  if (matcher.attributes !== undefined) {
    for (const [key, pattern] of Object.entries(matcher.attributes)) {
      const value = span.attributes[key];
      if (!matchesPattern(value, pattern)) {
        return false;
      }
    }
  }

  // Check custom condition
  if (matcher.condition !== undefined) {
    if (!matcher.condition(span)) {
      return false;
    }
  }

  return true;
}

// ============================================================================
// Hit Condition Evaluation
// ============================================================================

/**
 * Evaluate if a breakpoint should fire based on hit condition
 */
export function shouldFire(hitCondition: HitCondition, hitCount: number): boolean {
  if (hitCondition === "always") {
    return true;
  }

  if (typeof hitCondition === "number") {
    return hitCount === hitCondition;
  }

  if ("every" in hitCondition) {
    return hitCount % hitCondition.every === 0;
  }

  if ("after" in hitCondition) {
    return hitCount > hitCondition.after;
  }

  if ("until" in hitCondition) {
    return hitCount <= hitCondition.until;
  }

  return true;
}

// ============================================================================
// Breakpoint Manager
// ============================================================================

/**
 * Manager for registering and evaluating breakpoints
 *
 * @example
 * ```typescript
 * const manager = new BreakpointManager();
 *
 * manager.register(defineBreakpoint({
 *   name: 'tool-errors',
 *   matcher: and(onSpanType('tool'), onError()),
 *   action: { type: 'log' },
 * }));
 *
 * // During trace processing
 * await manager.evaluate(span, trace, 'onExit');
 * ```
 */
export class BreakpointManager {
  private breakpoints: Map<string, Breakpoint> = new Map();
  private hitCounts: Map<string, number> = new Map();
  private captureStore: Map<string, BreakpointContext[]> = new Map();

  /**
   * Register a breakpoint
   */
  register(breakpoint: Breakpoint): void {
    this.breakpoints.set(breakpoint.id, breakpoint);
    this.hitCounts.set(breakpoint.id, 0);
  }

  /**
   * Register multiple breakpoints
   */
  registerAll(breakpoints: Breakpoint[]): void {
    for (const bp of breakpoints) {
      this.register(bp);
    }
  }

  /**
   * Unregister a breakpoint by ID
   */
  unregister(id: string): boolean {
    this.hitCounts.delete(id);
    this.captureStore.delete(id);
    return this.breakpoints.delete(id);
  }

  /**
   * Enable a breakpoint
   */
  enable(id: string): boolean {
    const bp = this.breakpoints.get(id);
    if (bp) {
      bp.enabled = true;
      return true;
    }
    return false;
  }

  /**
   * Disable a breakpoint
   */
  disable(id: string): boolean {
    const bp = this.breakpoints.get(id);
    if (bp) {
      bp.enabled = false;
      return true;
    }
    return false;
  }

  /**
   * Get a breakpoint by ID
   */
  get(id: string): Breakpoint | undefined {
    return this.breakpoints.get(id);
  }

  /**
   * Get all registered breakpoints
   */
  getAll(): Breakpoint[] {
    return Array.from(this.breakpoints.values());
  }

  /**
   * Get enabled breakpoints only
   */
  getEnabled(): Breakpoint[] {
    return this.getAll().filter((bp) => bp.enabled);
  }

  /**
   * Clear all breakpoints
   */
  clear(): void {
    this.breakpoints.clear();
    this.hitCounts.clear();
  }

  /**
   * Reset hit counts for all breakpoints
   */
  resetHitCounts(): void {
    for (const id of this.hitCounts.keys()) {
      this.hitCounts.set(id, 0);
    }
  }

  /**
   * Get hit count for a breakpoint
   */
  getHitCount(id: string): number {
    return this.hitCounts.get(id) ?? 0;
  }

  /**
   * Get captured contexts for a breakpoint
   */
  getCaptured(id: string): BreakpointContext[] {
    return this.captureStore.get(id) ?? [];
  }

  /**
   * Clear captured contexts
   */
  clearCaptured(id?: string): void {
    if (id) {
      this.captureStore.delete(id);
    } else {
      this.captureStore.clear();
    }
  }

  /**
   * Evaluate all breakpoints against a span
   *
   * @returns Array of breakpoints that fired
   */
  async evaluate(
    span: Span,
    trace: Trace,
    trigger: BreakpointTrigger
  ): Promise<Breakpoint[]> {
    const fired: Breakpoint[] = [];

    for (const bp of this.breakpoints.values()) {
      // Skip disabled breakpoints
      if (!bp.enabled) {
        continue;
      }

      // Check if trigger matches
      if (!bp.triggers.includes(trigger)) {
        continue;
      }

      // Check if span matches
      if (!matchesSpan(bp.matcher, span)) {
        continue;
      }

      // Increment hit count
      const hitCount = (this.hitCounts.get(bp.id) ?? 0) + 1;
      this.hitCounts.set(bp.id, hitCount);

      // Check hit condition
      if (!shouldFire(bp.hitCondition, hitCount)) {
        continue;
      }

      // Build context
      const context: BreakpointContext = {
        span,
        trace,
        breakpoint: bp,
        hitCount,
        timestamp: new Date(),
        trigger,
      };

      // Execute action
      await this.executeAction(bp.action, context);

      fired.push(bp);
    }

    return fired;
  }

  /**
   * Execute a breakpoint action
   */
  private async executeAction(
    action: BreakpointAction,
    context: BreakpointContext
  ): Promise<void> {
    switch (action.type) {
      case "log": {
        const message = action.message
          ? this.interpolateMessage(action.message, context)
          : this.defaultLogMessage(context);
        const level = action.level ?? "info";
        console[level](`[Breakpoint ${context.breakpoint.id}] ${message}`);
        break;
      }

      case "notify": {
        await action.handler(context);
        break;
      }

      case "capture": {
        const store = action.store ?? this.captureStore;
        const key = context.breakpoint.id;
        if (!store.has(key)) {
          store.set(key, []);
        }
        store.get(key)!.push(context);
        break;
      }

      case "custom": {
        await action.handler(context);
        break;
      }
    }
  }

  /**
   * Interpolate template variables in a message
   */
  private interpolateMessage(template: string, context: BreakpointContext): string {
    return template
      .replace(/\{\{span\.(\w+)\}\}/g, (_, key) => {
        const value = (context.span as Record<string, unknown>)[key];
        return value !== undefined ? String(value) : "";
      })
      .replace(/\{\{trace\.(\w+)\}\}/g, (_, key) => {
        const value = (context.trace as Record<string, unknown>)[key];
        return value !== undefined ? String(value) : "";
      })
      .replace(/\{\{hitCount\}\}/g, String(context.hitCount))
      .replace(/\{\{trigger\}\}/g, context.trigger);
  }

  /**
   * Generate a default log message
   */
  private defaultLogMessage(context: BreakpointContext): string {
    const parts: string[] = [
      `Span "${context.span.name}"`,
      `type=${context.span.spanType}`,
    ];

    if (context.span.toolName) {
      parts.push(`tool=${context.span.toolName}`);
    }
    if (context.span.model) {
      parts.push(`model=${context.span.model}`);
    }
    if (context.span.status === "error") {
      parts.push(`status=error`);
    }

    return parts.join(", ");
  }
}

// ============================================================================
// Global Manager Instance
// ============================================================================

let globalManager: BreakpointManager | null = null;

/**
 * Get the global breakpoint manager instance
 */
export function getBreakpointManager(): BreakpointManager {
  if (!globalManager) {
    globalManager = new BreakpointManager();
  }
  return globalManager;
}

/**
 * Reset the global breakpoint manager (useful for testing)
 */
export function resetBreakpointManager(): void {
  globalManager = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Register a breakpoint with the global manager
 */
export function registerBreakpoint(breakpoint: Breakpoint): void {
  getBreakpointManager().register(breakpoint);
}

/**
 * Define and register a breakpoint in one step
 */
export function addBreakpoint(config: BreakpointConfig): Breakpoint {
  const bp = defineBreakpoint(config);
  getBreakpointManager().register(bp);
  return bp;
}

/**
 * Remove a breakpoint from the global manager
 */
export function removeBreakpoint(id: string): boolean {
  return getBreakpointManager().unregister(id);
}

/**
 * Evaluate breakpoints against a span tree
 */
export async function evaluateBreakpoints(
  spans: SpanWithChildren[],
  trace: Trace,
  trigger: BreakpointTrigger
): Promise<Map<string, Breakpoint[]>> {
  const manager = getBreakpointManager();
  const results = new Map<string, Breakpoint[]>();

  async function processSpan(span: SpanWithChildren): Promise<void> {
    const fired = await manager.evaluate(span, trace, trigger);
    if (fired.length > 0) {
      results.set(span.spanId, fired);
    }

    // Process children recursively
    for (const child of span.children) {
      await processSpan(child);
    }
  }

  for (const span of spans) {
    await processSpan(span);
  }

  return results;
}
