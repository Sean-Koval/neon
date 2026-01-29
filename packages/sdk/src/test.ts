/**
 * Test Definition API
 *
 * Define tests, datasets, and test suites for agent evaluation.
 */

import type { DatasetItem } from "@neon/shared";
import type { Scorer } from "./scorers/base";

/**
 * Test case definition
 */
export interface Test {
  name: string;
  input: Record<string, unknown>;
  expected?: {
    toolCalls?: string[];
    outputContains?: string[];
    output?: string;
  };
  scorers?: string[];
  timeout?: number;
}

/**
 * Dataset definition
 */
export interface Dataset {
  name: string;
  items: DatasetItem[];
  description?: string;
}

/**
 * Test suite definition
 */
export interface Suite {
  name: string;
  tests: Test[];
  datasets?: Dataset[];
  scorers?: Record<string, Scorer>;
  config?: {
    parallel?: number;
    timeout?: number;
    agentId?: string;
    agentVersion?: string;
  };
}

/**
 * Define a test case
 *
 * @example
 * ```typescript
 * const weatherTest = defineTest({
 *   name: 'weather-query',
 *   input: { query: 'What is the weather in NYC?' },
 *   expected: {
 *     toolCalls: ['get_weather'],
 *     outputContains: ['temperature', 'NYC'],
 *   },
 *   scorers: ['tool_selection', 'response_quality'],
 * });
 * ```
 */
export function defineTest(config: Test): Test {
  return {
    ...config,
    timeout: config.timeout ?? 60000, // 1 minute default
  };
}

/**
 * Define a dataset
 *
 * @example
 * ```typescript
 * const goldenDataset = defineDataset({
 *   name: 'golden-queries',
 *   items: [
 *     { input: { query: 'What is 2+2?' }, expected: { output: '4' } },
 *     { input: { query: 'Summarize this' }, expected: { output: 'A summary' } },
 *   ],
 * });
 * ```
 */
export function defineDataset(config: Dataset): Dataset {
  return config;
}

/**
 * Define a test suite
 *
 * @example
 * ```typescript
 * export const agentSuite = defineSuite({
 *   name: 'my-agent-v1',
 *   tests: [weatherTest, mathTest],
 *   datasets: [goldenDataset],
 *   scorers: {
 *     tool_selection: ruleBasedScorer({
 *       check: (trace) => trace.toolCalls.includes('get_weather'),
 *     }),
 *     response_quality: llmJudge({
 *       prompt: 'Rate the response quality from 0-1...',
 *     }),
 *   },
 *   config: {
 *     parallel: 5,
 *     timeout: 120000,
 *   },
 * });
 * ```
 */
export function defineSuite(config: Suite): Suite {
  return {
    ...config,
    config: {
      parallel: 1,
      timeout: 300000, // 5 minutes default
      ...config.config,
    },
  };
}

/**
 * Test result
 */
export interface TestResult {
  name: string;
  passed: boolean;
  scores: Array<{
    name: string;
    value: number;
    reason?: string;
  }>;
  traceId?: string;
  durationMs: number;
  error?: string;
}

/**
 * Suite result
 */
export interface SuiteResult {
  name: string;
  results: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    avgScore: number;
  };
  durationMs: number;
}

/**
 * Validate a test definition
 */
export function validateTest(test: Test): string[] {
  const errors: string[] = [];

  if (!test.name || test.name.trim() === "") {
    errors.push("Test name is required");
  }

  if (!test.input || typeof test.input !== "object") {
    errors.push("Test input must be an object");
  }

  if (test.timeout !== undefined && test.timeout <= 0) {
    errors.push("Test timeout must be positive");
  }

  return errors;
}

/**
 * Validate a suite definition
 */
export function validateSuite(suite: Suite): string[] {
  const errors: string[] = [];

  if (!suite.name || suite.name.trim() === "") {
    errors.push("Suite name is required");
  }

  if (!suite.tests || suite.tests.length === 0) {
    errors.push("Suite must have at least one test");
  }

  for (const test of suite.tests || []) {
    const testErrors = validateTest(test);
    errors.push(...testErrors.map((e) => `Test "${test.name}": ${e}`));
  }

  return errors;
}
