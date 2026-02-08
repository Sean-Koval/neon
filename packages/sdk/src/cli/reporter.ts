/**
 * CLI Reporter
 *
 * Pluggable reporter for CLI output with colored console formatting.
 * Designed to be extensible for SDK-005 (JSON output support).
 */

import pc from "picocolors";
import type { Test, TestResult, SuiteResult, Suite } from "../test/index.js";
import type { Reporter } from "../runner/index.js";

/**
 * Reporter output format
 */
export type ReporterFormat = "console" | "json" | "silent";

/**
 * CLI Reporter options
 */
export interface CLIReporterOptions {
  /** Output format */
  format?: ReporterFormat;
  /** Show verbose output */
  verbose?: boolean;
  /** Show score details */
  showScores?: boolean;
}

/**
 * Create a CLI reporter with the specified options
 */
export function createCLIReporter(options: CLIReporterOptions = {}): Reporter {
  const { format = "console", verbose = false, showScores = true } = options;

  if (format === "json") {
    return createJSONReporter();
  }

  if (format === "silent") {
    return createSilentReporter();
  }

  return createConsoleReporter({ verbose, showScores });
}

/**
 * Console reporter with colored output
 */
function createConsoleReporter(options: {
  verbose: boolean;
  showScores: boolean;
}): Reporter {
  const { verbose, showScores } = options;
  let startTime = 0;

  return {
    onSuiteStart: (suite: Suite) => {
      startTime = Date.now();
      console.log();
      console.log(pc.bold(pc.cyan(`Suite: ${suite.name}`)));
      console.log(pc.dim(`Running ${suite.tests.length} test(s)...`));
      console.log();
    },

    onTestStart: (test: Test) => {
      if (verbose) {
        process.stdout.write(pc.dim(`  ${test.name}... `));
      }
    },

    onTestComplete: (test: Test, result: TestResult) => {
      const icon = result.passed ? pc.green("✓") : pc.red("✗");
      const status = result.passed ? pc.green("PASS") : pc.red("FAIL");
      const duration = pc.dim(`(${result.durationMs}ms)`);

      if (verbose) {
        // Clear the "test..." line if we wrote it
        process.stdout.write("\r");
      }

      console.log(`  ${icon} ${test.name} ${status} ${duration}`);

      // Show scores if enabled
      if (showScores && result.scores.length > 0) {
        for (const score of result.scores) {
          const scoreColor = score.value >= 0.7 ? pc.green : score.value >= 0.5 ? pc.yellow : pc.red;
          const scoreValue = scoreColor(`${(score.value * 100).toFixed(0)}%`);
          console.log(pc.dim(`      ${score.name}: ${scoreValue}`));
          if (verbose && score.reason) {
            console.log(pc.dim(`        ${score.reason}`));
          }
        }
      }

      // Show error if present
      if (result.error) {
        console.log(pc.red(`      Error: ${result.error}`));
      }
    },

    onSuiteComplete: (suite: Suite, result: SuiteResult) => {
      console.log();
      printSummary(result);
    },
  };
}

/**
 * JSON reporter for CI/CD integration
 */
function createJSONReporter(): Reporter {
  const results: SuiteResult[] = [];

  return {
    onSuiteComplete: (_suite: Suite, result: SuiteResult) => {
      results.push(result);
    },
  };
}

/**
 * Silent reporter for programmatic use
 */
function createSilentReporter(): Reporter {
  return {
    onSuiteStart: () => {},
    onTestStart: () => {},
    onTestComplete: () => {},
    onSuiteComplete: () => {},
  };
}

/**
 * Print run summary
 */
export function printSummary(result: SuiteResult): void {
  const { summary, durationMs } = result;

  console.log(pc.bold("Summary"));
  console.log(pc.dim("─".repeat(40)));

  // Test counts
  const passedStr = summary.passed > 0 ? pc.green(`${summary.passed} passed`) : "0 passed";
  const failedStr = summary.failed > 0 ? pc.red(`${summary.failed} failed`) : "0 failed";
  console.log(`  Tests:     ${passedStr}, ${failedStr}, ${summary.total} total`);

  // Pass rate
  const passRate = (summary.passRate * 100).toFixed(1);
  const passRateColor = summary.passRate >= 0.9 ? pc.green : summary.passRate >= 0.7 ? pc.yellow : pc.red;
  console.log(`  Pass rate: ${passRateColor(`${passRate}%`)}`);

  // Average score
  if (summary.avgScore > 0) {
    const avgScore = (summary.avgScore * 100).toFixed(1);
    const avgScoreColor = summary.avgScore >= 0.7 ? pc.green : summary.avgScore >= 0.5 ? pc.yellow : pc.red;
    console.log(`  Avg score: ${avgScoreColor(`${avgScore}%`)}`);
  }

  // Duration
  const durationSec = (durationMs / 1000).toFixed(2);
  console.log(`  Duration:  ${pc.dim(`${durationSec}s`)}`);

  console.log();

  // Final status
  if (summary.failed === 0) {
    console.log(pc.green(pc.bold("All tests passed!")));
  } else {
    console.log(pc.red(pc.bold(`${summary.failed} test(s) failed`)));
  }
}

/**
 * Print aggregated summary for multiple suites
 */
export function printAggregatedSummary(results: SuiteResult[]): void {
  const totalTests = results.reduce((sum, r) => sum + r.summary.total, 0);
  const totalPassed = results.reduce((sum, r) => sum + r.summary.passed, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.summary.failed, 0);
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);

  const passRate = totalTests > 0 ? totalPassed / totalTests : 0;

  let totalScore = 0;
  let scoreCount = 0;
  for (const result of results) {
    for (const testResult of result.results) {
      for (const score of testResult.scores) {
        totalScore += score.value;
        scoreCount++;
      }
    }
  }
  const avgScore = scoreCount > 0 ? totalScore / scoreCount : 0;

  console.log();
  console.log(pc.bold("Aggregated Summary"));
  console.log(pc.dim("─".repeat(40)));

  // Suite count
  console.log(`  Suites:    ${results.length} total`);

  // Test counts
  const passedStr = totalPassed > 0 ? pc.green(`${totalPassed} passed`) : "0 passed";
  const failedStr = totalFailed > 0 ? pc.red(`${totalFailed} failed`) : "0 failed";
  console.log(`  Tests:     ${passedStr}, ${failedStr}, ${totalTests} total`);

  // Pass rate
  const passRateStr = (passRate * 100).toFixed(1);
  const passRateColor = passRate >= 0.9 ? pc.green : passRate >= 0.7 ? pc.yellow : pc.red;
  console.log(`  Pass rate: ${passRateColor(`${passRateStr}%`)}`);

  // Average score
  if (avgScore > 0) {
    const avgScoreStr = (avgScore * 100).toFixed(1);
    const avgScoreColor = avgScore >= 0.7 ? pc.green : avgScore >= 0.5 ? pc.yellow : pc.red;
    console.log(`  Avg score: ${avgScoreColor(`${avgScoreStr}%`)}`);
  }

  // Duration
  const durationSec = (totalDuration / 1000).toFixed(2);
  console.log(`  Duration:  ${pc.dim(`${durationSec}s`)}`);

  console.log();

  // Final status
  if (totalFailed === 0) {
    console.log(pc.green(pc.bold("All tests passed!")));
  } else {
    console.log(pc.red(pc.bold(`${totalFailed} test(s) failed`)));
  }
}

/**
 * Print error message
 */
export function printError(message: string): void {
  console.error(pc.red(`Error: ${message}`));
}

/**
 * Print warning message
 */
export function printWarning(message: string): void {
  console.warn(pc.yellow(`Warning: ${message}`));
}

/**
 * Print info message
 */
export function printInfo(message: string): void {
  console.log(pc.cyan(message));
}
