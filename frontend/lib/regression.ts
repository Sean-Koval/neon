/**
 * Regression detection logic for eval runs.
 *
 * Compares latest run scores against configurable thresholds
 * and historical averages to detect quality regressions.
 */

import type { EvalRun } from './types'

// =============================================================================
// Types
// =============================================================================

export type AlertSeverity = 'warning' | 'critical'

export interface RegressionAlert {
  id: string
  suiteId: string
  suiteName: string
  runId: string
  isRegression: boolean
  severity: AlertSeverity
  details: string
  detectedAt: string
  score: number
  threshold?: number
  historicalAvg?: number
}

export interface AlertThreshold {
  suiteId: string
  /** Absolute minimum score — below this triggers critical alert */
  absoluteMin: number
  /** Percentage drop from historical average that triggers warning (0-1) */
  dropPercent: number
  /** Number of recent runs to use for historical average */
  windowSize: number
}

export const DEFAULT_THRESHOLD: Omit<AlertThreshold, 'suiteId'> = {
  absoluteMin: 0.5,
  dropPercent: 0.1,
  windowSize: 5,
}

// =============================================================================
// Detection Logic
// =============================================================================

/**
 * Compute the historical average score for a suite from recent runs.
 */
function computeHistoricalAvg(
  runs: EvalRun[],
  suiteId: string,
  windowSize: number,
): number | null {
  const suiteRuns = runs
    .filter(
      (r) =>
        r.suite_id === suiteId &&
        r.status === 'completed' &&
        r.summary?.avg_score != null,
    )
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, windowSize)

  if (suiteRuns.length === 0) return null

  const sum = suiteRuns.reduce((acc, r) => acc + (r.summary?.avg_score ?? 0), 0)
  return sum / suiteRuns.length
}

/**
 * Check a single run for regressions against thresholds and history.
 */
export function detectRegression(
  run: EvalRun,
  allRuns: EvalRun[],
  threshold: AlertThreshold,
): RegressionAlert | null {
  if (run.status !== 'completed' || run.summary?.avg_score == null) {
    return null
  }

  const score = run.summary.avg_score

  // Check absolute threshold — critical if below minimum
  if (score < threshold.absoluteMin) {
    return {
      id: `reg-${run.id}-abs`,
      suiteId: run.suite_id,
      suiteName: run.suite_name,
      runId: run.id,
      isRegression: true,
      severity: 'critical',
      details: `Score ${score.toFixed(2)} is below absolute minimum ${threshold.absoluteMin.toFixed(2)}`,
      detectedAt: run.completed_at ?? run.created_at,
      score,
      threshold: threshold.absoluteMin,
    }
  }

  // Compare against historical average — warning if significant drop
  const historicalAvg = computeHistoricalAvg(
    // Exclude the current run from history
    allRuns.filter((r) => r.id !== run.id),
    run.suite_id,
    threshold.windowSize,
  )

  if (historicalAvg !== null && historicalAvg > 0) {
    const dropRatio = (historicalAvg - score) / historicalAvg
    if (dropRatio >= threshold.dropPercent) {
      const severity: AlertSeverity =
        dropRatio >= threshold.dropPercent * 2 ? 'critical' : 'warning'
      return {
        id: `reg-${run.id}-drop`,
        suiteId: run.suite_id,
        suiteName: run.suite_name,
        runId: run.id,
        isRegression: true,
        severity,
        details: `Score dropped ${(dropRatio * 100).toFixed(1)}% from historical average (${historicalAvg.toFixed(2)} → ${score.toFixed(2)})`,
        detectedAt: run.completed_at ?? run.created_at,
        score,
        historicalAvg,
      }
    }
  }

  return null
}

/**
 * Scan all recent runs and return active regression alerts.
 */
export function detectRegressions(
  runs: EvalRun[],
  thresholds: AlertThreshold[],
): RegressionAlert[] {
  const alerts: RegressionAlert[] = []
  const thresholdMap = new Map(thresholds.map((t) => [t.suiteId, t]))

  // Group runs by suite and check most recent completed run per suite
  const suiteLatest = new Map<string, EvalRun>()
  const sortedRuns = [...runs].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  for (const run of sortedRuns) {
    if (run.status === 'completed' && !suiteLatest.has(run.suite_id)) {
      suiteLatest.set(run.suite_id, run)
    }
  }

  for (const [suiteId, latestRun] of suiteLatest) {
    const threshold = thresholdMap.get(suiteId) ?? {
      suiteId,
      ...DEFAULT_THRESHOLD,
    }
    const alert = detectRegression(latestRun, runs, threshold)
    if (alert) {
      alerts.push(alert)
    }
  }

  // Sort critical first, then by detection date
  alerts.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'critical' ? -1 : 1
    }
    return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
  })

  return alerts
}
