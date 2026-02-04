/**
 * Statistical Testing Utilities
 *
 * Implements statistical tests for A/B experiment analysis:
 * - Student's t-test (equal variance)
 * - Welch's t-test (unequal variance)
 * - Mann-Whitney U test (non-parametric)
 * - Bootstrap confidence intervals
 */

import type {
  ConfidenceInterval,
  EffectSize,
  MetricComparison,
  MetricSummary,
  RandomState,
  StatisticalSignificance,
  StatisticalTestType,
} from "./types.js";

// ===============================
// Seeded Random Number Generator
// ===============================

/**
 * Mulberry32 - A simple seeded PRNG with good statistical properties
 * Period: 2^32
 */
function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Re-export RandomState type from types.ts
export type { RandomState };

/**
 * Create a seeded random number generator
 *
 * @example
 * ```typescript
 * const rng = createRng(42);
 * const value = rng.random(); // Always same sequence for seed 42
 * rng.reset(); // Start over
 * ```
 */
export function createRng(seed: number): RandomState {
  let generator = mulberry32(seed);
  return {
    random: () => generator(),
    reset: () => {
      generator = mulberry32(seed);
    },
    seed,
  };
}

/**
 * Default random number generator (uses current time if no seed provided)
 */
let defaultRng: RandomState | null = null;

/**
 * Get or create the default RNG
 * Use setDefaultSeed() for reproducible experiments
 */
export function getDefaultRng(): RandomState {
  if (!defaultRng) {
    defaultRng = createRng(Date.now());
  }
  return defaultRng;
}

/**
 * Set the default seed for reproducible experiments
 *
 * @example
 * ```typescript
 * setDefaultSeed(42);
 * // All statistical operations will now be reproducible
 * ```
 */
export function setDefaultSeed(seed: number): void {
  defaultRng = createRng(seed);
}

/**
 * Reset the default RNG (useful for testing)
 */
export function resetDefaultRng(): void {
  if (defaultRng) {
    defaultRng.reset();
  }
}

// ===============================
// Basic Statistics
// ===============================

/**
 * Calculate mean of an array
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate variance of an array
 * @param values - Array of numbers
 * @param ddof - Delta degrees of freedom (default: 1 for sample variance)
 */
export function variance(values: number[], ddof = 1): number {
  if (values.length <= ddof) return 0;
  const m = mean(values);
  const squaredDiffs = values.map((v) => (v - m) ** 2);
  return squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - ddof);
}

/**
 * Calculate standard deviation of an array
 */
export function stdDev(values: number[], ddof = 1): number {
  return Math.sqrt(variance(values, ddof));
}

/**
 * Calculate median of an array (optimized - accepts pre-sorted array)
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return medianFromSorted(sorted);
}

/**
 * Calculate median from a pre-sorted array (no copying)
 */
export function medianFromSorted(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculate a percentile of an array
 * @param values - Array of numbers
 * @param p - Percentile (0-100)
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  if (p < 0 || p > 100) {
    throw new Error(`Percentile must be between 0 and 100, got ${p}`);
  }
  const sorted = [...values].sort((a, b) => a - b);
  return percentileFromSorted(sorted, p);
}

/**
 * Calculate a percentile from a pre-sorted array (no copying)
 * @param sorted - Pre-sorted array of numbers
 * @param p - Percentile (0-100)
 */
export function percentileFromSorted(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (p < 0 || p > 100) {
    throw new Error(`Percentile must be between 0 and 100, got ${p}`);
  }
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Calculate all common percentiles from a single sorted array
 * Optimized to sort once for all percentile calculations
 */
export function calculatePercentiles(values: number[]): {
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
} {
  if (values.length === 0) {
    return { p5: 0, p25: 0, p50: 0, p75: 0, p95: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p5: percentileFromSorted(sorted, 5),
    p25: percentileFromSorted(sorted, 25),
    p50: percentileFromSorted(sorted, 50),
    p75: percentileFromSorted(sorted, 75),
    p95: percentileFromSorted(sorted, 95),
  };
}

/**
 * Calculate summary statistics for a set of values
 * Optimized to sort once and reuse for all percentile calculations
 */
export function calculateMetricSummary(
  name: string,
  values: number[],
  confidenceLevel = 0.95
): MetricSummary {
  if (confidenceLevel <= 0 || confidenceLevel >= 1) {
    throw new Error(`Confidence level must be between 0 and 1, got ${confidenceLevel}`);
  }

  const m = mean(values);
  const sd = stdDev(values);
  const se = values.length > 0 ? sd / Math.sqrt(values.length) : 0;

  // Calculate confidence interval using t-distribution
  const alpha = 1 - confidenceLevel;
  const df = Math.max(values.length - 1, 1);
  const tCritical = tQuantile(1 - alpha / 2, df);
  const marginOfError = tCritical * se;

  // Sort once for all percentile calculations
  const sorted = values.length > 0 ? [...values].sort((a, b) => a - b) : [];

  return {
    name,
    mean: m,
    stdDev: sd,
    median: sorted.length > 0 ? medianFromSorted(sorted) : 0,
    min: sorted.length > 0 ? sorted[0] : 0,
    max: sorted.length > 0 ? sorted[sorted.length - 1] : 0,
    count: values.length,
    confidenceInterval: {
      lower: m - marginOfError,
      upper: m + marginOfError,
      level: confidenceLevel,
    },
    percentiles: sorted.length > 0
      ? {
          p5: percentileFromSorted(sorted, 5),
          p25: percentileFromSorted(sorted, 25),
          p75: percentileFromSorted(sorted, 75),
          p95: percentileFromSorted(sorted, 95),
        }
      : undefined,
  };
}

// ===============================
// Statistical Tests
// ===============================

/**
 * Student's t-test for two independent samples (equal variance assumed)
 */
export function tTest(
  sample1: number[],
  sample2: number[]
): { tStatistic: number; pValue: number } {
  const n1 = sample1.length;
  const n2 = sample2.length;

  if (n1 < 2 || n2 < 2) {
    return { tStatistic: 0, pValue: 1 };
  }

  const mean1 = mean(sample1);
  const mean2 = mean(sample2);
  const var1 = variance(sample1);
  const var2 = variance(sample2);

  // Pooled variance
  const pooledVar = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2);
  const se = Math.sqrt(pooledVar * (1 / n1 + 1 / n2));

  if (se === 0) {
    return { tStatistic: 0, pValue: 1 };
  }

  const tStatistic = (mean1 - mean2) / se;
  const df = n1 + n2 - 2;
  const pValue = 2 * (1 - tCDF(Math.abs(tStatistic), df));

  return { tStatistic, pValue };
}

/**
 * Welch's t-test for two independent samples (unequal variance)
 */
export function welchTest(
  sample1: number[],
  sample2: number[]
): { tStatistic: number; pValue: number; df: number } {
  const n1 = sample1.length;
  const n2 = sample2.length;

  if (n1 < 2 || n2 < 2) {
    return { tStatistic: 0, pValue: 1, df: 0 };
  }

  const mean1 = mean(sample1);
  const mean2 = mean(sample2);
  const var1 = variance(sample1);
  const var2 = variance(sample2);

  const se = Math.sqrt(var1 / n1 + var2 / n2);

  if (se === 0) {
    return { tStatistic: 0, pValue: 1, df: 0 };
  }

  const tStatistic = (mean1 - mean2) / se;

  // Welch-Satterthwaite degrees of freedom
  const num = (var1 / n1 + var2 / n2) ** 2;
  const denom =
    (var1 / n1) ** 2 / (n1 - 1) + (var2 / n2) ** 2 / (n2 - 1);
  const df = num / denom;

  const pValue = 2 * (1 - tCDF(Math.abs(tStatistic), df));

  return { tStatistic, pValue, df };
}

/**
 * Mann-Whitney U test (non-parametric alternative to t-test)
 */
export function mannWhitneyU(
  sample1: number[],
  sample2: number[]
): { uStatistic: number; pValue: number } {
  const n1 = sample1.length;
  const n2 = sample2.length;

  if (n1 === 0 || n2 === 0) {
    return { uStatistic: 0, pValue: 1 };
  }

  // Combine and rank all values
  const combined = [
    ...sample1.map((v, i) => ({ value: v, group: 1, index: i })),
    ...sample2.map((v, i) => ({ value: v, group: 2, index: i })),
  ].sort((a, b) => a.value - b.value);

  // Assign ranks (handle ties by averaging)
  const ranks: number[] = [];
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j < combined.length && combined[j].value === combined[i].value) {
      j++;
    }
    const avgRank = (i + j + 1) / 2;
    for (let k = i; k < j; k++) {
      ranks[k] = avgRank;
    }
    i = j;
  }

  // Calculate rank sum for group 1
  let r1 = 0;
  for (let k = 0; k < combined.length; k++) {
    if (combined[k].group === 1) {
      r1 += ranks[k];
    }
  }

  // U statistic
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  const uStatistic = Math.min(u1, u2);

  // Normal approximation for p-value (valid for n1, n2 > 20)
  const muU = (n1 * n2) / 2;
  const sigmaU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);

  if (sigmaU === 0) {
    return { uStatistic, pValue: 1 };
  }

  const z = (uStatistic - muU) / sigmaU;
  const pValue = 2 * normalCDF(z); // two-tailed

  return { uStatistic, pValue };
}

/**
 * Bootstrap confidence interval for the difference between two samples
 *
 * @param sample1 - First sample
 * @param sample2 - Second sample
 * @param confidenceLevel - Confidence level (0-1, default: 0.95)
 * @param nBootstrap - Number of bootstrap iterations (default: 10000)
 * @param rng - Optional random number generator for reproducibility
 */
export function bootstrapConfidenceInterval(
  sample1: number[],
  sample2: number[],
  confidenceLevel = 0.95,
  nBootstrap = 10000,
  rng?: RandomState
): ConfidenceInterval {
  if (confidenceLevel <= 0 || confidenceLevel >= 1) {
    throw new Error(`Confidence level must be between 0 and 1, got ${confidenceLevel}`);
  }

  const random = rng?.random ?? getDefaultRng().random;
  const differences: number[] = new Array(nBootstrap);

  for (let i = 0; i < nBootstrap; i++) {
    const boot1 = bootstrapSample(sample1, random);
    const boot2 = bootstrapSample(sample2, random);
    differences[i] = mean(boot1) - mean(boot2);
  }

  differences.sort((a, b) => a - b);

  const alpha = 1 - confidenceLevel;
  const lowerIndex = Math.floor((alpha / 2) * nBootstrap);
  const upperIndex = Math.floor((1 - alpha / 2) * nBootstrap);

  return {
    lower: differences[lowerIndex],
    upper: differences[upperIndex],
    level: confidenceLevel,
  };
}

/**
 * Generate a bootstrap sample (sampling with replacement)
 * @param values - Original sample
 * @param random - Random number generator function
 */
function bootstrapSample(values: number[], random: () => number): number[] {
  const n = values.length;
  const result: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const index = Math.floor(random() * n);
    result[i] = values[index];
  }
  return result;
}

// ===============================
// Effect Size Calculations
// ===============================

/**
 * Calculate Cohen's d effect size
 */
export function cohensD(sample1: number[], sample2: number[]): number {
  const mean1 = mean(sample1);
  const mean2 = mean(sample2);
  const var1 = variance(sample1);
  const var2 = variance(sample2);
  const n1 = sample1.length;
  const n2 = sample2.length;

  // Pooled standard deviation
  const pooledStdDev = Math.sqrt(
    ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2)
  );

  if (pooledStdDev === 0) return 0;

  return (mean1 - mean2) / pooledStdDev;
}

/**
 * Calculate Cliff's delta (non-parametric effect size)
 *
 * Optimized using counting sort approach for better performance
 * on large samples. Complexity: O(n1 * n2) but with better constant
 * factors and early termination possibilities.
 *
 * For very large samples (>1000 each), consider using a sampling approach.
 */
export function cliffsDelta(sample1: number[], sample2: number[]): number {
  const n1 = sample1.length;
  const n2 = sample2.length;
  const n = n1 * n2;

  if (n === 0) return 0;

  // For large samples, use a sorted comparison approach
  // which is O(n1 * log(n1) + n2 * log(n2) + n1 + n2) instead of O(n1 * n2)
  if (n1 > 500 && n2 > 500) {
    return cliffsDeltaOptimized(sample1, sample2);
  }

  let moreThan = 0;
  let lessThan = 0;

  for (const v1 of sample1) {
    for (const v2 of sample2) {
      if (v1 > v2) moreThan++;
      else if (v1 < v2) lessThan++;
    }
  }

  return (moreThan - lessThan) / n;
}

/**
 * Optimized Cliff's delta for large samples
 * Uses sorted arrays and binary search for O(n log n) complexity
 */
function cliffsDeltaOptimized(sample1: number[], sample2: number[]): number {
  const sorted1 = [...sample1].sort((a, b) => a - b);
  const sorted2 = [...sample2].sort((a, b) => a - b);
  const n1 = sorted1.length;
  const n2 = sorted2.length;

  let dominance = 0;

  // For each value in sample1, count how many values in sample2 it dominates
  // Using sorted arrays, we can do this with two pointers
  let lessThanIdx = 0;
  let equalEndIdx = 0;

  for (let i = 0; i < n1; i++) {
    const v1 = sorted1[i];

    // Count values in sample2 less than v1
    while (lessThanIdx < n2 && sorted2[lessThanIdx] < v1) {
      lessThanIdx++;
    }

    // Count values in sample2 equal to v1
    equalEndIdx = lessThanIdx;
    while (equalEndIdx < n2 && sorted2[equalEndIdx] === v1) {
      equalEndIdx++;
    }

    const lessThan = lessThanIdx;
    const equalCount = equalEndIdx - lessThanIdx;
    const greaterThan = n2 - equalEndIdx;

    // For each value in sample1, add (greaterThan - lessThan) to dominance
    // where greaterThan = values in sample2 > v1
    // and lessThan = values in sample2 < v1
    dominance += lessThan - greaterThan;
  }

  return dominance / (n1 * n2);
}

/**
 * Interpret effect size magnitude
 */
export function interpretEffectSize(
  d: number
): "negligible" | "small" | "medium" | "large" {
  const absD = Math.abs(d);
  if (absD < 0.2) return "negligible";
  if (absD < 0.5) return "small";
  if (absD < 0.8) return "medium";
  return "large";
}

/**
 * Calculate effect size with interpretation
 */
export function calculateEffectSize(
  sample1: number[],
  sample2: number[]
): EffectSize {
  const d = cohensD(sample1, sample2);
  const delta = cliffsDelta(sample1, sample2);

  return {
    cohensD: d,
    magnitude: interpretEffectSize(d),
    cliffsDelta: delta,
  };
}

// ===============================
// Metric Comparison
// ===============================

/**
 * Perform statistical comparison between two samples
 */
export function compareMetric(
  metricName: string,
  controlSamples: number[],
  treatmentSamples: number[],
  options: {
    test?: StatisticalTestType;
    alpha?: number;
    confidenceLevel?: number;
    rng?: RandomState;
  } = {}
): MetricComparison {
  const { test = "welch", alpha = 0.05, confidenceLevel = 0.95, rng } = options;

  const controlMean = mean(controlSamples);
  const treatmentMean = mean(treatmentSamples);
  const absoluteDiff = treatmentMean - controlMean;
  const relativeDiff =
    controlMean !== 0 ? ((treatmentMean - controlMean) / controlMean) * 100 : 0;

  // Perform statistical test
  let testResult: { tStatistic?: number; uStatistic?: number; pValue: number };
  let testStatistic: number;

  switch (test) {
    case "ttest":
      testResult = tTest(controlSamples, treatmentSamples);
      testStatistic = testResult.tStatistic ?? 0;
      break;
    case "welch":
      testResult = welchTest(controlSamples, treatmentSamples);
      testStatistic = testResult.tStatistic ?? 0;
      break;
    case "mannwhitney":
      testResult = mannWhitneyU(controlSamples, treatmentSamples);
      testStatistic = testResult.uStatistic ?? 0;
      break;
    case "bootstrap":
      // For bootstrap, we use Welch's test for p-value
      testResult = welchTest(controlSamples, treatmentSamples);
      testStatistic = testResult.tStatistic ?? 0;
      break;
    default:
      testResult = welchTest(controlSamples, treatmentSamples);
      testStatistic = testResult.tStatistic ?? 0;
  }

  const significance: StatisticalSignificance = {
    pValue: testResult.pValue,
    isSignificant: testResult.pValue < alpha,
    alpha,
    testUsed: test,
    testStatistic,
  };

  const effectSize = calculateEffectSize(controlSamples, treatmentSamples);

  // Calculate confidence interval for the difference
  const diffConfidenceInterval =
    test === "bootstrap"
      ? bootstrapConfidenceInterval(
          treatmentSamples,
          controlSamples,
          confidenceLevel,
          10000,
          rng
        )
      : calculateDiffConfidenceInterval(
          controlSamples,
          treatmentSamples,
          confidenceLevel
        );

  return {
    metric: metricName,
    controlMean,
    treatmentMean,
    absoluteDiff,
    relativeDiff,
    significance,
    effectSize,
    diffConfidenceInterval,
  };
}

/**
 * Calculate confidence interval for the difference between means (parametric)
 */
function calculateDiffConfidenceInterval(
  sample1: number[],
  sample2: number[],
  confidenceLevel: number
): ConfidenceInterval {
  const diff = mean(sample2) - mean(sample1);
  const var1 = variance(sample1);
  const var2 = variance(sample2);
  const n1 = sample1.length;
  const n2 = sample2.length;

  const se = Math.sqrt(var1 / n1 + var2 / n2);
  const df = Math.min(n1, n2) - 1;

  const alpha = 1 - confidenceLevel;
  const tCritical = tQuantile(1 - alpha / 2, Math.max(df, 1));
  const marginOfError = tCritical * se;

  return {
    lower: diff - marginOfError,
    upper: diff + marginOfError,
    level: confidenceLevel,
  };
}

// ===============================
// Multiple Comparison Corrections
// ===============================

/**
 * Apply Bonferroni correction for multiple comparisons
 */
export function bonferroniCorrection(
  pValues: number[],
  alpha: number
): { correctedAlpha: number; adjustedPValues: number[] } {
  const correctedAlpha = alpha / pValues.length;
  const adjustedPValues = pValues.map((p) =>
    Math.min(p * pValues.length, 1)
  );
  return { correctedAlpha, adjustedPValues };
}

/**
 * Apply Holm-Bonferroni correction for multiple comparisons
 */
export function holmCorrection(
  pValues: number[],
  alpha: number
): { adjustedPValues: number[]; significant: boolean[] } {
  const n = pValues.length;
  const indexed = pValues.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => a.p - b.p);

  const adjustedPValues = new Array(n).fill(0);
  const significant = new Array(n).fill(false);

  let rejected = true;
  for (let k = 0; k < n; k++) {
    const { p, i } = indexed[k];
    const threshold = alpha / (n - k);

    if (rejected && p <= threshold) {
      significant[i] = true;
    } else {
      rejected = false;
    }

    adjustedPValues[i] = Math.min(p * (n - k), 1);
  }

  return { adjustedPValues, significant };
}

// ===============================
// Distribution Functions (Approximations)
// ===============================

/**
 * Standard normal CDF (approximation using error function)
 */
export function normalCDF(x: number): number {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

/**
 * Error function approximation (Abramowitz and Stegun)
 */
function erf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);

  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
}

/**
 * Student's t-distribution CDF (approximation)
 */
export function tCDF(t: number, df: number): number {
  if (df <= 0) return 0;

  // For large df, use normal approximation
  if (df > 100) {
    return normalCDF(t);
  }

  // Use incomplete beta function approximation
  const x = df / (df + t * t);
  const a = df / 2;
  const b = 0.5;

  if (t >= 0) {
    return 1 - 0.5 * incompleteBeta(x, a, b);
  } else {
    return 0.5 * incompleteBeta(x, a, b);
  }
}

/**
 * Inverse t-distribution (quantile function) - approximation
 */
export function tQuantile(p: number, df: number): number {
  if (p <= 0 || p >= 1 || df <= 0) return 0;

  // For large df, use normal approximation
  if (df > 100) {
    return normalQuantile(p);
  }

  // Newton-Raphson iteration
  let x = normalQuantile(p);
  for (let i = 0; i < 10; i++) {
    const fx = tCDF(x, df) - p;
    const fpx = tPDF(x, df);
    if (Math.abs(fpx) < 1e-10) break;
    const newX = x - fx / fpx;
    if (Math.abs(newX - x) < 1e-10) break;
    x = newX;
  }
  return x;
}

/**
 * Student's t-distribution PDF
 */
function tPDF(x: number, df: number): number {
  const coef = gamma((df + 1) / 2) / (Math.sqrt(df * Math.PI) * gamma(df / 2));
  return coef * Math.pow(1 + (x * x) / df, -(df + 1) / 2);
}

/**
 * Inverse standard normal (quantile function) - approximation
 */
export function normalQuantile(p: number): number {
  if (p <= 0) return Number.NEGATIVE_INFINITY;
  if (p >= 1) return Number.POSITIVE_INFINITY;
  if (p === 0.5) return 0;

  // Rational approximation for lower region
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
    -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0,
    3.754408661907416e0,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number;
  let r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return (
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
}

/**
 * Incomplete beta function (regularized) - approximation
 */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use continued fraction expansion
  const bt =
    x === 0 || x === 1
      ? 0
      : Math.exp(
          gammaLn(a + b) -
            gammaLn(a) -
            gammaLn(b) +
            a * Math.log(x) +
            b * Math.log(1 - x)
        );

  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betaCF(x, a, b)) / a;
  } else {
    return 1 - (bt * betaCF(1 - x, b, a)) / b;
  }
}

/**
 * Continued fraction for incomplete beta
 */
function betaCF(x: number, a: number, b: number): number {
  const maxIterations = 100;
  const epsilon = 1e-10;
  const fpMin = 1e-30;

  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;

  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < fpMin) d = fpMin;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIterations; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));

    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    h *= d * c;

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));

    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;

    const del = d * c;
    h *= del;

    if (Math.abs(del - 1) < epsilon) break;
  }

  return h;
}

/**
 * Gamma function (approximation using Lanczos)
 */
function gamma(z: number): number {
  return Math.exp(gammaLn(z));
}

/**
 * Log gamma function (Lanczos approximation)
 */
function gammaLn(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];

  if (z < 0.5) {
    return (
      Math.log(Math.PI / Math.sin(Math.PI * z)) - gammaLn(1 - z)
    );
  }

  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }

  const t = z + g + 0.5;
  return (
    0.5 * Math.log(2 * Math.PI) +
    (z + 0.5) * Math.log(t) -
    t +
    Math.log(x)
  );
}
