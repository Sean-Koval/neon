/**
 * @neon/sdk
 *
 * Neon Agent Ops SDK - Evals as code
 *
 * @example
 * ```typescript
 * import {
 *   Neon,
 *   defineTest,
 *   defineSuite,
 *   exactMatch,
 *   contains,
 *   llmJudge
 * } from '@neon/sdk';
 *
 * // Create client
 * const neon = new Neon({ apiKey: process.env.NEON_API_KEY });
 *
 * // Define tests with scorers
 * const test = defineTest({
 *   name: 'weather-query',
 *   input: { query: 'Weather in NYC?' },
 *   expected: { toolCalls: ['get_weather'] },
 *   scorers: ['tool_selection', 'quality'],
 * });
 *
 * // Define suite with scorer implementations
 * const suite = defineSuite({
 *   name: 'my-agent-v1',
 *   tests: [test],
 *   scorers: {
 *     tool_selection: toolSelectionScorer(),
 *     output_check: exactMatch('sunny'),
 *     keywords: contains(['weather', 'temperature']),
 *     quality: llmJudge({
 *       prompt: 'Rate response quality 0-1: {{output}}',
 *     }),
 *   },
 * });
 *
 * // Run evaluation
 * const result = await neon.eval.runSuite(suite);
 * ```
 */

// Client
export { Neon, createNeonClient, type NeonConfig } from "./client.js";

// Test definitions
export {
  defineTest,
  defineDataset,
  defineSuite,
  validateTest,
  validateSuite,
  run,
  type Test,
  type Dataset,
  type Suite,
  type TestResult,
  type SuiteResult,
  type ExpectedOutput,
  type InlineScorer,
  type RunOptions,
  type AgentOutput,
} from "./test.js";

// Scorers
export {
  // Base
  defineScorer,
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
  // Rule-based (new API - preferred)
  exactMatch,
  contains,
  // Rule-based (legacy aliases)
  containsScorer,
  exactMatchScorer,
  // Other rule-based
  ruleBasedScorer,
  toolSelectionScorer,
  jsonMatchScorer,
  latencyScorer,
  errorRateScorer,
  tokenEfficiencyScorer,
  successScorer,
  iterationScorer,
  type RuleBasedConfig,
  type ContainsConfig,
  type ExactMatchConfig,
  // Causal analysis
  causalAnalysisScorer,
  causalAnalysisDetailedScorer,
  rootCauseScorer,
  analyzeCausality,
  type CausalAnalysisConfig,
  type CausalAnalysisResult,
  type CausalNode,
} from "./scorers/index.js";

// Tracing (local context management)
export {
  trace,
  span,
  generation,
  tool,
  retrieval,
  reasoning,
  planning,
  prompt,
  routing,
  memory,
  withContext,
  getCurrentContext,
  setCurrentContext,
  type TraceContext,
  type SpanOptions,
  type ComponentType,
} from "./tracing/index.js";

// Runner
export {
  TestRunner,
  runSuite,
  runSuites,
  consoleReporter,
  jsonReporter,
  type RunnerOptions,
  type Reporter,
} from "./runner/index.js";

// Cloud sync
export {
  NeonCloudClient,
  CloudSyncError,
  createCloudClientFromEnv,
  isCloudSyncConfigured,
  syncResultsToCloud,
  syncSuiteResult,
  createBackgroundSync,
  formatSyncStatus,
  type CloudConfig,
  type EvalSyncPayload,
  type SyncResponse,
  type SyncOptions,
  type SyncResult,
} from "./cloud/index.js";

// Threshold configuration (for CI/CD)
export {
  parseThreshold,
  getThreshold,
  evaluateThreshold,
  evaluateAllThresholds,
  DEFAULT_THRESHOLD,
  type ThresholdConfig,
  type ThresholdResult,
} from "./threshold.js";

// CI/CD JSON output
export {
  generateCIOutput,
  formatCIOutput,
  JSON_SCHEMA_VERSION,
  type CIOutput,
  type JSONSuiteResult,
  type JSONTestResult,
  type JSONScoreResult,
  type JSONOutputOptions,
} from "./cli/reporters/json-reporter.js";

// CLI exit codes
export { EXIT_CODES } from "./cli/commands/eval.js";

// Prompts
export {
  // Types
  type Prompt,
  type PromptBase,
  type PromptVariable,
  type PromptMessage,
  type PromptConfig,
  type CreatePromptRequest,
  type UpdatePromptRequest,
  type GetPromptRequest,
  type ListPromptsRequest,
  type PromptVersionEntry,
  type PromptExecutionContext,
  type CompiledPrompt,
  // Manager
  PromptManager,
  promptManager,
  definePrompt,
  defineTextPrompt,
  defineChatPrompt,
} from "./prompts/index.js";

// Optimization signals
export {
  // Types
  type SignalType,
  type SignalSource,
  type SignalGranularity,
  type Signal,
  type RewardSignal,
  type PreferenceSignal,
  type DemonstrationSignal,
  type FeedbackSignal,
  type MetricSignal,
  type EventSignal,
  type AnySignal,
  type DemonstrationAction,
  type FeedbackCategory,
  type SignalBatch,
  type SignalAggregation,
  type SignalGeneratorConfig,
  type SignalFilter,
  type SignalContext,
  type SignalGenerationResult,
  // Signal generation
  generateSignals,
  generateRewardSignals,
  generateDemonstrationSignals,
  generateMetricSignals,
  generateEventSignals,
  generatePreferenceSignal,
  // Utilities
  filterSignals,
  aggregateSignals,
  createSignalBatch,
  toRLHFFormat,
  // Config types
  type RewardSignalConfig,
  type DemonstrationSignalConfig,
  type MetricSignalConfig,
  type EventSignalConfig,
  type PreferenceSignalConfig,
  type ComprehensiveSignalConfig,
} from "./optimization/index.js";

// Export utilities (Agent Lightning, etc.)
export {
  // Agent Lightning format
  exportToAgentLightning,
  exportBatchToAgentLightning,
  streamExportToAgentLightning,
  validateAgentLightningBatch,
  mergeAgentLightningBatches,
  type AgentLightningTransition,
  type AgentLightningEpisode,
  type AgentLightningBatch,
  type AgentLightningFilter,
  type AgentLightningExportConfig,
  type ExportContext,
  type ScoreData,
  type StreamExportConfig,
} from "./export/index.js";
