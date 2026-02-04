/**
 * Experiment Definition and Execution API
 *
 * Define and run A/B experiments with statistical analysis.
 */

import type { Suite, SuiteResult, TestResult } from "../test.js";
import { run as runTests, type RunOptions } from "../test.js";
import type { Scorer } from "../scorers/base.js";
import type {
  Experiment,
  ExperimentResult,
  ExperimentRunOptions,
  ExperimentProgress,
  ExperimentConclusion,
  ExperimentExecutionMetadata,
  Variant,
  VariantResult,
  ComparisonResult,
  MetricComparison,
  MetricSummary,
  Hypothesis,
  HypothesisResult,
  StatisticalConfig,
  StatisticalTestType,
} from "./types.js";
import {
  validateVariants,
  getControlVariant,
  getTreatmentVariants,
} from "./variant.js";
import {
  calculateMetricSummary,
  compareMetric,
  bonferroniCorrection,
  holmCorrection,
  calculateEffectSize,
  type RandomState,
} from "./statistics.js";

/**
 * Options for defining an experiment
 */
export interface DefineExperimentOptions {
  /** Unique experiment identifier */
  id?: string;
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
 * Generate a unique experiment ID
 */
function generateExperimentId(name: string): string {
  const sanitized = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const timestamp = Date.now().toString(36);
  return `exp-${sanitized}-${timestamp}`;
}

/**
 * Define an A/B experiment
 *
 * @example
 * ```typescript
 * const experiment = defineExperiment({
 *   name: 'Model Comparison',
 *   description: 'Compare GPT-4 vs GPT-4 Turbo on response quality',
 *   variants: [control, treatment],
 *   suite: mySuite,
 *   primaryMetric: 'response_quality',
 *   secondaryMetrics: ['latency', 'token_efficiency'],
 *   hypotheses: [{
 *     metric: 'response_quality',
 *     direction: 'increase',
 *     minimumEffect: 0.1,
 *     description: 'GPT-4 Turbo improves quality by at least 10%',
 *   }],
 *   statisticalConfig: {
 *     alpha: 0.05,
 *     test: 'welch',
 *   },
 * });
 * ```
 */
export function defineExperiment(options: DefineExperimentOptions): Experiment {
  const {
    id = generateExperimentId(options.name),
    name,
    description,
    variants,
    suite,
    primaryMetric,
    secondaryMetrics = [],
    hypotheses = [],
    statisticalConfig = {},
    metadata = {},
  } = options;

  // Validate variants
  const validationErrors = validateVariants(variants);
  if (validationErrors.length > 0) {
    throw new Error(`Invalid experiment variants: ${validationErrors.join(", ")}`);
  }

  return {
    id,
    name,
    description,
    variants,
    suite,
    primaryMetric,
    secondaryMetrics,
    hypotheses,
    statisticalConfig: {
      alpha: 0.05,
      power: 0.8,
      test: "welch",
      multipleComparisonCorrection: "holm",
      ...statisticalConfig,
    },
    metadata,
  };
}

/**
 * Semaphore for controlling concurrency
 */
class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    const next = this.waiting.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }
}

/**
 * Run an A/B experiment
 *
 * @example
 * ```typescript
 * const result = await runExperiment(experiment, {
 *   runsPerVariant: 100,
 *   parallel: true,
 *   maxConcurrency: 10,
 *   agent: async (input, variant) => {
 *     const response = await myAgent.invoke(input, variant.config);
 *     return { output: response.text, toolCalls: response.tools };
 *   },
 * });
 *
 * if (result.conclusion.winner) {
 *   console.log(`Winner: ${result.conclusion.winner.name}`);
 * }
 * ```
 */
export async function runExperiment(
  experiment: Experiment,
  options: ExperimentRunOptions = {}
): Promise<ExperimentResult> {
  const {
    runsPerVariant = 30,
    parallel = false,
    maxConcurrency = 5,
    agent,
    onProgress,
    scorers = {},
    rng,
  } = options;

  const startTime = new Date();
  const errors: string[] = [];

  // Run suite for each variant
  const variantResults: VariantResult[] = [];

  if (parallel) {
    // Run all variants in parallel with concurrency control
    const results = await runVariantsParallel(
      experiment,
      runsPerVariant,
      agent,
      scorers,
      maxConcurrency,
      onProgress,
      rng
    );
    variantResults.push(...results.variantResults);
    errors.push(...results.errors);
  } else {
    // Run variants sequentially
    for (const variant of experiment.variants) {
      onProgress?.({
        currentVariant: variant,
        completedRuns: variantResults.length * runsPerVariant,
        totalRuns: experiment.variants.length * runsPerVariant,
        percentComplete:
          (variantResults.length / experiment.variants.length) * 100,
      });

      try {
        const variantResult = await runVariant(
          experiment,
          variant,
          runsPerVariant,
          agent,
          scorers,
          rng
        );
        variantResults.push(variantResult);
      } catch (error) {
        errors.push(
          `Failed to run variant ${variant.name}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }
  }

  const completedAt = new Date();

  // Perform statistical comparison
  const comparison = performComparison(experiment, variantResults, rng);

  // Generate conclusion
  const conclusion = generateConclusion(experiment, comparison, variantResults);

  const executionMetadata: ExperimentExecutionMetadata = {
    startedAt: startTime,
    completedAt,
    durationMs: completedAt.getTime() - startTime.getTime(),
    runsPerVariant,
    errors: errors.length > 0 ? errors : undefined,
  };

  return {
    experiment,
    variantResults,
    comparison,
    conclusion,
    executionMetadata,
  };
}

/**
 * Run all variants in parallel with concurrency control
 */
async function runVariantsParallel(
  experiment: Experiment,
  runsPerVariant: number,
  agent: ExperimentRunOptions["agent"],
  scorers: Record<string, Scorer>,
  maxConcurrency: number,
  onProgress?: (progress: ExperimentProgress) => void,
  rng?: RandomState
): Promise<{ variantResults: VariantResult[]; errors: string[] }> {
  const semaphore = new Semaphore(maxConcurrency);
  const errors: string[] = [];
  let completedVariants = 0;
  const totalVariants = experiment.variants.length;

  const runVariantWithSemaphore = async (
    variant: Variant
  ): Promise<VariantResult | null> => {
    await semaphore.acquire();
    try {
      onProgress?.({
        currentVariant: variant,
        completedRuns: completedVariants * runsPerVariant,
        totalRuns: totalVariants * runsPerVariant,
        percentComplete: (completedVariants / totalVariants) * 100,
      });

      const result = await runVariant(
        experiment,
        variant,
        runsPerVariant,
        agent,
        scorers,
        rng
      );
      completedVariants++;
      return result;
    } catch (error) {
      errors.push(
        `Failed to run variant ${variant.name}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      completedVariants++;
      return null;
    } finally {
      semaphore.release();
    }
  };

  const promises = experiment.variants.map((variant) =>
    runVariantWithSemaphore(variant)
  );
  const results = await Promise.all(promises);

  // Filter out null results (failed variants)
  const variantResults = results.filter(
    (result): result is VariantResult => result !== null
  );

  return { variantResults, errors };
}

/**
 * Run the test suite for a single variant
 */
async function runVariant(
  experiment: Experiment,
  variant: Variant,
  runsPerVariant: number,
  agent: ExperimentRunOptions["agent"],
  scorers: Record<string, Scorer>,
  _rng?: RandomState
): Promise<VariantResult> {
  const allResults: TestResult[] = [];

  // Run the suite multiple times
  for (let run = 0; run < runsPerVariant; run++) {
    const runOptions: RunOptions = {
      parallel: experiment.suite.config?.parallel ?? 1,
      timeout: experiment.suite.config?.timeout,
      agent: agent
        ? (input) => agent(input, variant)
        : undefined,
      scorers: { ...scorers, ...experiment.suite.scorers },
    };

    const suiteResult = await runTests(experiment.suite, runOptions);
    if ("results" in suiteResult) {
      allResults.push(...suiteResult.results);
    }
  }

  // Aggregate results into metrics
  const metrics = aggregateMetrics(allResults, experiment);

  // Build suite result summary
  const suiteResult: SuiteResult = {
    name: `${experiment.suite.name} (${variant.name})`,
    results: allResults,
    summary: {
      total: allResults.length,
      passed: allResults.filter((r) => r.passed).length,
      failed: allResults.filter((r) => !r.passed).length,
      passRate:
        allResults.length > 0
          ? allResults.filter((r) => r.passed).length / allResults.length
          : 0,
      avgScore: calculateAverageScore(allResults),
    },
    durationMs: allResults.reduce((sum, r) => sum + r.durationMs, 0),
  };

  return {
    variant,
    suiteResult,
    metrics,
    sampleSize: allResults.length,
  };
}

/**
 * Aggregate test results into metric summaries
 */
function aggregateMetrics(
  results: TestResult[],
  experiment: Experiment
): Record<string, MetricSummary> {
  const metrics: Record<string, MetricSummary> = {};
  const allMetrics = [experiment.primaryMetric, ...experiment.secondaryMetrics ?? []];

  for (const metricName of allMetrics) {
    const values = extractMetricValues(results, metricName);
    if (values.length > 0) {
      metrics[metricName] = calculateMetricSummary(
        metricName,
        values,
        1 - (experiment.statisticalConfig?.alpha ?? 0.05)
      );
    }
  }

  // Also calculate pass rate as a metric
  const passRates = results.map((r) => (r.passed ? 1 : 0));
  metrics.pass_rate = calculateMetricSummary(
    "pass_rate",
    passRates,
    1 - (experiment.statisticalConfig?.alpha ?? 0.05)
  );

  return metrics;
}

/**
 * Extract metric values from test results
 */
function extractMetricValues(results: TestResult[], metricName: string): number[] {
  const values: number[] = [];

  for (const result of results) {
    // Look for the metric in scores
    const score = result.scores.find(
      (s) => s.name === metricName || s.name.toLowerCase() === metricName.toLowerCase()
    );
    if (score !== undefined) {
      values.push(score.value);
    }
  }

  return values;
}

/**
 * Calculate average score across all results
 */
function calculateAverageScore(results: TestResult[]): number {
  let totalScore = 0;
  let count = 0;

  for (const result of results) {
    for (const score of result.scores) {
      totalScore += score.value;
      count++;
    }
  }

  return count > 0 ? totalScore / count : 0;
}

/**
 * Perform statistical comparison between control and treatment(s)
 */
function performComparison(
  experiment: Experiment,
  variantResults: VariantResult[],
  rng?: RandomState
): ComparisonResult {
  const control = getControlVariant(experiment.variants);
  const treatments = getTreatmentVariants(experiment.variants);

  if (!control || treatments.length === 0) {
    throw new Error("Experiment must have exactly 1 control and at least 1 treatment");
  }

  // Compare against first treatment for now
  // TODO: Support multiple treatment comparisons
  const treatment = treatments[0];

  const controlResult = variantResults.find((r) => r.variant.id === control.id);
  const treatmentResult = variantResults.find((r) => r.variant.id === treatment.id);

  if (!controlResult || !treatmentResult) {
    throw new Error("Missing results for control or treatment variant");
  }

  const config = experiment.statisticalConfig ?? {};
  const alpha = config.alpha ?? 0.05;
  const test = config.test ?? "welch";

  // Compare primary metric
  const primaryMetricComparison = compareVariantMetric(
    experiment.primaryMetric,
    controlResult,
    treatmentResult,
    test,
    alpha,
    rng
  );

  // Compare secondary metrics
  const secondaryMetricComparisons: MetricComparison[] = [];
  for (const metric of experiment.secondaryMetrics ?? []) {
    const comparison = compareVariantMetric(
      metric,
      controlResult,
      treatmentResult,
      test,
      alpha,
      rng
    );
    secondaryMetricComparisons.push(comparison);
  }

  // Apply multiple comparison correction if needed
  if (
    config.multipleComparisonCorrection &&
    config.multipleComparisonCorrection !== "none" &&
    secondaryMetricComparisons.length > 0
  ) {
    const allPValues = [
      primaryMetricComparison.significance.pValue,
      ...secondaryMetricComparisons.map((c) => c.significance.pValue),
    ];

    const correction =
      config.multipleComparisonCorrection === "bonferroni"
        ? bonferroniCorrection(allPValues, alpha)
        : holmCorrection(allPValues, alpha);

    // Update significance based on corrected values
    primaryMetricComparison.significance.isSignificant =
      correction.adjustedPValues[0] < alpha;

    for (let i = 0; i < secondaryMetricComparisons.length; i++) {
      secondaryMetricComparisons[i].significance.isSignificant =
        correction.adjustedPValues[i + 1] < alpha;
    }
  }

  // Test hypotheses
  const hypothesisResults = experiment.hypotheses?.map((hypothesis) =>
    testHypothesis(hypothesis, controlResult, treatmentResult, config, rng)
  );

  return {
    control,
    treatment,
    primaryMetric: primaryMetricComparison,
    secondaryMetrics: secondaryMetricComparisons,
    hypothesisResults,
  };
}

/**
 * Compare a single metric between variants
 */
function compareVariantMetric(
  metricName: string,
  controlResult: VariantResult,
  treatmentResult: VariantResult,
  test: StatisticalTestType,
  alpha: number,
  rng?: RandomState
): MetricComparison {
  // Extract raw values for the metric
  const controlValues = extractMetricValues(
    controlResult.suiteResult.results,
    metricName
  );
  const treatmentValues = extractMetricValues(
    treatmentResult.suiteResult.results,
    metricName
  );

  // Use summary stats if raw values not available
  if (controlValues.length === 0 || treatmentValues.length === 0) {
    // Fall back to pass rate comparison
    const controlPassRate = controlResult.suiteResult.summary.passRate;
    const treatmentPassRate = treatmentResult.suiteResult.summary.passRate;

    return {
      metric: metricName,
      controlMean: controlPassRate,
      treatmentMean: treatmentPassRate,
      absoluteDiff: treatmentPassRate - controlPassRate,
      relativeDiff:
        controlPassRate > 0
          ? ((treatmentPassRate - controlPassRate) / controlPassRate) * 100
          : 0,
      significance: {
        pValue: 1,
        isSignificant: false,
        alpha,
        testUsed: test,
        testStatistic: 0,
      },
      effectSize: {
        cohensD: 0,
        magnitude: "negligible",
      },
      diffConfidenceInterval: {
        lower: 0,
        upper: 0,
        level: 1 - alpha,
      },
    };
  }

  return compareMetric(metricName, controlValues, treatmentValues, {
    test,
    alpha,
    confidenceLevel: 1 - alpha,
    rng,
  });
}

/**
 * Test a single hypothesis
 */
function testHypothesis(
  hypothesis: Hypothesis,
  controlResult: VariantResult,
  treatmentResult: VariantResult,
  config: StatisticalConfig,
  rng?: RandomState
): HypothesisResult {
  const controlValues = extractMetricValues(
    controlResult.suiteResult.results,
    hypothesis.metric
  );
  const treatmentValues = extractMetricValues(
    treatmentResult.suiteResult.results,
    hypothesis.metric
  );

  const comparison = compareMetric(
    hypothesis.metric,
    controlValues,
    treatmentValues,
    {
      test: config.test ?? "welch",
      alpha: config.alpha ?? 0.05,
      rng,
    }
  );

  // Determine if hypothesis is supported
  let supported = false;
  let explanation = "";

  const isSignificant = comparison.significance.isSignificant;
  const diff = comparison.absoluteDiff;
  const minEffect = hypothesis.minimumEffect ?? 0;

  switch (hypothesis.direction) {
    case "increase":
      supported = isSignificant && diff > minEffect;
      explanation = supported
        ? `Treatment significantly increased ${hypothesis.metric} by ${diff.toFixed(3)} (p=${comparison.significance.pValue.toFixed(4)})`
        : isSignificant
          ? `Significant change but below minimum effect size (${diff.toFixed(3)} < ${minEffect})`
          : `No significant increase detected (p=${comparison.significance.pValue.toFixed(4)})`;
      break;

    case "decrease":
      supported = isSignificant && diff < -minEffect;
      explanation = supported
        ? `Treatment significantly decreased ${hypothesis.metric} by ${Math.abs(diff).toFixed(3)} (p=${comparison.significance.pValue.toFixed(4)})`
        : isSignificant
          ? `Significant change but below minimum effect size (${Math.abs(diff).toFixed(3)} < ${minEffect})`
          : `No significant decrease detected (p=${comparison.significance.pValue.toFixed(4)})`;
      break;

    case "no_change":
      supported = !isSignificant && Math.abs(diff) < (minEffect || 0.1);
      explanation = supported
        ? `No significant change detected, as expected (p=${comparison.significance.pValue.toFixed(4)})`
        : `Unexpected change detected (diff=${diff.toFixed(3)}, p=${comparison.significance.pValue.toFixed(4)})`;
      break;
  }

  return {
    hypothesis,
    supported,
    statisticalResult: comparison.significance,
    effectSize: comparison.effectSize,
    explanation,
  };
}

/**
 * Generate overall conclusion from experiment results
 */
function generateConclusion(
  experiment: Experiment,
  comparison: ComparisonResult,
  variantResults: VariantResult[]
): ExperimentConclusion {
  const { primaryMetric, control, treatment } = comparison;
  const rationale: string[] = [];

  // Check sample sizes
  const controlSample = variantResults.find((r) => r.variant.id === control.id)?.sampleSize ?? 0;
  const treatmentSample = variantResults.find((r) => r.variant.id === treatment.id)?.sampleSize ?? 0;
  const minSample = experiment.statisticalConfig?.minSampleSize ?? 30;

  if (controlSample < minSample || treatmentSample < minSample) {
    rationale.push(
      `Sample sizes (control: ${controlSample}, treatment: ${treatmentSample}) below recommended minimum (${minSample})`
    );
  }

  // Analyze primary metric
  const isSignificant = primaryMetric.significance.isSignificant;
  const effectMagnitude = primaryMetric.effectSize.magnitude;
  const diff = primaryMetric.absoluteDiff;

  rationale.push(
    `Primary metric (${primaryMetric.metric}): ${
      isSignificant
        ? `significant difference detected (p=${primaryMetric.significance.pValue.toFixed(4)})`
        : `no significant difference (p=${primaryMetric.significance.pValue.toFixed(4)})`
    }`
  );

  rationale.push(
    `Effect size: ${effectMagnitude} (Cohen's d = ${primaryMetric.effectSize.cohensD.toFixed(3)})`
  );

  // Check hypothesis results
  const hypothesesSupported = comparison.hypothesisResults?.filter((h) => h.supported).length ?? 0;
  const totalHypotheses = comparison.hypothesisResults?.length ?? 0;

  if (totalHypotheses > 0) {
    rationale.push(
      `${hypothesesSupported}/${totalHypotheses} hypotheses supported`
    );
  }

  // Determine winner and recommendation
  let winner: Variant | null = null;
  let confidence: "high" | "medium" | "low" | "inconclusive";
  let recommendation: "ship_treatment" | "keep_control" | "continue_experiment" | "redesign";
  let summary: string;

  if (!isSignificant) {
    // No significant difference
    confidence = "inconclusive";
    recommendation = "continue_experiment";
    summary = `No statistically significant difference detected between ${control.name} and ${treatment.name}`;
  } else if (diff > 0) {
    // Treatment is better
    winner = treatment;
    confidence =
      effectMagnitude === "large"
        ? "high"
        : effectMagnitude === "medium"
          ? "medium"
          : "low";
    recommendation = confidence === "high" ? "ship_treatment" : "continue_experiment";
    summary = `${treatment.name} outperforms ${control.name} with ${effectMagnitude} effect size`;
  } else {
    // Control is better
    winner = control;
    confidence =
      effectMagnitude === "large"
        ? "high"
        : effectMagnitude === "medium"
          ? "medium"
          : "low";
    recommendation = "keep_control";
    summary = `${control.name} outperforms ${treatment.name} with ${effectMagnitude} effect size`;
  }

  // Adjust recommendation based on sample size
  if (controlSample < minSample || treatmentSample < minSample) {
    confidence = "low";
    if (recommendation === "ship_treatment") {
      recommendation = "continue_experiment";
      rationale.push("Recommendation adjusted due to insufficient sample size");
    }
  }

  return {
    winner,
    confidence,
    summary,
    recommendation,
    rationale,
  };
}

/**
 * Validate an experiment definition
 */
export function validateExperiment(experiment: Experiment): string[] {
  const errors: string[] = [];

  if (!experiment.name || experiment.name.trim() === "") {
    errors.push("Experiment name is required");
  }

  if (!experiment.suite) {
    errors.push("Experiment must have a test suite");
  }

  if (!experiment.primaryMetric) {
    errors.push("Experiment must have a primary metric");
  }

  errors.push(...validateVariants(experiment.variants));

  return errors;
}
