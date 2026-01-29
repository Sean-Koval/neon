#!/usr/bin/env node
/**
 * Neon CLI
 *
 * Command-line interface for running evaluations.
 */

import { Command } from "commander";
import pc from "picocolors";
import { runEval } from "./commands/eval.js";
import { printError } from "./reporter.js";

// Get version from package.json at build time
const VERSION = "0.1.0";

/**
 * Create the CLI program
 */
function createProgram(): Command {
  const program = new Command();

  program
    .name("neon")
    .description("Neon Agent Ops - Evaluate AI agents with confidence")
    .version(VERSION, "-v, --version", "Show version number");

  // Eval command
  program
    .command("eval")
    .description("Run evaluation tests")
    .argument("[patterns...]", "Glob patterns for test file discovery", [])
    .option("-f, --filter <pattern>", "Filter tests by name pattern")
    .option("-p, --parallel <number>", "Number of parallel tests", parseInt, 1)
    .option("-t, --timeout <ms>", "Timeout per test in milliseconds", parseInt, 60000)
    .option("--format <type>", "Output format (console, json)", "console")
    .option("--verbose", "Show verbose output", false)
    .option("--cwd <path>", "Working directory for test discovery", process.cwd())
    .option("--no-sync", "Disable syncing results to Neon cloud")
    .action(async (patterns: string[], options) => {
      const exitCode = await runEval({
        pattern: patterns.length > 0 ? patterns : undefined,
        filter: options.filter,
        parallel: options.parallel,
        timeout: options.timeout,
        format: options.format,
        verbose: options.verbose,
        cwd: options.cwd,
        noSync: options.sync === false, // Commander.js negates the flag
      });
      process.exit(exitCode);
    });

  // Default action: show help if no command provided
  program.action(() => {
    program.outputHelp();
  });

  return program;
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const program = createProgram();

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof Error) {
      printError(error.message);
      if (process.env.DEBUG) {
        console.error(pc.dim(error.stack));
      }
    } else {
      printError("An unexpected error occurred");
    }
    process.exit(1);
  }
}

// Run CLI
main();
