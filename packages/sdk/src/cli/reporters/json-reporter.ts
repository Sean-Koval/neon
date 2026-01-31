/**
 * JSON Reporter for CI/CD Integration
 *
 * Provides structured JSON output for machine consumption in CI pipelines.
 * Output is a single line for easy parsing with tools like jq.
 *
 * @example Output Schema
 * ```json
 * {
 *   "version": "1.0.0",
 *   "timestamp": "2024-01-15T10:30:00.000Z",
 *   "passed": true,
 *   "threshold": 0.7,
 *   "suites": [{
 *     "name": "my-suite",
 *     "passed": true,
 *     "tests": [{
 *       "name": "test-1",
 *       "passed": true,
 *       "scores": [{"name": "accuracy", "value": 0.85, "passed": true}],
 *       "durationMs": 150
 *     }],
 *     "summary": {
 *       "total": 10,
 *       "passed": 9,
 *       "failed": 1,
 *       "passRate": 0.9,
 *       "avgScore": 0.82
 *     },
 *     "durationMs": 1500
 *   }],
 *   "summary": {
 *     "totalSuites": 1,
 *     "totalTests": 10,
 *     "passed": 9,
 *     "failed": 1,
 *     "passRate": 0.9,
 *     "avgScore": 0.82,
 *     "durationMs": 1500
 *   }
 * }
 * ```
 */

import type { SuiteResult, TestResult } from "../../test.js";
import type { ThresholdConfig } from "../../threshold.js";
import { evaluateThreshold, getThreshold, DEFAULT_THRESHOLD } from "../../threshold.js";

/**
 * JSON Output Schema version
 * Increment when making breaking changes to the schema
 */
export const JSON_SCHEMA_VERSION = "1.0.0";

/**
 * Score result in JSON output
 */
export interface JSONScoreResult {
  /** Score name */
  name: string;
  /** Score value (0-1) */
  value: number;
  /** Whether score passed the threshold */
  passed: boolean;
  /** Threshold used for this score */
  threshold: number;
  /** Optional reason/explanation */
  reason?: string;
}

/**
 * Test result in JSON output
 */
export interface JSONTestResult {
  /** Test name */
  name: string;
  /** Whether all scores passed their thresholds */
  passed: boolean;
  /** Individual score results */
  scores: JSONScoreResult[];
  /** Test duration in milliseconds */
  durationMs: number;
  /** Error message if test failed to execute */
  error?: string;
  /** Trace ID if available */
  traceId?: string;
}

/**
 * Suite result in JSON output
 */
export interface JSONSuiteResult {
  /** Suite name */
  name: string;
  /** Whether all tests passed */
  passed: boolean;
  /** Individual test results */
  tests: JSONTestResult[];
  /** Summary statistics */
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    avgScore: number;
  };
  /** Suite duration in milliseconds */
  durationMs: number;
}

/**
 * Complete CI output schema
 */
export interface CIOutput {
  /** Schema version for compatibility checking */
  version: string;
  /** ISO 8601 timestamp of when the run completed */
  timestamp: string;
  /** Overall pass/fail status */
  passed: boolean;
  /** Global threshold used */
  threshold: number;
  /** Individual suite results */
  suites: JSONSuiteResult[];
  /** Aggregated summary */
  summary: {
    totalSuites: number;
    totalTests: number;
    passed: number;
    failed: number;
    passRate: number;
    avgScore: number;
    durationMs: number;
  };
}

/**
 * Options for JSON output generation
 */
export interface JSONOutputOptions {
  /** Threshold configuration */
  thresholdConfig?: ThresholdConfig;
  /** Whether to pretty-print the JSON (default: false for single-line) */
  pretty?: boolean;
}

/**
 * Convert a TestResult to JSONTestResult with threshold evaluation
 */
function convertTestResult(
  result: TestResult,
  thresholdConfig: ThresholdConfig
): JSONTestResult {
  const jsonScores: JSONScoreResult[] = result.scores.map((score) => {
    const evaluation = evaluateThreshold(score.value, score.name, thresholdConfig);
    return {
      name: score.name,
      value: score.value,
      passed: evaluation.passed,
      threshold: evaluation.threshold,
      reason: score.reason,
    };
  });

  // Test passes if all scores pass their thresholds
  // If no scores, use the test's own passed status
  const allScoresPassed = jsonScores.length > 0
    ? jsonScores.every((s) => s.passed)
    : result.passed;

  return {
    name: result.name,
    passed: allScoresPassed,
    scores: jsonScores,
    durationMs: result.durationMs,
    ...(result.error && { error: result.error }),
    ...(result.traceId && { traceId: result.traceId }),
  };
}

/**
 * Convert a SuiteResult to JSONSuiteResult with threshold evaluation
 */
function convertSuiteResult(
  result: SuiteResult,
  thresholdConfig: ThresholdConfig
): JSONSuiteResult {
  const jsonTests = result.results.map((r) =>
    convertTestResult(r, thresholdConfig)
  );

  const passed = jsonTests.every((t) => t.passed);

  return {
    name: result.name,
    passed,
    tests: jsonTests,
    summary: result.summary,
    durationMs: result.durationMs,
  };
}

/**
 * Generate CI output from suite results
 */
export function generateCIOutput(
  results: SuiteResult[],
  options: JSONOutputOptions = {}
): CIOutput {
  const { thresholdConfig = {} } = options;
  const globalThreshold = thresholdConfig.global ?? DEFAULT_THRESHOLD;

  const jsonSuites = results.map((r) =>
    convertSuiteResult(r, thresholdConfig)
  );

  // Calculate aggregated summary
  let totalTests = 0;
  let passedTests = 0;
  let totalScore = 0;
  let scoreCount = 0;
  let totalDuration = 0;

  for (const suite of jsonSuites) {
    totalTests += suite.summary.total;
    passedTests += suite.summary.passed;
    totalDuration += suite.durationMs;

    for (const test of suite.tests) {
      for (const score of test.scores) {
        totalScore += score.value;
        scoreCount++;
      }
    }
  }

  const failedTests = totalTests - passedTests;
  const passRate = totalTests > 0 ? passedTests / totalTests : 0;
  const avgScore = scoreCount > 0 ? totalScore / scoreCount : 0;

  const overallPassed = jsonSuites.every((s) => s.passed);

  return {
    version: JSON_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    passed: overallPassed,
    threshold: globalThreshold,
    suites: jsonSuites,
    summary: {
      totalSuites: results.length,
      totalTests,
      passed: passedTests,
      failed: failedTests,
      passRate,
      avgScore,
      durationMs: totalDuration,
    },
  };
}

/**
 * Format CI output as JSON string
 *
 * @param output - CI output object
 * @param pretty - Whether to pretty-print (default: false)
 * @returns JSON string (single line if not pretty)
 */
export function formatCIOutput(output: CIOutput, pretty = false): string {
  return JSON.stringify(output, null, pretty ? 2 : undefined);
}
