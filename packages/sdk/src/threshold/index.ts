/**
 * Threshold Module
 *
 * Handles threshold configuration for CI/CD pass/fail determination.
 * Supports decimal (0.7) and percentage (70%) formats.
 *
 * Environment variable: NEON_THRESHOLD
 */

/**
 * Default threshold value (70%)
 */
export const DEFAULT_THRESHOLD = 0.7;

/**
 * Threshold configuration options
 */
export interface ThresholdConfig {
  /** Global threshold for all tests (0-1) */
  global?: number;
  /** Per-test threshold overrides */
  perTest?: Record<string, number>;
}

/**
 * Result of threshold evaluation
 */
export interface ThresholdResult {
  /** Whether the score passes the threshold */
  passed: boolean;
  /** The score value (0-1) */
  score: number;
  /** The threshold used (0-1) */
  threshold: number;
  /** Human-readable reason */
  reason: string;
}

/**
 * Parse a threshold value from string input
 *
 * Accepts:
 * - Decimal format: "0.7", "0.85", "1.0"
 * - Percentage format: "70", "85", "100"
 * - Percentage with symbol: "70%", "85%"
 *
 * @param input - Threshold value as string or number
 * @returns Normalized threshold value (0-1)
 * @throws Error if input is invalid
 *
 * @example
 * parseThreshold("0.7")   // 0.7
 * parseThreshold("70")    // 0.7
 * parseThreshold("70%")   // 0.7
 * parseThreshold(0.85)    // 0.85
 */
export function parseThreshold(input: string | number): number {
  if (typeof input === "number") {
    return normalizeThreshold(input);
  }

  const trimmed = input.trim();
  if (trimmed === "") {
    throw new Error("Threshold value cannot be empty");
  }

  // Remove percentage symbol if present
  const cleanValue = trimmed.replace(/%$/, "");
  const parsed = Number.parseFloat(cleanValue);

  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid threshold value: "${input}"`);
  }

  return normalizeThreshold(parsed);
}

/**
 * Normalize a threshold value to 0-1 range
 *
 * Values > 1 are treated as percentages and divided by 100
 */
function normalizeThreshold(value: number): number {
  if (value < 0) {
    throw new Error(`Threshold must be positive, got: ${value}`);
  }

  // Values > 1 are treated as percentages
  if (value > 1) {
    if (value > 100) {
      throw new Error(`Threshold cannot exceed 100%, got: ${value}`);
    }
    return value / 100;
  }

  return value;
}

/**
 * Get the threshold for a specific test
 *
 * Priority (highest to lowest):
 * 1. Per-test threshold override
 * 2. CLI --threshold flag (passed as config.global)
 * 3. NEON_THRESHOLD environment variable
 * 4. Default threshold (0.7)
 *
 * @param testName - Name of the test (for per-test lookup)
 * @param config - Threshold configuration
 * @returns Threshold value (0-1)
 */
export function getThreshold(testName: string, config: ThresholdConfig = {}): number {
  // 1. Check per-test override
  if (config.perTest?.[testName] !== undefined) {
    return config.perTest[testName];
  }

  // 2. Check global config (from --threshold flag)
  if (config.global !== undefined) {
    return config.global;
  }

  // 3. Check environment variable
  const envThreshold = process.env.NEON_THRESHOLD;
  if (envThreshold) {
    try {
      return parseThreshold(envThreshold);
    } catch {
      // Log warning but fall back to default
      console.warn(`Warning: Invalid NEON_THRESHOLD value "${envThreshold}", using default`);
    }
  }

  // 4. Default threshold
  return DEFAULT_THRESHOLD;
}

/**
 * Evaluate whether a score passes the threshold
 *
 * @param score - Score value to evaluate (0-1)
 * @param testName - Name of the test (for per-test lookup)
 * @param config - Threshold configuration
 * @returns ThresholdResult with pass/fail status
 */
export function evaluateThreshold(
  score: number,
  testName: string,
  config: ThresholdConfig = {}
): ThresholdResult {
  const threshold = getThreshold(testName, config);
  const passed = score >= threshold;

  const scorePercent = (score * 100).toFixed(1);
  const thresholdPercent = (threshold * 100).toFixed(1);

  return {
    passed,
    score,
    threshold,
    reason: passed
      ? `Score ${scorePercent}% meets threshold ${thresholdPercent}%`
      : `Score ${scorePercent}% below threshold ${thresholdPercent}%`,
  };
}

/**
 * Evaluate multiple scores against thresholds
 *
 * @param scores - Array of scores with names and values
 * @param config - Threshold configuration
 * @returns Object with overall pass/fail and individual results
 */
export function evaluateAllThresholds(
  scores: Array<{ name: string; value: number }>,
  config: ThresholdConfig = {}
): {
  passed: boolean;
  results: ThresholdResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
} {
  const results = scores.map((score) =>
    evaluateThreshold(score.value, score.name, config)
  );

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.length - passedCount;

  return {
    passed: failedCount === 0,
    results,
    summary: {
      total: results.length,
      passed: passedCount,
      failed: failedCount,
    },
  };
}
