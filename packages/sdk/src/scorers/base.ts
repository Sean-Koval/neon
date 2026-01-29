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

