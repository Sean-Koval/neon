/**
 * @neon/sdk
 *
 * Neon Agent Ops SDK - Evals as code
 *
 * @example
 * ```typescript
 * import { Neon, defineTest, defineSuite, llmJudge } from '@neon/sdk';
 *
 * // Create client
 * const neon = new Neon({ apiKey: process.env.NEON_API_KEY });
 *
 * // Define tests
 * const test = defineTest({
 *   name: 'weather-query',
 *   input: { query: 'Weather in NYC?' },
 *   expected: { toolCalls: ['get_weather'] },
 *   scorers: ['tool_selection'],
 * });
 *
 * // Define suite
 * const suite = defineSuite({
 *   name: 'my-agent-v1',
 *   tests: [test],
 *   scorers: {
 *     tool_selection: toolSelectionScorer(),
 *     quality: llmJudge({ prompt: 'Rate quality...' }),
 *   },
 * });
 *
 * // Run evaluation
 * const result = await neon.eval.runSuite(suite);
 * ```
 */

// Client
export { Neon, createNeonClient, type NeonConfig } from "./client";

// Test definitions
export {
  defineTest,
  defineDataset,
  defineSuite,
  validateTest,
  validateSuite,
  type Test,
  type Dataset,
  type Suite,
  type TestResult,
  type SuiteResult,
} from "./test";

// Scorers
export {
  // Base
  defineScorer,
  combineScorers,
  invertScorer,
  withThreshold,
  type Scorer,
  type ScorerConfig,
  type EvalContext,
  type ScoreResult,
  // LLM Judge
  llmJudge,
  responseQualityJudge,
  safetyJudge,
  helpfulnessJudge,
  type LLMJudgeConfig,
  // Rule-based
  ruleBasedScorer,
  toolSelectionScorer,
  containsScorer,
  exactMatchScorer,
  jsonMatchScorer,
  latencyScorer,
  errorRateScorer,
  tokenEfficiencyScorer,
  successScorer,
  iterationScorer,
  type RuleBasedConfig,
} from "./scorers";

// Tracing
export {
  trace,
  span,
  generation,
  tool,
  traced,
  scored,
  withContext,
  getCurrentContext,
  setCurrentContext,
  type TraceContext,
  type SpanOptions,
} from "./tracing";

// Runner
export {
  TestRunner,
  runSuite,
  runSuites,
  consoleReporter,
  jsonReporter,
  type RunnerOptions,
  type Reporter,
} from "./runner";
