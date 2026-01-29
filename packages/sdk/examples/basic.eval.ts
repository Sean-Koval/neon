/**
 * Basic evaluation example
 *
 * Demonstrates how to create an evaluation file for the Neon CLI.
 */

import { defineSuite, defineTest, exactMatch, contains } from "@neon/sdk";

// Define individual tests
const greetingTest = defineTest({
  name: "greeting-response",
  input: { query: "Hello!" },
  expected: {
    outputContains: ["hello", "hi"],
  },
});

const mathTest = defineTest({
  name: "math-calculation",
  input: { query: "What is 2 + 2?" },
  expected: {
    output: "4",
  },
});

// Define the suite with tests and scorers
export const basicSuite = defineSuite({
  name: "basic-agent-tests",
  tests: [greetingTest, mathTest],
  scorers: {
    greeting_check: contains(["hello", "hi", "greetings"], { caseSensitive: false }),
  },
  config: {
    parallel: 2,
    timeout: 30000,
  },
});

// Default export also works
export default basicSuite;
