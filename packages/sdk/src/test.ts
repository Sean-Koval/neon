/**
 * Test Definition API
 *
 * Define tests, datasets, and test suites for agent evaluation.
 */

import type { DatasetItem } from "@neon/shared";
import type { Scorer, EvalContext, ScoreResult } from "./scorers/base";

/**
 * Expected output definition for a test
 */
export interface ExpectedOutput {
  toolCalls?: string[];
  outputContains?: string[];
  output?: string;
  [key: string]: unknown;
}

/**
 * Inline scorer function type
 */
export type InlineScorer = (context: EvalContext) => Promise<ScoreResult> | ScoreResult;

/**
 * Test case definition
 */
export interface Test {
  name: string;
  input: Record<string, unknown>;
  expected?: ExpectedOutput;
  /** Named scorers to run (references scorers defined in the suite) */
  scorers?: string[];
  /** Inline scorer function for this specific test */
  scorer?: Scorer | InlineScorer;
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

/**
 * Options for running tests
 */
export interface RunOptions {
  /** Number of tests to run in parallel */
  parallel?: number;
  /** Timeout per test in milliseconds */
  timeout?: number;
  /** Filter tests by name pattern */
  filter?: string | RegExp;
  /** Agent function to execute for each test input */
  agent?: (input: Record<string, unknown>) => Promise<AgentOutput>;
  /** Scorers to apply to all tests */
  scorers?: Record<string, Scorer>;
}

/**
 * Agent output returned from agent execution
 */
export interface AgentOutput {
  output: string;
  toolCalls?: string[];
  traceId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Run tests or a suite and return structured results
 *
 * @example
 * ```typescript
 * // Run a single test
 * const result = await run(myTest, {
 *   agent: async (input) => {
 *     const response = await myAgent.invoke(input);
 *     return { output: response.text, toolCalls: response.toolCalls };
 *   },
 * });
 *
 * // Run a suite
 * const results = await run(mySuite, { parallel: 5 });
 *
 * // Run multiple tests
 * const results = await run([test1, test2, test3], { timeout: 30000 });
 * ```
 */
export async function run(
  testOrSuite: Test | Test[] | Suite,
  options: RunOptions = {}
): Promise<TestResult | TestResult[] | SuiteResult> {
  const {
    parallel = 1,
    timeout = 60000,
    filter,
    agent,
    scorers = {},
  } = options;

  // Determine if it's a suite, array of tests, or single test
  if (isSuite(testOrSuite)) {
    return runSuiteInternal(testOrSuite, options);
  }

  if (Array.isArray(testOrSuite)) {
    return runTestsInternal(testOrSuite, options);
  }

  // Single test
  const results = await runTestsInternal([testOrSuite], options);
  return results[0];
}

/**
 * Type guard to check if the input is a Suite
 */
function isSuite(input: Test | Test[] | Suite): input is Suite {
  return !Array.isArray(input) && "tests" in input && Array.isArray(input.tests);
}

/**
 * Run a suite internally
 */
async function runSuiteInternal(
  suite: Suite,
  options: RunOptions
): Promise<SuiteResult> {
  const startTime = Date.now();
  const parallel = suite.config?.parallel ?? options.parallel ?? 1;
  const mergedScorers = { ...options.scorers, ...suite.scorers };

  let tests = suite.tests;
  if (options.filter) {
    const pattern =
      typeof options.filter === "string"
        ? new RegExp(options.filter)
        : options.filter;
    tests = tests.filter((t) => pattern.test(t.name));
  }

  const results = await runTestsInternal(tests, {
    ...options,
    parallel,
    scorers: mergedScorers,
  });

  const summary = calculateSummary(results);

  return {
    name: suite.name,
    results,
    summary,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Run an array of tests internally
 */
async function runTestsInternal(
  tests: Test[],
  options: RunOptions
): Promise<TestResult[]> {
  const { parallel = 1, timeout = 60000, agent, scorers = {} } = options;

  const results: TestResult[] = [];

  // Run in batches for parallelism
  for (let i = 0; i < tests.length; i += parallel) {
    const batch = tests.slice(i, i + parallel);
    const batchResults = await Promise.all(
      batch.map((test) => runSingleTest(test, { timeout, agent, scorers }))
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Run a single test
 */
async function runSingleTest(
  test: Test,
  options: { timeout: number; agent?: RunOptions["agent"]; scorers: Record<string, Scorer> }
): Promise<TestResult> {
  const startTime = Date.now();
  const { timeout, agent, scorers } = options;

  try {
    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Test "${test.name}" timed out after ${timeout}ms`)), test.timeout ?? timeout);
    });

    // Execute the test with timeout
    const resultPromise = executeTest(test, agent, scorers);
    const result = await Promise.race([resultPromise, timeoutPromise]);

    return {
      ...result,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      name: test.name,
      passed: false,
      scores: [],
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Execute a test and run its scorers
 */
async function executeTest(
  test: Test,
  agent: RunOptions["agent"],
  scorers: Record<string, Scorer>
): Promise<Omit<TestResult, "durationMs">> {
  // Run agent if provided
  let agentOutput: AgentOutput | undefined;
  if (agent) {
    agentOutput = await agent(test.input);
  }

  // Build evaluation context with a minimal mock trace
  const traceId = agentOutput?.traceId ?? `test-${test.name}-${Date.now()}`;
  const context: EvalContext = {
    trace: {
      trace: {
        traceId,
        projectId: "",
        name: test.name,
        timestamp: new Date(),
        durationMs: 0,
        status: "ok",
        metadata: {},
        totalInputTokens: 0,
        totalOutputTokens: 0,
        toolCallCount: agentOutput?.toolCalls?.length ?? 0,
        llmCallCount: 0,
      },
      spans: [],
    } as unknown as EvalContext["trace"],
    expected: test.expected,
    metadata: {
      testName: test.name,
      input: test.input,
      output: agentOutput?.output,
      toolCalls: agentOutput?.toolCalls,
      ...agentOutput?.metadata,
    },
  };

  // Collect scores
  const scores: Array<{ name: string; value: number; reason?: string }> = [];

  // Run inline scorer if provided
  if (test.scorer) {
    const inlineResult = await runInlineScorer(test.scorer, context);
    scores.push({
      name: "inline",
      value: inlineResult.value,
      reason: inlineResult.reason,
    });
  }

  // Run named scorers
  for (const scorerName of test.scorers ?? []) {
    const scorer = scorers[scorerName];
    if (!scorer) {
      scores.push({
        name: scorerName,
        value: 0,
        reason: `Scorer "${scorerName}" not found`,
      });
      continue;
    }

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
        reason: error instanceof Error ? error.message : "Scorer error",
      });
    }
  }

  // Run built-in checks based on expected output
  if (test.expected && agentOutput) {
    const builtInScores = runBuiltInChecks(test.expected, agentOutput);
    scores.push(...builtInScores);
  }

  // Determine pass/fail
  const passed = scores.length === 0 || scores.every((s) => s.value >= 0.7);

  return {
    name: test.name,
    passed,
    scores,
    traceId: agentOutput?.traceId,
  };
}

/**
 * Run an inline scorer
 */
async function runInlineScorer(
  scorer: Scorer | InlineScorer,
  context: EvalContext
): Promise<ScoreResult> {
  if (typeof scorer === "function") {
    return scorer(context);
  }
  return scorer.evaluate(context);
}

/**
 * Run built-in checks based on expected output
 */
function runBuiltInChecks(
  expected: ExpectedOutput,
  output: AgentOutput
): Array<{ name: string; value: number; reason?: string }> {
  const scores: Array<{ name: string; value: number; reason?: string }> = [];

  // Check tool calls
  if (expected.toolCalls && expected.toolCalls.length > 0) {
    const actualTools = output.toolCalls ?? [];
    const matchedTools = expected.toolCalls.filter((t) =>
      actualTools.includes(t)
    );
    const score = matchedTools.length / expected.toolCalls.length;
    scores.push({
      name: "tool_selection",
      value: score,
      reason: `Matched ${matchedTools.length}/${expected.toolCalls.length} expected tools`,
    });
  }

  // Check output contains
  if (expected.outputContains && expected.outputContains.length > 0) {
    const matchedContains = expected.outputContains.filter((s) =>
      output.output.toLowerCase().includes(s.toLowerCase())
    );
    const score = matchedContains.length / expected.outputContains.length;
    scores.push({
      name: "output_contains",
      value: score,
      reason: `Found ${matchedContains.length}/${expected.outputContains.length} expected strings`,
    });
  }

  // Check exact output match
  if (expected.output !== undefined) {
    const matches = output.output.trim() === expected.output.trim();
    scores.push({
      name: "exact_match",
      value: matches ? 1 : 0,
      reason: matches ? "Output matches expected" : "Output does not match expected",
    });
  }

  return scores;
}

/**
 * Calculate summary statistics
 */
function calculateSummary(results: TestResult[]): SuiteResult["summary"] {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  const passRate = total > 0 ? passed / total : 0;

  let totalScore = 0;
  let scoreCount = 0;
  for (const result of results) {
    for (const score of result.scores) {
      totalScore += score.value;
      scoreCount++;
    }
  }
  const avgScore = scoreCount > 0 ? totalScore / scoreCount : 0;

  return {
    total,
    passed,
    failed,
    passRate,
    avgScore,
  };
}
