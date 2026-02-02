/**
 * Rule-Based Scorers
 *
 * Deterministic scorers that don't require LLM calls.
 */

import type { SpanWithChildren } from "@neon/shared";
import { defineScorer, type Scorer, type EvalContext } from "./base.js";

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
        .filter((s: SpanWithChildren) => s.spanType === "tool")
        .map((s: SpanWithChildren) => s.toolName);

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
 * Configuration for contains scorer
 */
export interface ContainsConfig {
  /** Strings to check for (case-insensitive by default) */
  expected?: string | string[];
  /** Whether to use case-sensitive matching (default: false) */
  caseSensitive?: boolean;
  /** Require all strings to match (AND) vs any string (OR). Default: true (AND) */
  matchAll?: boolean;
}

/**
 * Check if output contains expected string(s)
 *
 * @example
 * ```typescript
 * // Simple usage
 * contains('hello')
 * contains(['hello', 'world'])
 *
 * // With options
 * contains({ expected: ['error', 'warning'], matchAll: false })
 * contains({ expected: 'SUCCESS', caseSensitive: true })
 * ```
 */
export function contains(config?: string | string[] | ContainsConfig): Scorer {
  // Normalize config
  const normalizedConfig: ContainsConfig =
    typeof config === "string"
      ? { expected: [config] }
      : Array.isArray(config)
        ? { expected: config }
        : config ?? {};

  const { expected, caseSensitive = false, matchAll = true } = normalizedConfig;

  return defineScorer({
    name: "contains",
    description: "Checks if output contains expected string(s)",
    dataType: "numeric",
    evaluate: (context: EvalContext) => {
      const output = getLastOutput(context);

      // Get expected strings from config or context
      const rawExpected = expected ?? (context.expected?.outputContains as string | string[]);
      const strings = normalizeToArray(rawExpected);

      // Handle edge cases
      if (strings.length === 0) {
        return { value: 1, reason: "No expected strings specified" };
      }

      if (output === "") {
        return { value: 0, reason: "Output is empty" };
      }

      const normalizedOutput = caseSensitive ? output : output.toLowerCase();
      const matches = strings.filter((s) => {
        if (s === null || s === undefined) return false;
        const normalizedSearch = caseSensitive ? String(s) : String(s).toLowerCase();
        return normalizedOutput.includes(normalizedSearch);
      });

      const matchCount = matches.length;
      const total = strings.length;

      if (matchAll) {
        // AND mode: score is ratio of matches
        const value = matchCount / total;
        const reason =
          value === 1
            ? `All ${total} expected string(s) found`
            : `Found ${matchCount}/${total} expected strings: missing [${strings.filter((s) => !matches.includes(s)).join(", ")}]`;
        return { value, reason };
      } else {
        // OR mode: 1 if any match, 0 otherwise
        const value = matchCount > 0 ? 1 : 0;
        const reason =
          value === 1
            ? `Found matching string: "${matches[0]}"`
            : `None of the expected strings found: [${strings.join(", ")}]`;
        return { value, reason };
      }
    },
  });
}

/**
 * @deprecated Use `contains()` instead for cleaner API
 */
export function containsScorer(expected?: string[]): Scorer {
  return contains(expected);
}

/**
 * Configuration for exact match scorer
 */
export interface ExactMatchConfig {
  /** Expected output string */
  expected?: string;
  /** Whether to trim whitespace before comparison (default: true) */
  trim?: boolean;
  /** Whether to normalize whitespace (collapse multiple spaces/newlines) (default: false) */
  normalizeWhitespace?: boolean;
  /** Whether to use case-sensitive matching (default: true) */
  caseSensitive?: boolean;
}

/**
 * Check for exact output match
 *
 * @example
 * ```typescript
 * // Simple usage - expects exact string
 * exactMatch('hello world')
 *
 * // With options
 * exactMatch({ expected: 'Hello World', caseSensitive: false })
 * exactMatch({ expected: 'result', normalizeWhitespace: true })
 * ```
 */
export function exactMatch(config?: string | ExactMatchConfig): Scorer {
  // Normalize config
  const normalizedConfig: ExactMatchConfig =
    typeof config === "string" ? { expected: config } : config ?? {};

  const {
    expected,
    trim = true,
    normalizeWhitespace = false,
    caseSensitive = true,
  } = normalizedConfig;

  return defineScorer({
    name: "exact_match",
    description: "Checks for exact output match",
    dataType: "numeric",
    evaluate: (context: EvalContext) => {
      const rawOutput = getLastOutput(context);
      const rawExpected = expected ?? (context.expected?.output as string);

      // Handle null/undefined expected
      if (rawExpected === null || rawExpected === undefined) {
        return { value: 1, reason: "No expected output specified" };
      }

      // Handle null/undefined output
      if (rawOutput === null || rawOutput === undefined) {
        return { value: 0, reason: "Output is null or undefined" };
      }

      // Normalize strings
      let output = String(rawOutput);
      let expectedStr = String(rawExpected);

      if (trim) {
        output = output.trim();
        expectedStr = expectedStr.trim();
      }

      if (normalizeWhitespace) {
        output = output.replace(/\s+/g, " ");
        expectedStr = expectedStr.replace(/\s+/g, " ");
      }

      if (!caseSensitive) {
        output = output.toLowerCase();
        expectedStr = expectedStr.toLowerCase();
      }

      const matches = output === expectedStr;

      if (matches) {
        return { value: 1, reason: "Output matches expected exactly" };
      }

      // Provide helpful diff info for debugging
      const outputPreview = output.length > 50 ? `${output.slice(0, 50)}...` : output;
      const expectedPreview =
        expectedStr.length > 50 ? `${expectedStr.slice(0, 50)}...` : expectedStr;

      return {
        value: 0,
        reason: `Output "${outputPreview}" does not match expected "${expectedPreview}"`,
      };
    },
  });
}

/**
 * @deprecated Use `exactMatch()` instead for cleaner API
 */
export function exactMatchScorer(expected?: string): Scorer {
  return exactMatch(expected);
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

      const errors = spans.filter((s: SpanWithChildren) => s.status === "error").length;
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
        .filter((s: SpanWithChildren) => s.spanType === "generation")
        .reduce((sum: number, s: SpanWithChildren) => sum + (s.totalTokens || 0), 0);

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
        (s: SpanWithChildren) => s.spanType === "generation"
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
    (s: SpanWithChildren) => s.spanType === "generation"
  );
  const lastGen = generations[generations.length - 1];
  return lastGen?.output || "";
}

/**
 * Normalize a value to an array
 */
function normalizeToArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
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
