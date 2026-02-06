/**
 * Parameter Accuracy Scorers
 *
 * Evaluates how accurately an agent selects and populates skill parameters.
 * Supports type checking, range validation, pattern matching, and semantic similarity.
 *
 * @example
 * ```typescript
 * // Basic parameter accuracy
 * parameterAccuracyScorer({
 *   schema: {
 *     query: { type: 'string', required: true },
 *     limit: { type: 'number', min: 1, max: 100 },
 *   },
 * })
 *
 * // With expected values
 * parameterAccuracyScorer({
 *   expectedValues: {
 *     query: 'search term',
 *     limit: 10,
 *   },
 * })
 * ```
 */

import type { SpanWithChildren } from "@neon/shared";
import { defineScorer, type Scorer, type EvalContext } from "./base.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Parameter type definition
 */
export type ParameterType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'any';

/**
 * Parameter schema for validation
 */
export interface ParameterSchemaItem {
  /** Expected type */
  type: ParameterType;
  /** Whether the parameter is required */
  required?: boolean;
  /** Minimum value (for numbers) or length (for strings/arrays) */
  min?: number;
  /** Maximum value (for numbers) or length (for strings/arrays) */
  max?: number;
  /** Regex pattern (for strings) */
  pattern?: string;
  /** Allowed values */
  enum?: unknown[];
  /** Default value */
  default?: unknown;
  /** Nested schema for objects */
  properties?: Record<string, ParameterSchemaItem>;
  /** Item schema for arrays */
  items?: ParameterSchemaItem;
}

/**
 * Configuration for parameter accuracy scorer
 */
export interface ParameterAccuracyConfig {
  /** Parameter schema for type/constraint validation */
  schema?: Record<string, ParameterSchemaItem>;
  /** Expected parameter values for exact matching */
  expectedValues?: Record<string, unknown>;
  /** Expected parameter patterns for regex matching */
  expectedPatterns?: Record<string, string | RegExp>;
  /** Weight for each type of check (default: equal weights) */
  weights?: {
    typeCheck?: number;
    constraintCheck?: number;
    valueMatch?: number;
    patternMatch?: number;
  };
  /** Whether to penalize extra parameters not in schema */
  penalizeExtraParams?: boolean;
  /** Penalty per extra parameter (0-1) */
  extraParamPenalty?: number;
  /** Whether to extract parameters from skill context */
  useSkillContext?: boolean;
}

/**
 * Detailed result of parameter accuracy check
 */
export interface ParameterAccuracyDetails {
  totalParams: number;
  validParams: number;
  invalidParams: string[];
  typeErrors: string[];
  constraintErrors: string[];
  missingRequired: string[];
  extraParams: string[];
  valueMatches: number;
  patternMatches: number;
}

// =============================================================================
// Main Scorer
// =============================================================================

/**
 * Score parameter accuracy for skill/tool invocations
 *
 * @example
 * ```typescript
 * // Validate against schema
 * const scorer = parameterAccuracyScorer({
 *   schema: {
 *     file: { type: 'string', required: true, pattern: '\\.ts$' },
 *     line: { type: 'number', min: 1 },
 *     content: { type: 'string', required: true },
 *   },
 * });
 *
 * // Match expected values
 * const scorer = parameterAccuracyScorer({
 *   expectedValues: {
 *     action: 'search',
 *     query: 'typescript best practices',
 *   },
 * });
 *
 * // Combined validation
 * const scorer = parameterAccuracyScorer({
 *   schema: {
 *     query: { type: 'string', required: true },
 *   },
 *   expectedPatterns: {
 *     query: /typescript|javascript/i,
 *   },
 * });
 * ```
 */
export function parameterAccuracyScorer(config?: ParameterAccuracyConfig): Scorer {
  const {
    schema = {},
    expectedValues = {},
    expectedPatterns = {},
    weights = {},
    penalizeExtraParams = false,
    extraParamPenalty = 0.1,
    useSkillContext = true,
  } = config ?? {};

  const defaultWeights = {
    typeCheck: 0.3,
    constraintCheck: 0.2,
    valueMatch: 0.3,
    patternMatch: 0.2,
  };

  const w = { ...defaultWeights, ...weights };
  const totalWeight = w.typeCheck + w.constraintCheck + w.valueMatch + w.patternMatch;

  return defineScorer({
    name: "parameter_accuracy",
    description: "Evaluates accuracy of skill/tool parameter selection",
    dataType: "numeric",
    evaluate: (context: EvalContext) => {
      // Extract actual parameters from tool spans
      const toolSpans = context.trace.spans.filter(
        (s: SpanWithChildren) => s.spanType === "tool"
      );

      if (toolSpans.length === 0) {
        return {
          value: 0.5,
          reason: "No tool spans found to evaluate parameters",
        };
      }

      // Aggregate scores across all tool spans
      let totalScore = 0;
      const allDetails: string[] = [];

      for (const span of toolSpans) {
        const params = extractParameters(span, useSkillContext);
        const expectedFromContext = context.expected?.parameters as Record<string, unknown> | undefined;
        const mergedExpectedValues = { ...expectedValues, ...expectedFromContext };
        const expectedValueCount = Object.keys(mergedExpectedValues).length;
        const expectedPatternCount = Object.keys(expectedPatterns).length;

        const details = validateParameters({
          actual: params,
          schema,
          expectedValues: mergedExpectedValues,
          expectedPatterns,
          penalizeExtraParams,
          extraParamPenalty,
        });

        const score = calculateParameterScore(details, w, totalWeight, expectedValueCount, expectedPatternCount);
        totalScore += score;
        allDetails.push(formatDetails(span.toolName ?? 'unknown', details));
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
 * Score only parameter types
 */
export function parameterTypeScorer(schema: Record<string, ParameterSchemaItem>): Scorer {
  return defineScorer({
    name: "parameter_types",
    description: "Validates parameter types against schema",
    dataType: "numeric",
    evaluate: (context: EvalContext) => {
      const toolSpans = context.trace.spans.filter(
        (s: SpanWithChildren) => s.spanType === "tool"
      );

      if (toolSpans.length === 0) {
        return { value: 0.5, reason: "No tool spans found" };
      }

      let validCount = 0;
      let totalCount = 0;
      const errors: string[] = [];

      for (const span of toolSpans) {
        const params = extractParameters(span, true);

        for (const [key, schemaItem] of Object.entries(schema)) {
          totalCount++;
          const actual = params[key];

          if (actual === undefined) {
            if (schemaItem.required) {
              errors.push(`${key}: missing required`);
            } else {
              validCount++; // Optional and missing is valid
            }
          } else if (checkType(actual, schemaItem.type)) {
            validCount++;
          } else {
            errors.push(`${key}: expected ${schemaItem.type}, got ${typeof actual}`);
          }
        }
      }

      const score = totalCount > 0 ? validCount / totalCount : 1;
      return {
        value: score,
        reason: errors.length > 0 ? errors.join(', ') : 'All types valid',
      };
    },
  });
}

/**
 * Score parameter completeness (required fields)
 */
export function parameterCompletenessScorer(
  requiredParams: string[]
): Scorer {
  return defineScorer({
    name: "parameter_completeness",
    description: "Checks if all required parameters are present",
    dataType: "numeric",
    evaluate: (context: EvalContext) => {
      const toolSpans = context.trace.spans.filter(
        (s: SpanWithChildren) => s.spanType === "tool"
      );

      if (toolSpans.length === 0) {
        return { value: 0.5, reason: "No tool spans found" };
      }

      let totalPresent = 0;
      let totalRequired = 0;
      const missing: string[] = [];

      for (const span of toolSpans) {
        const params = extractParameters(span, true);

        for (const param of requiredParams) {
          totalRequired++;
          if (params[param] !== undefined && params[param] !== null) {
            totalPresent++;
          } else {
            missing.push(`${span.toolName}:${param}`);
          }
        }
      }

      const score = totalRequired > 0 ? totalPresent / totalRequired : 1;
      return {
        value: score,
        reason:
          missing.length > 0
            ? `Missing: ${missing.join(', ')}`
            : 'All required parameters present',
      };
    },
  });
}

/**
 * Score parameter value matching against expected values
 */
export function parameterValueMatchScorer(
  expectedValues: Record<string, unknown>,
  options?: { fuzzyMatch?: boolean; ignoreCase?: boolean }
): Scorer {
  const { fuzzyMatch = false, ignoreCase = false } = options ?? {};

  return defineScorer({
    name: "parameter_value_match",
    description: "Checks if parameter values match expected values",
    dataType: "numeric",
    evaluate: (context: EvalContext) => {
      const toolSpans = context.trace.spans.filter(
        (s: SpanWithChildren) => s.spanType === "tool"
      );

      if (toolSpans.length === 0) {
        return { value: 0.5, reason: "No tool spans found" };
      }

      let matches = 0;
      let total = Object.keys(expectedValues).length * toolSpans.length;
      const mismatches: string[] = [];

      for (const span of toolSpans) {
        const params = extractParameters(span, true);

        for (const [key, expectedVal] of Object.entries(expectedValues)) {
          const actualVal = params[key];

          if (valuesMatch(actualVal, expectedVal, { fuzzyMatch, ignoreCase })) {
            matches++;
          } else {
            mismatches.push(`${key}: ${JSON.stringify(actualVal)} !== ${JSON.stringify(expectedVal)}`);
          }
        }
      }

      const score = total > 0 ? matches / total : 1;
      return {
        value: score,
        reason:
          mismatches.length > 0
            ? `Mismatches: ${mismatches.slice(0, 3).join(', ')}${mismatches.length > 3 ? '...' : ''}`
            : 'All values match',
      };
    },
  });
}

/**
 * Score parameter value constraints (min, max, pattern, enum)
 */
export function parameterConstraintScorer(
  constraints: Record<string, { min?: number; max?: number; pattern?: string; enum?: unknown[] }>
): Scorer {
  return defineScorer({
    name: "parameter_constraints",
    description: "Validates parameter values against constraints",
    dataType: "numeric",
    evaluate: (context: EvalContext) => {
      const toolSpans = context.trace.spans.filter(
        (s: SpanWithChildren) => s.spanType === "tool"
      );

      if (toolSpans.length === 0) {
        return { value: 0.5, reason: "No tool spans found" };
      }

      let valid = 0;
      let total = 0;
      const violations: string[] = [];

      for (const span of toolSpans) {
        const params = extractParameters(span, true);

        for (const [key, constraint] of Object.entries(constraints)) {
          const val = params[key];
          if (val === undefined) continue;

          total++;
          const errors = checkConstraints(val, constraint);

          if (errors.length === 0) {
            valid++;
          } else {
            violations.push(`${key}: ${errors.join(', ')}`);
          }
        }
      }

      const score = total > 0 ? valid / total : 1;
      return {
        value: score,
        reason:
          violations.length > 0
            ? violations.join('; ')
            : 'All constraints satisfied',
      };
    },
  });
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract parameters from a span
 */
function extractParameters(
  span: SpanWithChildren,
  useSkillContext: boolean
): Record<string, unknown> {
  // Try skill context first
  if (useSkillContext) {
    const skillSelection = (span as SpanWithChildren & {
      skillSelection?: { parameters?: Record<string, unknown> }
    }).skillSelection;
    if (skillSelection?.parameters) {
      return skillSelection.parameters;
    }
  }

  // Try toolInput
  if (span.toolInput) {
    try {
      return JSON.parse(span.toolInput);
    } catch {
      return {};
    }
  }

  return {};
}

/**
 * Check if a value matches the expected type
 */
function checkType(value: unknown, expectedType: ParameterType): boolean {
  if (expectedType === 'any') return true;

  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      return false;
  }
}

/**
 * Check value against constraints
 */
function checkConstraints(
  value: unknown,
  constraint: { min?: number; max?: number; pattern?: string; enum?: unknown[] }
): string[] {
  const errors: string[] = [];

  if (constraint.min !== undefined) {
    const numVal = typeof value === 'number' ? value :
                   typeof value === 'string' ? value.length :
                   Array.isArray(value) ? value.length : 0;
    if (numVal < constraint.min) {
      errors.push(`below min ${constraint.min}`);
    }
  }

  if (constraint.max !== undefined) {
    const numVal = typeof value === 'number' ? value :
                   typeof value === 'string' ? value.length :
                   Array.isArray(value) ? value.length : Infinity;
    if (numVal > constraint.max) {
      errors.push(`above max ${constraint.max}`);
    }
  }

  if (constraint.pattern) {
    const strVal = typeof value === 'string' ? value : JSON.stringify(value);
    if (!new RegExp(constraint.pattern).test(strVal)) {
      errors.push(`pattern mismatch`);
    }
  }

  if (constraint.enum && !constraint.enum.includes(value)) {
    errors.push(`not in enum [${constraint.enum.join(', ')}]`);
  }

  return errors;
}

/**
 * Check if two values match
 */
function valuesMatch(
  actual: unknown,
  expected: unknown,
  options: { fuzzyMatch?: boolean; ignoreCase?: boolean }
): boolean {
  if (actual === expected) return true;

  // Handle regex expected values
  if (expected instanceof RegExp) {
    const strVal = typeof actual === 'string' ? actual : JSON.stringify(actual);
    return expected.test(strVal);
  }

  // String comparison with options
  if (typeof actual === 'string' && typeof expected === 'string') {
    let a = actual;
    let e = expected;

    if (options.ignoreCase) {
      a = a.toLowerCase();
      e = e.toLowerCase();
    }

    if (options.fuzzyMatch) {
      // Simple fuzzy match: contains or Levenshtein distance
      return a.includes(e) || e.includes(a);
    }

    return a === e;
  }

  // Deep equality for objects/arrays
  if (typeof actual === 'object' && typeof expected === 'object') {
    return JSON.stringify(actual) === JSON.stringify(expected);
  }

  return false;
}

/**
 * Validate parameters and return detailed results
 */
function validateParameters(config: {
  actual: Record<string, unknown>;
  schema: Record<string, ParameterSchemaItem>;
  expectedValues: Record<string, unknown>;
  expectedPatterns: Record<string, string | RegExp>;
  penalizeExtraParams: boolean;
  extraParamPenalty: number;
}): ParameterAccuracyDetails {
  const {
    actual,
    schema,
    expectedValues,
    expectedPatterns,
    penalizeExtraParams,
  } = config;

  const details: ParameterAccuracyDetails = {
    totalParams: 0,
    validParams: 0,
    invalidParams: [],
    typeErrors: [],
    constraintErrors: [],
    missingRequired: [],
    extraParams: [],
    valueMatches: 0,
    patternMatches: 0,
  };

  const schemaKeys = new Set(Object.keys(schema));
  const actualKeys = Object.keys(actual);

  // Check schema validation
  for (const [key, schemaItem] of Object.entries(schema)) {
    details.totalParams++;
    const val = actual[key];

    if (val === undefined) {
      if (schemaItem.required) {
        details.missingRequired.push(key);
        details.invalidParams.push(key);
      } else {
        details.validParams++;
      }
      continue;
    }

    // Type check
    if (!checkType(val, schemaItem.type)) {
      details.typeErrors.push(`${key}: expected ${schemaItem.type}`);
      details.invalidParams.push(key);
      continue;
    }

    // Constraint check
    const constraintErrors = checkConstraints(val, {
      min: schemaItem.min,
      max: schemaItem.max,
      pattern: schemaItem.pattern,
      enum: schemaItem.enum,
    });

    if (constraintErrors.length > 0) {
      details.constraintErrors.push(`${key}: ${constraintErrors.join(', ')}`);
      details.invalidParams.push(key);
      continue;
    }

    details.validParams++;
  }

  // Check expected values
  for (const [key, expectedVal] of Object.entries(expectedValues)) {
    if (valuesMatch(actual[key], expectedVal, {})) {
      details.valueMatches++;
    }
  }

  // Check expected patterns
  for (const [key, pattern] of Object.entries(expectedPatterns)) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    const val = actual[key];
    const strVal = typeof val === 'string' ? val : JSON.stringify(val);
    if (regex.test(strVal)) {
      details.patternMatches++;
    }
  }

  // Check extra params
  if (penalizeExtraParams) {
    for (const key of actualKeys) {
      if (!schemaKeys.has(key)) {
        details.extraParams.push(key);
      }
    }
  }

  return details;
}

/**
 * Calculate parameter accuracy score from details
 */
function calculateParameterScore(
  details: ParameterAccuracyDetails,
  weights: { typeCheck: number; constraintCheck: number; valueMatch: number; patternMatch: number },
  totalWeight: number,
  expectedValueCount: number,
  expectedPatternCount: number
): number {
  let score = 0;

  // Type/constraint score (combined)
  if (details.totalParams > 0) {
    const schemaScore = details.validParams / details.totalParams;
    score += schemaScore * (weights.typeCheck + weights.constraintCheck);
  } else {
    score += weights.typeCheck + weights.constraintCheck; // No schema = full credit
  }

  // Value match score - calculate ratio of matched to expected
  if (expectedValueCount > 0) {
    const valueMatchRatio = details.valueMatches / expectedValueCount;
    score += valueMatchRatio * weights.valueMatch;
  } else {
    score += weights.valueMatch; // No expected values = full credit
  }

  // Pattern match score - calculate ratio of matched to expected
  if (expectedPatternCount > 0) {
    const patternMatchRatio = details.patternMatches / expectedPatternCount;
    score += patternMatchRatio * weights.patternMatch;
  } else {
    score += weights.patternMatch; // No expected patterns = full credit
  }

  // Normalize
  return score / totalWeight;
}

/**
 * Format details for reason string
 */
function formatDetails(toolName: string, details: ParameterAccuracyDetails): string {
  const parts: string[] = [];

  if (details.validParams > 0 || details.totalParams > 0) {
    parts.push(`${toolName}: ${details.validParams}/${details.totalParams} valid`);
  }

  if (details.missingRequired.length > 0) {
    parts.push(`missing: [${details.missingRequired.join(', ')}]`);
  }

  if (details.typeErrors.length > 0) {
    parts.push(`type errors: [${details.typeErrors.slice(0, 2).join(', ')}]`);
  }

  return parts.join(', ') || `${toolName}: all parameters valid`;
}
