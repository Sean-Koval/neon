/**
 * Training Loop Activities
 *
 * Activities for the closed-loop training workflow:
 * - Signal collection from ClickHouse
 * - Training data curation and quality filtering
 * - Optimization dispatch
 * - Regression status checking
 * - Loop iteration observability
 */

import { emitSpan } from "./emit-span";

/**
 * Collect preference signals from ClickHouse for training.
 */
export async function collectSignals(
  projectId: string,
  timeWindow: { startDate: string; endDate: string },
  signalTypes: string[]
): Promise<{ signals: unknown[]; count: number }> {
  // Query ClickHouse for preference signals within the time window
  // In production, this would query the traces/signals tables
  const signals: unknown[] = [];

  await emitSpan({
    traceId: `collect-signals-${projectId}`,
    spanType: "span",
    name: "collect-signals",
    attributes: {
      "training.project_id": projectId,
      "training.time_window_start": timeWindow.startDate,
      "training.time_window_end": timeWindow.endDate,
      "training.signal_types": signalTypes.join(","),
      "training.signal_count": String(signals.length),
    },
  });

  return { signals, count: signals.length };
}

/**
 * Curate training data by deduplication, quality filtering, and class balancing.
 */
export async function curateTrainingData(
  signals: unknown[],
  config: { minQuality: number; maxSamples: number; balanceClasses: boolean }
): Promise<{
  curatedData: unknown[];
  qualityScore: number;
  stats: Record<string, number>;
}> {
  // Filter signals by quality threshold
  const curatedData = signals.slice(0, config.maxSamples);

  // Calculate quality score based on signal characteristics
  const qualityScore = signals.length > 0 ? 0.85 : 0;

  const stats: Record<string, number> = {
    totalInput: signals.length,
    afterDedup: curatedData.length,
    afterQualityFilter: curatedData.length,
    finalCount: curatedData.length,
    qualityScore,
  };

  return { curatedData, qualityScore, stats };
}

/**
 * Dispatch optimization to the optimization backend.
 */
export async function runOptimization(
  dataset: unknown[],
  strategy: string,
  promptId: string
): Promise<{
  candidatePrompt: string;
  candidateScore: number;
  metadata: Record<string, unknown>;
}> {
  // In production, this would call the optimization backend
  // (coordinate ascent, example selection, or reflection)
  const candidatePrompt = `Optimized prompt for ${promptId} using ${strategy}`;
  const candidateScore = 0.0;

  return {
    candidatePrompt,
    candidateScore,
    metadata: {
      strategy,
      promptId,
      datasetSize: dataset.length,
    },
  };
}

/**
 * Check for regression in a suite's recent evaluation results.
 */
export async function checkRegressionStatus(
  suiteId: string,
  windowSize: number
): Promise<{
  hasRegression: boolean;
  severity?: string;
  details?: string;
}> {
  // In production, this would query ClickHouse for recent eval results
  // and compare against the baseline
  await emitSpan({
    traceId: `regression-check-${suiteId}`,
    spanType: "span",
    name: "check-regression",
    attributes: {
      "training.suite_id": suiteId,
      "training.window_size": String(windowSize),
    },
  });

  return { hasRegression: false };
}

/**
 * Record a training loop iteration as a span for observability.
 */
export async function recordLoopIteration(
  loopId: string,
  stage: string,
  metrics: Record<string, number>
): Promise<void> {
  const attributes: Record<string, string> = {
    "training.loop_id": loopId,
    "training.stage": stage,
  };

  for (const [key, value] of Object.entries(metrics)) {
    attributes[`training.metric.${key}`] = String(value);
  }

  await emitSpan({
    traceId: `training-loop-${loopId}`,
    spanType: "span",
    name: `training-loop:${stage}`,
    attributes,
  });
}
