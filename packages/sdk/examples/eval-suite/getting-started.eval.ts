/**
 * Getting Started with Neon Evals
 *
 * This is the simplest possible evaluation file to get you started.
 * It demonstrates the core concepts without overwhelming complexity.
 *
 * Run with: npx neon eval examples/eval-suite/getting-started.eval.ts
 */

import { defineTest, defineSuite, exactMatch, contains } from "@neon/sdk";

// ============================================================================
// Step 1: Define Your Tests
// ============================================================================

/**
 * A test case has:
 * - name: Unique identifier for the test
 * - input: What gets passed to your agent
 * - expected: What you expect back (optional)
 */
const helloWorldTest = defineTest({
  name: "hello-world",
  input: {
    query: "Say hello!",
  },
  expected: {
    // The agent's output should contain "hello" (case-insensitive)
    outputContains: ["hello"],
  },
});

const simpleQuestionTest = defineTest({
  name: "simple-question",
  input: {
    query: "What color is the sky?",
  },
  expected: {
    outputContains: ["blue"],
  },
});

const exactAnswerTest = defineTest({
  name: "exact-answer",
  input: {
    query: "What is 1 + 1?",
  },
  expected: {
    // For precise answers, use exact output matching
    output: "2",
  },
});

// ============================================================================
// Step 2: Create a Suite
// ============================================================================

/**
 * A suite groups related tests and defines how to score them.
 */
export const gettingStartedSuite = defineSuite({
  name: "getting-started",

  // List all tests to run
  tests: [helloWorldTest, simpleQuestionTest, exactAnswerTest],

  // Define scorers (evaluation metrics)
  scorers: {
    // Built-in: Check if output contains expected strings
    has_keywords: contains(),

    // Built-in: Check for exact match
    is_exact: exactMatch(),
  },

  // Configuration options
  config: {
    parallel: 1, // Run tests sequentially (safest for getting started)
    timeout: 30000, // 30 second timeout per test
  },
});

// ============================================================================
// Step 3: Export for CLI
// ============================================================================

/**
 * Default export is discovered by `npx neon eval`
 */
export default gettingStartedSuite;

/**
 * Next steps:
 *
 * 1. Run this eval:
 *    npx neon eval examples/eval-suite/getting-started.eval.ts
 *
 * 2. See agent-eval.eval.ts for more advanced examples including:
 *    - LLM judges (AI-powered evaluation)
 *    - Custom scorers
 *    - Inline scorers
 *    - Tool selection verification
 *    - Datasets
 *    - Parallel execution
 *
 * 3. Create your own eval file:
 *    - Name it *.eval.ts (or *.eval.js)
 *    - Export a default suite
 *    - Run with: npx neon eval path/to/your/file.eval.ts
 */
