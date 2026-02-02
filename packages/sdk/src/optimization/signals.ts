/**
 * Signal Generation
 *
 * Generate reward signals from traces for agent optimization and RLHF.
 * Supports multiple signal types and aggregation from multiple sources.
 */

import type {
  TraceWithSpans,
  SpanWithChildren,
  ComponentType,
  SpanStatus,
} from "@neon/shared";

import type {
  Signal,
  SignalType,
  SignalSource,
  SignalGranularity,
  RewardSignal,
  PreferenceSignal,
  DemonstrationSignal,
  FeedbackSignal,
  MetricSignal,
  EventSignal,
  AnySignal,
  SignalBatch,
  SignalAggregation,
  SignalGeneratorConfig,
  SignalFilter,
  SignalContext,
  SignalGenerationResult,
  DemonstrationAction,
} from "./types.js";

/**
 * Generate a unique signal ID
 */
function generateSignalId(): string {
  return `sig_${crypto.randomUUID()}`;
}

/**
 * Flatten a span tree into a flat array
 */
function flattenSpans(spans: SpanWithChildren[]): SpanWithChildren[] {
  const result: SpanWithChildren[] = [];

  function traverse(span: SpanWithChildren): void {
    result.push(span);
    for (const child of span.children) {
      traverse(child);
    }
  }

  for (const span of spans) {
    traverse(span);
  }

  return result;
}

/**
 * Create a base signal with common fields
 */
function createBaseSignal(
  type: SignalType,
  source: SignalSource,
  granularity: SignalGranularity,
  traceId: string,
  spanId?: string,
  componentType?: ComponentType
): Omit<Signal, "signalType"> {
  return {
    signalId: generateSignalId(),
    source,
    granularity,
    timestamp: new Date(),
    traceId,
    spanId,
    componentType,
    metadata: {},
  };
}

/**
 * Configuration for reward signal generation
 */
export interface RewardSignalConfig extends SignalGeneratorConfig {
  /** Base reward for successful execution (default: 1.0) */
  successReward?: number;
  /** Base penalty for failed execution (default: 0.0) */
  failurePenalty?: number;
  /** Discount factor for intermediate steps (default: 0.99) */
  discountFactor?: number;
  /** Include latency-based rewards */
  includeLatencyReward?: boolean;
  /** Target latency in ms (for latency reward) */
  targetLatencyMs?: number;
  /** Include token efficiency rewards */
  includeTokenEfficiency?: boolean;
  /** Target token budget */
  targetTokens?: number;
}

/**
 * Generate reward signals from a trace
 *
 * Creates reward signals at the configured granularity:
 * - trace: Single reward for the entire trace
 * - span: Rewards for each span
 * - component: Rewards aggregated by component type
 *
 * @example
 * ```typescript
 * const signals = generateRewardSignals(context, {
 *   name: 'task_completion',
 *   granularity: 'trace',
 *   successReward: 1.0,
 *   failurePenalty: -0.5,
 * });
 * ```
 */
export function generateRewardSignals(
  context: SignalContext,
  config: RewardSignalConfig
): RewardSignal[] {
  const {
    granularity,
    successReward = 1.0,
    failurePenalty = 0.0,
    discountFactor = 0.99,
    includeLatencyReward = false,
    targetLatencyMs = 5000,
    includeTokenEfficiency = false,
    targetTokens = 1000,
  } = config;

  const { trace } = context;
  const signals: RewardSignal[] = [];
  const flatSpans = flattenSpans(trace.spans);

  if (granularity === "trace") {
    // Single trace-level reward
    const traceStatus = trace.trace.status;
    const isSuccess = traceStatus === "ok";

    let value = isSuccess ? successReward : failurePenalty;

    // Add latency component
    if (includeLatencyReward) {
      const latencyRatio = Math.min(1, targetLatencyMs / Math.max(1, trace.trace.durationMs));
      value = value * 0.8 + latencyRatio * 0.2;
    }

    // Add token efficiency component
    if (includeTokenEfficiency) {
      const totalTokens = trace.trace.totalInputTokens + trace.trace.totalOutputTokens;
      const tokenRatio = Math.min(1, targetTokens / Math.max(1, totalTokens));
      value = value * 0.8 + tokenRatio * 0.2;
    }

    signals.push({
      ...createBaseSignal("reward", "trace", "trace", trace.trace.traceId),
      signalType: "reward",
      value: Math.max(-1, Math.min(1, value)),
      reason: isSuccess ? "Trace completed successfully" : `Trace failed: ${traceStatus}`,
      terminal: true,
      discount: 1.0,
      metadata: {
        traceStatus,
        durationMs: trace.trace.durationMs,
        totalTokens: trace.trace.totalInputTokens + trace.trace.totalOutputTokens,
      },
    });
  } else if (granularity === "span") {
    // Span-level rewards with discounting
    const sortedSpans = [...flatSpans].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    sortedSpans.forEach((span, index) => {
      const isLast = index === sortedSpans.length - 1;
      const isSuccess = span.status !== "error";
      const discount = Math.pow(discountFactor, sortedSpans.length - 1 - index);

      let value = isSuccess ? successReward : failurePenalty;

      // Apply latency bonus for fast spans
      if (includeLatencyReward && span.durationMs < targetLatencyMs / sortedSpans.length) {
        value += 0.1;
      }

      signals.push({
        ...createBaseSignal("reward", "trace", "span", trace.trace.traceId, span.spanId, span.componentType),
        signalType: "reward",
        value: Math.max(-1, Math.min(1, value * discount)),
        reason: isSuccess ? `Span ${span.name} succeeded` : `Span ${span.name} failed: ${span.statusMessage}`,
        terminal: isLast,
        discount,
        metadata: {
          spanName: span.name,
          spanType: span.spanType,
          componentType: span.componentType,
          status: span.status,
        },
      });
    });
  } else if (granularity === "component") {
    // Component-level aggregated rewards
    const componentSpans = new Map<ComponentType | "untyped", SpanWithChildren[]>();

    for (const span of flatSpans) {
      const compType = span.componentType || "untyped";
      if (!componentSpans.has(compType)) {
        componentSpans.set(compType, []);
      }
      componentSpans.get(compType)!.push(span);
    }

    for (const [compType, spans] of componentSpans) {
      const successCount = spans.filter(s => s.status !== "error").length;
      const successRate = spans.length > 0 ? successCount / spans.length : 0;
      const avgDuration = spans.reduce((sum, s) => sum + s.durationMs, 0) / Math.max(1, spans.length);

      let value = successRate * successReward + (1 - successRate) * failurePenalty;

      signals.push({
        ...createBaseSignal(
          "reward",
          "trace",
          "component",
          trace.trace.traceId,
          undefined,
          compType === "untyped" ? undefined : compType
        ),
        signalType: "reward",
        value: Math.max(-1, Math.min(1, value)),
        reason: `Component ${compType}: ${successCount}/${spans.length} spans succeeded`,
        terminal: false,
        metadata: {
          componentType: compType,
          spanCount: spans.length,
          successCount,
          successRate,
          avgDurationMs: avgDuration,
        },
      });
    }
  }

  return signals;
}

/**
 * Configuration for demonstration signal generation
 */
export interface DemonstrationSignalConfig extends SignalGeneratorConfig {
  /** Mark as expert demonstration (default: true) */
  isExpert?: boolean;
  /** Span types to include (default: ['tool', 'generation']) */
  spanTypes?: string[];
  /** Include state snapshots */
  includeState?: boolean;
}

/**
 * Generate demonstration signals from trace spans
 *
 * Creates demonstration signals for tool calls and generations,
 * suitable for imitation learning.
 *
 * @example
 * ```typescript
 * const demos = generateDemonstrationSignals(context, {
 *   name: 'expert_demos',
 *   granularity: 'span',
 *   isExpert: true,
 *   spanTypes: ['tool', 'generation'],
 * });
 * ```
 */
export function generateDemonstrationSignals(
  context: SignalContext,
  config: DemonstrationSignalConfig
): DemonstrationSignal[] {
  const {
    isExpert = true,
    spanTypes = ["tool", "generation"],
    includeState = false,
  } = config;

  const { trace } = context;
  const signals: DemonstrationSignal[] = [];
  const flatSpans = flattenSpans(trace.spans);

  // Filter to relevant span types
  const demoSpans = flatSpans.filter(span => spanTypes.includes(span.spanType));

  for (const span of demoSpans) {
    let action: DemonstrationAction;

    if (span.spanType === "tool") {
      action = {
        actionType: "tool_call",
        name: span.toolName || span.name,
        input: span.toolInput,
        output: span.toolOutput,
        parameters: span.attributes,
      };
    } else if (span.spanType === "generation") {
      action = {
        actionType: "generation",
        name: span.model || span.name,
        input: span.input,
        output: span.output,
        parameters: span.modelParameters,
      };
    } else {
      action = {
        actionType: "other",
        name: span.name,
        input: span.input,
        output: span.output,
      };
    }

    // Calculate quality based on status and duration
    let quality = span.status === "error" ? 0.0 : 1.0;
    if (span.status === "ok" && span.durationMs < 1000) {
      quality = 1.0;
    } else if (span.status === "ok") {
      quality = Math.max(0.5, 1 - (span.durationMs / 10000));
    }

    signals.push({
      ...createBaseSignal("demonstration", "trace", "span", trace.trace.traceId, span.spanId, span.componentType),
      signalType: "demonstration",
      action,
      stateBefore: includeState ? { timestamp: span.timestamp } : undefined,
      stateAfter: includeState ? { timestamp: span.endTime, status: span.status } : undefined,
      isExpert,
      quality: isExpert ? quality : undefined,
      metadata: {
        spanName: span.name,
        spanType: span.spanType,
        durationMs: span.durationMs,
      },
    });
  }

  return signals;
}

/**
 * Configuration for metric signals
 */
export interface MetricSignalConfig extends SignalGeneratorConfig {
  /** Metrics to extract (default: all available) */
  metrics?: Array<"latency" | "tokens" | "cost" | "tool_calls" | "error_rate">;
}

/**
 * Generate metric signals from trace data
 *
 * Extracts common performance metrics from traces.
 *
 * @example
 * ```typescript
 * const metrics = generateMetricSignals(context, {
 *   name: 'performance_metrics',
 *   granularity: 'trace',
 *   metrics: ['latency', 'tokens', 'error_rate'],
 * });
 * ```
 */
export function generateMetricSignals(
  context: SignalContext,
  config: MetricSignalConfig
): MetricSignal[] {
  const {
    granularity,
    metrics = ["latency", "tokens", "cost", "tool_calls", "error_rate"],
  } = config;

  const { trace } = context;
  const signals: MetricSignal[] = [];
  const flatSpans = flattenSpans(trace.spans);

  if (granularity === "trace" || granularity === "step") {
    if (metrics.includes("latency")) {
      signals.push({
        ...createBaseSignal("metric", "trace", "trace", trace.trace.traceId),
        signalType: "metric",
        name: "latency_ms",
        value: trace.trace.durationMs,
        unit: "ms",
        higherIsBetter: false,
        metadata: {},
      });
    }

    if (metrics.includes("tokens")) {
      const totalTokens = trace.trace.totalInputTokens + trace.trace.totalOutputTokens;
      signals.push({
        ...createBaseSignal("metric", "trace", "trace", trace.trace.traceId),
        signalType: "metric",
        name: "total_tokens",
        value: totalTokens,
        unit: "tokens",
        higherIsBetter: false,
        metadata: {
          inputTokens: trace.trace.totalInputTokens,
          outputTokens: trace.trace.totalOutputTokens,
        },
      });
    }

    if (metrics.includes("cost") && trace.trace.totalCostUsd !== undefined) {
      signals.push({
        ...createBaseSignal("metric", "trace", "trace", trace.trace.traceId),
        signalType: "metric",
        name: "cost_usd",
        value: trace.trace.totalCostUsd,
        unit: "USD",
        higherIsBetter: false,
        metadata: {},
      });
    }

    if (metrics.includes("tool_calls")) {
      signals.push({
        ...createBaseSignal("metric", "trace", "trace", trace.trace.traceId),
        signalType: "metric",
        name: "tool_call_count",
        value: trace.trace.toolCallCount,
        unit: "calls",
        higherIsBetter: false,
        metadata: {},
      });
    }

    if (metrics.includes("error_rate")) {
      const errorSpans = flatSpans.filter(s => s.status === "error").length;
      const errorRate = flatSpans.length > 0 ? errorSpans / flatSpans.length : 0;
      signals.push({
        ...createBaseSignal("metric", "trace", "trace", trace.trace.traceId),
        signalType: "metric",
        name: "error_rate",
        value: errorRate,
        unit: "ratio",
        higherIsBetter: false,
        threshold: 0.1,
        metadata: {
          errorSpans,
          totalSpans: flatSpans.length,
        },
      });
    }
  }

  return signals;
}

/**
 * Configuration for event signals
 */
export interface EventSignalConfig extends SignalGeneratorConfig {
  /** Event types to detect */
  eventTypes?: Array<"error" | "timeout" | "retry" | "fallback" | "tool_error">;
}

/**
 * Generate event signals from trace spans
 *
 * Detects and reports discrete events of interest.
 *
 * @example
 * ```typescript
 * const events = generateEventSignals(context, {
 *   name: 'error_events',
 *   granularity: 'span',
 *   eventTypes: ['error', 'timeout'],
 * });
 * ```
 */
export function generateEventSignals(
  context: SignalContext,
  config: EventSignalConfig
): EventSignal[] {
  const {
    eventTypes = ["error", "timeout", "retry", "fallback", "tool_error"],
  } = config;

  const { trace } = context;
  const signals: EventSignal[] = [];
  const flatSpans = flattenSpans(trace.spans);

  for (const span of flatSpans) {
    // Detect error events
    if (eventTypes.includes("error") && span.status === "error") {
      signals.push({
        ...createBaseSignal("event", "trace", "span", trace.trace.traceId, span.spanId, span.componentType),
        signalType: "event",
        eventName: "span_error",
        severity: "error",
        data: {
          spanName: span.name,
          statusMessage: span.statusMessage,
          spanType: span.spanType,
        },
        metadata: {},
      });
    }

    // Detect tool errors specifically
    if (eventTypes.includes("tool_error") && span.spanType === "tool" && span.status === "error") {
      signals.push({
        ...createBaseSignal("event", "trace", "span", trace.trace.traceId, span.spanId, span.componentType),
        signalType: "event",
        eventName: "tool_error",
        severity: "error",
        data: {
          toolName: span.toolName,
          toolInput: span.toolInput,
          statusMessage: span.statusMessage,
        },
        metadata: {},
      });
    }

    // Detect potential timeouts (long-running spans)
    if (eventTypes.includes("timeout") && span.durationMs > 30000) {
      signals.push({
        ...createBaseSignal("event", "trace", "span", trace.trace.traceId, span.spanId, span.componentType),
        signalType: "event",
        eventName: "potential_timeout",
        severity: "warning",
        data: {
          spanName: span.name,
          durationMs: span.durationMs,
        },
        metadata: {},
      });
    }

    // Detect retry patterns (spans with "retry" in name or attributes)
    if (eventTypes.includes("retry") &&
        (span.name.toLowerCase().includes("retry") ||
         span.attributes["retry.count"] !== undefined)) {
      signals.push({
        ...createBaseSignal("event", "trace", "span", trace.trace.traceId, span.spanId, span.componentType),
        signalType: "event",
        eventName: "retry_detected",
        severity: "info",
        data: {
          spanName: span.name,
          retryCount: span.attributes["retry.count"],
        },
        metadata: {},
      });
    }
  }

  return signals;
}

/**
 * Configuration for preference signal generation
 */
export interface PreferenceSignalConfig {
  /** Name for the preference comparison */
  name: string;
  /** Criteria for comparison (e.g., ['quality', 'efficiency']) */
  criteria?: string[];
}

/**
 * Generate a preference signal from two traces
 *
 * Compares two traces and generates a preference signal indicating
 * which one is better based on the configured criteria.
 *
 * @example
 * ```typescript
 * const pref = generatePreferenceSignal(
 *   contextA,
 *   contextB,
 *   { name: 'quality_comparison', criteria: ['success', 'latency'] }
 * );
 * ```
 */
export function generatePreferenceSignal(
  contextA: SignalContext,
  contextB: SignalContext,
  config: PreferenceSignalConfig
): PreferenceSignal {
  const { criteria = ["success", "latency", "tokens"] } = config;

  const traceA = contextA.trace;
  const traceB = contextB.trace;

  let scoreA = 0;
  let scoreB = 0;
  const reasons: string[] = [];

  // Compare based on success
  if (criteria.includes("success")) {
    if (traceA.trace.status === "ok" && traceB.trace.status !== "ok") {
      scoreA += 2;
      reasons.push("A succeeded while B failed");
    } else if (traceB.trace.status === "ok" && traceA.trace.status !== "ok") {
      scoreB += 2;
      reasons.push("B succeeded while A failed");
    }
  }

  // Compare based on latency
  if (criteria.includes("latency")) {
    if (traceA.trace.durationMs < traceB.trace.durationMs * 0.9) {
      scoreA += 1;
      reasons.push("A was faster");
    } else if (traceB.trace.durationMs < traceA.trace.durationMs * 0.9) {
      scoreB += 1;
      reasons.push("B was faster");
    }
  }

  // Compare based on tokens
  if (criteria.includes("tokens")) {
    const tokensA = traceA.trace.totalInputTokens + traceA.trace.totalOutputTokens;
    const tokensB = traceB.trace.totalInputTokens + traceB.trace.totalOutputTokens;
    if (tokensA < tokensB * 0.9) {
      scoreA += 1;
      reasons.push("A used fewer tokens");
    } else if (tokensB < tokensA * 0.9) {
      scoreB += 1;
      reasons.push("B used fewer tokens");
    }
  }

  // Compare based on cost
  if (criteria.includes("cost") &&
      traceA.trace.totalCostUsd !== undefined &&
      traceB.trace.totalCostUsd !== undefined) {
    if (traceA.trace.totalCostUsd < traceB.trace.totalCostUsd * 0.9) {
      scoreA += 1;
      reasons.push("A was cheaper");
    } else if (traceB.trace.totalCostUsd < traceA.trace.totalCostUsd * 0.9) {
      scoreB += 1;
      reasons.push("B was cheaper");
    }
  }

  const isAPreferred = scoreA >= scoreB;
  const totalScore = scoreA + scoreB;
  const confidence = totalScore > 0 ? Math.abs(scoreA - scoreB) / totalScore : 0.5;

  return {
    ...createBaseSignal("preference", "comparison", "trace", traceA.trace.traceId),
    signalType: "preference",
    preferredId: isAPreferred ? traceA.trace.traceId : traceB.trace.traceId,
    rejectedId: isAPreferred ? traceB.trace.traceId : traceA.trace.traceId,
    confidence: Math.min(1, confidence + 0.5),
    reason: reasons.length > 0 ? reasons.join("; ") : "No significant differences",
    criteria,
    metadata: {
      traceAId: traceA.trace.traceId,
      traceBId: traceB.trace.traceId,
      scoreA,
      scoreB,
    },
  };
}

/**
 * Comprehensive signal generator configuration
 */
export interface ComprehensiveSignalConfig {
  /** Include reward signals */
  includeRewards?: boolean;
  rewardConfig?: Partial<RewardSignalConfig>;
  /** Include demonstration signals */
  includeDemonstrations?: boolean;
  demonstrationConfig?: Partial<DemonstrationSignalConfig>;
  /** Include metric signals */
  includeMetrics?: boolean;
  metricConfig?: Partial<MetricSignalConfig>;
  /** Include event signals */
  includeEvents?: boolean;
  eventConfig?: Partial<EventSignalConfig>;
}

/**
 * Generate comprehensive signals from a trace
 *
 * Generates multiple signal types in a single call for convenience.
 *
 * @example
 * ```typescript
 * const result = generateSignals(context, {
 *   includeRewards: true,
 *   includeMetrics: true,
 *   includeEvents: true,
 *   rewardConfig: {
 *     granularity: 'trace',
 *     successReward: 1.0,
 *   },
 * });
 * ```
 */
export function generateSignals(
  context: SignalContext,
  config: ComprehensiveSignalConfig = {}
): SignalGenerationResult {
  const startTime = Date.now();
  const signals: AnySignal[] = [];
  const warnings: string[] = [];
  const byType: Record<string, number> = {};
  const byGranularity: Record<string, number> = {};

  const {
    includeRewards = true,
    rewardConfig = {},
    includeDemonstrations = false,
    demonstrationConfig = {},
    includeMetrics = true,
    metricConfig = {},
    includeEvents = true,
    eventConfig = {},
  } = config;

  // Generate reward signals
  if (includeRewards) {
    try {
      const rewardSignals = generateRewardSignals(context, {
        name: "reward",
        granularity: "trace",
        ...rewardConfig,
      });
      signals.push(...rewardSignals);
      byType.reward = (byType.reward || 0) + rewardSignals.length;
      for (const sig of rewardSignals) {
        byGranularity[sig.granularity] = (byGranularity[sig.granularity] || 0) + 1;
      }
    } catch (err) {
      warnings.push(`Failed to generate reward signals: ${err}`);
    }
  }

  // Generate demonstration signals
  if (includeDemonstrations) {
    try {
      const demoSignals = generateDemonstrationSignals(context, {
        name: "demonstration",
        granularity: "span",
        ...demonstrationConfig,
      });
      signals.push(...demoSignals);
      byType.demonstration = (byType.demonstration || 0) + demoSignals.length;
      for (const sig of demoSignals) {
        byGranularity[sig.granularity] = (byGranularity[sig.granularity] || 0) + 1;
      }
    } catch (err) {
      warnings.push(`Failed to generate demonstration signals: ${err}`);
    }
  }

  // Generate metric signals
  if (includeMetrics) {
    try {
      const metricSignals = generateMetricSignals(context, {
        name: "metrics",
        granularity: "trace",
        ...metricConfig,
      });
      signals.push(...metricSignals);
      byType.metric = (byType.metric || 0) + metricSignals.length;
      for (const sig of metricSignals) {
        byGranularity[sig.granularity] = (byGranularity[sig.granularity] || 0) + 1;
      }
    } catch (err) {
      warnings.push(`Failed to generate metric signals: ${err}`);
    }
  }

  // Generate event signals
  if (includeEvents) {
    try {
      const eventSignals = generateEventSignals(context, {
        name: "events",
        granularity: "span",
        ...eventConfig,
      });
      signals.push(...eventSignals);
      byType.event = (byType.event || 0) + eventSignals.length;
      for (const sig of eventSignals) {
        byGranularity[sig.granularity] = (byGranularity[sig.granularity] || 0) + 1;
      }
    } catch (err) {
      warnings.push(`Failed to generate event signals: ${err}`);
    }
  }

  return {
    signals,
    warnings,
    stats: {
      totalSignals: signals.length,
      byType,
      byGranularity,
      generationTimeMs: Date.now() - startTime,
    },
  };
}

/**
 * Filter signals based on criteria
 */
export function filterSignals(
  signals: AnySignal[],
  filter: SignalFilter
): AnySignal[] {
  return signals.filter(signal => {
    if (filter.signalTypes && !filter.signalTypes.includes(signal.signalType)) {
      return false;
    }
    if (filter.sources && !filter.sources.includes(signal.source)) {
      return false;
    }
    if (filter.granularities && !filter.granularities.includes(signal.granularity)) {
      return false;
    }
    if (filter.traceIds && !filter.traceIds.includes(signal.traceId)) {
      return false;
    }
    if (filter.timeRange) {
      const timestamp = signal.timestamp.getTime();
      if (filter.timeRange.start && timestamp < filter.timeRange.start.getTime()) {
        return false;
      }
      if (filter.timeRange.end && timestamp > filter.timeRange.end.getTime()) {
        return false;
      }
    }
    // Filter numeric signals by value
    if ((filter.minValue !== undefined || filter.maxValue !== undefined) &&
        "value" in signal && typeof signal.value === "number") {
      if (filter.minValue !== undefined && signal.value < filter.minValue) {
        return false;
      }
      if (filter.maxValue !== undefined && signal.value > filter.maxValue) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Aggregate signals by type
 */
export function aggregateSignals(signals: AnySignal[]): SignalAggregation[] {
  const grouped = new Map<SignalType, AnySignal[]>();

  for (const signal of signals) {
    if (!grouped.has(signal.signalType)) {
      grouped.set(signal.signalType, []);
    }
    grouped.get(signal.signalType)!.push(signal);
  }

  const aggregations: SignalAggregation[] = [];

  for (const [signalType, typeSignals] of grouped) {
    const bySource: Record<SignalSource, number> = {} as Record<SignalSource, number>;
    const byGranularity: Record<SignalGranularity, number> = {} as Record<SignalGranularity, number>;

    let timestamps: number[] = [];
    let values: number[] = [];

    for (const signal of typeSignals) {
      bySource[signal.source] = (bySource[signal.source] || 0) + 1;
      byGranularity[signal.granularity] = (byGranularity[signal.granularity] || 0) + 1;
      timestamps.push(signal.timestamp.getTime());

      if ("value" in signal && typeof signal.value === "number") {
        values.push(signal.value);
      }
    }

    let mean: number | undefined;
    let stdDev: number | undefined;
    let min: number | undefined;
    let max: number | undefined;

    if (values.length > 0) {
      mean = values.reduce((a, b) => a + b, 0) / values.length;
      min = Math.min(...values);
      max = Math.max(...values);

      if (values.length > 1) {
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean!, 2), 0) / values.length;
        stdDev = Math.sqrt(variance);
      }
    }

    aggregations.push({
      signalType,
      count: typeSignals.length,
      mean,
      stdDev,
      min,
      max,
      bySource,
      byGranularity,
      timeRange: {
        start: new Date(Math.min(...timestamps)),
        end: new Date(Math.max(...timestamps)),
      },
    });
  }

  return aggregations;
}

/**
 * Create a signal batch from multiple signals
 */
export function createSignalBatch(
  projectId: string,
  signals: AnySignal[],
  source: string = "sdk"
): SignalBatch {
  return {
    batchId: `batch_${crypto.randomUUID()}`,
    projectId,
    signals,
    createdAt: new Date(),
    source,
  };
}

/**
 * Convert signals to training format for RLHF
 *
 * Formats signals into a structure suitable for reinforcement learning
 * from human feedback (RLHF) training.
 */
export function toRLHFFormat(signals: AnySignal[]): Array<{
  type: string;
  traceId: string;
  data: Record<string, unknown>;
}> {
  return signals.map(signal => {
    const base = {
      type: signal.signalType,
      traceId: signal.traceId,
      data: {} as Record<string, unknown>,
    };

    switch (signal.signalType) {
      case "reward":
        base.data = {
          reward: (signal as RewardSignal).value,
          terminal: (signal as RewardSignal).terminal,
          reason: (signal as RewardSignal).reason,
        };
        break;
      case "preference":
        base.data = {
          chosen: (signal as PreferenceSignal).preferredId,
          rejected: (signal as PreferenceSignal).rejectedId,
          confidence: (signal as PreferenceSignal).confidence,
        };
        break;
      case "demonstration":
        const demo = signal as DemonstrationSignal;
        base.data = {
          action: demo.action,
          isExpert: demo.isExpert,
          quality: demo.quality,
        };
        break;
      case "metric":
        const metric = signal as MetricSignal;
        base.data = {
          name: metric.name,
          value: metric.value,
          unit: metric.unit,
        };
        break;
      default:
        base.data = signal.metadata;
    }

    return base;
  });
}
