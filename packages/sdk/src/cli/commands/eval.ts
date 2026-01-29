/**
 * Eval Command
 *
 * Discovers and runs test files matching glob patterns.
 */

import { glob } from "glob";
import { pathToFileURL } from "node:url";
import path from "node:path";
import pc from "picocolors";
import type { Suite, SuiteResult } from "../../test.js";
import { TestRunner } from "../../runner/index.js";
import {
  createCLIReporter,
  printAggregatedSummary,
  printError,
  printInfo,
  type ReporterFormat,
} from "../reporter.js";
import {
  isCloudSyncConfigured,
  createBackgroundSync,
  formatSyncStatus,
  type SyncResult,
} from "../../cloud/index.js";

/**
 * Eval command options
 */
export interface EvalOptions {
  /** Glob patterns to match test files */
  pattern?: string[];
  /** Filter tests by name */
  filter?: string;
  /** Number of parallel tests */
  parallel?: number;
  /** Timeout per test in ms */
  timeout?: number;
  /** Output format */
  format?: ReporterFormat;
  /** Show verbose output */
  verbose?: boolean;
  /** Working directory */
  cwd?: string;
  /** Disable syncing results to Neon cloud */
  noSync?: boolean;
}

/**
 * Default glob patterns for test file discovery
 * Note: Only JS files by default - use tsx or compile TS files first
 */
const DEFAULT_PATTERNS = ["**/*.eval.js", "**/eval.js"];

/**
 * Patterns to always ignore
 */
const IGNORE_PATTERNS = ["**/node_modules/**", "**/dist/**", "**/.git/**"];

/**
 * Run the eval command
 */
export async function runEval(options: EvalOptions = {}): Promise<number> {
  const {
    pattern = DEFAULT_PATTERNS,
    filter,
    parallel = 1,
    timeout = 60000,
    format = "console",
    verbose = false,
    cwd = process.cwd(),
    noSync = false,
  } = options;

  const startTime = Date.now();

  // Discover test files
  if (format !== "json") {
    printInfo(`Discovering test files...`);
    if (verbose) {
      console.log(pc.dim(`  Patterns: ${pattern.join(", ")}`));
      console.log(pc.dim(`  Directory: ${cwd}`));
    }
  }

  const files = await discoverTestFiles(pattern, cwd);

  if (files.length === 0) {
    if (format !== "json") {
      printError(`No test files found matching patterns: ${pattern.join(", ")}`);
      console.log();
      console.log(pc.dim("Tip: Test files should match one of these patterns:"));
      for (const p of DEFAULT_PATTERNS) {
        console.log(pc.dim(`  - ${p}`));
      }
    }
    return 1;
  }

  if (format !== "json") {
    console.log(pc.green(`Found ${files.length} test file(s)`));
    if (verbose) {
      for (const file of files) {
        console.log(pc.dim(`  - ${path.relative(cwd, file)}`));
      }
    }
    console.log();
  }

  // Load test suites from files
  const suites = await loadTestSuites(files, format !== "json");

  if (suites.length === 0) {
    if (format !== "json") {
      printError("No test suites found in test files");
      console.log();
      console.log(pc.dim("Tip: Export a suite using `export const suite = defineSuite({...})`"));
      console.log(pc.dim("     or `export default defineSuite({...})`"));
    }
    return 1;
  }

  if (format !== "json") {
    console.log(pc.green(`Loaded ${suites.length} suite(s)`));
    console.log();
  }

  // Create reporter and runner
  const reporter = createCLIReporter({ format, verbose, showScores: true });
  const runner = new TestRunner({
    parallel,
    timeout,
    reporter,
    filter,
  });

  // Run all suites
  const results: SuiteResult[] = [];
  let hasFailures = false;

  for (const suite of suites) {
    try {
      const result = await runner.runSuite(suite);
      results.push(result);
      if (result.summary.failed > 0) {
        hasFailures = true;
      }
    } catch (error) {
      if (format !== "json") {
        printError(`Failed to run suite "${suite.name}": ${error instanceof Error ? error.message : "Unknown error"}`);
      }
      hasFailures = true;
    }
  }

  // Print aggregated summary for multiple suites
  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
  } else if (results.length > 1) {
    printAggregatedSummary(results);
  }

  // Sync results to cloud (unless disabled)
  let syncResults: SyncResult[] = [];
  if (!noSync && results.length > 0) {
    // Start background sync - don't block the main flow
    const syncPromise = createBackgroundSync(results, {
      metadata: {
        cwd,
        patterns: pattern,
        filter,
      },
    });

    // Wait for sync to complete (it handles its own errors)
    syncResults = await syncPromise;
  }

  // Print total duration
  if (format !== "json") {
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log();
    console.log(pc.dim(`Total time: ${totalDuration}s`));

    // Print sync status
    const syncStatus = formatSyncStatus(syncResults, verbose);
    if (syncStatus) {
      console.log();
      if (syncResults.every((r) => r.success)) {
        console.log(pc.green(syncStatus));
      } else if (syncResults.some((r) => r.skipped)) {
        console.log(pc.dim(syncStatus));
      } else {
        console.log(pc.yellow(syncStatus));
      }
    }
  }

  return hasFailures ? 1 : 0;
}

/**
 * Discover test files matching glob patterns
 */
async function discoverTestFiles(patterns: string[], cwd: string): Promise<string[]> {
  const allFiles = new Set<string>();

  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd,
      absolute: true,
      ignore: IGNORE_PATTERNS,
      nodir: true,
    });

    for (const file of matches) {
      allFiles.add(file);
    }
  }

  // Sort files for consistent ordering
  return Array.from(allFiles).sort();
}

/**
 * Load test suites from files
 */
async function loadTestSuites(files: string[], showOutput: boolean): Promise<Suite[]> {
  const suites: Suite[] = [];

  for (const file of files) {
    try {
      // Convert to file URL for ESM import
      const fileUrl = pathToFileURL(file).href;
      const module = await import(fileUrl);

      // Look for exported suites
      const exportedSuites = extractSuites(module);

      if (exportedSuites.length === 0 && showOutput) {
        console.log(pc.yellow(`Warning: No suites found in ${path.basename(file)}`));
      }

      suites.push(...exportedSuites);
    } catch (error) {
      if (showOutput) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.log(pc.red(`Error loading ${path.basename(file)}: ${errorMessage}`));

        // Provide helpful hint for TypeScript files
        if (file.endsWith(".ts") && errorMessage.includes("Unknown file extension")) {
          console.log(pc.dim(`  Hint: TypeScript files must be compiled to JavaScript first.`));
          console.log(pc.dim(`  Run 'tsc' or use 'tsx' to execute TypeScript directly.`));
        }
      }
    }
  }

  return suites;
}

/**
 * Extract suites from a module
 */
function extractSuites(module: Record<string, unknown>): Suite[] {
  const suites: Suite[] = [];
  const seen = new Set<unknown>();

  // Check default export first
  if (module.default && isSuite(module.default)) {
    suites.push(module.default);
    seen.add(module.default);
  }

  // Check named exports (skip if same object as default)
  for (const [key, value] of Object.entries(module)) {
    if (key !== "default" && isSuite(value) && !seen.has(value)) {
      suites.push(value);
      seen.add(value);
    }
  }

  return suites;
}

/**
 * Type guard to check if value is a Suite
 */
function isSuite(value: unknown): value is Suite {
  if (!value || typeof value !== "object") {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.name === "string" &&
    Array.isArray(obj.tests) &&
    obj.tests.length > 0
  );
}
