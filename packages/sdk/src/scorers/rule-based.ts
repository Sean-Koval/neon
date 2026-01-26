/**
 * Rule-Based Scorers
 *
 * Deterministic scorers that don't require LLM calls.
 */

import { defineScorer, type Scorer, type EvalContext } from "./base";

/**
 * Rule-based scorer configuration
 */
export interface RuleBasedConfig {
  /** Check function that returns a score (0-1) or boolean */
  check: (context: EvalContext) => boolean | number;
  /** Optional threshold for boolean to score conversion */
  threshold?: number;
  /** Name for the scorer */
  name?: string;
  /** Description of what the scorer checks */
  description?: string;
}

/**
 * Create a rule-based scorer
 *
 * @example
 * ```typescript
 * const toolUsedScorer = ruleBasedScorer({
 *   check: (ctx) => ctx.trace.spans.some(s => s.spanType === 'tool'),
 *   name: 'tool_used',
 * });
 * ```
 */
export function ruleBasedScorer(config: RuleBasedConfig): Scorer {
  return defineScorer({
    name: config.name ?? "rule_based",
    description: config.description,
    dataType: "numeric",
    evaluate: (context: EvalContext) => {
      const result = config.check(context);
      const value = typeof result === "boolean" ? (result ? 1 : 0) : result;

      return {
        value: Math.min(1, Math.max(0, value)),
        reason: `Rule check returned ${value}`,
      };
    },
  });
}

// ==================== Built-in Rule-Based Scorers ====================

/**
 * Check if expected tools were called
 */
export function toolSelectionScorer(expectedTools?: string[]): Scorer {
  return ruleBasedScorer({
    name: "tool_selection",
    description: "Checks if the expected tools were called",
    check: (context) => {
      const actualTools = context.trace.spans
        .filter((s) => s.spanType === "tool")
        .map((s) => s.toolName);

      const expected = expectedTools || (context.expected?.toolCalls as string[]) || [];

      if (expected.length === 0) {
        return actualTools.length > 0 ? 1 : 0.5;
      }

      const matches = expected.filter((t) => actualTools.includes(t));
      return matches.length / expected.length;
    },
  });
}

/**
 * Check if output contains expected strings
 */
export function containsScorer(expected?: string[]): Scorer {
  return ruleBasedScorer({
    name: "contains",
    description: "Checks if output contains expected strings",
    check: (context) => {
      const output = getLastOutput(context);
      const strings = expected || (context.expected?.outputContains as string[]) || [];

      if (strings.length === 0) return 1;

      const matches = strings.filter((s) =>
        output.toLowerCase().includes(s.toLowerCase())
      );
      return matches.length / strings.length;
    },
  });
}

/**
 * Check for exact output match
 */
export function exactMatchScorer(expected?: string): Scorer {
  return ruleBasedScorer({
    name: "exact_match",
    description: "Checks for exact output match",
    check: (context) => {
      const output = getLastOutput(context);
      const expectedOutput = expected || (context.expected?.output as string);

      if (!expectedOutput) return 1;

      return output.trim() === expectedOutput.trim() ? 1 : 0;
    },
  });
}

/**
 * Check if output matches JSON structure
 */
export function jsonMatchScorer(expected?: object): Scorer {
  return ruleBasedScorer({
    name: "json_match",
    description: "Checks if output matches expected JSON structure",
    check: (context) => {
      const output = getLastOutput(context);
      const expectedObj = expected || context.expected;

      try {
        const parsed = JSON.parse(output);
        return deepMatch(parsed, expectedObj) ? 1 : 0;
      } catch {
        return 0;
      }
    },
  });
}

/**
 * Score based on latency
 */
export function latencyScorer(thresholds?: {
  excellent?: number;
  good?: number;
  acceptable?: number;
}): Scorer {
  const { excellent = 1000, good = 5000, acceptable = 10000 } =
    thresholds || {};

  return ruleBasedScorer({
    name: "latency",
    description: "Scores based on execution latency",
    check: (context) => {
      const duration = context.trace.trace.durationMs;

      if (duration <= excellent) return 1.0;
      if (duration <= good) return 0.8;
      if (duration <= acceptable) return 0.6;
      return 0.4;
    },
  });
}

/**
 * Score based on error rate
 */
export function errorRateScorer(): Scorer {
  return ruleBasedScorer({
    name: "error_rate",
    description: "Scores based on span error rate",
    check: (context) => {
      const spans = context.trace.spans;
      if (spans.length === 0) return 1;

      const errors = spans.filter((s) => s.status === "error").length;
      return 1 - errors / spans.length;
    },
  });
}

/**
 * Score based on token efficiency
 */
export function tokenEfficiencyScorer(thresholds?: {
  excellent?: number;
  good?: number;
  acceptable?: number;
}): Scorer {
  const { excellent = 1000, good = 5000, acceptable = 10000 } =
    thresholds || {};

  return ruleBasedScorer({
    name: "token_efficiency",
    description: "Scores based on total token usage",
    check: (context) => {
      const totalTokens = context.trace.spans
        .filter((s) => s.spanType === "generation")
        .reduce((sum, s) => sum + (s.totalTokens || 0), 0);

      if (totalTokens <= excellent) return 1.0;
      if (totalTokens <= good) return 0.8;
      if (totalTokens <= acceptable) return 0.6;
      return 0.4;
    },
  });
}

/**
 * Check if trace completed successfully
 */
export function successScorer(): Scorer {
  return ruleBasedScorer({
    name: "success",
    description: "Checks if trace completed successfully",
    check: (context) => {
      return context.trace.trace.status === "ok" ? 1 : 0;
    },
  });
}

/**
 * Score based on iteration count
 */
export function iterationScorer(maxIterations: number = 10): Scorer {
  return ruleBasedScorer({
    name: "iterations",
    description: "Scores based on number of iterations",
    check: (context) => {
      // Count generation spans as proxy for iterations
      const iterations = context.trace.spans.filter(
        (s) => s.spanType === "generation"
      ).length;

      if (iterations <= 1) return 1.0;
      if (iterations <= 3) return 0.9;
      if (iterations <= 5) return 0.7;
      if (iterations <= maxIterations) return 0.5;
      return 0.3;
    },
  });
}

// ==================== Utility Functions ====================

/**
 * Get the last output from the trace
 */
function getLastOutput(context: EvalContext): string {
  const generations = context.trace.spans.filter(
    (s) => s.spanType === "generation"
  );
  const lastGen = generations[generations.length - 1];
  return lastGen?.output || "";
}

/**
 * Deep match two objects
 */
function deepMatch(actual: unknown, expected: unknown): boolean {
  if (expected === undefined) return true;
  if (typeof expected !== typeof actual) return false;

  if (typeof expected === "object" && expected !== null) {
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual)) return false;
      return expected.every((item, i) => deepMatch(actual[i], item));
    }

    for (const key of Object.keys(expected)) {
      if (
        !deepMatch(
          (actual as Record<string, unknown>)[key],
          (expected as Record<string, unknown>)[key]
        )
      ) {
        return false;
      }
    }
    return true;
  }

  return actual === expected;
}
