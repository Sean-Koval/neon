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
  // Skill selection
  skillSelectionScorer,
  skillChainScorer,
  skillSetScorer,
  firstSkillScorer,
  skillCategoryScorer,
  skillConfidenceScorer,
  type SkillSelectionConfig,
  type SkillSubstitutes,
  type SkillCategoryMap,
  type SkillSelectionDetails,
  // Parameter accuracy
  parameterAccuracyScorer,
  parameterTypeScorer,
  parameterCompletenessScorer,
  parameterValueMatchScorer,
  parameterConstraintScorer,
  type ParameterType,
  type ParameterSchemaItem,
  type ParameterAccuracyConfig,
  type ParameterAccuracyDetails,
  // Result quality
  resultQualityScorer,
  outputTypeScorer,
  outputPatternScorer,
  outputCompletenessScorer,
  outputLengthScorer,
  noForbiddenPatternsScorer,
  resultSuccessScorer,
  resultLatencyScorer,
  type OutputType,
  type ResultQualityConfig,
  type ResultQualityDetails,
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
  mcp,
  withContext,
  getCurrentContext,
  setCurrentContext,
  // MCP tracing
  withMCPTracing,
  mcpToolCall,
  MCPHealthTracker,
  type TraceContext,
  type SpanOptions,
  type ComponentType,
  type MCPClient,
  type MCPTracingConfig,
  type MCPToolCallResult,
  type MCPServerHealth,
  type MCPConnectionEvent,
  // Offline buffer
  OfflineBuffer,
  createOfflineBuffer,
  createAndInitializeOfflineBuffer,
  createBufferableSpan,
  getGlobalBuffer,
  resetGlobalBuffer,
  isBufferHealthy,
  type BufferedSpan,
  type FlushStrategy,
  type OfflineBufferConfig,
  type FlushResult,
  type BufferStats,
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

// Export utilities - Training data export for fine-tuning (Agent Lightning, OpenAI, TRL, DSPy)
export {
  // Generic export system
  exportRegistry,
  registerFormat,
  registerFormatAlias,
  getFormat,
  listFormats,
  exportTraces,
  exportTracesToFile,
  streamExport,
  validateExport,
  parseExport,
  extractMessages,
  extractPromptCompletions,
  flattenSpans,
  filterSpans,
  estimateTokenCount,
  truncateText,
  type ExportFormat,
  type BaseExportConfig,
  type TraceExportContext,
  type ExportResult,
  type ExportStats,
  // OpenAI fine-tuning format
  openAIFineTuneFormat,
  tracesToOpenAI,
  tracesToOpenAIJSONL,
  parseOpenAIJSONL,
  validateOpenAIExamples,
  type OpenAIRole,
  type OpenAIFunctionCall,
  type OpenAIToolCall,
  type OpenAIMessage,
  type OpenAIFineTuneExample,
  type OpenAIFineTuneConfig,
  // HuggingFace TRL formats
  trlFormat,
  trlSFTFormat,
  trlDPOFormat,
  trlKTOFormat,
  tracesToSFT,
  tracesToDPO,
  tracesToKTO,
  createDPOPairs,
  toTRLJSONL,
  parseTRLJSONL,
  type TRLMode,
  type TRLSFTExample,
  type TRLDPOExample,
  type TRLKTOExample,
  type TRLExample,
  type TRLConfig,
  // Agent Lightning format (RL training)
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
  // DSPy format
  exportToDSPy,
  exportBatchToDSPy,
  streamExportToDSPy,
  validateDSPyDataset,
  mergeDSPyDatasets,
  datasetToJSONL,
  generateDSPyLoaderCode,
  type DSPyExample,
  type DSPyExampleMetadata,
  type DSPyPreset,
  type DSPyFieldMapping,
  type DSPyFilter,
  type DSPyExportConfig,
  type DSPyScoreData,
  type DSPyExportContext,
  type DSPyDataset,
  type DSPyStreamExportConfig,
} from "./export/index.js";

// A/B Testing Framework (comparison module)
export {
  // Variant API
  defineVariant,
  defineControl,
  defineTreatment,
  validateVariants,
  getControlVariant,
  getTreatmentVariants,
  resetVariantIdCounter,
  // Experiment API
  defineExperiment,
  runExperiment,
  validateExperiment,
  // Seeded RNG (for reproducibility)
  createRng,
  getDefaultRng,
  setDefaultSeed,
  resetDefaultRng,
  // Statistical utilities
  mean,
  variance,
  stdDev,
  median,
  medianFromSorted,
  percentile,
  percentileFromSorted,
  calculatePercentiles,
  calculateMetricSummary,
  tTest,
  welchTest,
  mannWhitneyU,
  bootstrapConfidenceInterval,
  cohensD,
  cliffsDelta,
  calculateEffectSize,
  interpretEffectSize,
  compareMetric,
  bonferroniCorrection,
  holmCorrection,
  normalCDF,
  normalQuantile,
  tCDF,
  tQuantile,
  // Types
  type VariantType,
  type Variant,
  type VariantConfig,
  type DefineVariantOptions,
  type Experiment,
  type Hypothesis,
  type StatisticalConfig,
  type StatisticalTestType,
  type DefineExperimentOptions,
  type ExperimentResult,
  type VariantResult,
  type ComparisonResult,
  type MetricComparison,
  type MetricSummary,
  type ConfidenceInterval,
  type StatisticalSignificance,
  type EffectSize,
  type HypothesisResult,
  type ExperimentConclusion,
  type ExperimentExecutionMetadata,
  type ExperimentRunOptions,
  type ExperimentProgress,
  type RandomState,
} from "./comparison/index.js";

// Skill Evaluation Framework
export {
  // Define functions
  defineSkillEval,
  defineSkillEvalSuite,
  // Run functions
  runSkillEval,
  runSkillEvalSuite,
  // Utility functions
  skillTestFromSpan,
  generateSkillTestCases,
  // Types
  type ParameterSchema,
  type SkillBehavior,
  type SkillTestCase,
  type SkillResult,
  type SkillEval,
  type SkillTestResult,
  type SkillEvalResult,
  type SkillEvalOptions,
  type SkillEvalSuite,
} from "./evals/index.js";
