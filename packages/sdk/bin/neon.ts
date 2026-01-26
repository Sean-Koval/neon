#!/usr/bin/env node
/**
 * Neon CLI
 *
 * Command-line interface for running evaluations.
 */

import { program } from "commander";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { glob } from "glob";

program
  .name("neon")
  .description("Neon Agent Ops CLI")
  .version("0.1.0");

// ==================== Eval Command ====================

program
  .command("eval")
  .description("Run evaluations")
  .option("-f, --file <path>", "Specific eval file to run")
  .option("-s, --suite <name>", "Run a specific suite by name")
  .option("--filter <pattern>", "Filter tests by name pattern")
  .option("-p, --parallel <n>", "Number of parallel tests", "1")
  .option("-o, --output <format>", "Output format (console, json)", "console")
  .option("--timeout <ms>", "Test timeout in milliseconds", "60000")
  .action(async (options) => {
    try {
      // Find eval files
      let files: string[] = [];

      if (options.file) {
        files = [resolve(options.file)];
      } else {
        // Look for *.eval.ts files
        files = await glob("**/*.eval.ts", {
          ignore: ["node_modules/**"],
          cwd: process.cwd(),
        });
        files = files.map((f) => resolve(f));
      }

      if (files.length === 0) {
        console.error("No eval files found");
        process.exit(1);
      }

      console.log(`Found ${files.length} eval file(s)`);

      // Import and run each file
      for (const file of files) {
        if (!existsSync(file)) {
          console.error(`File not found: ${file}`);
          continue;
        }

        console.log(`\nLoading: ${file}`);

        try {
          // Dynamic import
          const module = await import(file);

          // Find exported suites
          const suites = Object.entries(module)
            .filter(
              ([, value]) =>
                value &&
                typeof value === "object" &&
                "tests" in (value as object)
            )
            .map(([name, value]) => ({ name, suite: value }));

          if (suites.length === 0) {
            console.warn(`No suites found in ${file}`);
            continue;
          }

          // Filter by suite name if specified
          let suitesToRun = suites;
          if (options.suite) {
            suitesToRun = suites.filter((s) =>
              s.name.toLowerCase().includes(options.suite.toLowerCase())
            );
          }

          // Run suites
          const { TestRunner, consoleReporter, jsonReporter } = await import(
            "../dist/runner/index.js"
          );

          const reporter =
            options.output === "json" ? jsonReporter : consoleReporter;

          const runner = new TestRunner({
            parallel: parseInt(options.parallel),
            timeout: parseInt(options.timeout),
            reporter,
            filter: options.filter,
          });

          for (const { suite } of suitesToRun) {
            await runner.runSuite(suite as Parameters<typeof runner.runSuite>[0]);
          }
        } catch (error) {
          console.error(`Error running ${file}:`, error);
        }
      }
    } catch (error) {
      console.error("Error:", error);
      process.exit(1);
    }
  });

// ==================== Report Command ====================

program
  .command("report")
  .description("Generate evaluation report")
  .option("--run <id>", "Evaluation run ID")
  .option("-o, --output <format>", "Output format (console, json, html)", "console")
  .action(async (options) => {
    if (!options.run) {
      console.error("--run <id> is required");
      process.exit(1);
    }

    console.log(`Generating report for run: ${options.run}`);

    // TODO: Fetch run results and generate report
    console.log("Report generation not yet implemented");
  });

// ==================== Compare Command ====================

program
  .command("compare")
  .description("Compare two evaluation runs")
  .argument("<run1>", "First run ID")
  .argument("<run2>", "Second run ID")
  .option("-o, --output <format>", "Output format (console, json)", "console")
  .action(async (run1, run2, options) => {
    console.log(`Comparing runs: ${run1} vs ${run2}`);

    // TODO: Fetch both runs and compare
    console.log("Comparison not yet implemented");
  });

// ==================== Init Command ====================

program
  .command("init")
  .description("Initialize Neon in a project")
  .action(async () => {
    console.log("Initializing Neon...");

    // Create example eval file
    const exampleEval = `/**
 * Example evaluation file
 *
 * Run with: npx neon eval
 */

import {
  defineTest,
  defineSuite,
  toolSelectionScorer,
  llmJudge,
} from '@neon/sdk';

// Define a test case
const weatherTest = defineTest({
  name: 'weather-query',
  input: { query: 'What is the weather in NYC?' },
  expected: {
    toolCalls: ['get_weather'],
    outputContains: ['temperature'],
  },
  scorers: ['tool_selection', 'response_quality'],
});

// Define the suite
export const exampleSuite = defineSuite({
  name: 'example-agent',
  tests: [weatherTest],
  scorers: {
    tool_selection: toolSelectionScorer(),
    response_quality: llmJudge({
      prompt: \`Rate the response quality from 0 to 1.

Input: {{input}}
Output: {{output}}

Provide JSON: {"score": <0-1>, "reason": "<explanation>"}\`,
    }),
  },
});
`;

    const evalPath = join(process.cwd(), "evals", "example.eval.ts");

    // Check if file exists
    if (existsSync(evalPath)) {
      console.log(`File already exists: ${evalPath}`);
    } else {
      // Create directory and file
      const { mkdirSync, writeFileSync } = await import("fs");
      mkdirSync(join(process.cwd(), "evals"), { recursive: true });
      writeFileSync(evalPath, exampleEval);
      console.log(`Created: ${evalPath}`);
    }

    console.log("\nNext steps:");
    console.log("1. Set NEON_API_KEY environment variable");
    console.log("2. Edit evals/example.eval.ts");
    console.log("3. Run: npx neon eval");
  });

// Parse and run
program.parse();
