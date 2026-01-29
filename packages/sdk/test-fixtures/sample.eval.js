/**
 * Sample evaluation file (pre-compiled JS)
 *
 * Used for testing the CLI flow.
 */

import { defineSuite, defineTest, exactMatch, contains } from "../dist/index.js";

const simpleTest = defineTest({
  name: "simple-test",
  input: { message: "Hello" },
  expected: {
    output: "Hello back!",
  },
});

const scorerTest = defineTest({
  name: "scorer-test",
  input: { message: "Test message" },
  scorers: ["keyword_check"],
});

export const sampleSuite = defineSuite({
  name: "sample-suite",
  tests: [simpleTest, scorerTest],
  scorers: {
    keyword_check: contains(["test", "message"]),
  },
  config: {
    parallel: 1,
  },
});

export default sampleSuite;
