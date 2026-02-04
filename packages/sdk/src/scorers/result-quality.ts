/**
 * Result Quality Scorers
 *
 * Evaluates the quality of skill/tool execution results.
 * Supports relevance scoring, output format validation, completeness checks,
 * and semantic similarity assessment.
 *
 * @example
 * ```typescript
 * // Basic result quality
 * resultQualityScorer({
 *   minRelevance: 0.7,
 *   expectedOutputType: 'json',
 * })
 *
 * // With patterns and completeness
 * resultQualityScorer({
 *   expectedPatterns: ['status', 'data'],
 *   requiredFields: ['id', 'name'],
 *   minContentLength: 100,
 * })
 * ```
 */

import type { SpanWithChildren } from "@neon/shared";
import { defineScorer, type Scorer, type EvalContext } from "./base.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Expected output type
 */
export type OutputType = 'text' | 'json' | 'array' | 'object' | 'number' | 'boolean' | 'any';

/**
 * Configuration for result quality scorer
 */
export interface ResultQualityConfig {
  /** Minimum relevance score (0-1) based on pattern matching */
  minRelevance?: number;
  /** Expected output type */
  expectedOutputType?: OutputType;
  /** Expected patterns in output (strings or regex) */
  expectedPatterns?: (string | RegExp)[];
  /** Required fields for object outputs */
  requiredFields?: string[];
  /** Minimum content length */
  minContentLength?: number;
  /** Maximum content length */
  maxContentLength?: number;
  /** Forbidden patterns (should NOT appear in output) */
  forbiddenPatterns?: (string | RegExp)[];
  /** Weight for each check type */
  weights?: {
    typeCheck?: number;
    patternMatch?: number;
    completeness?: number;
    length?: number;
  };
  /** Whether to extract from skill context */
  useSkillContext?: boolean;
}

/**
 * Detailed result quality analysis
 */
export interface ResultQualityDetails {
  typeValid: boolean;
  actualType: string;
  patternMatches: number;
  totalPatterns: number;
  forbiddenMatches: string[];
  requiredFieldsPresent: number;
  totalRequiredFields: number;
  contentLength: number;
  lengthValid: boolean;
  relevanceScore: number;
}

// =============================================================================
// Main Scorer
// =============================================================================

/**
 * Score the quality of skill/tool execution results
 *
 * @example
 * ```typescript
 * // Check output type and patterns
 * const scorer = resultQualityScorer({
 *   expectedOutputType: 'json',
 *   expectedPatterns: ['success', 'data'],
 *   minRelevance: 0.7,
 * });
 *
 * // Check completeness of object results
 * const scorer = resultQualityScorer({
 *   expectedOutputType: 'object',
 *   requiredFields: ['id', 'status', 'result'],
 *   forbiddenPatterns: ['error', 'failed'],
 * });
 *
 * // Check content length for text results
 * const scorer = resultQualityScorer({
 *   expectedOutputType: 'text',
 *   minContentLength: 50,
 *   maxContentLength: 5000,
 * });
 * ```
 */
export function resultQualityScorer(config?: ResultQualityConfig): Scorer {
  const {
    minRelevance = 0.5,
    expectedOutputType = 'any',
    expectedPatterns = [],
    requiredFields = [],
    minContentLength = 0,
    maxContentLength = Infinity,
    forbiddenPatterns = [],
    weights = {},
    useSkillContext = true,
  } = config ?? {};

  const defaultWeights = {
    typeCheck: 0.2,
    patternMatch: 0.3,
    completeness: 0.3,
    length: 0.2,
  };

  const w = { ...defaultWeights, ...weights };
  const totalWeight = w.typeCheck + w.patternMatch + w.completeness + w.length;

  return defineScorer({
    name: "result_quality",
    description: "Evaluates quality of skill/tool execution results",
    dataType: "numeric",
    evaluate: (context: EvalContext) => {
      // Extract results from tool spans
      const toolSpans = context.trace.spans.filter(
        (s: SpanWithChildren) => s.spanType === "tool"
      );

      if (toolSpans.length === 0) {
        return {
          value: 0.5,
          reason: "No tool spans found to evaluate results",
        };
      }

      // Get expected patterns from context if available
      const contextPatterns = context.expected?.resultPatterns as (string | RegExp)[] | undefined;
      const allPatterns = [...expectedPatterns, ...(contextPatterns ?? [])];

      // Aggregate scores across all tool spans
      let totalScore = 0;
      const allDetails: string[] = [];

      for (const span of toolSpans) {
        const output = extractOutput(span, useSkillContext);
        const details = analyzeResultQuality({
          output,
          expectedOutputType,
          expectedPatterns: allPatterns,
          requiredFields,
          minContentLength,
          maxContentLength,
          forbiddenPatterns,
        });

        const score = calculateResultScore(details, w, totalWeight, minRelevance);
        totalScore += score;
        allDetails.push(formatResultDetails(span.toolName ?? 'unknown', details));
      }

      const avgScore = totalScore / toolSpans.length;

      return {
        value: Math.min(1, Math.max(0, avgScore)),
        reason: allDetails.join('; '),
      };
    },
  });
}

// =============================================================================
// Specialized Scorers
// =============================================================================

/**
 * Score output type correctness
 */
export function outputTypeScorer(expectedType: OutputType): Scorer {
  return defineScorer({
    name: "output_type",
    description: `Validates output is of type: ${expectedType}`,
    dataType: "numeric",
    evaluate: (context: EvalContext) => {
      const toolSpans = context.trace.spans.filter(
        (s: SpanWithChildren) => s.spanType === "tool"
      );

      if (toolSpans.length === 0) {
        return { value: 0.5, reason: "No tool spans found" };
      }

      let validCount = 0;
      const errors: string[] = [];

      for (const span of toolSpans) {
        const output = extractOutput(span, true);
        const actualType = getOutputType(output);

        if (typesMatch(actualType, expectedType)) {
          validCount++;
        } else {
          errors.push(`${span.toolName}: expected ${expectedType}, got ${actualType}`);
        }
      }

      const score = validCount / toolSpans.length;
      return {
        value: score,
        reason: errors.length > 0 ? errors.join(', ') : 'All outputs correct type',
      };
    },
  });
}

/**
 * Score pattern presence in output
 */
export function outputPatternScorer(patterns: (string | RegExp)[]): Scorer {
  return defineScorer({
    name: "output_patterns",
    description: "Checks for expected patterns in output",
    dataType: "numeric",
    evaluate: (context: EvalContext) => {
      const toolSpans = context.trace.spans.filter(
        (s: SpanWithChildren) => s.spanType === "tool"
      );

      if (toolSpans.length === 0) {
        return { value: 0.5, reason: "No tool spans found" };
      }

      let totalMatches = 0;
      const totalPatterns = patterns.length * toolSpans.length;
      const missing: string[] = [];

      for (const span of toolSpans) {
        const output = extractOutput(span, true);
        const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

        for (const pattern of patterns) {
          const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
          if (regex.test(outputStr)) {
            totalMatches++;
          } else {
            missing.push(typeof pattern === 'string' ? pattern : pattern.source);
          }
        }
      }

      const score = totalPatterns > 0 ? totalMatches / totalPatterns : 1;
      return {
        value: score,
        reason:
          missing.length > 0
            ? `Missing patterns: ${missing.slice(0, 3).join(', ')}`
            : 'All patterns found',
      };
    },
  });
}

/**
 * Score output completeness (required fields)
 */
export function outputCompletenessScorer(requiredFields: string[]): Scorer {
  return defineScorer({
    name: "output_completeness",
    description: "Checks if output contains all required fields",
    dataType: "numeric",
    evaluate: (context: EvalContext) => {
      const toolSpans = context.trace.spans.filter(
        (s: SpanWithChildren) => s.spanType === "tool"
      );

      if (toolSpans.length === 0) {
        return { value: 0.5, reason: "No tool spans found" };
      }

      let totalPresent = 0;
      const totalRequired = requiredFields.length * toolSpans.length;
      const missing: string[] = [];

      for (const span of toolSpans) {
        const output = extractOutput(span, true);

        if (typeof output !== 'object' || output === null) {
          missing.push(...requiredFields.map((f) => `${span.toolName}:${f}`));
          continue;
        }

        for (const field of requiredFields) {
          if (hasField(output as Record<string, unknown>, field)) {
            totalPresent++;
          } else {
            missing.push(`${span.toolName}:${field}`);
          }
        }
      }

      const score = totalRequired > 0 ? totalPresent / totalRequired : 1;
      return {
        value: score,
        reason:
          missing.length > 0
            ? `Missing: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '...' : ''}`
            : 'All required fields present',
      };
    },
  });
}

/**
 * Score output length appropriateness
 */
export function outputLengthScorer(options: {
  minLength?: number;
  maxLength?: number;
  optimalLength?: number;
}): Scorer {
  const { minLength = 0, maxLength = Infinity, optimalLength } = options;

  return defineScorer({
    name: "output_length",
    description: "Evaluates output length appropriateness",
    dataType: "numeric",
    evaluate: (context: EvalContext) => {
      const toolSpans = context.trace.spans.filter(
        (s: SpanWithChildren) => s.spanType === "tool"
      );

      if (toolSpans.length === 0) {
        return { value: 0.5, reason: "No tool spans found" };
      }

      let totalScore = 0;
      const details: string[] = [];

      for (const span of toolSpans) {
        const output = extractOutput(span, true);
        const length = getOutputLength(output);

        let score = 1;
        if (length < minLength) {
          score = length / minLength;
          details.push(`${span.toolName}: too short (${length} < ${minLength})`);
        } else if (length > maxLength) {
          score = maxLength / length;
          details.push(`${span.toolName}: too long (${length} > ${maxLength})`);
        } else if (optimalLength !== undefined) {
          // Score based on distance from optimal
          const distance = Math.abs(length - optimalLength);
          const maxDistance = Math.max(optimalLength - minLength, maxLength - optimalLength);
          score = 1 - distance / maxDistance;
        }

        totalScore += score;
      }

      const avgScore = totalScore / toolSpans.length;
      return {
        value: Math.max(0, avgScore),
        reason: details.length > 0 ? details.join(', ') : 'All output lengths appropriate',
      };
    },
  });
}

/**
 * Score absence of forbidden patterns
 */
export function noForbiddenPatternsScorer(
  forbiddenPatterns: (string | RegExp)[]
): Scorer {
  return defineScorer({
    name: "no_forbidden_patterns",
    description: "Ensures forbidden patterns are not present",
    dataType: "numeric",
    evaluate: (context: EvalContext) => {
      const toolSpans = context.trace.spans.filter(
        (s: SpanWithChildren) => s.spanType === "tool"
      );

      if (toolSpans.length === 0) {
        return { value: 0.5, reason: "No tool spans found" };
      }

      let violations = 0;
      const found: string[] = [];

      for (const span of toolSpans) {
        const output = extractOutput(span, true);
        const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

        for (const pattern of forbiddenPatterns) {
          const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
          if (regex.test(outputStr)) {
            violations++;
            found.push(typeof pattern === 'string' ? pattern : pattern.source);
          }
        }
      }

      const score = violations === 0 ? 1 : Math.max(0, 1 - violations * 0.2);
      return {
        value: score,
        reason:
          found.length > 0
            ? `Found forbidden: ${found.slice(0, 3).join(', ')}`
            : 'No forbidden patterns found',
      };
    },
  });
}

/**
 * Score result success status
 */
export function resultSuccessScorer(): Scorer {
  return defineScorer({
    name: "result_success",
    description: "Checks if tool executions succeeded",
    dataType: "numeric",
    evaluate: (context: EvalContext) => {
      const toolSpans = context.trace.spans.filter(
        (s: SpanWithChildren) => s.spanType === "tool"
      );

      if (toolSpans.length === 0) {
        return { value: 0.5, reason: "No tool spans found" };
      }

      const successCount = toolSpans.filter((s: SpanWithChildren) => s.status === 'ok').length;
      const failedSpans = toolSpans
        .filter((s: SpanWithChildren) => s.status !== 'ok')
        .map((s: SpanWithChildren) => s.toolName ?? 'unknown');

      const score = successCount / toolSpans.length;
      return {
        value: score,
        reason:
          failedSpans.length > 0
            ? `Failed: ${failedSpans.join(', ')}`
            : 'All tools succeeded',
      };
    },
  });
}

/**
 * Score result latency
 */
export function resultLatencyScorer(options: {
  maxLatencyMs: number;
  targetLatencyMs?: number;
}): Scorer {
  const { maxLatencyMs, targetLatencyMs } = options;

  return defineScorer({
    name: "result_latency",
    description: `Evaluates result latency (max: ${maxLatencyMs}ms)`,
    dataType: "numeric",
    evaluate: (context: EvalContext) => {
      const toolSpans = context.trace.spans.filter(
        (s: SpanWithChildren) => s.spanType === "tool"
      );

      if (toolSpans.length === 0) {
        return { value: 0.5, reason: "No tool spans found" };
      }

      let totalScore = 0;
      const slowSpans: string[] = [];

      for (const span of toolSpans) {
        const latency = span.durationMs;

        if (latency <= (targetLatencyMs ?? maxLatencyMs * 0.5)) {
          totalScore += 1;
        } else if (latency <= maxLatencyMs) {
          const ratio = (maxLatencyMs - latency) / (maxLatencyMs - (targetLatencyMs ?? maxLatencyMs * 0.5));
          totalScore += Math.max(0.5, ratio);
        } else {
          totalScore += Math.max(0, 0.5 - (latency - maxLatencyMs) / maxLatencyMs);
          slowSpans.push(`${span.toolName}: ${latency}ms`);
        }
      }

      const avgScore = totalScore / toolSpans.length;
      return {
        value: Math.max(0, avgScore),
        reason:
          slowSpans.length > 0
            ? `Slow: ${slowSpans.join(', ')}`
            : 'All latencies acceptable',
      };
    },
  });
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract output from a span
 */
function extractOutput(
  span: SpanWithChildren,
  useSkillContext: boolean
): unknown {
  // Try skill context first
  if (useSkillContext) {
    const skillOutput = (span as SpanWithChildren & {
      skillOutput?: unknown;
    }).skillOutput;
    if (skillOutput !== undefined) {
      return skillOutput;
    }
  }

  // Try toolOutput
  if (span.toolOutput) {
    try {
      return JSON.parse(span.toolOutput);
    } catch {
      return span.toolOutput;
    }
  }

  // Try output field
  if (span.output) {
    try {
      return JSON.parse(span.output);
    } catch {
      return span.output;
    }
  }

  return null;
}

/**
 * Get the type of an output
 */
function getOutputType(output: unknown): OutputType {
  if (output === null || output === undefined) return 'any';
  if (typeof output === 'string') return 'text';
  if (typeof output === 'number') return 'number';
  if (typeof output === 'boolean') return 'boolean';
  if (Array.isArray(output)) return 'array';
  if (typeof output === 'object') return 'object';
  return 'any';
}

/**
 * Check if actual type matches expected type
 */
function typesMatch(actual: OutputType, expected: OutputType): boolean {
  if (expected === 'any') return true;
  if (expected === 'json') return actual === 'object' || actual === 'array';
  return actual === expected;
}

/**
 * Check if object has a field (supports nested paths)
 */
function hasField(obj: Record<string, unknown>, field: string): boolean {
  const parts = field.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (typeof current !== 'object' || current === null) return false;
    current = (current as Record<string, unknown>)[part];
    if (current === undefined) return false;
  }

  return true;
}

/**
 * Get the length of an output
 */
function getOutputLength(output: unknown): number {
  if (typeof output === 'string') return output.length;
  if (Array.isArray(output)) return output.length;
  if (typeof output === 'object' && output !== null) {
    return JSON.stringify(output).length;
  }
  return 0;
}

/**
 * Analyze result quality
 */
function analyzeResultQuality(config: {
  output: unknown;
  expectedOutputType: OutputType;
  expectedPatterns: (string | RegExp)[];
  requiredFields: string[];
  minContentLength: number;
  maxContentLength: number;
  forbiddenPatterns: (string | RegExp)[];
}): ResultQualityDetails {
  const {
    output,
    expectedOutputType,
    expectedPatterns,
    requiredFields,
    minContentLength,
    maxContentLength,
    forbiddenPatterns,
  } = config;

  const actualType = getOutputType(output);
  const typeValid = typesMatch(actualType, expectedOutputType);

  const outputStr = typeof output === 'string' ? output : JSON.stringify(output ?? '');

  // Pattern matching
  let patternMatches = 0;
  for (const pattern of expectedPatterns) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
    if (regex.test(outputStr)) {
      patternMatches++;
    }
  }

  // Forbidden patterns
  const forbiddenMatches: string[] = [];
  for (const pattern of forbiddenPatterns) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
    if (regex.test(outputStr)) {
      forbiddenMatches.push(typeof pattern === 'string' ? pattern : pattern.source);
    }
  }

  // Required fields
  let requiredFieldsPresent = 0;
  if (typeof output === 'object' && output !== null) {
    for (const field of requiredFields) {
      if (hasField(output as Record<string, unknown>, field)) {
        requiredFieldsPresent++;
      }
    }
  }

  // Content length
  const contentLength = getOutputLength(output);
  const lengthValid = contentLength >= minContentLength && contentLength <= maxContentLength;

  // Calculate relevance score
  const relevanceScore = calculateRelevanceScore(
    patternMatches,
    expectedPatterns.length,
    forbiddenMatches.length,
    requiredFieldsPresent,
    requiredFields.length
  );

  return {
    typeValid,
    actualType,
    patternMatches,
    totalPatterns: expectedPatterns.length,
    forbiddenMatches,
    requiredFieldsPresent,
    totalRequiredFields: requiredFields.length,
    contentLength,
    lengthValid,
    relevanceScore,
  };
}

/**
 * Calculate relevance score
 */
function calculateRelevanceScore(
  patternMatches: number,
  totalPatterns: number,
  forbiddenCount: number,
  fieldsPresent: number,
  totalFields: number
): number {
  let score = 1;

  if (totalPatterns > 0) {
    score *= patternMatches / totalPatterns;
  }

  if (totalFields > 0) {
    score *= fieldsPresent / totalFields;
  }

  // Penalize forbidden patterns
  score *= Math.max(0, 1 - forbiddenCount * 0.2);

  return score;
}

/**
 * Calculate result score from details
 */
function calculateResultScore(
  details: ResultQualityDetails,
  weights: { typeCheck: number; patternMatch: number; completeness: number; length: number },
  totalWeight: number,
  minRelevance: number
): number {
  let score = 0;

  // Type check score
  score += (details.typeValid ? 1 : 0) * weights.typeCheck;

  // Pattern match score
  if (details.totalPatterns > 0) {
    const patternScore = details.patternMatches / details.totalPatterns;
    // Penalize forbidden patterns
    const forbiddenPenalty = details.forbiddenMatches.length * 0.2;
    score += Math.max(0, patternScore - forbiddenPenalty) * weights.patternMatch;
  } else {
    score += (details.forbiddenMatches.length === 0 ? 1 : 0.5) * weights.patternMatch;
  }

  // Completeness score
  if (details.totalRequiredFields > 0) {
    score += (details.requiredFieldsPresent / details.totalRequiredFields) * weights.completeness;
  } else {
    score += weights.completeness;
  }

  // Length score
  score += (details.lengthValid ? 1 : 0.5) * weights.length;

  // Normalize
  const normalizedScore = score / totalWeight;

  // Check against minimum relevance
  if (details.relevanceScore < minRelevance) {
    return normalizedScore * (details.relevanceScore / minRelevance);
  }

  return normalizedScore;
}

/**
 * Format details for reason string
 */
function formatResultDetails(
  toolName: string,
  details: ResultQualityDetails
): string {
  const parts: string[] = [];

  if (!details.typeValid) {
    parts.push(`type: ${details.actualType}`);
  }

  if (details.totalPatterns > 0) {
    parts.push(`patterns: ${details.patternMatches}/${details.totalPatterns}`);
  }

  if (details.forbiddenMatches.length > 0) {
    parts.push(`forbidden: ${details.forbiddenMatches.length}`);
  }

  if (details.totalRequiredFields > 0) {
    parts.push(`fields: ${details.requiredFieldsPresent}/${details.totalRequiredFields}`);
  }

  if (!details.lengthValid) {
    parts.push(`length: ${details.contentLength}`);
  }

  return parts.length > 0
    ? `${toolName}: ${parts.join(', ')}`
    : `${toolName}: quality OK`;
}
