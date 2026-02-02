/**
 * Causal Failure Analysis Scorer
 *
 * Analyzes trace spans to identify causal chains in failed executions.
 * Traces error propagation paths and identifies root cause components.
 *
 * Example: "The retrieval returned irrelevant docs → agent hallucinated → tool call failed"
 */

import type { SpanWithChildren, ComponentType } from "@neon/shared";
import { defineScorer, type Scorer, type EvalContext, type ScoreResult } from "./base.js";

/**
 * Represents a node in the causal failure chain
 */
export interface CausalNode {
  spanId: string;
  spanName: string;
  componentType: ComponentType | undefined;
  spanType: string;
  statusMessage: string | undefined;
  depth: number;
}

/**
 * Result of causal analysis
 */
export interface CausalAnalysisResult {
  /** Whether the trace had any errors */
  hasErrors: boolean;
  /** The identified root cause span */
  rootCause: CausalNode | null;
  /** The full causal chain from root cause to final failure */
  causalChain: CausalNode[];
  /** Human-readable explanation of the failure */
  explanation: string;
  /** Number of error spans in the trace */
  errorCount: number;
  /** Total spans analyzed */
  totalSpans: number;
}

/**
 * Configuration for causal analysis scorer
 */
export interface CausalAnalysisConfig {
  /** Custom name for the scorer */
  name?: string;
  /** Description of the scorer */
  description?: string;
  /** Weight given to root cause identification (0-1). Default: 0.5 */
  rootCauseWeight?: number;
  /** Weight given to chain completeness (0-1). Default: 0.3 */
  chainCompletenessWeight?: number;
  /** Weight given to overall error rate (0-1). Default: 0.2 */
  errorRateWeight?: number;
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
 * Build a map from spanId to span for quick lookup
 */
function buildSpanMap(spans: SpanWithChildren[]): Map<string, SpanWithChildren> {
  const map = new Map<string, SpanWithChildren>();
  const flat = flattenSpans(spans);
  for (const span of flat) {
    map.set(span.spanId, span);
  }
  return map;
}

/**
 * Find all error spans in the trace
 */
function findErrorSpans(spans: SpanWithChildren[]): SpanWithChildren[] {
  return flattenSpans(spans).filter((span) => span.status === "error");
}

/**
 * Check if a span has any failed children (recursively)
 */
function hasFailedDescendants(span: SpanWithChildren): boolean {
  for (const child of span.children) {
    if (child.status === "error" || hasFailedDescendants(child)) {
      return true;
    }
  }
  return false;
}

/**
 * Find the root cause span - the earliest error that doesn't have a failed parent
 */
function findRootCause(
  errorSpans: SpanWithChildren[],
  spanMap: Map<string, SpanWithChildren>
): SpanWithChildren | null {
  if (errorSpans.length === 0) {
    return null;
  }

  // Sort by timestamp to find earliest errors
  const sortedErrors = [...errorSpans].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Find errors that don't have a failed parent (true root causes)
  const rootCauses = sortedErrors.filter((span) => {
    if (!span.parentSpanId) {
      return true; // Root span with error is a root cause
    }
    const parent = spanMap.get(span.parentSpanId);
    // If parent exists and is not an error, this could be the root cause
    return !parent || parent.status !== "error";
  });

  // Return the earliest root cause, or earliest error if no clear root cause
  return rootCauses[0] || sortedErrors[0];
}

/**
 * Build the causal chain from root cause to downstream failures
 */
function buildCausalChain(
  rootCause: SpanWithChildren,
  errorSpans: SpanWithChildren[],
  spanMap: Map<string, SpanWithChildren>
): CausalNode[] {
  const chain: CausalNode[] = [];
  const visited = new Set<string>();

  // Start with root cause
  function addToChain(span: SpanWithChildren, depth: number): void {
    if (visited.has(span.spanId)) {
      return;
    }
    visited.add(span.spanId);

    chain.push({
      spanId: span.spanId,
      spanName: span.name,
      componentType: span.componentType,
      spanType: span.spanType,
      statusMessage: span.statusMessage,
      depth,
    });

    // Find failed children and add them
    const failedChildren = span.children.filter(
      (child: SpanWithChildren) => child.status === "error"
    );
    for (const child of failedChildren) {
      addToChain(child, depth + 1);
    }
  }

  addToChain(rootCause, 0);

  // Sort by depth to show causality order
  return chain.sort((a, b) => a.depth - b.depth);
}

/**
 * Generate a human-readable component label
 */
function getComponentLabel(node: CausalNode): string {
  if (node.componentType && node.componentType !== "other") {
    return node.componentType;
  }
  if (node.spanType !== "span") {
    return node.spanType;
  }
  return node.spanName;
}

/**
 * Generate human-readable explanation of the causal chain
 */
function generateExplanation(result: CausalAnalysisResult): string {
  if (!result.hasErrors) {
    return "No errors detected in trace";
  }

  if (!result.rootCause) {
    return "Errors detected but root cause could not be determined";
  }

  if (result.causalChain.length === 1) {
    const root = result.rootCause;
    const label = getComponentLabel(root);
    const message = root.statusMessage ? `: ${root.statusMessage}` : "";
    return `Single point of failure in ${label}${message}`;
  }

  // Build chain description: "retrieval failed → reasoning failed → tool call failed"
  const chainDescription = result.causalChain
    .map((node) => {
      const label = getComponentLabel(node);
      const status = node.statusMessage ? ` (${node.statusMessage})` : " failed";
      return `${label}${status}`;
    })
    .join(" → ");

  return `Causal chain: ${chainDescription}`;
}

/**
 * Perform causal analysis on a trace
 */
export function analyzeCausality(context: EvalContext): CausalAnalysisResult {
  const { spans } = context.trace;
  const flatSpans = flattenSpans(spans);
  const spanMap = buildSpanMap(spans);
  const errorSpans = findErrorSpans(spans);

  if (errorSpans.length === 0) {
    return {
      hasErrors: false,
      rootCause: null,
      causalChain: [],
      explanation: "No errors detected in trace",
      errorCount: 0,
      totalSpans: flatSpans.length,
    };
  }

  const rootCauseSpan = findRootCause(errorSpans, spanMap);
  let causalChain: CausalNode[] = [];
  let rootCause: CausalNode | null = null;

  if (rootCauseSpan) {
    causalChain = buildCausalChain(rootCauseSpan, errorSpans, spanMap);
    rootCause = causalChain[0] || null;
  }

  const result: CausalAnalysisResult = {
    hasErrors: true,
    rootCause,
    causalChain,
    explanation: "", // Will be filled below
    errorCount: errorSpans.length,
    totalSpans: flatSpans.length,
  };

  result.explanation = generateExplanation(result);

  return result;
}

/**
 * Create a causal failure analysis scorer
 *
 * This scorer analyzes error propagation in traces to:
 * 1. Identify the root cause of failures
 * 2. Build causal chains showing error propagation
 * 3. Provide human-readable explanations
 *
 * @example
 * ```typescript
 * // Basic usage
 * const scorer = causalAnalysisScorer();
 *
 * // With custom weights
 * const customScorer = causalAnalysisScorer({
 *   rootCauseWeight: 0.6,
 *   chainCompletenessWeight: 0.3,
 *   errorRateWeight: 0.1,
 * });
 * ```
 *
 * Score interpretation:
 * - 1.0: No errors in trace (perfect execution)
 * - 0.7-0.9: Errors present but clear root cause identified
 * - 0.4-0.6: Errors with partial causal chain
 * - 0.0-0.3: Many errors, unclear causality
 */
export function causalAnalysisScorer(config?: CausalAnalysisConfig): Scorer {
  const {
    name = "causal_analysis",
    description = "Analyzes error propagation and identifies root cause",
    rootCauseWeight = 0.5,
    chainCompletenessWeight = 0.3,
    errorRateWeight = 0.2,
  } = config || {};

  return defineScorer({
    name,
    description,
    dataType: "numeric",
    evaluate: (context: EvalContext): ScoreResult => {
      const analysis = analyzeCausality(context);

      // Perfect score if no errors
      if (!analysis.hasErrors) {
        return {
          value: 1.0,
          reason: analysis.explanation,
        };
      }

      // Calculate component scores
      const errorRate = analysis.totalSpans > 0
        ? 1 - (analysis.errorCount / analysis.totalSpans)
        : 0;

      const rootCauseScore = analysis.rootCause ? 1.0 : 0.0;

      // Chain completeness: how well can we trace the error propagation
      // Higher score if causal chain covers most error spans
      const chainCompleteness = analysis.errorCount > 0
        ? Math.min(1.0, analysis.causalChain.length / analysis.errorCount)
        : 0;

      // Weighted combination
      const value =
        rootCauseWeight * rootCauseScore +
        chainCompletenessWeight * chainCompleteness +
        errorRateWeight * errorRate;

      // Clamp to 0-1 range
      const clampedValue = Math.min(1, Math.max(0, value));

      return {
        value: clampedValue,
        reason: analysis.explanation,
      };
    },
  });
}

/**
 * Get detailed causal analysis for a trace
 *
 * Use this when you need the full analysis result, not just a score.
 *
 * @example
 * ```typescript
 * const scorer = causalAnalysisDetailedScorer();
 * const result = scorer.evaluate(context);
 * // result.reason contains JSON with full CausalAnalysisResult
 * ```
 */
export function causalAnalysisDetailedScorer(config?: Omit<CausalAnalysisConfig, "name">): Scorer {
  const {
    description = "Detailed causal analysis with full chain information",
    rootCauseWeight = 0.5,
    chainCompletenessWeight = 0.3,
    errorRateWeight = 0.2,
  } = config || {};

  return defineScorer({
    name: "causal_analysis_detailed",
    description,
    dataType: "numeric",
    evaluate: (context: EvalContext): ScoreResult => {
      const analysis = analyzeCausality(context);

      // Calculate score same as basic scorer
      if (!analysis.hasErrors) {
        return {
          value: 1.0,
          reason: JSON.stringify(analysis, null, 2),
        };
      }

      const errorRate = analysis.totalSpans > 0
        ? 1 - (analysis.errorCount / analysis.totalSpans)
        : 0;

      const rootCauseScore = analysis.rootCause ? 1.0 : 0.0;

      const chainCompleteness = analysis.errorCount > 0
        ? Math.min(1.0, analysis.causalChain.length / analysis.errorCount)
        : 0;

      const value =
        rootCauseWeight * rootCauseScore +
        chainCompletenessWeight * chainCompleteness +
        errorRateWeight * errorRate;

      const clampedValue = Math.min(1, Math.max(0, value));

      return {
        value: clampedValue,
        reason: JSON.stringify(analysis, null, 2),
      };
    },
  });
}

/**
 * Scorer that only checks if root cause can be identified
 *
 * Returns 1 if root cause is identified, 0 otherwise.
 */
export function rootCauseScorer(): Scorer {
  return defineScorer({
    name: "root_cause_identified",
    description: "Checks if root cause of failure can be identified",
    dataType: "boolean",
    evaluate: (context: EvalContext): ScoreResult => {
      const analysis = analyzeCausality(context);

      if (!analysis.hasErrors) {
        return {
          value: 1.0,
          reason: "No errors to analyze",
        };
      }

      if (analysis.rootCause) {
        const label = getComponentLabel(analysis.rootCause);
        return {
          value: 1.0,
          reason: `Root cause identified: ${label}`,
        };
      }

      return {
        value: 0.0,
        reason: "Could not identify root cause",
      };
    },
  });
}
