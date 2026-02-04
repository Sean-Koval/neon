/**
 * Skill Evaluation Framework
 *
 * Provides comprehensive evaluation of agent skills including:
 * - Parameter accuracy assessment
 * - Result quality scoring
 * - Skill-specific regression tracking
 * - Multi-skill chain evaluation
 *
 * @example
 * ```typescript
 * // Define a skill evaluation
 * const webSearchEval = defineSkillEval({
 *   skillId: 'web_search',
 *   name: 'Web Search Skill Evaluation',
 *   parameterSchema: {
 *     query: { type: 'string', required: true },
 *     maxResults: { type: 'number', default: 10 },
 *   },
 *   expectedBehavior: {
 *     minRelevance: 0.7,
 *     maxLatencyMs: 5000,
 *   },
 *   testCases: [
 *     {
 *       input: { query: 'TypeScript best practices' },
 *       expectedParameters: { query: 'TypeScript best practices' },
 *       expectedResultPatterns: ['typescript', 'coding', 'development'],
 *     },
 *   ],
 *   scorers: {
 *     parameter_accuracy: parameterAccuracyScorer(),
 *     result_quality: resultQualityScorer({ minRelevance: 0.7 }),
 *   },
 * });
 *
 * // Run the evaluation
 * const result = await runSkillEval(webSearchEval, {
 *   agent: myAgent,
 * });
 * ```
 */

import type { Scorer, EvalContext, ScoreResult } from "../scorers/base.js";
import type { SpanWithChildren } from "@neon/shared";

// =============================================================================
// Types
// =============================================================================

// Import ParameterType from scorers to avoid duplicate definition
import type { ParameterType } from '../scorers/parameter-accuracy';

export type { ParameterType };

/**
 * Parameter schema definition
 */
export interface ParameterSchema {
  type: ParameterType;
  required?: boolean;
  default?: unknown;
  description?: string;
  enum?: unknown[];
  min?: number;
  max?: number;
  pattern?: string;
  items?: ParameterSchema;
  properties?: Record<string, ParameterSchema>;
}

/**
 * Expected behavior configuration for a skill
 */
export interface SkillBehavior {
  /** Minimum relevance score (0-1) for results */
  minRelevance?: number;
  /** Maximum acceptable latency in milliseconds */
  maxLatencyMs?: number;
  /** Maximum number of retries allowed */
  maxRetries?: number;
  /** Whether the skill should always succeed */
  mustSucceed?: boolean;
  /** Expected output patterns (regex or strings) */
  outputPatterns?: (string | RegExp)[];
  /** Custom validation function */
  customValidator?: (result: SkillResult) => boolean;
}

/**
 * Test case for skill evaluation
 */
export interface SkillTestCase {
  /** Unique identifier for the test case */
  id?: string;
  /** Human-readable name */
  name?: string;
  /** Input to the skill */
  input: Record<string, unknown>;
  /** Expected parameters after normalization */
  expectedParameters?: Record<string, unknown>;
  /** Expected patterns in result */
  expectedResultPatterns?: (string | RegExp)[];
  /** Expected output type */
  expectedOutputType?: 'text' | 'json' | 'array' | 'object';
  /** Expected minimum score */
  minScore?: number;
  /** Tags for filtering */
  tags?: string[];
  /** Test case timeout in ms */
  timeout?: number;
}

/**
 * Result from skill execution
 */
export interface SkillResult {
  /** Whether the skill succeeded */
  success: boolean;
  /** Output from the skill */
  output?: unknown;
  /** Parsed parameters that were used */
  parameters?: Record<string, unknown>;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Error message if failed */
  error?: string;
  /** Associated span ID */
  spanId?: string;
  /** Raw tool output */
  rawOutput?: string;
  /** Number of retries */
  retryCount?: number;
}

/**
 * Skill evaluation definition
 */
export interface SkillEval {
  /** Unique skill identifier */
  skillId: string;
  /** Human-readable name */
  name: string;
  /** Skill description */
  description?: string;
  /** Parameter schema for validation */
  parameterSchema?: Record<string, ParameterSchema>;
  /** Expected behavior configuration */
  expectedBehavior?: SkillBehavior;
  /** Test cases */
  testCases: SkillTestCase[];
  /** Scorers to apply */
  scorers?: Record<string, Scorer>;
  /** Baseline version for regression tracking */
  baselineVersion?: string;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Single test case result
 */
export interface SkillTestResult {
  /** Test case ID */
  testCaseId: string;
  /** Test case name */
  testCaseName?: string;
  /** Whether the test passed */
  passed: boolean;
  /** Individual scores */
  scores: Array<{
    name: string;
    value: number;
    reason?: string;
  }>;
  /** Skill execution result */
  skillResult?: SkillResult;
  /** Duration in milliseconds */
  durationMs: number;
  /** Error if failed */
  error?: string;
}

/**
 * Complete skill evaluation result
 */
export interface SkillEvalResult {
  /** Skill ID */
  skillId: string;
  /** Evaluation name */
  name: string;
  /** Individual test results */
  testResults: SkillTestResult[];
  /** Summary statistics */
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    avgScore: number;
    avgLatencyMs: number;
  };
  /** Regression status compared to baseline */
  regression?: {
    isRegression: boolean;
    baselineScore: number;
    currentScore: number;
    delta: number;
    significance: 'high' | 'medium' | 'low' | 'none';
  };
  /** Total duration in milliseconds */
  durationMs: number;
  /** Timestamp */
  timestamp: Date;
  /** Version identifier */
  version?: string;
}

/**
 * Options for running skill evaluation
 */
export interface SkillEvalOptions {
  /** Agent function to execute skills */
  agent?: (input: Record<string, unknown>) => Promise<SkillResult>;
  /** Filter test cases by tags */
  filterTags?: string[];
  /** Filter test cases by name pattern */
  filterName?: string | RegExp;
  /** Number of parallel test cases */
  parallel?: number;
  /** Timeout per test case in ms */
  timeout?: number;
  /** Enable detailed logging */
  verbose?: boolean;
  /** Version identifier for tracking */
  version?: string;
  /** Baseline scores for regression detection */
  baseline?: Record<string, number>;
}

// =============================================================================
// Define Skill Eval
// =============================================================================

/**
 * Define a skill evaluation
 *
 * @example
 * ```typescript
 * const codeEditEval = defineSkillEval({
 *   skillId: 'code_edit',
 *   name: 'Code Edit Skill',
 *   parameterSchema: {
 *     file: { type: 'string', required: true },
 *     changes: { type: 'array', required: true },
 *   },
 *   testCases: [
 *     {
 *       input: { instruction: 'Add a return statement' },
 *       expectedParameters: { file: /\.ts$/ },
 *     },
 *   ],
 * });
 * ```
 */
export function defineSkillEval(config: SkillEval): SkillEval {
  // Assign IDs to test cases that don't have them
  const testCases = config.testCases.map((tc, idx) => ({
    ...tc,
    id: tc.id ?? `${config.skillId}-test-${idx}`,
    name: tc.name ?? `Test case ${idx + 1}`,
  }));

  return {
    ...config,
    testCases,
  };
}

/**
 * Define multiple skill evaluations as a suite
 *
 * @example
 * ```typescript
 * const skillSuite = defineSkillEvalSuite({
 *   name: 'Core Agent Skills',
 *   skills: [webSearchEval, codeEditEval, fileReadEval],
 *   commonScorers: {
 *     latency: latencyScorer({ maxMs: 5000 }),
 *   },
 * });
 * ```
 */
export function defineSkillEvalSuite(config: {
  name: string;
  description?: string;
  skills: SkillEval[];
  commonScorers?: Record<string, Scorer>;
  tags?: string[];
}): SkillEvalSuite {
  return {
    ...config,
    skills: config.skills.map((skill) => ({
      ...skill,
      scorers: { ...config.commonScorers, ...skill.scorers },
    })),
  };
}

/**
 * Skill evaluation suite
 */
export interface SkillEvalSuite {
  name: string;
  description?: string;
  skills: SkillEval[];
  commonScorers?: Record<string, Scorer>;
  tags?: string[];
}

// =============================================================================
// Run Skill Eval
// =============================================================================

/**
 * Run a skill evaluation
 *
 * @example
 * ```typescript
 * const result = await runSkillEval(webSearchEval, {
 *   agent: async (input) => {
 *     const result = await myAgent.invokeSkill('web_search', input);
 *     return {
 *       success: result.success,
 *       output: result.data,
 *       parameters: result.params,
 *       latencyMs: result.duration,
 *     };
 *   },
 * });
 *
 * console.log(`Pass rate: ${result.summary.passRate * 100}%`);
 * ```
 */
export async function runSkillEval(
  skillEval: SkillEval,
  options: SkillEvalOptions = {}
): Promise<SkillEvalResult> {
  const startTime = Date.now();
  const {
    agent,
    filterTags,
    filterName,
    parallel = 1,
    timeout = 30000,
    verbose = false,
    version,
    baseline,
  } = options;

  // Filter test cases
  let testCases = skillEval.testCases;

  if (filterTags && filterTags.length > 0) {
    testCases = testCases.filter((tc) =>
      tc.tags?.some((tag) => filterTags.includes(tag))
    );
  }

  if (filterName) {
    const pattern = typeof filterName === 'string' ? new RegExp(filterName) : filterName;
    testCases = testCases.filter((tc) => tc.name && pattern.test(tc.name));
  }

  // Run test cases
  const testResults: SkillTestResult[] = [];

  for (let i = 0; i < testCases.length; i += parallel) {
    const batch = testCases.slice(i, i + parallel);
    const batchResults = await Promise.all(
      batch.map((testCase) =>
        runSingleSkillTest(skillEval, testCase, {
          agent,
          timeout: testCase.timeout ?? timeout,
          verbose,
          scorers: skillEval.scorers ?? {},
        })
      )
    );
    testResults.push(...batchResults);
  }

  // Calculate summary
  const summary = calculateSkillSummary(testResults);

  // Detect regression if baseline provided
  let regression: SkillEvalResult['regression'];
  if (baseline && baseline[skillEval.skillId] !== undefined) {
    const baselineScore = baseline[skillEval.skillId];
    const delta = summary.avgScore - baselineScore;
    regression = {
      isRegression: delta < -0.05, // 5% threshold
      baselineScore,
      currentScore: summary.avgScore,
      delta,
      significance: getRegressionSignificance(delta),
    };
  }

  return {
    skillId: skillEval.skillId,
    name: skillEval.name,
    testResults,
    summary,
    regression,
    durationMs: Date.now() - startTime,
    timestamp: new Date(),
    version,
  };
}

/**
 * Run a skill evaluation suite
 */
export async function runSkillEvalSuite(
  suite: SkillEvalSuite,
  options: SkillEvalOptions = {}
): Promise<{
  name: string;
  results: SkillEvalResult[];
  summary: {
    totalSkills: number;
    passedSkills: number;
    totalTests: number;
    passedTests: number;
    avgScore: number;
    regressions: number;
  };
  durationMs: number;
}> {
  const startTime = Date.now();
  const results: SkillEvalResult[] = [];

  for (const skill of suite.skills) {
    const result = await runSkillEval(skill, options);
    results.push(result);
  }

  // Calculate suite summary
  const totalTests = results.reduce((sum, r) => sum + r.summary.total, 0);
  const passedTests = results.reduce((sum, r) => sum + r.summary.passed, 0);
  const passedSkills = results.filter((r) => r.summary.passRate >= 0.7).length;
  const avgScore =
    results.length > 0
      ? results.reduce((sum, r) => sum + r.summary.avgScore, 0) / results.length
      : 0;
  const regressions = results.filter((r) => r.regression?.isRegression).length;

  return {
    name: suite.name,
    results,
    summary: {
      totalSkills: suite.skills.length,
      passedSkills,
      totalTests,
      passedTests,
      avgScore,
      regressions,
    },
    durationMs: Date.now() - startTime,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Run a single skill test case
 */
async function runSingleSkillTest(
  skillEval: SkillEval,
  testCase: SkillTestCase,
  options: {
    agent?: SkillEvalOptions['agent'];
    timeout: number;
    verbose: boolean;
    scorers: Record<string, Scorer>;
  }
): Promise<SkillTestResult> {
  const startTime = Date.now();
  const { agent, timeout, verbose, scorers } = options;

  try {
    // Execute skill via agent
    let skillResult: SkillResult | undefined;

    if (agent) {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Test case timed out after ${timeout}ms`)),
          timeout
        );
      });

      const agentPromise = agent(testCase.input);
      skillResult = await Promise.race([agentPromise, timeoutPromise]);
    }

    // Build evaluation context
    const context: EvalContext = {
      trace: {
        trace: {
          traceId: `skill-${skillEval.skillId}-${Date.now()}`,
          projectId: '',
          name: skillEval.name,
          timestamp: new Date(),
          durationMs: skillResult?.latencyMs ?? 0,
          status: skillResult?.success ? 'ok' : 'error',
          metadata: {},
          totalInputTokens: 0,
          totalOutputTokens: 0,
          toolCallCount: 1,
          llmCallCount: 0,
        },
        spans: skillResult
          ? [
              {
                spanId: skillResult.spanId ?? `span-${Date.now()}`,
                traceId: `skill-${skillEval.skillId}-${Date.now()}`,
                name: skillEval.skillId,
                spanType: 'tool',
                componentType: 'skill',
                toolName: skillEval.skillId,
                toolInput: JSON.stringify(skillResult.parameters ?? testCase.input),
                toolOutput: skillResult.rawOutput ?? JSON.stringify(skillResult.output),
                timestamp: new Date(),
                durationMs: skillResult.latencyMs,
                status: skillResult.success ? 'ok' : 'error',
                statusMessage: skillResult.error,
                parentSpanId: null,
                children: [],
              } as unknown as SpanWithChildren,
            ]
          : [],
      } as unknown as EvalContext['trace'],
      expected: {
        parameters: testCase.expectedParameters,
        resultPatterns: testCase.expectedResultPatterns,
        outputType: testCase.expectedOutputType,
        behavior: skillEval.expectedBehavior,
      },
      metadata: {
        skillId: skillEval.skillId,
        testCaseId: testCase.id,
        input: testCase.input,
        skillResult,
      },
    };

    // Run scorers
    const scores: Array<{ name: string; value: number; reason?: string }> = [];

    for (const [scorerName, scorer] of Object.entries(scorers)) {
      try {
        const scoreResult = await scorer.evaluate(context);
        scores.push({
          name: scorerName,
          value: scoreResult.value,
          reason: scoreResult.reason,
        });
      } catch (error) {
        scores.push({
          name: scorerName,
          value: 0,
          reason: error instanceof Error ? error.message : 'Scorer error',
        });
      }
    }

    // Run built-in checks
    if (skillResult) {
      scores.push(...runSkillBuiltInChecks(skillEval, testCase, skillResult));
    }

    // Determine pass/fail
    const avgScore =
      scores.length > 0
        ? scores.reduce((sum, s) => sum + s.value, 0) / scores.length
        : 0;
    const passed = avgScore >= (testCase.minScore ?? 0.7);

    return {
      testCaseId: testCase.id!,
      testCaseName: testCase.name,
      passed,
      scores,
      skillResult,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      testCaseId: testCase.id!,
      testCaseName: testCase.name,
      passed: false,
      scores: [],
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Run built-in checks for skill evaluation
 */
function runSkillBuiltInChecks(
  skillEval: SkillEval,
  testCase: SkillTestCase,
  skillResult: SkillResult
): Array<{ name: string; value: number; reason?: string }> {
  const scores: Array<{ name: string; value: number; reason?: string }> = [];
  const behavior = skillEval.expectedBehavior ?? {};

  // Success check
  if (behavior.mustSucceed) {
    scores.push({
      name: 'skill_success',
      value: skillResult.success ? 1 : 0,
      reason: skillResult.success ? 'Skill succeeded' : `Skill failed: ${skillResult.error}`,
    });
  }

  // Latency check
  if (behavior.maxLatencyMs) {
    const latencyScore =
      skillResult.latencyMs <= behavior.maxLatencyMs
        ? 1
        : Math.max(0, 1 - (skillResult.latencyMs - behavior.maxLatencyMs) / behavior.maxLatencyMs);
    scores.push({
      name: 'latency',
      value: latencyScore,
      reason: `Latency: ${skillResult.latencyMs}ms (max: ${behavior.maxLatencyMs}ms)`,
    });
  }

  // Output pattern check
  if (testCase.expectedResultPatterns && skillResult.output) {
    const outputStr =
      typeof skillResult.output === 'string'
        ? skillResult.output
        : JSON.stringify(skillResult.output);

    let matchCount = 0;
    for (const pattern of testCase.expectedResultPatterns) {
      const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
      if (regex.test(outputStr)) {
        matchCount++;
      }
    }

    const patternScore = matchCount / testCase.expectedResultPatterns.length;
    scores.push({
      name: 'output_patterns',
      value: patternScore,
      reason: `Matched ${matchCount}/${testCase.expectedResultPatterns.length} patterns`,
    });
  }

  // Parameter accuracy check
  if (testCase.expectedParameters && skillResult.parameters) {
    const { score, details } = checkParameterAccuracy(
      testCase.expectedParameters,
      skillResult.parameters
    );
    scores.push({
      name: 'parameter_accuracy',
      value: score,
      reason: details,
    });
  }

  return scores;
}

/**
 * Check parameter accuracy
 */
function checkParameterAccuracy(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>
): { score: number; details: string } {
  const expectedKeys = Object.keys(expected);
  let matchCount = 0;
  const mismatches: string[] = [];

  for (const key of expectedKeys) {
    const expectedVal = expected[key];
    const actualVal = actual[key];

    if (expectedVal instanceof RegExp) {
      const strVal = typeof actualVal === 'string' ? actualVal : JSON.stringify(actualVal);
      if (expectedVal.test(strVal)) {
        matchCount++;
      } else {
        mismatches.push(`${key}: pattern mismatch`);
      }
    } else if (typeof expectedVal === 'object' && expectedVal !== null) {
      // Deep comparison
      if (JSON.stringify(expectedVal) === JSON.stringify(actualVal)) {
        matchCount++;
      } else {
        mismatches.push(`${key}: value mismatch`);
      }
    } else if (expectedVal === actualVal) {
      matchCount++;
    } else {
      mismatches.push(`${key}: ${actualVal} !== ${expectedVal}`);
    }
  }

  const score = expectedKeys.length > 0 ? matchCount / expectedKeys.length : 1;
  const details =
    mismatches.length > 0
      ? `Matched ${matchCount}/${expectedKeys.length}: ${mismatches.join(', ')}`
      : `All ${expectedKeys.length} parameters matched`;

  return { score, details };
}

/**
 * Calculate skill evaluation summary
 */
function calculateSkillSummary(
  results: SkillTestResult[]
): SkillEvalResult['summary'] {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;

  let totalScore = 0;
  let scoreCount = 0;
  let totalLatency = 0;
  let latencyCount = 0;

  for (const result of results) {
    for (const score of result.scores) {
      totalScore += score.value;
      scoreCount++;
    }
    if (result.skillResult?.latencyMs) {
      totalLatency += result.skillResult.latencyMs;
      latencyCount++;
    }
  }

  return {
    total,
    passed,
    failed: total - passed,
    passRate: total > 0 ? passed / total : 0,
    avgScore: scoreCount > 0 ? totalScore / scoreCount : 0,
    avgLatencyMs: latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0,
  };
}

/**
 * Get regression significance level
 */
function getRegressionSignificance(
  delta: number
): 'high' | 'medium' | 'low' | 'none' {
  if (delta >= 0) return 'none';
  if (delta <= -0.2) return 'high';
  if (delta <= -0.1) return 'medium';
  return 'low';
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Create a skill test case from a trace span
 */
export function skillTestFromSpan(span: SpanWithChildren): SkillTestCase {
  return {
    id: `from-span-${span.spanId}`,
    name: `Test from ${span.name}`,
    input: span.toolInput ? JSON.parse(span.toolInput) : {},
    expectedParameters: span.toolInput ? JSON.parse(span.toolInput) : undefined,
    expectedResultPatterns: [],
  };
}

/**
 * Generate test cases from historical traces
 */
export function generateSkillTestCases(
  skillId: string,
  spans: SpanWithChildren[],
  options?: {
    maxCases?: number;
    filterSuccess?: boolean;
    deduplicateInputs?: boolean;
  }
): SkillTestCase[] {
  const { maxCases = 10, filterSuccess = true, deduplicateInputs = true } = options ?? {};

  let filtered = spans.filter((s) => s.toolName === skillId);

  if (filterSuccess) {
    filtered = filtered.filter((s) => s.status === 'ok');
  }

  if (deduplicateInputs) {
    const seen = new Set<string>();
    filtered = filtered.filter((s) => {
      const key = s.toolInput ?? '';
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  return filtered.slice(0, maxCases).map((span) => skillTestFromSpan(span));
}
