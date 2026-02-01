/**
 * Test Runner
 *
 * Executes test suites and generates reports.
 */

import type { Suite, Test, TestResult, SuiteResult, AgentOutput, ExpectedOutput } from "../test.js";
import type { Scorer, EvalContext } from "../scorers/base.js";
import { Neon } from "../client.js";

/**
 * Agent function type for test execution
 */
export type AgentFunction = (input: Record<string, unknown>) => Promise<AgentOutput>;

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
  /** Agent function to execute for each test */
  agent?: AgentFunction;
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
  private options: Required<Omit<RunnerOptions, 'agent'>> & { agent?: AgentFunction };
  private scorers: Map<string, Scorer> = new Map();

  constructor(options: RunnerOptions = {}) {
    this.options = {
      client: options.client || new Neon({ apiKey: process.env.NEON_API_KEY || "" }),
      parallel: options.parallel ?? 1,
      timeout: options.timeout ?? 60000,
      reporter: options.reporter ?? consoleReporter,
      filter: options.filter ?? "",
      agent: options.agent,
    };
  }

  /**
   * Set the agent function for test execution
   */
  setAgent(agent: AgentFunction): void {
    this.options.agent = agent;
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
      // Execute agent if provided
      let agentOutput: AgentOutput | undefined;
      if (this.options.agent) {
        agentOutput = await this.options.agent(test.input);
      }

      // Run scorers with actual context
      const scores = await this.runScorers(test, agentOutput);

      // Run built-in checks if expected output is defined
      if (test.expected && agentOutput) {
        const builtInScores = this.runBuiltInChecks(test.expected, agentOutput);
        scores.push(...builtInScores);
      }

      const passed = scores.length === 0 || scores.every((s) => s.value >= 0.7);

      const result: TestResult = {
        name: test.name,
        passed,
        scores,
        traceId: agentOutput?.traceId,
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
    test: Test,
    agentOutput?: AgentOutput
  ): Promise<Array<{ name: string; value: number; reason?: string }>> {
    const scorerNames = test.scorers || [];
    const scores: Array<{ name: string; value: number; reason?: string }> = [];

    // Build evaluation context
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

    // Run inline scorer if provided
    if (test.scorer) {
      try {
        const result = typeof test.scorer === "function"
          ? await test.scorer(context)
          : await test.scorer.evaluate(context);
        scores.push({
          name: "inline",
          value: result.value,
          reason: result.reason,
        });
      } catch (error) {
        scores.push({
          name: "inline",
          value: 0,
          reason: error instanceof Error ? error.message : "Inline scorer error",
        });
      }
    }

    // Run named scorers
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

      try {
        const result = await scorer.evaluate(context);
        scores.push({
          name,
          value: result.value,
          reason: result.reason,
        });
      } catch (error) {
        scores.push({
          name,
          value: 0,
          reason: error instanceof Error ? error.message : "Scorer error",
        });
      }
    }

    return scores;
  }

  /**
   * Run built-in checks based on expected output
   */
  private runBuiltInChecks(
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
      const outputText = output.output ?? "";
      const matchedContains = expected.outputContains.filter((s) =>
        outputText.toLowerCase().includes(s.toLowerCase())
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
      const outputText = output.output ?? "";
      const matches = outputText.trim() === expected.output.trim();
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
