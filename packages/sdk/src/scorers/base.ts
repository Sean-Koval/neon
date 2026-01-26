/**
 * Base Scorer Types
 *
 * Foundation for defining custom scorers.
 */

import type { TraceWithSpans, ScoreDataType } from "@neon/shared";

/**
 * Evaluation context passed to scorers
 */
export interface EvalContext {
  trace: TraceWithSpans;
  expected?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Score result from a scorer
 */
export interface ScoreResult {
  value: number;
  reason?: string;
}

/**
 * Scorer definition
 */
export interface Scorer<T = unknown> {
  name: string;
  description?: string;
  dataType: ScoreDataType;
  evaluate: (context: EvalContext) => Promise<ScoreResult> | ScoreResult;
}

/**
 * Scorer configuration
 */
export interface ScorerConfig<T = unknown> {
  name: string;
  description?: string;
  dataType?: ScoreDataType;
  evaluate: (context: EvalContext) => Promise<ScoreResult> | ScoreResult;
}

/**
 * Define a custom scorer
 *
 * @example
 * ```typescript
 * const customScorer = defineScorer({
 *   name: 'custom_metric',
 *   dataType: 'numeric',
 *   evaluate: async ({ trace, expected }) => {
 *     const actualTools = trace.spans
 *       .filter(s => s.spanType === 'tool')
 *       .map(s => s.toolName);
 *
 *     const expectedTools = expected?.toolCalls || [];
 *     const matches = actualTools.filter(t => expectedTools.includes(t));
 *     const score = matches.length / Math.max(expectedTools.length, 1);
 *
 *     return {
 *       value: score,
 *       reason: `Matched ${matches.length}/${expectedTools.length} tools`,
 *     };
 *   },
 * });
 * ```
 */
export function defineScorer<T = unknown>(
  config: ScorerConfig<T>
): Scorer<T> {
  return {
    name: config.name,
    description: config.description,
    dataType: config.dataType ?? "numeric",
    evaluate: config.evaluate,
  };
}

/**
 * Combine multiple scorers into one
 */
export function combineScorers(
  name: string,
  scorers: Scorer[],
  aggregation: "avg" | "min" | "max" = "avg"
): Scorer {
  return defineScorer({
    name,
    dataType: "numeric",
    evaluate: async (context) => {
      const results = await Promise.all(
        scorers.map((s) => s.evaluate(context))
      );

      let value: number;
      switch (aggregation) {
        case "avg":
          value =
            results.reduce((sum, r) => sum + r.value, 0) / results.length;
          break;
        case "min":
          value = Math.min(...results.map((r) => r.value));
          break;
        case "max":
          value = Math.max(...results.map((r) => r.value));
          break;
      }

      return {
        value,
        reason: `Combined ${scorers.length} scorers (${aggregation})`,
      };
    },
  });
}

/**
 * Create a scorer that inverts the score (1 - value)
 */
export function invertScorer(scorer: Scorer, name?: string): Scorer {
  return defineScorer({
    name: name ?? `not_${scorer.name}`,
    dataType: scorer.dataType,
    evaluate: async (context) => {
      const result = await scorer.evaluate(context);
      return {
        value: 1 - result.value,
        reason: `Inverted: ${result.reason}`,
      };
    },
  });
}

/**
 * Create a scorer with a threshold
 */
export function withThreshold(
  scorer: Scorer,
  threshold: number,
  name?: string
): Scorer {
  return defineScorer({
    name: name ?? `${scorer.name}_threshold`,
    dataType: "boolean",
    evaluate: async (context) => {
      const result = await scorer.evaluate(context);
      const passed = result.value >= threshold;
      return {
        value: passed ? 1 : 0,
        reason: `${result.value.toFixed(2)} ${passed ? ">=" : "<"} ${threshold}: ${result.reason}`,
      };
    },
  });
}
