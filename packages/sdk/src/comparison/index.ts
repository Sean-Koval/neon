/**
 * A/B Testing Framework
 *
 * Define and run experiments to compare agent variants with statistical rigor.
 *
 * @example
 * ```typescript
 * import {
 *   defineControl,
 *   defineTreatment,
 *   defineExperiment,
 *   runExperiment,
 * } from '@neon/sdk';
 *
 * // Define variants
 * const control = defineControl({
 *   name: 'GPT-4 Baseline',
 *   config: { model: 'gpt-4', temperature: 0.7 },
 * });
 *
 * const treatment = defineTreatment({
 *   name: 'GPT-4 Turbo',
 *   config: { model: 'gpt-4-turbo', temperature: 0.5 },
 * });
 *
 * // Define experiment
 * const experiment = defineExperiment({
 *   name: 'Model Comparison',
 *   variants: [control, treatment],
 *   suite: mySuite,
 *   primaryMetric: 'response_quality',
 *   hypotheses: [{
 *     metric: 'response_quality',
 *     direction: 'increase',
 *     minimumEffect: 0.1,
 *   }],
 * });
 *
 * // Run experiment
 * const result = await runExperiment(experiment, {
 *   runsPerVariant: 100,
 *   agent: async (input, variant) => {
 *     return await myAgent.invoke(input, variant.config);
 *   },
 * });
 *
 * console.log(result.conclusion.summary);
 * ```
 */

// Types
export type {
  // Variant types
  VariantType,
  Variant,
  VariantConfig,
  // Experiment types
  Experiment,
  Hypothesis,
  StatisticalConfig,
  StatisticalTestType,
  // Result types
  ExperimentResult,
  VariantResult,
  ComparisonResult,
  MetricComparison,
  MetricSummary,
  ConfidenceInterval,
  StatisticalSignificance,
  EffectSize,
  HypothesisResult,
  ExperimentConclusion,
  ExperimentExecutionMetadata,
  // Run options
  ExperimentRunOptions,
  ExperimentProgress,
} from "./types.js";

// Variant API
export {
  defineVariant,
  defineControl,
  defineTreatment,
  validateVariants,
  getControlVariant,
  getTreatmentVariants,
  resetVariantIdCounter,
  type DefineVariantOptions,
} from "./variant.js";

// Experiment API
export {
  defineExperiment,
  runExperiment,
  validateExperiment,
  type DefineExperimentOptions,
} from "./experiment.js";

// Statistical utilities
export {
  // Seeded RNG (for reproducibility)
  createRng,
  getDefaultRng,
  setDefaultSeed,
  resetDefaultRng,
  type RandomState,
  // Basic statistics
  mean,
  variance,
  stdDev,
  median,
  medianFromSorted,
  percentile,
  percentileFromSorted,
  calculatePercentiles,
  calculateMetricSummary,
  // Statistical tests
  tTest,
  welchTest,
  mannWhitneyU,
  bootstrapConfidenceInterval,
  // Effect size
  cohensD,
  cliffsDelta,
  calculateEffectSize,
  interpretEffectSize,
  // Comparison
  compareMetric,
  // Multiple comparison corrections
  bonferroniCorrection,
  holmCorrection,
  // Distribution functions
  normalCDF,
  normalQuantile,
  tCDF,
  tQuantile,
} from "./statistics.js";
