/**
 * Failing evaluation file
 *
 * Used for testing failure handling in the CLI.
 */

import { defineSuite, defineTest, exactMatch } from "../dist/index.js";

const passingTest = defineTest({
  name: "passing-test",
  input: { message: "Hello" },
});

const failingTest = defineTest({
  name: "failing-test",
  input: { message: "Test" },
  scorers: ["always_fail"],
});

export const failingSuite = defineSuite({
  name: "failing-suite",
  tests: [passingTest, failingTest],
  scorers: {
    always_fail: {
      name: "always_fail",
      evaluate: async () => ({
        value: 0.3,
        reason: "This scorer always returns a low score",
      }),
    },
  },
});
