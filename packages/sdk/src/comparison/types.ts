/**
 * A/B Testing Framework Types
 *
 * Types for defining experiments, variants, and statistical comparisons.
 */

import type { Suite, SuiteResult, TestResult } from "../test/index.js";
import type { Scorer } from "../scorers/base.js";

/**
 * Variant type for A/B testing
 */
export type VariantType = "control" | "treatment";

/**
 * A variant definition for A/B testing
 */
export interface Variant {
  /** Unique identifier for the variant */
  id: string;
  /** Human-readable name */
  name: string;
  /** Variant type (control or treatment) */
  type: VariantType;
  /** Optional description */
  description?: string;
  /** Agent configuration for this variant */
  config: VariantConfig;
  /** Traffic allocation percentage (0-100) */
  allocation?: number;
}

/**
 * Configuration for a variant's agent
 */
export interface VariantConfig {
  /** Agent ID or version */
  agentId?: string;
  /** Agent version */
  agentVersion?: string;
  /** Model to use */
  model?: string;
  /** System prompt override */
  systemPrompt?: string;
  /** Temperature setting */
  temperature?: number;
  /** Maximum tokens */
  maxTokens?: number;
  /** Custom parameters */
  parameters?: Record<string, unknown>;
}

/**
 * Statistical hypothesis for the experiment
 */
export interface Hypothesis {
  /** Metric to measure */
  metric: string;
  /** Expected direction of improvement */
  direction: "increase" | "decrease" | "no_change";
  /** Minimum detectable effect size (optional) */
  minimumEffect?: number;
  /** Description of the hypothesis */
  description?: string;
}

/**
 * Experiment configuration
 */
export interface Experiment {
  /** Unique experiment identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of the experiment */
  description?: string;
  /** Variants being compared */
  variants: Variant[];
  /** Test suite to run for each variant */
  suite: Suite;
  /** Primary metric for comparison */
  primaryMetric: string;
  /** Additional metrics to track */
  secondaryMetrics?: string[];
  /** Hypotheses to test */
  hypotheses?: Hypothesis[];
  /** Statistical configuration */
  statisticalConfig?: StatisticalConfig;
  /** Experiment metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Statistical configuration for experiments
 */
export interface StatisticalConfig {
  /** Significance level (alpha), default 0.05 */
  alpha?: number;
  /** Statistical power (1 - beta), default 0.8 */
  power?: number;
  /** Minimum sample size per variant */
  minSampleSize?: number;
  /** Maximum sample size per variant */
  maxSampleSize?: number;
  /** Statistical test to use */
  test?: StatisticalTestType;
  /** Use correction for multiple comparisons */
  multipleComparisonCorrection?: "bonferroni" | "holm" | "none";
}

/**
 * Type of statistical test to perform
 */
export type StatisticalTestType =
  | "ttest"
  | "welch"
  | "mannwhitney"
  | "bootstrap";

/**
 * Result of running an experiment
 */
export interface ExperimentResult {
  /** Experiment that was run */
  experiment: Experiment;
  /** Results per variant */
  variantResults: VariantResult[];
  /** Statistical comparison results */
  comparison: ComparisonResult;
  /** Overall experiment conclusion */
  conclusion: ExperimentConclusion;
  /** Execution metadata */
  executionMetadata: ExperimentExecutionMetadata;
}

/**
 * Results for a single variant
 */
export interface VariantResult {
  /** Variant that was run */
  variant: Variant;
  /** Suite result */
  suiteResult: SuiteResult;
  /** Aggregated metrics */
  metrics: Record<string, MetricSummary>;
  /** Sample size */
  sampleSize: number;
}

/**
 * Summary statistics for a metric
 */
export interface MetricSummary {
  /** Metric name */
  name: string;
  /** Mean value */
  mean: number;
  /** Standard deviation */
  stdDev: number;
  /** Median value */
  median: number;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Sample size */
  count: number;
  /** Confidence interval */
  confidenceInterval: ConfidenceInterval;
  /** Percentiles */
  percentiles?: {
    p5: number;
    p25: number;
    p75: number;
    p95: number;
  };
}

/**
 * Confidence interval
 */
export interface ConfidenceInterval {
  /** Lower bound */
  lower: number;
  /** Upper bound */
  upper: number;
  /** Confidence level (e.g., 0.95 for 95%) */
  level: number;
}

/**
 * Statistical comparison between variants
 */
export interface ComparisonResult {
  /** Control variant */
  control: Variant;
  /** Treatment variant */
  treatment: Variant;
  /** Primary metric comparison */
  primaryMetric: MetricComparison;
  /** Secondary metric comparisons */
  secondaryMetrics: MetricComparison[];
  /** Hypothesis test results */
  hypothesisResults?: HypothesisResult[];
}

/**
 * Comparison for a single metric
 */
export interface MetricComparison {
  /** Metric name */
  metric: string;
  /** Control mean */
  controlMean: number;
  /** Treatment mean */
  treatmentMean: number;
  /** Absolute difference (treatment - control) */
  absoluteDiff: number;
  /** Relative difference as percentage */
  relativeDiff: number;
  /** Statistical significance */
  significance: StatisticalSignificance;
  /** Effect size */
  effectSize: EffectSize;
  /** Confidence interval for the difference */
  diffConfidenceInterval: ConfidenceInterval;
}

/**
 * Statistical significance result
 */
export interface StatisticalSignificance {
  /** P-value from the statistical test */
  pValue: number;
  /** Whether the result is significant at the configured alpha */
  isSignificant: boolean;
  /** The alpha level used */
  alpha: number;
  /** Statistical test used */
  testUsed: StatisticalTestType;
  /** Test statistic value */
  testStatistic: number;
}

/**
 * Effect size measures
 */
export interface EffectSize {
  /** Cohen's d */
  cohensD: number;
  /** Effect magnitude interpretation */
  magnitude: "negligible" | "small" | "medium" | "large";
  /** Cliff's delta (for non-parametric comparison) */
  cliffsDelta?: number;
}

/**
 * Result of testing a hypothesis
 */
export interface HypothesisResult {
  /** The hypothesis tested */
  hypothesis: Hypothesis;
  /** Whether the hypothesis was supported */
  supported: boolean;
  /** Statistical result */
  statisticalResult: StatisticalSignificance;
  /** Effect size observed */
  effectSize: EffectSize;
  /** Explanation */
  explanation: string;
}

/**
 * Overall conclusion of the experiment
 */
export interface ExperimentConclusion {
  /** Winning variant (or null if inconclusive) */
  winner: Variant | null;
  /** Confidence in the conclusion */
  confidence: "high" | "medium" | "low" | "inconclusive";
  /** Summary of the experiment */
  summary: string;
  /** Recommended action */
  recommendation: "ship_treatment" | "keep_control" | "continue_experiment" | "redesign";
  /** Detailed rationale */
  rationale: string[];
}

/**
 * Execution metadata for the experiment
 */
export interface ExperimentExecutionMetadata {
  /** Start time */
  startedAt: Date;
  /** End time */
  completedAt: Date;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Number of runs per variant */
  runsPerVariant: number;
  /** Any errors encountered */
  errors?: string[];
}

/**
 * Random number generator state (for reproducibility)
 */
export interface RandomState {
  /** Get next random number in [0, 1) */
  random: () => number;
  /** Reset to initial seed */
  reset: () => void;
  /** Get current seed */
  seed: number;
}

/**
 * Options for running an experiment
 */
export interface ExperimentRunOptions {
  /** Number of runs per variant */
  runsPerVariant?: number;
  /** Run variants in parallel */
  parallel?: boolean;
  /** Maximum concurrent runs */
  maxConcurrency?: number;
  /** Agent executor function */
  agent?: (
    input: Record<string, unknown>,
    variant: Variant
  ) => Promise<{
    output: string;
    toolCalls?: string[];
    traceId?: string;
    metadata?: Record<string, unknown>;
  }>;
  /** Progress callback */
  onProgress?: (progress: ExperimentProgress) => void;
  /** Scorers to use */
  scorers?: Record<string, Scorer>;
  /** Random number generator for reproducibility */
  rng?: RandomState;
}

/**
 * Progress update during experiment execution
 */
export interface ExperimentProgress {
  /** Current variant being processed */
  currentVariant: Variant;
  /** Completed runs */
  completedRuns: number;
  /** Total runs */
  totalRuns: number;
  /** Percentage complete */
  percentComplete: number;
  /** Current test being run */
  currentTest?: string;
}
