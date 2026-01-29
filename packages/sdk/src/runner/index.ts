/**
 * Test Runner
 *
 * Executes test suites and generates reports.
 */

import type { Suite, Test, TestResult, SuiteResult } from "../test.js";
import type { Scorer } from "../scorers/base.js";
import { Neon } from "../client.js";

/**
 * Runner options
 */
export interface RunnerOptions {
  /** Neon API client */
  client?: Neon;
  /** Number of parallel tests */
  parallel?: number;
  /** Timeout per test in ms */
  timeout?: number;
  /** Reporter function */
  reporter?: Reporter;
  /** Filter tests by name pattern */
  filter?: string | RegExp;
}

/**
 * Reporter for test progress
 */
export interface Reporter {
  onSuiteStart?: (suite: Suite) => void;
  onTestStart?: (test: Test) => void;
  onTestComplete?: (test: Test, result: TestResult) => void;
  onSuiteComplete?: (suite: Suite, result: SuiteResult) => void;
}

/**
 * Default console reporter
 */
export const consoleReporter: Reporter = {
  onSuiteStart: (suite) => {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Running suite: ${suite.name}`);
    console.log(`Tests: ${suite.tests.length}`);
    console.log("=".repeat(60));
  },

  onTestStart: (test) => {
    process.stdout.write(`  ${test.name}... `);
  },

  onTestComplete: (test, result) => {
    const status = result.passed ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
    const scores = result.scores
      .map((s) => `${s.name}: ${s.value.toFixed(2)}`)
      .join(", ");
    console.log(`${status} (${result.durationMs}ms) [${scores}]`);
    if (result.error) {
      console.log(`    Error: ${result.error}`);
    }
  },

  onSuiteComplete: (suite, result) => {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Suite: ${suite.name}`);
    console.log(
      `Results: ${result.summary.passed}/${result.summary.total} passed (${(result.summary.passRate * 100).toFixed(1)}%)`
    );
    console.log(`Average score: ${result.summary.avgScore.toFixed(2)}`);
    console.log(`Duration: ${result.durationMs}ms`);
    console.log("=".repeat(60));
  },
};

/**
 * JSON reporter for CI output
 */
export const jsonReporter: Reporter = {
  onSuiteComplete: (suite, result) => {
    console.log(JSON.stringify(result, null, 2));
  },
};

/**
 * Test Runner
 */
export class TestRunner {
  private options: Required<RunnerOptions>;
  private scorers: Map<string, Scorer> = new Map();

  constructor(options: RunnerOptions = {}) {
    this.options = {
      client: options.client || new Neon({ apiKey: process.env.NEON_API_KEY || "" }),
      parallel: options.parallel ?? 1,
      timeout: options.timeout ?? 60000,
      reporter: options.reporter ?? consoleReporter,
      filter: options.filter ?? "",
    };
  }

  /**
   * Register a scorer
   */
  registerScorer(scorer: Scorer): void {
    this.scorers.set(scorer.name, scorer);
  }

  /**
   * Register multiple scorers
   */
  registerScorers(scorers: Record<string, Scorer>): void {
    for (const [name, scorer] of Object.entries(scorers)) {
      this.scorers.set(name, scorer);
    }
  }

  /**
   * Run a test suite
   */
  async runSuite(suite: Suite): Promise<SuiteResult> {
    const startTime = Date.now();
    const reporter = this.options.reporter;

    // Register suite scorers
    if (suite.scorers) {
      this.registerScorers(suite.scorers);
    }

    reporter.onSuiteStart?.(suite);

    // Filter tests if needed
    let tests = suite.tests;
    if (this.options.filter) {
      const pattern =
        typeof this.options.filter === "string"
          ? new RegExp(this.options.filter)
          : this.options.filter;
      tests = tests.filter((t) => pattern.test(t.name));
    }

    // Run tests
    const results: TestResult[] = [];
    const parallel = suite.config?.parallel ?? this.options.parallel;

    // Run in batches for parallelism
    for (let i = 0; i < tests.length; i += parallel) {
      const batch = tests.slice(i, i + parallel);
      const batchResults = await Promise.all(
        batch.map((test) => this.runTest(test, reporter))
      );
      results.push(...batchResults);
    }

    // Calculate summary
    const summary = this.calculateSummary(results);

    const suiteResult: SuiteResult = {
      name: suite.name,
      results,
      summary,
      durationMs: Date.now() - startTime,
    };

    reporter.onSuiteComplete?.(suite, suiteResult);

    return suiteResult;
  }

  /**
   * Run a single test
   */
  async runTest(test: Test, reporter?: Reporter): Promise<TestResult> {
    const startTime = Date.now();

    reporter?.onTestStart?.(test);

    try {
      // Here we would actually run the agent and get a trace
      // For now, this is a placeholder that would integrate with Temporal

      // Simulate running the test
      const scores = await this.runScorers(test);

      const passed = scores.every((s) => s.value >= 0.7);

      const result: TestResult = {
        name: test.name,
        passed,
        scores,
        durationMs: Date.now() - startTime,
      };

      reporter?.onTestComplete?.(test, result);

      return result;
    } catch (error) {
      const result: TestResult = {
        name: test.name,
        passed: false,
        scores: [],
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : "Unknown error",
      };

      reporter?.onTestComplete?.(test, result);

      return result;
    }
  }

  /**
   * Run scorers for a test
   */
  private async runScorers(
    test: Test
  ): Promise<Array<{ name: string; value: number; reason?: string }>> {
    const scorerNames = test.scorers || [];
    const scores: Array<{ name: string; value: number; reason?: string }> = [];

    for (const name of scorerNames) {
      const scorer = this.scorers.get(name);
      if (!scorer) {
        scores.push({
          name,
          value: 0,
          reason: `Scorer "${name}" not found`,
        });
        continue;
      }

      // This would use actual trace data
      // For now, return a placeholder
      scores.push({
        name,
        value: 0.8,
        reason: "Placeholder score",
      });
    }

    return scores;
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(results: TestResult[]): SuiteResult["summary"] {
    const total = results.length;
    const passed = results.filter((r) => r.passed).length;
    const failed = total - passed;
    const passRate = total > 0 ? passed / total : 0;

    // Calculate average score across all tests
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
}

/**
 * Run a suite with default options
 */
export async function runSuite(
  suite: Suite,
  options?: RunnerOptions
): Promise<SuiteResult> {
  const runner = new TestRunner(options);
  return runner.runSuite(suite);
}

/**
 * Run multiple suites
 */
export async function runSuites(
  suites: Suite[],
  options?: RunnerOptions
): Promise<SuiteResult[]> {
  const runner = new TestRunner(options);
  const results: SuiteResult[] = [];

  for (const suite of suites) {
    const result = await runner.runSuite(suite);
    results.push(result);
  }

  return results;
}
