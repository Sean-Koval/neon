/**
 * React Query hooks for component correlation analysis.
 *
 * Provides:
 * - Cross-component correlation calculations
 * - Component health metrics
 * - Dependency relationship analysis
 */

import { useMemo } from 'react'
import type { EvalRun } from '@/lib/types'
import { useRuns } from './use-runs'
import { useSuites } from './use-suites'

// =============================================================================
// Types
// =============================================================================

export interface ComponentMetrics {
  /** Component identifier (suite ID or scorer name) */
  id: string
  /** Display name */
  name: string
  /** Component type */
  type: 'suite' | 'scorer'
  /** Average score (0-1) */
  avgScore: number
  /** Total number of evaluations */
  evalCount: number
  /** Pass rate (0-1) */
  passRate: number
  /** Error rate (0-1) */
  errorRate: number
  /** Average latency in ms */
  avgLatency: number
  /** Trend direction */
  trend: 'up' | 'down' | 'stable'
  /** Health status */
  healthStatus: 'healthy' | 'warning' | 'critical'
  /** Score variance */
  variance: number
}

export interface CorrelationPair {
  /** First component ID */
  componentA: string
  /** Second component ID */
  componentB: string
  /** Pearson correlation coefficient (-1 to 1) */
  correlation: number
  /** Sample size */
  sampleSize: number
  /** Statistical significance (p-value) */
  pValue: number
  /** Relationship strength */
  strength: 'strong' | 'moderate' | 'weak' | 'none'
}

export interface CorrelationMatrix {
  /** Component labels */
  labels: string[]
  /** NxN correlation values */
  values: number[][]
  /** Component metadata */
  components: ComponentMetrics[]
}

export interface DependencyEdge {
  /** Source component ID */
  source: string
  /** Target component ID */
  target: string
  /** Dependency weight (correlation strength) */
  weight: number
  /** Dependency type */
  type: 'positive' | 'negative' | 'neutral'
}

export interface DependencyGraph {
  /** Component nodes */
  nodes: ComponentMetrics[]
  /** Dependency edges */
  edges: DependencyEdge[]
}

export interface ComponentHealth {
  /** Overall health score (0-100) */
  overallScore: number
  /** Number of healthy components */
  healthyCount: number
  /** Number of warning components */
  warningCount: number
  /** Number of critical components */
  criticalCount: number
  /** Top issues */
  issues: Array<{
    component: string
    issue: string
    severity: 'warning' | 'critical'
    metric: string
    value: number
    threshold: number
  }>
  /** Improvement suggestions */
  suggestions: string[]
}

export interface UseComponentCorrelationOptions {
  /** Number of days to analyze */
  days?: number
  /** Minimum sample size for correlation */
  minSampleSize?: number
  /** Correlation significance threshold */
  significanceThreshold?: number
  /** Health score thresholds */
  healthThresholds?: {
    warning: number
    critical: number
  }
}

export interface UseComponentCorrelationResult {
  /** Component metrics */
  components: ComponentMetrics[]
  /** Correlation matrix */
  correlationMatrix: CorrelationMatrix | null
  /** Pairwise correlations */
  correlations: CorrelationPair[]
  /** Dependency graph */
  dependencyGraph: DependencyGraph | null
  /** Component health summary */
  health: ComponentHealth | null
  /** Loading state */
  isLoading: boolean
  /** Error state */
  isError: boolean
  /** Error object */
  error: Error | null
  /** Refetch function */
  refetch: () => void
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Calculate Pearson correlation coefficient
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0

  const n = x.length
  const sumX = x.reduce((a, b) => a + b, 0)
  const sumY = y.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0)
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0)
  const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0)

  const numerator = n * sumXY - sumX * sumY
  const denominator = Math.sqrt(
    (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY),
  )

  if (denominator === 0) return 0
  return numerator / denominator
}

/**
 * Calculate p-value approximation for correlation
 */
function correlationPValue(r: number, n: number): number {
  if (n < 3) return 1
  const t = r * Math.sqrt((n - 2) / (1 - r * r))
  // Approximate p-value using t-distribution
  const df = n - 2
  const x = df / (df + t * t)
  // Simplified p-value approximation
  return Math.min(1, 2 * (1 - (1 - x) ** (df / 2)))
}

/**
 * Get correlation strength label
 */
function getCorrelationStrength(
  r: number,
): 'strong' | 'moderate' | 'weak' | 'none' {
  const abs = Math.abs(r)
  if (abs >= 0.7) return 'strong'
  if (abs >= 0.4) return 'moderate'
  if (abs >= 0.2) return 'weak'
  return 'none'
}

/**
 * Calculate variance
 */
function calculateVariance(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return values.reduce((acc, val) => acc + (val - mean) ** 2, 0) / values.length
}

/**
 * Calculate trend from recent values
 */
function calculateTrend(
  values: number[],
  threshold = 0.02,
): 'up' | 'down' | 'stable' {
  if (values.length < 2) return 'stable'

  // Compare recent average to older average
  const mid = Math.floor(values.length / 2)
  const olderAvg =
    values.slice(0, mid).reduce((a, b) => a + b, 0) / Math.max(mid, 1)
  const recentAvg =
    values.slice(mid).reduce((a, b) => a + b, 0) /
    Math.max(values.length - mid, 1)

  const delta = recentAvg - olderAvg
  if (delta > threshold) return 'up'
  if (delta < -threshold) return 'down'
  return 'stable'
}

/**
 * Determine health status from metrics
 */
function getHealthStatus(
  avgScore: number,
  errorRate: number,
  passRate: number,
  thresholds: { warning: number; critical: number },
): 'healthy' | 'warning' | 'critical' {
  // Critical if score is very low, error rate is high, or pass rate is very low
  if (
    avgScore < thresholds.critical ||
    errorRate > 0.2 ||
    passRate < thresholds.critical
  ) {
    return 'critical'
  }
  // Warning if score is moderate
  if (
    avgScore < thresholds.warning ||
    errorRate > 0.1 ||
    passRate < thresholds.warning
  ) {
    return 'warning'
  }
  return 'healthy'
}

// =============================================================================
// Main Hook
// =============================================================================

export function useComponentCorrelation(
  options: UseComponentCorrelationOptions = {},
): UseComponentCorrelationResult {
  const {
    days = 30,
    minSampleSize = 5,
    significanceThreshold = 0.05,
    healthThresholds = { warning: 0.7, critical: 0.5 },
  } = options

  // Fetch runs and suites
  const {
    data: runs = [],
    isLoading: runsLoading,
    isError: runsError,
    error: runsErrorObj,
    refetch: refetchRuns,
  } = useRuns({ limit: 500 })

  const {
    data: suites = [],
    isLoading: suitesLoading,
    isError: suitesError,
    error: suitesErrorObj,
  } = useSuites()

  // Process data
  const result = useMemo(() => {
    // Filter runs within date range
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)

    const filteredRuns = runs.filter(
      (run) =>
        run.status === 'completed' &&
        run.summary &&
        new Date(run.created_at) >= cutoff,
    )

    if (filteredRuns.length === 0) {
      return {
        components: [],
        correlationMatrix: null,
        correlations: [],
        dependencyGraph: null,
        health: null,
      }
    }

    // Build component metrics
    const componentMap = new Map<
      string,
      {
        id: string
        name: string
        type: 'suite' | 'scorer'
        scores: number[]
        passes: number
        fails: number
        errors: number
        latencies: number[]
      }
    >()

    // Process suite-level metrics
    for (const run of filteredRuns) {
      const suiteId = run.suite_id
      const suiteName = run.suite_name
      const score = run.summary?.avg_score ?? 0
      const latency = run.summary?.execution_time_ms ?? 0
      const passed = run.summary?.passed ?? 0
      const failed = run.summary?.failed ?? 0
      const errored = run.summary?.errored ?? 0

      const existing = componentMap.get(`suite:${suiteId}`)
      if (existing) {
        existing.scores.push(score)
        existing.latencies.push(latency)
        existing.passes += passed
        existing.fails += failed
        existing.errors += errored
      } else {
        componentMap.set(`suite:${suiteId}`, {
          id: `suite:${suiteId}`,
          name: suiteName,
          type: 'suite',
          scores: [score],
          latencies: [latency],
          passes: passed,
          fails: failed,
          errors: errored,
        })
      }

      // Process scorer-level metrics
      if (run.summary?.scores_by_type) {
        for (const [scorer, scorerScore] of Object.entries(
          run.summary.scores_by_type,
        )) {
          const scorerKey = `scorer:${scorer}`
          const scorerExisting = componentMap.get(scorerKey)
          if (scorerExisting) {
            scorerExisting.scores.push(scorerScore)
            scorerExisting.latencies.push(
              latency / Object.keys(run.summary.scores_by_type).length,
            )
            scorerExisting.passes += scorerScore >= 0.5 ? 1 : 0
            scorerExisting.fails += scorerScore < 0.5 ? 1 : 0
          } else {
            componentMap.set(scorerKey, {
              id: scorerKey,
              name: scorer,
              type: 'scorer',
              scores: [scorerScore],
              latencies: [
                latency / Object.keys(run.summary.scores_by_type).length,
              ],
              passes: scorerScore >= 0.5 ? 1 : 0,
              fails: scorerScore < 0.5 ? 1 : 0,
              errors: 0,
            })
          }
        }
      }
    }

    // Convert to component metrics
    const components: ComponentMetrics[] = Array.from(
      componentMap.entries(),
    ).map(([_, data]) => {
      const total = data.passes + data.fails + data.errors
      const avgScore =
        data.scores.length > 0
          ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length
          : 0
      const passRate = total > 0 ? data.passes / total : 0
      const errorRate = total > 0 ? data.errors / total : 0
      const avgLatency =
        data.latencies.length > 0
          ? data.latencies.reduce((a, b) => a + b, 0) / data.latencies.length
          : 0

      return {
        id: data.id,
        name: data.name,
        type: data.type,
        avgScore,
        evalCount: data.scores.length,
        passRate,
        errorRate,
        avgLatency,
        trend: calculateTrend(data.scores),
        healthStatus: getHealthStatus(
          avgScore,
          errorRate,
          passRate,
          healthThresholds,
        ),
        variance: calculateVariance(data.scores),
      }
    })

    // Sort by type (suites first) then by name
    components.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'suite' ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    // Build correlation matrix
    const labels = components.map((c) => c.name)
    const values: number[][] = []
    const correlations: CorrelationPair[] = []

    // Build score vectors keyed by run date for alignment
    const scoreVectors = new Map<string, Map<string, number>>()
    for (const run of filteredRuns) {
      const dateKey = run.created_at.split('T')[0]

      // Suite score
      const suiteKey = `suite:${run.suite_id}`
      if (!scoreVectors.has(suiteKey)) {
        scoreVectors.set(suiteKey, new Map())
      }
      const suiteScores = scoreVectors.get(suiteKey)!
      suiteScores.set(dateKey, run.summary?.avg_score ?? 0)

      // Scorer scores
      if (run.summary?.scores_by_type) {
        for (const [scorer, score] of Object.entries(
          run.summary.scores_by_type,
        )) {
          const scorerKey = `scorer:${scorer}`
          if (!scoreVectors.has(scorerKey)) {
            scoreVectors.set(scorerKey, new Map())
          }
          scoreVectors.get(scorerKey)!.set(dateKey, score)
        }
      }
    }

    // Calculate pairwise correlations
    for (let i = 0; i < components.length; i++) {
      const row: number[] = []
      for (let j = 0; j < components.length; j++) {
        if (i === j) {
          row.push(1)
          continue
        }

        const vectorA = scoreVectors.get(components[i].id)
        const vectorB = scoreVectors.get(components[j].id)

        if (!vectorA || !vectorB) {
          row.push(0)
          continue
        }

        // Find common dates
        const commonDates = Array.from(vectorA.keys()).filter((d) =>
          vectorB.has(d),
        )

        if (commonDates.length < minSampleSize) {
          row.push(0)
          continue
        }

        const xValues = commonDates.map((d) => vectorA.get(d)!)
        const yValues = commonDates.map((d) => vectorB.get(d)!)

        const r = pearsonCorrelation(xValues, yValues)
        const pValue = correlationPValue(r, commonDates.length)

        row.push(r)

        // Only add to correlations array for upper triangle
        if (j > i && Math.abs(r) >= 0.1) {
          correlations.push({
            componentA: components[i].id,
            componentB: components[j].id,
            correlation: r,
            sampleSize: commonDates.length,
            pValue,
            strength: getCorrelationStrength(r),
          })
        }
      }
      values.push(row)
    }

    const correlationMatrix: CorrelationMatrix = {
      labels,
      values,
      components,
    }

    // Sort correlations by absolute value
    correlations.sort(
      (a, b) => Math.abs(b.correlation) - Math.abs(a.correlation),
    )

    // Build dependency graph
    const significantCorrelations = correlations.filter(
      (c) => c.pValue < significanceThreshold && Math.abs(c.correlation) >= 0.3,
    )

    const dependencyGraph: DependencyGraph = {
      nodes: components,
      edges: significantCorrelations.map((c) => ({
        source: c.componentA,
        target: c.componentB,
        weight: Math.abs(c.correlation),
        type:
          c.correlation > 0.1
            ? 'positive'
            : c.correlation < -0.1
              ? 'negative'
              : 'neutral',
      })),
    }

    // Calculate component health
    const healthyCount = components.filter(
      (c) => c.healthStatus === 'healthy',
    ).length
    const warningCount = components.filter(
      (c) => c.healthStatus === 'warning',
    ).length
    const criticalCount = components.filter(
      (c) => c.healthStatus === 'critical',
    ).length

    const issues: ComponentHealth['issues'] = []
    const suggestions: string[] = []

    for (const component of components) {
      if (component.avgScore < healthThresholds.critical) {
        issues.push({
          component: component.name,
          issue: 'Score below critical threshold',
          severity: 'critical',
          metric: 'avgScore',
          value: component.avgScore,
          threshold: healthThresholds.critical,
        })
        suggestions.push(
          `Investigate ${component.name}: score ${(component.avgScore * 100).toFixed(0)}% is critically low`,
        )
      } else if (component.avgScore < healthThresholds.warning) {
        issues.push({
          component: component.name,
          issue: 'Score below warning threshold',
          severity: 'warning',
          metric: 'avgScore',
          value: component.avgScore,
          threshold: healthThresholds.warning,
        })
      }

      if (component.errorRate > 0.1) {
        issues.push({
          component: component.name,
          issue: 'High error rate',
          severity: component.errorRate > 0.2 ? 'critical' : 'warning',
          metric: 'errorRate',
          value: component.errorRate,
          threshold: 0.1,
        })
        suggestions.push(
          `${component.name} has ${(component.errorRate * 100).toFixed(0)}% error rate - check for timeouts or exceptions`,
        )
      }

      if (component.variance > 0.05) {
        suggestions.push(
          `${component.name} has high variance (${(component.variance * 100).toFixed(1)}%) - results may be inconsistent`,
        )
      }
    }

    // Sort issues by severity
    issues.sort((a, b) => {
      if (a.severity === b.severity) return 0
      return a.severity === 'critical' ? -1 : 1
    })

    const overallScore =
      components.length > 0
        ? Math.round(
            (components.reduce((acc, c) => acc + c.avgScore, 0) /
              components.length) *
              100,
          )
        : 0

    const health: ComponentHealth = {
      overallScore,
      healthyCount,
      warningCount,
      criticalCount,
      issues,
      suggestions: suggestions.slice(0, 5), // Top 5 suggestions
    }

    return {
      components,
      correlationMatrix,
      correlations,
      dependencyGraph,
      health,
    }
  }, [
    runs,
    suites,
    days,
    minSampleSize,
    significanceThreshold,
    healthThresholds,
  ])

  return {
    ...result,
    isLoading: runsLoading || suitesLoading,
    isError: runsError || suitesError,
    error: (runsErrorObj ?? suitesErrorObj) as Error | null,
    refetch: refetchRuns,
  }
}
