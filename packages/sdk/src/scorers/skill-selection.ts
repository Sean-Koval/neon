/**
 * Skill Selection Scorer
 *
 * Evaluates whether the correct tool/skill was selected for a given task.
 * Supports expected tool chains, ordering requirements, and partial credit
 * for correct category but wrong specific tool.
 */

import type { SpanWithChildren, SkillCategory } from "@neon/shared";
import { defineScorer, type Scorer, type EvalContext } from "./base.js";

// ==================== Configuration Types ====================

/**
 * Skill substitute mapping - defines acceptable alternatives for skills
 */
export type SkillSubstitutes = Record<string, string[]>;

/**
 * Skill category mapping - maps skill names to categories
 */
export type SkillCategoryMap = Record<string, SkillCategory>;

/**
 * Configuration for skill selection scorer
 */
export interface SkillSelectionConfig {
  /** Expected skills to be called (in order if orderMatters is true) */
  expectedSkills?: string[];
  /** Whether the order of skill calls matters (default: false) */
  orderMatters?: boolean;
  /** Acceptable skill substitutes (e.g., { 'web_search': ['google_search', 'bing_search'] }) */
  substitutes?: SkillSubstitutes;
  /** Whether to penalize extra skills not in expected list (default: false) */
  penalizeExtraSkills?: boolean;
  /** Penalty per extra skill (0-1, default: 0.1) */
  extraSkillPenalty?: number;
  /** Skill to category mapping for partial credit */
  categoryMap?: SkillCategoryMap;
  /** Partial credit for correct category but wrong skill (0-1, default: 0.5) */
  categoryPartialCredit?: number;
  /** Whether to use skillSelection context from spans if available (default: true) */
  useSpanContext?: boolean;
}

/**
 * Result details for skill selection scoring
 */
export interface SkillSelectionDetails {
  expectedSkills: string[];
  actualSkills: string[];
  matchedSkills: string[];
  missingSkills: string[];
  extraSkills: string[];
  orderCorrect: boolean;
  categoryMatches: number;
}

// ==================== Main Scorer ====================

/**
 * Evaluate skill/tool selection in agent traces
 *
 * @example
 * ```typescript
 * // Basic usage - check if expected skills were called
 * skillSelectionScorer({ expectedSkills: ['search', 'summarize'] })
 *
 * // With ordering requirement
 * skillSelectionScorer({
 *   expectedSkills: ['search', 'read_file', 'write_file'],
 *   orderMatters: true
 * })
 *
 * // With substitutes and partial credit
 * skillSelectionScorer({
 *   expectedSkills: ['web_search', 'code_edit'],
 *   substitutes: {
 *     'web_search': ['google_search', 'bing_search'],
 *     'code_edit': ['file_edit', 'sed_edit']
 *   },
 *   categoryMap: {
 *     'web_search': 'search',
 *     'google_search': 'search',
 *     'code_edit': 'code',
 *     'file_edit': 'file'
 *   },
 *   categoryPartialCredit: 0.5
 * })
 *
 * // Penalize unexpected skills
 * skillSelectionScorer({
 *   expectedSkills: ['read_file'],
 *   penalizeExtraSkills: true,
 *   extraSkillPenalty: 0.2
 * })
 * ```
 */
export function skillSelectionScorer(config?: SkillSelectionConfig): Scorer {
  const {
    expectedSkills,
    orderMatters = false,
    substitutes = {},
    penalizeExtraSkills = false,
    extraSkillPenalty = 0.1,
    categoryMap = {},
    categoryPartialCredit = 0.5,
    useSpanContext = true,
  } = config ?? {};

  return defineScorer({
    name: "skill_selection",
    description: "Evaluates whether the correct skills/tools were selected",
    dataType: "numeric",
    evaluate: (context: EvalContext) => {
      // Get expected skills from config or context
      const expected = expectedSkills ??
        (context.expected?.expectedSkills as string[]) ??
        (context.expected?.toolCalls as string[]) ??
        [];

      if (expected.length === 0) {
        return {
          value: 1,
          reason: "No expected skills specified",
        };
      }

      // Extract actual skills from trace
      const actualSkills = extractActualSkills(context, useSpanContext);

      if (actualSkills.length === 0) {
        return {
          value: 0,
          reason: `No skills were called. Expected: [${expected.join(", ")}]`,
        };
      }

      // Calculate score
      const result = calculateSkillScore({
        expected,
        actual: actualSkills,
        orderMatters,
        substitutes,
        penalizeExtraSkills,
        extraSkillPenalty,
        categoryMap,
        categoryPartialCredit,
      });

      return {
        value: Math.min(1, Math.max(0, result.score)),
        reason: result.reason,
      };
    },
  });
}

// ==================== Specialized Scorers ====================

/**
 * Score based on skill chain execution (strict ordering)
 *
 * @example
 * ```typescript
 * skillChainScorer(['search', 'analyze', 'summarize'])
 * ```
 */
export function skillChainScorer(expectedChain: string[]): Scorer {
  return skillSelectionScorer({
    expectedSkills: expectedChain,
    orderMatters: true,
  });
}

/**
 * Score based on skill set (any order)
 *
 * @example
 * ```typescript
 * skillSetScorer(['read_file', 'write_file', 'run_tests'])
 * ```
 */
export function skillSetScorer(expectedSet: string[]): Scorer {
  return skillSelectionScorer({
    expectedSkills: expectedSet,
    orderMatters: false,
  });
}

/**
 * Score based on first skill selection (for routing decisions)
 *
 * @example
 * ```typescript
 * firstSkillScorer(['search', 'retrieve']) // Any of these as first skill
 * ```
 */
export function firstSkillScorer(acceptableFirstSkills: string[]): Scorer {
  return defineScorer({
    name: "first_skill",
    description: "Evaluates if the first skill selected was appropriate",
    dataType: "numeric",
    evaluate: (context: EvalContext) => {
      const actualSkills = extractActualSkills(context, true);

      if (actualSkills.length === 0) {
        return {
          value: 0,
          reason: "No skills were called",
        };
      }

      const firstSkill = actualSkills[0];
      const isCorrect = acceptableFirstSkills.includes(firstSkill);

      return {
        value: isCorrect ? 1 : 0,
        reason: isCorrect
          ? `Correct first skill: ${firstSkill}`
          : `First skill "${firstSkill}" not in expected: [${acceptableFirstSkills.join(", ")}]`,
      };
    },
  });
}

/**
 * Score based on skill category selection (more lenient)
 *
 * @example
 * ```typescript
 * skillCategoryScorer({
 *   expectedCategories: ['search', 'code'],
 *   categoryMap: {
 *     'web_search': 'search',
 *     'file_search': 'search',
 *     'code_edit': 'code',
 *   }
 * })
 * ```
 */
export function skillCategoryScorer(config: {
  expectedCategories: SkillCategory[];
  categoryMap: SkillCategoryMap;
  orderMatters?: boolean;
}): Scorer {
  const { expectedCategories, categoryMap, orderMatters = false } = config;

  return defineScorer({
    name: "skill_category",
    description: "Evaluates if skills from expected categories were used",
    dataType: "numeric",
    evaluate: (context: EvalContext) => {
      const actualSkills = extractActualSkills(context, true);
      const actualCategories = actualSkills
        .map((skill) => categoryMap[skill])
        .filter((cat): cat is SkillCategory => cat !== undefined);

      if (actualCategories.length === 0) {
        return {
          value: 0,
          reason: "No categorized skills were called",
        };
      }

      if (orderMatters) {
        // Check if categories appear in order
        let expectedIndex = 0;
        for (const cat of actualCategories) {
          if (cat === expectedCategories[expectedIndex]) {
            expectedIndex++;
            if (expectedIndex >= expectedCategories.length) break;
          }
        }
        const score = expectedIndex / expectedCategories.length;
        return {
          value: score,
          reason: `Matched ${expectedIndex}/${expectedCategories.length} categories in order`,
        };
      } else {
        // Check if all expected categories are present
        const matchedCategories = expectedCategories.filter((cat) =>
          actualCategories.includes(cat)
        );
        const score = matchedCategories.length / expectedCategories.length;
        return {
          value: score,
          reason: `Matched ${matchedCategories.length}/${expectedCategories.length} expected categories`,
        };
      }
    },
  });
}

/**
 * Score skill selection confidence (uses skillSelection context from spans)
 */
export function skillConfidenceScorer(config?: {
  minConfidence?: number;
}): Scorer {
  const { minConfidence = 0.7 } = config ?? {};

  return defineScorer({
    name: "skill_confidence",
    description: "Evaluates confidence in skill selections",
    dataType: "numeric",
    evaluate: (context: EvalContext) => {
      const toolSpans = context.trace.spans.filter(
        (s: SpanWithChildren) => s.spanType === "tool"
      );

      if (toolSpans.length === 0) {
        return { value: 0.5, reason: "No tool spans found" };
      }

      // Extract confidence scores from skillSelection context
      const confidences: number[] = [];
      for (const span of toolSpans) {
        const skillSelection = (span as SpanWithChildren & {
          skillSelection?: { selectionConfidence?: number }
        }).skillSelection;
        if (skillSelection?.selectionConfidence !== undefined) {
          confidences.push(skillSelection.selectionConfidence);
        }
      }

      if (confidences.length === 0) {
        return {
          value: 0.5,
          reason: "No skill confidence data available in spans",
        };
      }

      const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
      const allAboveThreshold = confidences.every((c) => c >= minConfidence);

      return {
        value: avgConfidence,
        reason: allAboveThreshold
          ? `Average confidence: ${(avgConfidence * 100).toFixed(1)}% (all above ${minConfidence * 100}%)`
          : `Average confidence: ${(avgConfidence * 100).toFixed(1)}% (some below ${minConfidence * 100}% threshold)`,
      };
    },
  });
}

// ==================== Helper Functions ====================

/**
 * Extract actual skills called from trace
 */
function extractActualSkills(
  context: EvalContext,
  useSpanContext: boolean
): string[] {
  const toolSpans = context.trace.spans.filter(
    (s: SpanWithChildren) => s.spanType === "tool"
  );

  return toolSpans
    .map((span: SpanWithChildren) => {
      // Try skillSelection context first if enabled
      if (useSpanContext) {
        const skillSelection = (span as SpanWithChildren & {
          skillSelection?: { selectedSkill?: string }
        }).skillSelection;
        if (skillSelection?.selectedSkill) {
          return skillSelection.selectedSkill;
        }
      }
      // Fall back to toolName
      return span.toolName;
    })
    .filter((name): name is string => name !== undefined && name !== null);
}

/**
 * Check if a skill matches expected (including substitutes)
 */
function skillMatches(
  actual: string,
  expected: string,
  substitutes: SkillSubstitutes
): boolean {
  if (actual === expected) return true;
  const subs = substitutes[expected] ?? [];
  return subs.includes(actual);
}

/**
 * Get category for a skill
 */
function getSkillCategory(
  skill: string,
  categoryMap: SkillCategoryMap
): SkillCategory | undefined {
  return categoryMap[skill];
}

/**
 * Calculate the skill selection score
 */
function calculateSkillScore(params: {
  expected: string[];
  actual: string[];
  orderMatters: boolean;
  substitutes: SkillSubstitutes;
  penalizeExtraSkills: boolean;
  extraSkillPenalty: number;
  categoryMap: SkillCategoryMap;
  categoryPartialCredit: number;
}): { score: number; reason: string } {
  const {
    expected,
    actual,
    orderMatters,
    substitutes,
    penalizeExtraSkills,
    extraSkillPenalty,
    categoryMap,
    categoryPartialCredit,
  } = params;

  const matched: string[] = [];
  const missing: string[] = [];
  const categoryMatches: string[] = [];
  let orderCorrect = true;

  if (orderMatters) {
    // Check skills appear in order (not necessarily consecutive)
    let actualIndex = 0;
    for (const expectedSkill of expected) {
      let found = false;
      while (actualIndex < actual.length) {
        const actualSkill = actual[actualIndex];
        if (skillMatches(actualSkill, expectedSkill, substitutes)) {
          matched.push(expectedSkill);
          found = true;
          actualIndex++;
          break;
        }
        // Check for category match
        const expectedCat = getSkillCategory(expectedSkill, categoryMap);
        const actualCat = getSkillCategory(actualSkill, categoryMap);
        if (expectedCat && actualCat && expectedCat === actualCat) {
          categoryMatches.push(expectedSkill);
          found = true;
          actualIndex++;
          break;
        }
        actualIndex++;
      }
      if (!found) {
        missing.push(expectedSkill);
        orderCorrect = false;
      }
    }
  } else {
    // Check all expected skills are present (any order)
    const actualSet = new Set(actual);
    for (const expectedSkill of expected) {
      // Direct match
      if (actualSet.has(expectedSkill)) {
        matched.push(expectedSkill);
        continue;
      }
      // Substitute match
      const subs = substitutes[expectedSkill] ?? [];
      const subMatch = subs.find((s) => actualSet.has(s));
      if (subMatch) {
        matched.push(expectedSkill);
        continue;
      }
      // Category match
      const expectedCat = getSkillCategory(expectedSkill, categoryMap);
      if (expectedCat) {
        const catMatch = actual.find(
          (a) => getSkillCategory(a, categoryMap) === expectedCat
        );
        if (catMatch) {
          categoryMatches.push(expectedSkill);
          continue;
        }
      }
      missing.push(expectedSkill);
    }
  }

  // Calculate base score
  const fullMatchScore = matched.length / expected.length;
  const partialMatchScore = (categoryMatches.length * categoryPartialCredit) / expected.length;
  let score = fullMatchScore + partialMatchScore;

  // Apply extra skill penalty
  const extraSkills = actual.filter(
    (a) =>
      !expected.some((e) => skillMatches(a, e, substitutes)) &&
      !expected.some((e) => {
        const eCat = getSkillCategory(e, categoryMap);
        const aCat = getSkillCategory(a, categoryMap);
        return eCat && aCat && eCat === aCat;
      })
  );

  if (penalizeExtraSkills && extraSkills.length > 0) {
    score -= extraSkills.length * extraSkillPenalty;
  }

  // Build reason string
  const parts: string[] = [];
  if (matched.length > 0) {
    parts.push(`matched: [${matched.join(", ")}]`);
  }
  if (categoryMatches.length > 0) {
    parts.push(`category matches: [${categoryMatches.join(", ")}]`);
  }
  if (missing.length > 0) {
    parts.push(`missing: [${missing.join(", ")}]`);
  }
  if (extraSkills.length > 0 && penalizeExtraSkills) {
    parts.push(`extra (penalized): [${extraSkills.join(", ")}]`);
  }
  if (orderMatters) {
    parts.push(orderCorrect ? "order: correct" : "order: incorrect");
  }

  return {
    score: Math.min(1, Math.max(0, score)),
    reason: parts.join("; ") || "No skill matches",
  };
}
